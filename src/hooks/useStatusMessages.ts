import { useEffect, useState } from 'react';

/** AI 가 하루 단위로 만든 상태 문구 묶음 (서버가 Firestore 에 저장, 모든 사용자 공통) */
export type StatusMessageSets = Partial<Record<'absence' | 'high' | 'medium' | 'lowDay' | 'lowNight' | 'streamedToday', string[]>>;

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const STORAGE_KEY = 'uzuhama_status_messages_v1';
const REFRESH_MS = 30 * 60 * 1000;

export function useStatusMessages(): StatusMessageSets | null {
  const [sets, setSets] = useState<StatusMessageSets | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.sets || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved?.fetchedAt && Date.now() - saved.fetchedAt < REFRESH_MS && saved.sets) return;
      } catch {}
      try {
        const r = await fetch(`${API_BASE}/api/status-messages`);
        const json = await r.json();
        if (!cancelled && json?.sets) {
          setSets(json.sets);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets: json.sets, key: json.key, fetchedAt: Date.now() }));
          } catch {}
        }
      } catch {}
    };
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return sets;
}
