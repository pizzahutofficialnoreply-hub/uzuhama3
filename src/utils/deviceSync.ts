import { useEffect, useState } from 'react';
import { getWatchHistory, replaceWatchHistory, type WatchEntry } from './watchHistory';
import { getMyPlaylists, replaceMyLists, type MyList } from './myPlaylists';
import { readRecentSearches, replaceRecentSearches } from '../hooks/useRecentSearches';
import { readTomb, writeTomb, type Tomb } from './syncTomb';

/**
 * 기기 연결: 로그인 없이 QR·코드로 연결한 기기끼리 검색 기록·시청 기록·재생목록을 맞춤
 * - 연결 열쇠(긴 무작위 값)는 연결한 기기에만 있고, 서버에는 열쇠를 해시한 이름으로만 저장
 * - QR·코드는 10분 동안 한 번만 쓰는 연결 코드 (열쇠 자체가 아님)
 * - 합치기: 시청 기록은 영상마다 더 최근 것, 재생목록은 목록마다 더 최근에 고친 것, 최근 검색어는 더 최근에 바뀐 쪽
 *   지운 건 언제 지웠는지 적어 둬서 다시 살아나지 않음
 */
export type SyncState = { h: WatchEntry[]; l: MyList[]; s: { list: string[]; at: number }; t: Tomb };
type Link = { key: string; linkedAt: number; lastSync?: number; lastError?: string };

const LINK_KEY = 'uzuhama_device_link_v1';
const EVENT = 'uzuhama-device-link';
const API = (typeof window !== 'undefined' && /vercel\.app$|^localhost$|^127\./.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app') + '/api/health';

export function readLink(): Link | null {
  try { const v = JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); return v && /^[a-f0-9]{40}$/.test(v.key) ? v : null; } catch { return null; }
}
function writeLink(v: Link | null) {
  try { if (v) localStorage.setItem(LINK_KEY, JSON.stringify(v)); else localStorage.removeItem(LINK_KEY); } catch { /* */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* */ }
}
export function useDeviceLink() {
  const [l, setL] = useState(readLink);
  useEffect(() => {
    const on = () => setL(readLink());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return l;
}

/* ── 합치기 (순수 함수, 테스트 있음) ── */
export function mergeTomb(a: Tomb, b: Tomb): Tomb {
  const max = (x: Record<string, number>, y: Record<string, number>) => {
    const o = { ...x };
    Object.entries(y || {}).forEach(([k, v]) => { o[k] = Math.max(o[k] || 0, v); });
    return o;
  };
  return { h: max(a.h, b.h), hClear: Math.max(a.hClear || 0, b.hClear || 0), l: max(a.l, b.l), s: Math.max(a.s || 0, b.s || 0) };
}
export function mergeState(a: SyncState, b: SyncState): SyncState {
  const t = mergeTomb(a.t, b.t);
  const hm = new Map<string, WatchEntry>();
  [...a.h, ...b.h].forEach((e) => {
    if (!e?.id) return;
    const p = hm.get(e.id);
    if (!p || (e.at || 0) > (p.at || 0)) hm.set(e.id, { ...p, ...e });
  });
  const h = [...hm.values()]
    .filter((e) => (e.at || 0) > t.hClear && !((t.h[e.id] || 0) >= (e.at || 0)))
    .sort((x, y) => (y.at || 0) - (x.at || 0))
    .slice(0, 600);
  const lm = new Map<string, MyList>();
  [...a.l, ...b.l].forEach((x) => {
    if (!x?.id) return;
    const p = lm.get(x.id);
    if (!p || (x.updatedAt || 0) > (p.updatedAt || 0)) lm.set(x.id, x);
  });
  const l = [...lm.values()].filter((x) => !((t.l[x.id] || 0) >= (x.updatedAt || 0))).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  const s = (b.s?.at || 0) > (a.s?.at || 0) ? b.s : a.s;
  return { h, l, s: { list: (s.list || []).slice(0, 10), at: Math.max(a.s?.at || 0, b.s?.at || 0) }, t };
}

function localState(): SyncState {
  const t = readTomb();
  return { h: getWatchHistory(), l: getMyPlaylists().lists, s: { list: readRecentSearches(), at: t.s }, t };
}
let applying = false;
function applyLocal(m: SyncState) {
  applying = true;
  try {
    const cur = localState();
    if (JSON.stringify(cur.h) !== JSON.stringify(m.h)) replaceWatchHistory(m.h);
    if (JSON.stringify(cur.l) !== JSON.stringify(m.l)) replaceMyLists(m.l);
    if (JSON.stringify(cur.s.list) !== JSON.stringify(m.s.list)) replaceRecentSearches(m.s.list, m.s.at);
    writeTomb(m.t);
  } finally { applying = false; }
}

async function call(op: string, body: any) {
  const r = await fetch(`${API}?sync=${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('');

let syncing: Promise<boolean> | null = null;
/** 지금 맞추기: 서버 것을 받아 합치고, 합친 걸 다시 올림 */
export function syncNow(): Promise<boolean> {
  if (syncing) return syncing;
  syncing = (async () => {
    const link = readLink();
    if (!link) return false;
    try {
      for (let i = 0; i < 3; i++) {
        const p = await call('pull', { key: link.key });
        if (p.status === 404) { writeLink(null); return false; } // 다른 기기에서 연결을 모두 끊음
        if (!p.ok) throw new Error(p.j?.error || `HTTP ${p.status}`);
        const remote: SyncState | null = p.j.data ? JSON.parse(p.j.data) : null;
        const merged = remote ? mergeState(localState(), remote) : localState();
        applyLocal(merged);
        const data = JSON.stringify(merged);
        if (p.j.data === data) { writeLink({ ...link, lastSync: Date.now(), lastError: '' }); return true; }
        const u = await call('push', { key: link.key, rev: p.j.rev || 0, data });
        if (u.status === 409) continue; // 그 사이 다른 기기가 올림 → 다시 받아 합치기
        if (!u.ok) throw new Error(u.j?.error || `HTTP ${u.status}`);
        writeLink({ ...link, lastSync: Date.now(), lastError: '' });
        return true;
      }
      return false;
    } catch (e: any) {
      writeLink({ ...link, lastError: String(e?.message || e).slice(0, 120) });
      return false;
    } finally { syncing = null; }
  })();
  return syncing;
}

/** 이 기기로 새 연결 만들기 (이미 있으면 그대로) → 다른 기기용 연결 코드 */
export async function createPairCode(): Promise<{ code: string; exp: number }> {
  let link = readLink();
  if (!link) {
    link = { key: randomKey(), linkedAt: Date.now() };
    writeLink(link);
    await syncNow();
  }
  const r = await call('pair', { key: link.key });
  if (!r.ok) throw new Error(r.j?.error || '연결 코드를 만들지 못했어요');
  return { code: r.j.code, exp: r.j.exp };
}

/** 다른 기기에서 받은 코드로 연결 (이 기기의 기록과 합쳐짐) */
export async function joinWithCode(raw: string): Promise<void> {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new Error('코드는 8자리예요');
  const r = await call('join', { code });
  if (!r.ok) throw new Error(r.j?.error || '코드가 맞지 않거나 시간이 지났어요');
  writeLink({ key: r.j.key, linkedAt: Date.now() });
  await syncNow();
}

/** 이 기기만 연결 끊기 (기록은 이 기기에 그대로) */
export function unlinkThisDevice() { writeLink(null); }
/** 모든 기기 연결 끊고 서버의 맞춤 내용 지우기 */
export async function unlinkAll() {
  const link = readLink();
  if (link) await call('delete', { key: link.key }).catch(() => null);
  writeLink(null);
}

/** 앱에서 한 번: 바뀔 때마다·다시 볼 때마다 맞추기 */
let started = false;
export function startDeviceSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let timer: number | undefined;
  let lastAuto = 0;
  const soon = (ms: number) => {
    if (!readLink()) return;
    window.clearTimeout(timer);
    const wait = Math.max(ms, 20000 - (Date.now() - lastAuto)); // 자동으로는 20초에 한 번까지
    timer = window.setTimeout(() => { lastAuto = Date.now(); syncNow(); }, wait);
  };
  const onChange = () => { if (!applying) soon(4000); };
  ['uzuhama-watch-history', 'uzuhama-my-playlists-change', 'uzuhama-recent-searches'].forEach((ev) => window.addEventListener(ev, onChange));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(500); });
  window.setInterval(() => { if (document.visibilityState === 'visible') soon(0); }, 90000);
  soon(1500);
}
