import { useEffect, useState } from 'react';

/** 유튜브 조회수 (정렬 '유튜브 인기순'에만 씀, 화면에 숫자로 보여 주지 않음). 6시간 기기에 저장 */
const KEY = 'uzuhama_yt_views_v1';
let mem: Record<string, number> | null = null;
let loading: Promise<Record<string, number>> | null = null;

function load(): Promise<Record<string, number>> {
  if (mem) return Promise.resolve(mem);
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c?.v && Date.now() - c.t < 6 * 3600000) { mem = c.v; return Promise.resolve(mem!); }
  } catch { /* */ }
  if (!loading) {
    const base = window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app';
    loading = fetch(`${base}/api/videos/search-index?ai=views`).then((r) => r.json()).then((j) => {
      mem = j?.views || {};
      try { localStorage.setItem(KEY, JSON.stringify({ v: mem, t: Date.now() })); } catch { /* */ }
      return mem!;
    }).catch(() => { loading = null; return {}; });
  }
  return loading;
}

/** enabled 일 때만 받아 옴 (인기순을 고르기 전에는 안 받음) */
export function useYoutubeViews(enabled: boolean): Record<string, number> | null {
  const [v, setV] = useState<Record<string, number> | null>(mem);
  useEffect(() => { if (enabled && !v) load().then(setV); }, [enabled, v]);
  return enabled ? v : null;
}

export const ytIdOf = (u: any) => (String((typeof u === 'string' ? u : u?.url || u?.videoUrl) || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
