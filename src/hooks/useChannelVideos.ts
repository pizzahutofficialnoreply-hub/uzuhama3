import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../utils/kv';

/**
 * 우주하마 유튜브 채널의 일반 영상 전체 (쇼츠·생방송 제외)
 * - 서버가 유튜브에서 12시간마다 한 번 받아 저장해 둔 것을 받음. 브라우저에도 12시간 보관
 * - 방송 기록에 연결되지 않은 영상도 홈에 보이게 하고, 관리자 '연동 안 된 영상'에서 연결할 때 사용
 */
export type ChannelVideo = { videoId: string; title: string; publishedAt: string };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const KEY = 'uzuhama_channel_uploads_v1';
const TTL = 12 * 3600 * 1000;

let cache: ChannelVideo[] = [];
let at = 0;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (Array.isArray(saved?.items)) { cache = saved.items; at = Number(saved.at || 0); }
} catch { /* 무시 */ }
const listeners = new Set<(v: ChannelVideo[]) => void>();
let fetching: Promise<void> | null = null;
// localStorage 가 가득 차 저장이 안 된 기기(아이폰 등)도 다음에 켜면 바로 쓰게 IndexedDB 에도 보관
const kvKey = 'channel_uploads_v1';
const kvReady: Promise<void> = cache.length ? Promise.resolve() : kvGet<{ items: ChannelVideo[]; at: number }>(kvKey).then((s) => {
  if (!cache.length && Array.isArray(s?.items) && s!.items.length) { cache = s!.items; at = Number(s!.at || 0); listeners.forEach((fn) => fn(cache)); }
}).catch(() => {});

function ensure() {
  // IndexedDB 에서 꺼내는 중이면 끝난 뒤에 판단 (꺼낸 목록이 새것이면 서버를 안 부름)
  kvReady.then(ensureNow);
}
function ensureNow() {
  if (fetching || (cache.length && Date.now() - at < TTL)) return;
  // 저장해 둔 게 없으면: 사이트에 같이 배포된 목록을 먼저 (서버를 안 거쳐서 바로 정렬됨) → 그 뒤 서버에서 최신
  if (!cache.length) {
    fetch('/data/channel_uploads.json').then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null)).then((j) => {
      if (!cache.length && Array.isArray(j?.videos) && j.videos.length) { cache = j.videos; listeners.forEach((fn) => fn(cache)); }
    }).catch(() => {});
  }
  fetching = fetch(`${API_BASE}/api/videos/shorts?kind=uploads`)
    .then((r) => r.json())
    .then((json) => {
      if (!Array.isArray(json?.videos) || !json.videos.length) return;
      cache = json.videos;
      at = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify({ items: cache, at })); } catch { /* 가득 참 */ }
      kvSet(kvKey, { items: cache, at });
      listeners.forEach((fn) => fn(cache));
    })
    .catch(() => { /* 다음에 */ })
    .finally(() => { fetching = null; });
}

export function useChannelVideos(): ChannelVideo[] {
  const [v, setV] = useState<ChannelVideo[]>(cache);
  useEffect(() => {
    listeners.add(setV);
    ensure();
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
