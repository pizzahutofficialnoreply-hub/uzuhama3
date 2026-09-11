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
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BroadcastLog, DailyStat, TimeStat, DurationStat, MonthlyStat, AppData, PatternGuide, SystemConfig } from '../types';
import { dailyStats as defaultDaily, timeStats as defaultTime, durationStats as defaultDuration, monthlyStats as defaultMonthly, patternGuides as defaultGuides } from '../data';

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
    if (Array.isArray(data)) {
      data.forEach(log => {
        if (log && log.id) map[log.id] = log;
      });
    } else if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, val]) => {
        if (val && typeof val === 'object') {
          map[key] = val as BroadcastLog;
        }
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
  
  const isFirstLiveCheckRef = useRef(true);
  const prevStatusRef = useRef<string | null>(null);

  const updateCache = (newLogs: Record<string, BroadcastLog>) => {
    localStorage.setItem('uzuhama_logs_cache_v4', JSON.stringify(newLogs));
    localStorage.setItem('uzuhama_logs_time_v2', Date.now().toString());
  };

  const lastFetchTimeRef = useRef<number>(0);

  // 핵심 일지 데이터 호출 함수: 과거 아카이브(JSON) + Firestore 최신 데이터 병합
  const fetchLatestLogs = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    // 강제 새로고침이 아니고, 최근 2분 이내에 이미 최신 데이터를 불러왔다면 중복 요청 방지
    if (!force && lastFetchTimeRef.current > 0 && now - lastFetchTimeRef.current < 120000) {
      return;
    }

    try {
      // 1. 과거 아카이브 JSON 로드 (2016~2025)
      const historicalLogs = await loadHistoricalLogs();
      const logsMap: Record<string, BroadcastLog> = { ...historicalLogs };

      // 2. Firestore의 logs_by_month에서 최신 데이터(2026~) 조회
      try {
        const monthSnaps = await getDocs(collection(db, 'logs_by_month'));
        if (!monthSnaps.empty) {
          monthSnaps.forEach((docSnap) => {
            const docData = docSnap.data();
            // Firestore에 등록된 최신 데이터가 과거 JSON보다 항상 우선권을 갖도록 덮어씌움
            if (docData?.items && typeof docData.items === 'object') {
              Object.assign(logsMap, docData.items);
            }
            Object.entries(docData || {}).forEach(([key, val]) => {
              if (key !== 'month' && key !== 'updatedAt' && key !== 'items' && val && typeof val === 'object' && (val as any).date) {
                logsMap[key] = val as BroadcastLog;
              }
            });
          });
        }
      } catch (e: any) {
        console.warn('logs_by_month 컬렉션 조회 경고:', e?.message);
      }

      // 3. 로컬 캐시 갱신 및 화면 반영
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

  // 3. [트리거 3] 첫 실행 시 데이터 호출 및 초기화
  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoading(true);
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

        // 2. 로컬 캐시 확인하여 화면에 즉시 선표시
        const cachedLogsStr = localStorage.getItem('uzuhama_logs_cache_v4');
        if (cachedLogsStr) {
          try {
            const cachedLogs = JSON.parse(cachedLogsStr);
            initialData.logs = { ...initialData.logs, ...cachedLogs };
          } catch (e) {
            console.error('Cache parsing error', e);
          }
        }
        setData(initialData);

        // 3. 첫 실행 시 Firestore 최신 데이터 호출 및 병합
        await fetchLatestLogs();

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
    await fetchLatestLogs();
  }, [fetchLatestLogs]);

  // 관리자 일지 등록
  const addLog = async (log: BroadcastLog) => {
    if (!data) return;
    try {
      const sanitizedLog = cleanFirestoreData(log);
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
      await setDoc(doc(db, 'config', 'patternGuides'), {
        [guide.id]: guide
      }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const updateSystemConfig = async (sys: Partial<SystemConfig>) => {
    try {
      const sanitized = cleanFirestoreData(sys);
      await setDoc(doc(db, 'config', 'system'), sanitized, { merge: true });
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