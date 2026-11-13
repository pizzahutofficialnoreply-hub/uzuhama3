/**
 * 이 기기에서 DB(Firestore)를 얼마나 읽었는지 세어 두었다가, 화면을 떠날 때 서버로 한 번 보냄
 * (관리자 › 시스템 › DB 읽기 출처 에서 컬렉션별로 봄)
 */
const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

let counts: Record<string, number> = {};
let installed = false;

export function noteReads(label: string, n = 1) {
  if (!n || n < 0) return;
  counts[label] = (counts[label] || 0) + n;
  if (!installed) install();
}

function flush() {
  const c = counts;
  if (!Object.keys(c).length) return;
  counts = {};
  try {
    const body = JSON.stringify({ c });
    const url = `${API_BASE}/api/health?readstat=1`;
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) {
      void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch { /* */ }
}

function install() {
  installed = true;
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  } catch { /* */ }
}
