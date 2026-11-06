import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { checkSubmit, noteSubmit, visitorId } from './submitGuard';

/**
 * 방문자 화면에서 난 오류를 조용히 기록 (관리자 > 시스템 > 자동화 '사이트 오류'에서 봄)
 * - 같은 오류는 기기마다 하루 한 번, 10분에 3번까지
 * - 브라우저 확장 프로그램·네트워크 끊김·광고 차단 등 사이트와 상관없는 건 버림
 * - 개인정보는 보내지 않음 (오류 문구, 화면 경로, 브라우저 종류만)
 */
const IGNORE = /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection|Load failed|Failed to fetch|NetworkError|The operation was aborted|AbortError|cancelled|QuotaExceeded|play\(\) request was interrupted/i;
const VERSION_RE = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

function send(message: string, stack = '') {
  const msg = String(message || '').slice(0, 300);
  if (!msg || IGNORE.test(msg) || IGNORE.test(stack)) return;
  // 새 버전 배포 직후 옛 화면에서 나는 오류는 새로 고치면 해결 → 한 번만 새로 고침
  if (VERSION_RE.test(msg)) {
    try {
      if (!sessionStorage.getItem('uzuhama_chunk_reload')) { sessionStorage.setItem('uzuhama_chunk_reload', '1'); window.location.reload(); return; }
    } catch { /* 무시 */ }
  }
  const key = msg.slice(0, 120);
  if (checkSubmit('error', key)) return;
  noteSubmit('error', key);
  addDoc(collection(db, 'feedbacks'), {
    type: 'client_error',
    vid: visitorId(),
    title: `[오류] ${msg.slice(0, 80)}`,
    content: msg,
    stack: String(stack || '').split('\n').slice(0, 6).join('\n').slice(0, 800),
    path: `${window.location.pathname}${window.location.hash || ''}`.slice(0, 100),
    ua: navigator.userAgent.slice(0, 200),
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || false,
    build: (import.meta as any).env?.VITE_BUILD_ID || null,
    createdAt: serverTimestamp(),
  }).catch(() => { /* 기록 실패는 무시 */ });
}

export function installErrorReporting() {
  if (typeof window === 'undefined' || (window as any).__uzuhamaErr) return;
  (window as any).__uzuhamaErr = true;
  if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) return;
  window.addEventListener('error', (e) => send(e.message || String(e.error || ''), e.error?.stack || `${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => { const r: any = e.reason; send(r?.message || String(r || ''), r?.stack || ''); });
}
/** 화면이 통째로 깨졌을 때(ErrorBoundary) */
export const reportError = (err: any) => send(err?.message || String(err || ''), err?.stack || '');
