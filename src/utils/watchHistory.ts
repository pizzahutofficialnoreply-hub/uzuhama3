import { useEffect, useState } from 'react';

/**
 * 시청 기록 + 이어 보기 위치 (이 기기에만 저장)
 * - 사이트에서 영상을 열거나 사이트 안에서 재생하면 기록 (설정의 '기록 일시 중지' 중에는 기록 안 함)
 * - 사이트 안 재생기(유튜브 퍼가기)가 알려 주는 재생 위치를 몇 초마다 저장
 *   → 다시 열면 그 위치부터, '유튜브에서 보기'도 그 위치부터 (주소에 &t=초)
 */
export type WatchKind = 'video' | 'short' | 'live';
export type WatchEntry = { id: string; kind: WatchKind; title: string; at: number; pos?: number; dur?: number };

const KEY = 'uzuhama_watch_history_v1';
const EVENT = 'uzuhama-watch-history';
const MAX = 600;
const PAUSE_KEY = 'uzuhama_interest_paused'; // 맞춤 추천 '기록 일시 중지'와 같이

let cache: WatchEntry[] = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })();
let saveTimer: number | undefined;
const paused = () => { try { return localStorage.getItem(PAUSE_KEY) === '1'; } catch { return false; } };
function persist(now = false) {
  const run = () => { try { localStorage.setItem(KEY, JSON.stringify(cache.slice(0, MAX))); } catch { /* 가득 참 */ } };
  if (typeof window === 'undefined') return;
  window.clearTimeout(saveTimer);
  if (now) run(); else saveTimer = window.setTimeout(run, 600);
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* 무시 */ }
}

export function getWatchHistory() { return cache; }
export function useWatchHistory(): WatchEntry[] {
  const [h, setH] = useState(cache);
  useEffect(() => {
    const on = () => setH([...cache]);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return h;
}

/** 봤다고 기록 (같은 영상은 맨 위로 올림, 재생 위치는 그대로) */
export function recordWatch(e: { id: string; kind: WatchKind; title?: string }) {
  if (!e?.id || paused()) return;
  const prev = cache.find((x) => x.id === e.id);
  const next: WatchEntry = { ...(prev || {}), id: e.id, kind: e.kind || prev?.kind || 'video', title: e.title || prev?.title || '', at: Date.now() };
  cache = [next, ...cache.filter((x) => x.id !== e.id)].slice(0, MAX);
  persist();
}
/** 재생 위치 저장 (사이트 안 재생기) */
export function recordPosition(id: string, pos: number, dur: number, title?: string) {
  if (!id || paused() || !Number.isFinite(pos)) return;
  const i = cache.findIndex((x) => x.id === id);
  if (i < 0) { recordWatch({ id, kind: dur && dur <= 70 ? 'short' : 'video', title }); return recordPosition(id, pos, dur, title); }
  const e = cache[i];
  cache[i] = { ...e, pos: Math.floor(pos), dur: dur ? Math.floor(dur) : e.dur, title: e.title || title || '', at: Date.now() };
  if (i > 0) cache = [cache[i], ...cache.slice(0, i), ...cache.slice(i + 1)];
  persist();
}
export function removeWatch(id: string) { cache = cache.filter((x) => x.id !== id); persist(true); }
export function clearWatchEntries() { cache = []; persist(true); }

/** 이어 볼 위치 (앞 5초 이내·끝 15초 이내는 처음부터) */
export function resumeAt(id: string): number {
  const e = cache.find((x) => x.id === id);
  if (!e?.pos || e.pos < 5) return 0;
  if (e.dur && e.pos > e.dur - 15) return 0;
  return e.pos;
}
export const progressOf = (e?: WatchEntry) => (e?.pos && e?.dur ? Math.min(1, e.pos / e.dur) : 0);
/** 카드 하나의 본 만큼 (값이 바뀔 때만 다시 그림) */
export function useProgress(id: string): number {
  const get = () => (id ? progressOf(cache.find((x) => x.id === id)) : 0);
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => { const n = get(); setV((o) => (Math.abs(o - n) > 0.005 ? n : o)); };
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** 유튜브에서 이어 보기 주소 (쇼츠는 유튜브가 시작 시간을 무시해서 일반 화면으로) */
export function watchUrl(id: string, opts: { kind?: WatchKind; list?: string; t?: number } = {}) {
  const t = opts.t ?? resumeAt(id);
  if (opts.kind === 'short' && !t) return `https://www.youtube.com/shorts/${id}`;
  return `https://www.youtube.com/watch?v=${id}${opts.list ? `&list=${opts.list}` : ''}${t ? `&t=${t}s` : ''}`;
}
/** 유튜브 주소에 이어 보기 시간 붙이기 (유튜브 영상 주소가 아니면 그대로) */
export function withResume(url: string, id?: string | null): string {
  if (!id) return url;
  const t = resumeAt(id);
  if (!t || /[?&]t=\d/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}s`;
}

// ── 사이트 안 재생기(유튜브 퍼가기)에서 재생 위치 받기 ──
// enablejsapi=1 로 퍼간 iframe 에 'listening' 을 보내면, 유튜브가 재생 정보를 postMessage 로 계속 알려 줌
const frames = new Set<HTMLIFrameElement>();
const lastSaved = new Map<string, number>();
export const currentOf = new WeakMap<HTMLIFrameElement, { id: string; t: number; list?: string }>();

function hello(f: HTMLIFrameElement) {
  try { f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'uzuhama', channel: 'widget' }), '*'); } catch { /* 무시 */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev) => {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(ev.origin)) return;
    let d: any;
    try { d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch { return; }
    if (!d || d.event !== 'infoDelivery' || !d.info) return;
    let frame: HTMLIFrameElement | undefined;
    frames.forEach((f) => { if (!f.isConnected) frames.delete(f); else if (f.contentWindow === ev.source) frame = f; });
    if (!frame) return;
    const prev = currentOf.get(frame) || { id: '', t: 0 };
    const id = d.info.videoData?.video_id || prev.id;
    const t = Number(d.info.currentTime ?? prev.t);
    if (!id) return;
    currentOf.set(frame, { ...prev, id, t });
    const dur = Number(d.info.duration || 0);
    const key = id;
    const last = lastSaved.get(key) || 0;
    // 5초에 한 번만 저장
    if (Date.now() - last > 5000 && t > 0) {
      lastSaved.set(key, Date.now());
      recordPosition(id, t, dur, d.info.videoData?.title);
    }
  });
}

/** 퍼간 유튜브 iframe 에 붙이는 ref: <iframe ref={trackYoutubeFrame} src={embedSrc(...)} /> */
export function trackYoutubeFrame(f: HTMLIFrameElement | null) {
  if (!f || frames.has(f)) return;
  frames.add(f);
  const say = () => { hello(f); window.setTimeout(() => hello(f), 800); window.setTimeout(() => hello(f), 2500); };
  f.addEventListener('load', say);
  say();
}

/** 퍼가기 주소: 재생 위치를 받을 수 있게 하고, 보던 곳부터 */
export function embedSrc(id: string, params: Record<string, string | number> = {}) {
  const start = resumeAt(id);
  const q = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', enablejsapi: '1', origin: typeof window !== 'undefined' ? window.location.origin : '', ...(start ? { start: String(start) } : {}), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `https://www.youtube.com/embed/${id}?${q.toString()}`;
}
/** 이미 만들어진 퍼가기 주소에 재생 위치 받기 옵션 붙이기 */
export function trackableEmbed(src: string) {
  if (!src || /enablejsapi=1/.test(src)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`;
}
