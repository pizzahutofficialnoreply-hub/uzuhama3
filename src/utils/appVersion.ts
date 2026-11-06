import { useEffect, useState } from 'react';

/**
 * 앱 버전 = 가장 최근 패치노트(개발자 노트 제외)의 버전
 * - 패치노트 목록(usePatchNotes 가 저장해 두는 캐시)을 읽고, 없으면 한 번 받아 옴
 * - 관리자 설정의 appVersion 은 패치노트가 하나도 없을 때만 사용
 *
 * 새 버전 확인: 지금 열려 있는 화면의 스크립트와 서버의 최신 index.html 이 가리키는 스크립트를 비교
 * → 다르면 '새로고침' 이 필요함 (공지에 새로고침 버튼)
 */
const CACHE_KEY = 'uzuhama_patch_notes_v3';
const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const cmpVer = (a: string, b: string) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export function latestReleaseVersion(notes: any[]): string {
  const t = today();
  return (Array.isArray(notes) ? notes : [])
    .filter((n) => n && n.category !== 'dev' && /^\d+(\.\d+)+/.test(String(n.version || '')) && n.version !== '0.0.0' && (!n.date || n.date <= t))
    .map((n) => String(n.version))
    .sort((a, b) => cmpVer(b, a))[0] || '';
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; } };
let fetched = false;
function ensureFetched() {
  if (fetched || typeof window === 'undefined') return;
  fetched = true;
  if (readCache().length) return; // 패치노트 화면이 따로 새로 받아 옴
  fetch(`${API_BASE}/api/patch-notes`).then((r) => r.json()).then((j) => {
    if (!Array.isArray(j?.notes)) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(j.notes)); } catch {}
    window.dispatchEvent(new Event('uzuhama_patch_notes_changed'));
  }).catch(() => {});
}

export const formatVersion = (v: string) => (v ? (v.startsWith('v') ? v : `v${v}`) : '');

export function useAppVersion(fallback?: string): string {
  const [v, setV] = useState(() => latestReleaseVersion(readCache()));
  useEffect(() => {
    ensureFetched();
    const on = () => setV(latestReleaseVersion(readCache()));
    window.addEventListener('uzuhama_patch_notes_changed', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('uzuhama_patch_notes_changed', on); window.removeEventListener('storage', on); };
  }, []);
  return formatVersion(v || String(fallback || '').trim() || '1.0.0');
}

/* ── 새 버전(새 배포)이 나왔는지 ── */
const scriptOf = (html: string) => (html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i) || html.match(/src="(\/assets\/index-[^"]+\.js)"/i))?.[1] || '';
function currentScript() {
  const el = Array.from(document.querySelectorAll('script[type="module"][src]')).find((s) => /\/assets\/index-/.test((s as HTMLScriptElement).src)) as HTMLScriptElement | undefined;
  return el ? new URL(el.src, location.href).pathname : '';
}

export async function isNewBuildAvailable(): Promise<boolean> {
  try {
    const mine = currentScript();
    if (!mine) return false; // 개발 서버
    const r = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const latest = scriptOf(await r.text());
    return Boolean(latest) && new URL(latest, location.href).pathname !== mine;
  } catch {
    return false;
  }
}

export function useNewBuildAvailable(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => { isNewBuildAvailable().then((s) => { if (alive && s) setStale(true); }); };
    const t0 = window.setTimeout(check, 4000);
    const t = window.setInterval(check, 10 * 60 * 1000);
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; window.clearTimeout(t0); window.clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return stale;
}

/** 새 버전으로: 서비스 워커도 새로 받고 다시 불러오기 */
export async function reloadToNewVersion() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map(async (r) => {
      try { await r.update(); } catch {}
      r.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }));
  } catch {}
  window.location.reload();
}

export const RELOAD_LINK = 'app://reload';
