import { useEffect, useState } from 'react';

/**
 * 추천 영상 카드용 유튜브 영상 정보(길이·업로드일).
 * 여러 카드의 요청을 모아 한 번에 조회하고 브라우저에도 저장 (서버는 Firestore video_meta 에 영구 저장)
 */
export interface VideoMeta {
  durationSec: number | null;
  publishedAt: string | null;
}

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const STORAGE_KEY = 'uzuhama_video_meta_v2';
const cache = new Map<string, VideoMeta | null>();
try {
  localStorage.removeItem('uzuhama_video_durations_v1');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  Object.entries(saved).forEach(([k, v]) => cache.set(k, v as VideoMeta));
} catch {}

const listeners = new Map<string, Set<(v: VideoMeta | null) => void>>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  try {
    const obj: Record<string, VideoMeta> = {};
    cache.forEach((v, k) => { if (v) obj[k] = v; });
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
      const videos = json?.videos || {};
      chunk.forEach((id) => {
        if (!(id in videos)) return; // 조회 실패: 다음에 다시 시도
        cache.set(id, videos[id]);
        listeners.get(id)?.forEach((fn) => fn(videos[id]));
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

/** 업로드 시각(ISO)을 한국 날짜 YYYY-MM-DD 로 */
export function toKstDate(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10);
}

export function useVideoMeta(videoId?: string | null): VideoMeta | null {
  const [value, setValue] = useState<VideoMeta | null>(() => (videoId && cache.has(videoId) ? cache.get(videoId)! : null));
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

/** 유튜브와 같은 경과 시간 표기 (내림): 방금 전 / N분 전 / N시간 전 / N일 전 / N주 전 / N개월 전 / N년 전 */
export function formatRelativeTime(iso: string, now: number = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}
