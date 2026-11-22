/**
 * DB(Firestore) 하루 이용 한도가 다 찼는지 (resource-exhausted)
 * → 방문자 화면을 '잠시 점검 중' 화면으로 (한도가 초기화되는 미국 태평양 시간 자정 = 한국 오후 4~5시쯤 다시 열림)
 */
import { useSyncExternalStore } from 'react';

let down = false;
const EVENT = 'uzuhama-db-health';
/** DB 한도 초과 오류인지 — 브라우저 저장 공간이 꽉 찬 오류(QuotaExceededError, 사파리에서 흔함)는 DB 와 상관없으니 빼고 */
export const isQuotaError = (e: any) => {
  if (e?.name === 'QuotaExceededError' || /QuotaExceededError|storage|IndexedDB|localStorage/i.test(String(e?.message || ''))) return false;
  return /resource-exhausted|RESOURCE_EXHAUSTED|Quota exceeded/i.test(`${e?.code || ''} ${e?.message || ''}`);
};
let checking: Promise<void> | null = null;
let lastCheck = 0;
function setDown() { if (!down) { down = true; try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* */ } } }
/**
 * DB 오류를 알림. 한도 초과처럼 보여도 바로 점검을 띄우지 않고, 서버에 한 번 물어 정말 한도가 찼을 때만 점검
 * (예전엔 사파리의 '저장 공간 꽉 참' 오류도 한도 초과로 잘못 알아 점검 화면이 떴음)
 * confirmed: 이미 서버가 한도 초과라고 답한 경우
 */
export function noteDbError(e: any, confirmed = false) {
  if (down || !isQuotaError(e)) return;
  if (confirmed) { setDown(); return; }
  if (checking || Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  const base = typeof window !== 'undefined' && /vercel\.app$/.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app';
  checking = fetch(`${base}/api/health?dbping=1`).then((r) => r.json()).then((j) => { if (j?.down) setDown(); }).catch(() => {}).finally(() => { checking = null; });
}
export function noteDbOk() { if (down) { down = false; try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* */ } } }
export const useDbDown = () => useSyncExternalStore((f) => { window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, () => down, () => false);

/** 다음 한도 초기화 시각 (미국 태평양 시간 자정) */
export function nextQuotaReset(now = Date.now()): number {
  const la = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const local = new Date(now);
  const offset = local.getTime() - la.getTime(); // 지금 기기 시각 - LA 벽시계
  const next = new Date(la); next.setHours(24, 0, 0, 0);
  return next.getTime() + offset;
}
