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
import { overlayMonthDocs } from '../utils/archiveOverlay';
import { kvGet, kvSet } from '../utils/kv';
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
    // 서버가 거절한 경우(인증·검사 실패 등)는 조용히 넘어가지 않고 이유를 알림
    // (예전에는 기기에서 직접 쓰기로 넘어갔다가 권한이 없어 저장이 안 된 채 끝났음)
    if (res.status !== 404 && res.status !== 405) {
      throw Object.assign(new Error(String(errJson?.error || errJson?.message || `서버 오류 ${res.status}`)), { server: true });
    }
    return false;
  } catch (e: any) {
    if (e?.server) throw e;
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



// ─────────────────────────────────────────────────────────────
// 아카이브(JSON) 덮어쓰기 규칙
//  - 관리자가 JSON 기록을 수정하면 Firestore logs_by_month 에 "바뀐 필드만" 저장 (_patch: true)
//  - 사이트는 JSON 을 원본으로 불러온 뒤 수정분을 덮어씀
//  - 예전 버전이 저장한 전체 사본(_patch 없음)은 추가된 영상·몰아보기·쇼츠·게임 링크만 합치고
//    옛 형식 카테고리 등은 무시 (JSON 이 더 정확함)
// ─────────────────────────────────────────────────────────────
const PATCH_META_KEYS = new Set(['id', 'date', '_patch', '_updatedAt']);

const sameJson = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const normalizeGameLinks = (log: any) =>
  Array.isArray(log?.games)
    ? log.games.map((g: any) => ({ ...g, link: g?.link || g?.url || g?.gameUrl || g?.steamUrl || log.gameLink || '' }))
    : log?.games;



/** 관리자가 아카이브 기록을 저장할 때 JSON 원본과 다른 필드만 추린 수정분 생성 (원본이 없으면 null) */
export async function buildArchivePatch(log: BroadcastLog): Promise<any | null> {
  const historical = await loadHistoricalLogs();
  const base = historical[log.id] || Object.values(historical).find((l) => l.date === log.date);
  if (!base) return null;
  const patch: any = { id: base.id, date: base.date, _patch: true, _updatedAt: new Date().toISOString() };
  if (log.date && log.date !== base.date) patch._date = log.date;
  const keys = new Set([...Object.keys(base), ...Object.keys(log)]);
  keys.forEach((k) => {
    if (PATCH_META_KEYS.has(k)) return;
    const next = (log as any)[k];
    const prev = (base as any)[k];
    if (sameJson(next, prev)) return;
    patch[k] = next === undefined ? null : next;
  });
  return patch;
}

const CONFIG_CACHE_KEY = 'uzuhama_config_cache_v1';

export function useFirebaseData() {
  const [data, setData] = useState<AppData | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [loadingStatusText, setLoadingStatusText] = useState('불러오는 중');
  const [isFirstRun, setIsFirstRun] = useState(false);
  
  const isFirstLiveCheckRef = useRef(true);
  const prevStatusRef = useRef<string | null>(null);

  const updateCache = (newLogs: Record<string, BroadcastLog>) => {
    localStorage.setItem('uzuhama_logs_cache_v4', JSON.stringify(newLogs));
    localStorage.setItem('uzuhama_logs_time_v2', Date.now().toString());
  };

  const lastFetchTimeRef = useRef<number>(0);
  const MONTH_DOCS_KEY = 'logs_by_month_v1';
  const FULL_RESYNC_MS = 24 * 3600 * 1000;
  const COMPILATIONS_CACHE_KEY = 'uzuhama_fs_compilations_v1';

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

      // 2. Firestore logs_by_month → JSON 위에 덮어쓰기
      //    읽기 절약: 월별 문서 사본을 기기(IndexedDB)에 두고, 그 뒤에 바뀐 문서(updatedAt 이 더 나중)만 읽음
      //    → 바뀐 게 없으면 읽기 1회. 사본이 없거나 하루가 지나면 전체를 한 번 읽음 (지워진 문서 정리)
      let cachedMerged: Record<string, BroadcastLog> | null = null;
      try { cachedMerged = JSON.parse(localStorage.getItem('uzuhama_logs_cache_v4') || 'null'); } catch {}
      let overlayFailed = false;
      let doFull = false;
      let monthChanged = false;
      // 과거 아카이브를 못 불러왔으면(네트워크 등) 덮어쓰지 않고 저장해 둔 결과를 씀
      const histOk = Object.keys(historicalLogs).length > 0;
      try {
        const saved = (await kvGet<{ docs: Record<string, any>; syncAt: string; fullAt: number }>(MONTH_DOCS_KEY)) || null;
        doFull = !saved || !saved.docs || now - (saved.fullAt || 0) > FULL_RESYNC_MS;
        let docs: Record<string, any> = doFull ? {} : { ...saved!.docs };
        let syncAt = doFull ? '' : saved!.syncAt || '';
        const snaps = doFull || !syncAt
          ? await getDocs(collection(db, 'logs_by_month'))
          : await getDocs(query(collection(db, 'logs_by_month'), where('updatedAt', '>', syncAt)));
        monthChanged = snaps.size > 0;
        snaps.forEach((d) => {
          const v: any = d.data();
          docs[d.id] = v;
          if (typeof v?.updatedAt === 'string' && v.updatedAt > syncAt) syncAt = v.updatedAt;
        });
        if (!histOk) throw new Error('과거 아카이브를 못 불러옴');
        Object.assign(logsMap, overlayMonthDocs(historicalLogs, Object.values(docs)));
        kvSet(MONTH_DOCS_KEY, { docs, syncAt, fullAt: doFull ? now : saved!.fullAt });
      } catch (e: any) {
        console.warn('logs_by_month 조회 경고:', e?.message);
        overlayFailed = true;
        if (cachedMerged && Object.keys(cachedMerged).length) Object.assign(logsMap, cachedMerged);
      }

      // 4. Firestore compilations (몰아보기) 컬렉션 조회:
      // 과거 기록 JSON이 수정되거나 교체되더라도 등록된 몰아보기와 선택된 게임 목록이 사라지지 않고 100% 영구 보존되도록 병합
      try {
        // 몰아보기 원본은 compilations 컬렉션 (서버 규칙이 공개 읽기를 막고 있으면 건너뜀:
        // 아카이브 날짜의 몰아보기는 위 logs_by_month 덮어쓰기로 이미 반영됨)
        const compSources: { docId: string; comp: any }[] = [];
        try {
          let cachedComps: { docId: string; comp: any }[] | null = null;
          if (!doFull && !monthChanged) {
            try { cachedComps = JSON.parse(localStorage.getItem(COMPILATIONS_CACHE_KEY) || 'null'); } catch {}
          }
          if (Array.isArray(cachedComps)) {
            compSources.push(...cachedComps);
          } else {
            const compSnaps = await getDocs(collection(db, 'compilations'));
            compSnaps.forEach((d) => compSources.push({ docId: d.id, comp: d.data() }));
            try { localStorage.setItem(COMPILATIONS_CACHE_KEY, JSON.stringify(compSources)); } catch {}
          }
        } catch (permErr: any) {
          console.debug('compilations 직접 조회 불가:', permErr?.message);
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
      if (Object.keys(logsMap).length > 0 && !overlayFailed) {
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

  // 사이트 설정·통계를 기기에 저장해 두고 다음 방문 때 바로 표시 (Firestore 읽기 횟수는 그대로)
  useEffect(() => {
    if (!data?.system || Object.keys(data.system).length <= 3) return;
    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
        system: data.system, dailyStats: data.dailyStats, timeStats: data.timeStats,
        patternGuides: data.patternGuides, videoStats: data.videoStats, savedAt: Date.now(),
      }));
    } catch { /* 저장 공간 부족 등은 무시 */ }
  }, [data?.system, data?.dailyStats, data?.timeStats, data?.patternGuides, data?.videoStats]);

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
            // 지난번에 받아 둔 사이트 설정(휴방 사유·공지 등)·통계를 바로 써서, 새로 받기 전에도 화면이 완성된 상태로 뜸
            let cfg: any = null;
            try { cfg = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch {}
            const fastInitialData: AppData = {
              logs: cachedLogs,
              dailyStats: cfg?.dailyStats || defaultDaily.reduce((acc, stat) => ({ ...acc, [stat.day]: stat }), {} as any),
              timeStats: cfg?.timeStats || defaultTime.reduce((acc, stat) => ({ ...acc, [stat.time]: stat }), {} as any),
              durationStats: defaultDuration.reduce((acc, stat) => ({ ...acc, [stat.label]: stat }), {} as any),
              monthlyStats: defaultMonthly.reduce((acc, stat) => ({ ...acc, [stat.month]: stat }), {} as any),
              patternGuides: cfg?.patternGuides || defaultGuides.reduce((acc, guide) => ({ ...acc, [guide.id]: guide }), {} as any),
              videoStats: cfg?.videoStats || {},
              system: cfg?.system || { maintenance: false, noticeType: 'none', noticeContent: '' }
            };
            setData(fastInitialData);
            setLoading(false);
          } catch {}
        } else {
          setIsFirstRun(true);
          setLoading(true);
        }

        setLoadingProgress(20);
        setLoadingStatusText('설정 불러오는 중');

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
        setLoadingStatusText('방송 기록 불러오는 중');

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
        setLoadingStatusText('최신 기록 맞추는 중');

        // 3. 첫 실행 시 Firestore 최신 데이터 호출 및 병합
        await fetchLatestLogs(true);

        setLoadingProgress(100);
        setLoadingStatusText('준비됐어요');
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
      // 아카이브(JSON) 기록이면 원본과 다른 필드만 저장, 아니면 기록 전체 저장
      const archivePatch = await buildArchivePatch(log);
      const sanitizedLog = cleanFirestoreData(archivePatch || log);
      const serverHandled = await executeAdminMutation('updateLog', { log: sanitizedLog });
      if (!serverHandled) {
        await setDoc(doc(db, 'logs', sanitizedLog.id), sanitizedLog);
        try {
          const monthKey = sanitizedLog.date.slice(0, 7);
          const docRef = doc(db, 'logs_by_month', monthKey);
          const snap = await getDoc(docRef);
          if (!snap.exists()) {
            await setDoc(docRef, { month: monthKey, updatedAt: new Date().toISOString(), items: { [sanitizedLog.id]: sanitizedLog } });
          } else {
            // 해당 항목은 통째로 교체하고, 같은 날짜의 옛 전체 사본(다른 id)은 정리
            const updates: Record<string, any> = { updatedAt: new Date().toISOString(), [`items.${sanitizedLog.id}`]: sanitizedLog };
            if (archivePatch) {
              Object.entries(snap.data()?.items || {}).forEach(([k, v]: [string, any]) => {
                if (k !== sanitizedLog.id && v?.date === sanitizedLog.date && !v?._patch) updates[`items.${k}`] = deleteField();
              });
            }
            await updateDoc(docRef, updates);
          }
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