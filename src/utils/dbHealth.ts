/**
 * DB(Firestore) 하루 이용 한도가 다 찼는지 (resource-exhausted)
 * → 방문자 화면을 '잠시 점검 중' 화면으로 (한도가 초기화되는 미국 태평양 시간 자정 = 한국 오후 4~5시쯤 다시 열림)
 */
import { useSyncExternalStore } from 'react';

let down = false;
const EVENT = 'uzuhama-db-health';
export const isQuotaError = (e: any) => /resource-exhausted|quota/i.test(`${e?.code || ''} ${e?.message || ''}`);
export function noteDbError(e: any) {
  if (!down && isQuotaError(e)) { down = true; try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* */ } }
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
