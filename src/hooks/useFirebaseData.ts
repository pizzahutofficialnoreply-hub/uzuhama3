import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  deleteDoc,
  deleteField,
  query, 
  orderBy,
  where,
  documentId,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { BroadcastLog, DailyStat, TimeStat, DurationStat, MonthlyStat, AppData, PatternGuide, SystemConfig, GameItem, LinkItem } from '../types';
import { dailyStats as defaultDaily, timeStats as defaultTime, durationStats as defaultDuration, monthlyStats as defaultMonthly, patternGuides as defaultGuides } from '../data';

// Vercel 서버 API를 통한 관리자 Firestore 데이터 편집 (보안 및 무결성 강화)
async function executeAdminMutation(action: string, payload: any): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;

    const isVercel = typeof window !== 'undefined' && (
      window.location.hostname.endsWith('vercel.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '3000'
    );
    const mutateUrl = isVercel ? '/api/admin/mutate' : 'https://uzuhama.vercel.app/api/admin/mutate';

    const res = await fetch(mutateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, ...payload })
    });

    if (res.ok) {
      return true;
    }
    const errJson = await res.json().catch(() => ({}));
    console.warn('[Admin Mutate Warning]', errJson);
    return false;
  } catch (e) {
    console.debug('[Admin Mutate Network Error, falling back]:', e);
    return false;
  }
}

// Firestore does not allow `undefined` field values. This recursively purges undefined values
// while preserving Firestore special FieldValues (such as deleteField()).
export const cleanFirestoreData = (data: any): any => {
  if (data === undefined) return undefined;
  if (data === null) return null;
  // If it's a Firestore FieldValue (like deleteField(), serverTimestamp()), preserve it
  if (
    typeof data === 'object' &&
    data !== null &&
    ((data as any)._methodName || (data.constructor && data.constructor.name !== 'Object' && data.constructor.name !== 'Array'))
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .map(item => cleanFirestoreData(item))
      .filter(item => item !== undefined);
  }
  if (typeof data === 'object' && data !== null) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const cleanedVal = cleanFirestoreData(value);
        if (cleanedVal !== undefined) {
          cleaned[key] = cleanedVal;
        }
      }
    }
    return cleaned;
  }
  return data;
};

// 과거 아카이브(/data/historical_logs.json 또는 /archive-logs.json) 캐싱 및 로드 함수
let historicalCache: Record<string, BroadcastLog> | null = null;
async function loadHistoricalLogs(): Promise<Record<string, BroadcastLog>> {
  if (historicalCache) return historicalCache;
  try {
    let res = await fetch('/data/historical_logs.json');
    if (!res.ok) {
      res = await fetch('/archive-logs.json');
    }
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, BroadcastLog> = {};
    const processLog = (log: any, idKey?: string) => {
      if (!log || typeof log !== 'object') return;
      const id = log.id || idKey;
      if (!id) return;
      if (Array.isArray(log.games)) {
        log.games = log.games.map((g: any) => ({
          name: typeof g === 'string' ? g : (g.name || g.game || ''),
          link: typeof g === 'string' ? '' : (g.link || g.url || g.gameUrl || g.steamUrl || log.gameLink || log.gameUrl || ''),
          category: typeof g === 'string' ? '' : (g.category || log.category || '')
        }));
      }
      map[id] = log as BroadcastLog;
    };

    if (Array.isArray(data)) {
      data.forEach(log => processLog(log));
    } else if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, val]) => {
        processLog(val, key);
      });
    }
    historicalCache = map;
    return map;
  } catch (err) {
    console.warn('과거 데이터(/data/historical_logs.json) 로드 실패:', err);
    return {};
  }
}


export function useFirebaseData() {
  const [data, setData] = useState<AppData | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [loadingStatusText, setLoadingStatusText] = useState('초기 환경 구성 및 세션 확인 중...');
  const [isFirstRun, setIsFirstRun] = useState(false);
  
  const isFirstLiveCheckRef = useRef(true);
  const prevStatusRef = useRef<string | null>(null);

  const updateCache = (newLogs: Record<string, BroadcastLog>) => {
    localStorage.setItem('uzuhama_logs_cache_v4', JSON.stringify(newLogs));
    localStorage.setItem('uzuhama_logs_time_v2', Date.now().toString());
  };

  const lastFetchTimeRef = useRef<number>(0);

  // 핵심 일지 데이터 호출 함수: 과거 아카이브(JSON) + Firestore 최신 데이터(logs, logs_by_month, compilations) 통합 병합
  const fetchLatestLogs = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    // 강제 새로고침이 아니고, 최근 45초 이내에 이미 최신 데이터를 불러왔다면 중복 요청 방지
    if (!force && lastFetchTimeRef.current > 0 && now - lastFetchTimeRef.current < 45000) {
      return;
    }

    try {
      // 1. 과거 아카이브 JSON 로드 (2016~2025)
      const historicalLogs = await loadHistoricalLogs();
      const logsMap: Record<string, BroadcastLog> = { ...historicalLogs };

      // 2. Firestore logs_by_month 에서 아카이브 JSON 과 겹치지 않는 부분만 조회
      //    - logs 컬렉션은 읽지 않음 (logs_by_month 에 같은 내용이 모두 들어 있음)
      //    - JSON 의 마지막 달 이후 문서만 요청해 읽기 횟수를 줄이고,
      //      그 안에서도 JSON 에 이미 있는 날짜는 건너뜀 (아카이브는 JSON 이 원본)
      const lastJsonMonth = Object.values(historicalLogs).reduce(
        (m, l) => (l.date && l.date.slice(0, 7) > m ? l.date.slice(0, 7) : m),
        ''
      );
      try {
        const jsonDates = new Set(Object.values(historicalLogs).map((l) => l.date));
        const monthQuery = lastJsonMonth
          ? query(collection(db, 'logs_by_month'), where(documentId(), '>', lastJsonMonth))
          : collection(db, 'logs_by_month');
        const monthSnaps = await getDocs(monthQuery);
        const addEntry = (logId: string, val: any) => {
          if (!val || !val.date || jsonDates.has(val.date)) return;
          const games = Array.isArray(val.games)
            ? val.games.map((g: any) => ({
                ...g,
                link: g.link || g.url || g.gameUrl || g.steamUrl || val.gameLink || ''
              }))
            : val.games;
          logsMap[logId] = { ...val, id: logId, games } as BroadcastLog;
        };
        monthSnaps.forEach((docSnap) => {
          const docData = docSnap.data();
          if (docData?.items && typeof docData.items === 'object') {
            Object.entries(docData.items).forEach(([k, val]: [string, any]) => addEntry(val?.id || k, val));
          }
          Object.entries(docData || {}).forEach(([key, val]) => {
            if (key !== 'month' && key !== 'updatedAt' && key !== 'items' && val && typeof val === 'object' && (val as any).date) {
              addEntry((val as any).id || key, val);
            }
          });
        });
      } catch (e: any) {
        console.warn('logs_by_month 컬렉션 조회 경고:', e?.message);
      }

      // 4. Firestore compilations (몰아보기) 컬렉션 조회:
      // 과거 기록 JSON이 수정되거나 교체되더라도 등록된 몰아보기와 선택된 게임 목록이 사라지지 않고 100% 영구 보존되도록 병합
      try {
        // 몰아보기 원본은 compilations 컬렉션.
        // 서버 규칙이 아직 공개 읽기를 막고 있으면(권한 오류) 아카이브 기간 logs_by_month 에서 몰아보기 항목만 추출해 대체
        const compSources: { docId: string; comp: any }[] = [];
        try {
          const compSnaps = await getDocs(collection(db, 'compilations'));
          compSnaps.forEach((d) => compSources.push({ docId: d.id, comp: d.data() }));
        } catch (permErr: any) {
          console.debug('compilations 직접 조회 불가, 월별 기록에서 몰아보기 추출:', permErr?.message);
          if (lastJsonMonth) {
            const oldSnaps = await getDocs(query(collection(db, 'logs_by_month'), where(documentId(), '<=', lastJsonMonth)));
            const found = new Map<string, any>();
            oldSnaps.forEach((d) => {
              const items = d.data()?.items || {};
              Object.values(items).forEach((l: any) => {
                (Array.isArray(l?.edited) ? l.edited : []).forEach((e: any) => {
                  if (!e?.url || !(e.isCompilation || e.compilationId)) return;
                  const key = e.compilationId || e.url;
                  const c = found.get(key) || {
                    id: e.compilationId || key,
                    url: e.url,
                    title: e.title,
                    allBroadcastDates: Array.isArray(e.allBroadcastDates) ? [...e.allBroadcastDates] : [],
                    games: e.games,
                    gameSortOrder: e.gameSortOrder,
                    gameGroups: e.gameGroups,
                    createdAt: e.createdAt,
                  };
                  if (l.date && !c.allBroadcastDates.includes(l.date)) c.allBroadcastDates.push(l.date);
                  found.set(key, c);
                });
              });
            });
            found.forEach((comp, key) => compSources.push({ docId: key, comp }));
          }
        }
        if (compSources.length > 0) {
          compSources.forEach(({ docId, comp }) => {
            if (!comp || !comp.url) return;
            const compId = comp.id || docId;
            
            // 연동된 날짜 및 logId 목록 취합
            const allBroadcastDates: string[] = [];
            const linkedLogIds: string[] = [];

            if (Array.isArray(comp.broadcasts)) {
              comp.broadcasts.forEach((b: any) => {
                if (b.date && !allBroadcastDates.includes(b.date)) allBroadcastDates.push(b.date);
                if (b.logId && !linkedLogIds.includes(b.logId)) linkedLogIds.push(b.logId);
              });
            }
            if (Array.isArray(comp.allBroadcastDates)) {
              comp.allBroadcastDates.forEach((d: string) => {
                if (d && !allBroadcastDates.includes(d)) allBroadcastDates.push(d);
              });
            }

            // 연동 대상 로그 검색
            const targetLogs: BroadcastLog[] = [];
            linkedLogIds.forEach(id => {
              if (logsMap[id]) targetLogs.push(logsMap[id]);
            });
            allBroadcastDates.forEach(d => {
              const found = Object.values(logsMap).find(l => l.date === d);
              if (found && !targetLogs.some(t => t.id === found.id)) {
                targetLogs.push(found);
              }
            });

            // 각 연동 로그에 몰아보기 링크 및 선택된 게임 정보 보존/주입
            targetLogs.forEach(targetLog => {
              const editedList = Array.isArray(targetLog.edited) ? [...targetLog.edited] : [];
              const existingCompIndex = editedList.findIndex(
                e => e.compilationId === compId || e.url === comp.url
              );

              // 해당 방송에서 선택되었던 게임 목록 추출 (b.games)
              const bInfo = Array.isArray(comp.broadcasts)
                ? comp.broadcasts.find((b: any) => b.logId === targetLog.id || b.date === targetLog.date)
                : null;
              
              let selectedGames: GameItem[] = [];
              if (bInfo && Array.isArray(bInfo.games)) {
                selectedGames = bInfo.games.map((gName: string) => {
                  const matched = (targetLog.games || []).find(g => g.name === gName);
                  return matched || { name: gName, link: '' };
                });
              } else if (Array.isArray(comp.games)) {
                selectedGames = comp.games;
              }

              const compLink: LinkItem = {
                title: comp.title || '몰아보기',
                url: comp.url,
                isCompilation: true,
                compilationId: compId,
                allBroadcastDates: allBroadcastDates.length > 0 ? allBroadcastDates : [targetLog.date],
                games: selectedGames.length > 0 ? selectedGames : (targetLog.games || []),
                gameSortOrder: comp.gameSortOrder || 'latest',
                gameGroups: comp.gameGroups,
                createdAt: comp.createdAt || new Date().toISOString()
              };

              if (existingCompIndex >= 0) {
                // 기존 등록된 몰아보기 항목이 있으면 선택된 게임과 설정 최신 상태로 갱신 유지
                editedList[existingCompIndex] = {
                  ...editedList[existingCompIndex],
                  ...compLink,
                  games: selectedGames.length > 0 ? selectedGames : editedList[existingCompIndex].games
                };
              } else {
                editedList.unshift(compLink);
              }

              logsMap[targetLog.id] = {
                ...targetLog,
                edited: editedList
              };
            });
          });
        }
      } catch (e: any) {
        console.warn('compilations 컬렉션 조회 경고:', e?.message);
      }

      // 5. 로컬 캐시 갱신 및 화면 반영
      if (Object.keys(logsMap).length > 0) {
        updateCache(logsMap);
      }
      lastFetchTimeRef.current = Date.now();
      setData(prev => {
        if (!prev) return prev;
        return { ...prev, logs: logsMap };
      });

      return logsMap;
    } catch (err) {
      console.error('fetchLatestLogs 에러:', err);
    }
  }, []);

  // 1. 시스템 설정 실시간 리스너 (점검 모드 등)
  useEffect(() => {
    let unsubscribeSystem: () => void;
    const sysRef = doc(db, 'config', 'system');
    unsubscribeSystem = onSnapshot(
      sysRef, 
      (snap) => {
        if (snap.exists()) {
          setSystemConfig(snap.data() as SystemConfig);
          setData(prev => prev ? { ...prev, system: snap.data() as SystemConfig } : null);
        }
      },
      (error) => {
        if (error.code === 'unavailable' || error.message?.includes('offline')) {
          console.warn('Firestore is currently offline or unavailable for system config, using local cache.');
        } else {
          console.warn('System config snapshot warning:', error);
        }
      }
    );

    return () => {
      if (unsubscribeSystem) unsubscribeSystem();
    };
  }, []);

  // 2. 방송 시작(OPEN) 및 방송 종료(CLOSE) 감지 기반 데이터 호출
  useEffect(() => {
    const unsubscribeLive = onSnapshot(
      doc(db, 'live_status', 'c6e1c8cf1b128bd321cc2684c92b5a00'),
      async (snap) => {
        if (!snap.exists()) return;
        const statusData = snap.data();
        const currentStatus = statusData?.status; // e.g. "OPEN" or "CLOSE"

        if (isFirstLiveCheckRef.current) {
          isFirstLiveCheckRef.current = false;
          prevStatusRef.current = currentStatus;
          return;
        }

        const prev = prevStatusRef.current;
        prevStatusRef.current = currentStatus;

        // [트리거 1] 방송 시작 시 (CLOSE -> OPEN) 데이터 호출
        if (prev === 'CLOSE' && currentStatus === 'OPEN') {
          console.log('[Live] 방송 시작(OPEN) 감지: 최신 데이터 호출');
          await fetchLatestLogs();
        }

        // [트리거 2] 방송 종료 시 (OPEN -> CLOSE) 데이터 호출
        if (prev === 'OPEN' && currentStatus === 'CLOSE') {
          console.log('[Live] 방송 종료(CLOSE) 감지: 최신 데이터 호출');
          await fetchLatestLogs();
          // 트래커 봇이 Firestore에 신규 일지를 저장하는 시간차(1~3초)를 고려한 추가 갱신
          setTimeout(() => {
            fetchLatestLogs();
          }, 2500);
        }
      },
      (err) => {
        console.warn('live_status 리스너 경고:', err);
      }
    );

    return () => unsubscribeLive();
  }, [fetchLatestLogs]);

  // 3. [트리거 3] 첫 실행 시 데이터 호출 및 초기화 (SWR 캐싱 적용)
  useEffect(() => {
    const initializeData = async () => {
      try {
        const cachedLogsStr = localStorage.getItem('uzuhama_logs_cache_v4');
        const hasExistingCache = Boolean(cachedLogsStr);

        // 이미 로컬 캐시가 있으면 즉시 화면을 띄워 대기 시간 0초 (stale-while-revalidate)
        if (hasExistingCache) {
          try {
            const cachedLogs = JSON.parse(cachedLogsStr!);
            const fastInitialData: AppData = {
              logs: cachedLogs,
              dailyStats: defaultDaily.reduce((acc, stat) => ({ ...acc, [stat.day]: stat }), {} as any),
              timeStats: defaultTime.reduce((acc, stat) => ({ ...acc, [stat.time]: stat }), {} as any),
              durationStats: defaultDuration.reduce((acc, stat) => ({ ...acc, [stat.label]: stat }), {} as any),
              monthlyStats: defaultMonthly.reduce((acc, stat) => ({ ...acc, [stat.month]: stat }), {} as any),
              patternGuides: defaultGuides.reduce((acc, guide) => ({ ...acc, [guide.id]: guide }), {} as any),
              videoStats: {},
              system: { maintenance: false, noticeType: 'none', noticeContent: '' }
            };
            setData(fastInitialData);
            setLoading(false);
          } catch {}
        } else {
          setIsFirstRun(true);
          setLoading(true);
        }

        setLoadingProgress(20);
        setLoadingStatusText('시스템 설정 및 통계 지표 불러오는 중...');

        const sysRef = doc(db, 'config', 'system');
        const videoStatsRef = doc(db, 'config', 'videoStats');
        const statsRef = doc(db, 'config', 'dailyStats');
        const timeRef = doc(db, 'config', 'timeStats');
        const guidesRef = doc(db, 'config', 'patternGuides');
        
        let valSys = undefined;
        let valStats = undefined;
        let valTime = undefined;
        let valGuides = undefined;
        let valVideoStats = undefined;
        try {
          const [sysSnap, statsSnap, timeSnap, guidesSnap, videoStatsSnap] = await Promise.all([
            getDoc(sysRef), getDoc(statsRef), getDoc(timeRef), getDoc(guidesRef), getDoc(videoStatsRef)
          ]);
          valSys = sysSnap.data();
          valStats = statsSnap.data();
          valTime = timeSnap.data();
          valGuides = guidesSnap.data();
          valVideoStats = videoStatsSnap.data();
        } catch (e: any) {
          console.warn('Failed to fetch config from Firebase, using defaults. Error:', e.message);
        }
        
        setLoadingProgress(55);
        setLoadingStatusText('과거 방송 아카이브 및 일지 분석 중...');

        const initialData: AppData = {
          logs: {}, 
          dailyStats: valStats ? (valStats as Record<string, DailyStat>) : defaultDaily.reduce((acc, stat) => ({ ...acc, [stat.day]: stat }), {} as any),
          timeStats: valTime ? (valTime as Record<string, TimeStat>) : defaultTime.reduce((acc, stat) => ({ ...acc, [stat.time]: stat }), {} as any),
          durationStats: defaultDuration.reduce((acc, stat) => ({ ...acc, [stat.label]: stat }), {} as any),
          monthlyStats: defaultMonthly.reduce((acc, stat) => ({ ...acc, [stat.month]: stat }), {} as any),
          patternGuides: valGuides ? (valGuides as Record<string, PatternGuide>) : defaultGuides.reduce((acc, guide) => ({ ...acc, [guide.id]: guide }), {} as any),
          videoStats: valVideoStats || {},
          system: (valSys as SystemConfig) || { maintenance: false, noticeType: 'none', noticeContent: '' }
        };

        // 1. JSON 파일(/data/historical_logs.json)의 과거 아카이브 불러오기
        const historicalLogs = await loadHistoricalLogs();
        initialData.logs = { ...historicalLogs };

        // 2. 로컬 캐시 확인하여 화면에 반영
        if (cachedLogsStr) {
          try {
            const cachedLogs = JSON.parse(cachedLogsStr);
            initialData.logs = { ...initialData.logs, ...cachedLogs };
          } catch (e) {
            console.error('Cache parsing error', e);
          }
        }
        setData(initialData);

        setLoadingProgress(85);
        setLoadingStatusText('최신 방송 일지 동기화 중...');

        // 3. 첫 실행 시 Firestore 최신 데이터 호출 및 병합
        await fetchLatestLogs(true);

        setLoadingProgress(100);
        setLoadingStatusText('준비 완료!');
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [fetchLatestLogs]);

  // 수동 갱신 또는 날짜 필터링 대응
  const fetchLogsByDateRange = useCallback(async (startDate?: string, endDate?: string) => {
    await fetchLatestLogs(true);
  }, [fetchLatestLogs]);

  // 관리자 일지 등록
  const addLog = async (log: BroadcastLog) => {
    if (!data) return;
    try {
      const sanitizedLog = cleanFirestoreData(log);
      const serverHandled = await executeAdminMutation('addLog', { log: sanitizedLog });
      if (!serverHandled) {
        await setDoc(doc(db, 'logs', log.id), sanitizedLog);
        try {
          const monthKey = log.date.slice(0, 7);
          const docRef = doc(db, 'logs_by_month', monthKey);
          await setDoc(docRef, {
            month: monthKey,
            updatedAt: new Date().toISOString(),
            items: { [log.id]: sanitizedLog }
          }, { merge: true });
        } catch {}
      }

      setData(prev => {
        if (!prev) return prev;
        const newLogs = { ...prev.logs, [log.id]: log };
        updateCache(newLogs);
        return {
          ...prev,
          logs: newLogs
        };
      });
    } catch (e) {
      console.error('addLog error:', e);
      throw e;
    }
  };
  
  // 관리자 일지 수정
  const updateLog = async (log: BroadcastLog) => {
    if (!data) return;
    try {
      const sanitizedLog = cleanFirestoreData(log);
      const serverHandled = await executeAdminMutation('updateLog', { log: sanitizedLog });
      if (!serverHandled) {
        await setDoc(doc(db, 'logs', log.id), sanitizedLog, { merge: true });
        try {
          const monthKey = log.date.slice(0, 7);
          const docRef = doc(db, 'logs_by_month', monthKey);
          await setDoc(docRef, {
            month: monthKey,
            updatedAt: new Date().toISOString(),
            items: { [log.id]: sanitizedLog }
          }, { merge: true });
        } catch {}
      }

      setData(prev => {
        if (!prev) return prev;
        const newLogs = { ...prev.logs, [log.id]: log };
        updateCache(newLogs);
        return {
          ...prev,
          logs: newLogs
        };
      });
    } catch (e) {
      console.error('updateLog error:', e);
      throw e;
    }
  };
  
  // 관리자 일지 삭제
  const deleteLog = async (id: string) => {
    if (!data) return;
    const targetLog = data.logs[id];
    const monthKey = targetLog?.date ? targetLog.date.slice(0, 7) : null;
    try {
      const serverHandled = await executeAdminMutation('deleteLog', { id });
      if (!serverHandled) {
        await deleteDoc(doc(db, 'logs', id));
        if (monthKey) {
          try {
            const docRef = doc(db, 'logs_by_month', monthKey);
            await updateDoc(docRef, {
              [`items.${id}`]: deleteField(),
              updatedAt: new Date().toISOString()
            });
          } catch {}
        }
      }

      setData(prev => {
        if (!prev) return prev;
        const newLogs = { ...prev.logs };
        delete newLogs[id];
        updateCache(newLogs);
        return {
          ...prev,
          logs: newLogs
        };
      });
    } catch (e) {
      console.error('deleteLog error:', e);
    }
  };

  const deleteAllLogs = async () => {
    try {
      // 1. logs 컬렉션 문서 삭제
      const logsRef = collection(db, 'logs');
      const snapshot = await getDocs(query(logsRef));
      
      let batch = writeBatch(db);
      let count = 0;
      
      snapshot.forEach((document) => {
        batch.delete(document.ref);
        count++;
        if (count % 400 === 0) {
          batch.commit();
          batch = writeBatch(db);
        }
      });

      // 2. logs_by_month 컬렉션 문서 삭제
      try {
        const monthSnaps = await getDocs(collection(db, 'logs_by_month'));
        monthSnaps.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          count++;
          if (count % 400 === 0) {
            batch.commit();
            batch = writeBatch(db);
          }
        });
      } catch (e) {
        console.warn('logs_by_month 삭제 중 경고:', e);
      }
      
      if (count % 400 !== 0) {
        await batch.commit();
      }
      
      updateCache({});
      
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          logs: {}
        };
      });
    } catch (e) {
      console.error('Error deleting all logs:', e);
    }
  };

  const updateGuide = async (guide: PatternGuide) => {
    if (!data) return;
    try {
      const serverHandled = await executeAdminMutation('updateGuide', { guide });
      if (!serverHandled) {
        await setDoc(doc(db, 'config', 'patternGuides'), {
          [guide.id]: guide
        }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateSystemConfig = async (sys: Partial<SystemConfig>) => {
    try {
      const sanitized = cleanFirestoreData(sys);
      const serverHandled = await executeAdminMutation('updateSystemConfig', { config: sanitized });
      if (!serverHandled) {
        await setDoc(doc(db, 'config', 'system'), sanitized, { merge: true });
      }
      setData(prev => {
        if (!prev) return prev;
        const newSystem = { ...prev.system };
        for (const [key, val] of Object.entries(sys)) {
          if (val === undefined || (val && typeof val === 'object' && ((val as any)._methodName === 'deleteField' || (val as any).constructor?.name === 'FieldValue'))) {
            delete (newSystem as any)[key];
          } else {
            (newSystem as any)[key] = val;
          }
        }
        return {
          ...prev,
          system: newSystem as SystemConfig
        };
      });
    } catch (e) {
      console.error('updateSystemConfig error:', e);
      throw e;
    }
  };

  const rateVideo = async (videoId: string, score: number) => {
    try {
      const docRef = doc(db, 'config', 'videoStats');
      const snap = await getDoc(docRef);
      let stats = snap.exists() ? snap.data() : {};
      
      const current = stats[videoId] || { score: 0, count: 0 };
      const newScore = score >= 4 ? 1 : -1; // thumbs up/down
      
      await setDoc(docRef, {
        [videoId]: {
          score: current.score + newScore,
          count: current.count + 1
        }
      }, { merge: true });
    } catch(e) {
      console.error(e);
    }
  };

  return { 
    data, 
    loading, 
    loadingProgress,
    loadingStatusText,
    isFirstRun,
    addLog, 
    updateLog, 
    deleteLog, 
    deleteAllLogs, 
    updateGuide, 
    fetchLogsByDateRange, 
    fetchLatestLogs,
    rateVideo, 
    updateSystemConfig 
  };
}