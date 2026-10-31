import { useEffect, useMemo, useState } from 'react';
import type { SystemConfig } from '../types';
import { statusMessageKey } from '../utils/probability';

/**
 * AI 상태 문구 묶음 (상황별 수십 개)
 * - 한 번 받아 로컬에 저장해 두고 그대로 사용 (서버와 계속 동기화하지 않음)
 * - 방송일(오전 6시)이 바뀌거나 휴방 상황·사유가 바뀌어 키가 달라질 때만 서버에서 새 묶음을 받음
 */
export type StatusMessageSets = Partial<Record<'absence' | 'high' | 'medium' | 'lowDay' | 'lowNight' | 'streamedToday', string[]>>;

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const STORAGE_KEY = 'uzuhama_status_messages_v2';

type Stored = { key: string; sets: StatusMessageSets; savedAt: number };

function readStored(): Stored | null {
  try {
    localStorage.removeItem('uzuhama_status_messages_v1');
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function useStatusMessages(system: SystemConfig | undefined, now: Date): StatusMessageSets | null {
  // 분 단위로 바뀌는 now 대신 키 문자열만 의존 → 키가 바뀌는 순간에만 다시 받음
  const expectedKey = useMemo(() => (system ? statusMessageKey(system, now) : ''), [system, now]);
  const [stored, setStored] = useState<Stored | null>(readStored);

  useEffect(() => {
    if (!expectedKey) return;
    if (stored?.key === expectedKey) return;
    let cancelled = false;
    let retry: number | undefined;
    const load = async (attempt: number) => {
      try {
        const r = await fetch(`${API_BASE}/api/status-messages?k=${encodeURIComponent(expectedKey)}`);
        const json = await r.json();
        if (cancelled) return;
        if (json?.sets && json.key === expectedKey) {
          const next = { key: json.key, sets: json.sets, savedAt: Date.now() };
          setStored(next);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
          return;
        }
        // 다른 사용자가 생성 중이거나 실패: 이전 묶음은 계속 쓰고 잠시 뒤 한 번 더 시도
        if (attempt < 3) retry = window.setTimeout(() => load(attempt + 1), 30000 * (attempt + 1));
      } catch {}
    };
    load(0);
    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
    };
  }, [expectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return stored?.sets || null;
}
