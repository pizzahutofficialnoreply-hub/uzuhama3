import { useEffect, useState } from 'react';

/** 추천 영상 카드용 유튜브 영상 길이(초). 여러 카드의 요청을 모아 한 번에 조회하고, 결과는 세션 동안 캐시 */
const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const STORAGE_KEY = 'uzuhama_video_durations_v1';
const cache = new Map<string, number | null>();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  Object.entries(saved).forEach(([k, v]) => cache.set(k, v as number | null));
} catch {}

const listeners = new Map<string, Set<(v: number | null) => void>>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  try {
    const obj: Record<string, number | null> = {};
    cache.forEach((v, k) => { if (typeof v === 'number') obj[k] = v; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

async function flush() {
  timer = null;
  const ids = [...pending];
  pending = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const r = await fetch(`${API_BASE}/api/videos/meta?ids=${chunk.join(',')}`);
      const json = await r.json();
      const durations = json?.durations || {};
      chunk.forEach((id) => {
        if (!(id in durations)) return; // 조회 실패: 다음에 다시 시도
        cache.set(id, durations[id]);
        listeners.get(id)?.forEach((fn) => fn(durations[id]));
      });
      persist();
    } catch {}
  }
}

export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function useVideoDuration(videoId?: string | null): number | null {
  const [value, setValue] = useState<number | null>(() => (videoId && cache.has(videoId) ? cache.get(videoId)! : null));
  useEffect(() => {
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    if (cache.has(videoId)) {
      setValue(cache.get(videoId)!);
      return;
    }
    if (!listeners.has(videoId)) listeners.set(videoId, new Set());
    listeners.get(videoId)!.add(setValue);
    pending.add(videoId);
    if (!timer) timer = setTimeout(flush, 120);
    return () => {
      listeners.get(videoId)?.delete(setValue);
    };
  }, [videoId]);
  return value;
}
