/**
 * 신고로 확인 전까지 잠시 보류한 영상 (config/system.heldVideos — 이미 실시간으로 읽고 있는 문서라 읽기 추가 없음)
 * 목록에서 빼지 않고 회색 + 흐린 썸네일 + "현재 앱 내 신고로 인해 이용할 수 없어요"
 */
import { useSyncExternalStore } from 'react';

export type HeldMap = Record<string, { at?: number; reason?: string }>;
let held: HeldMap = {};
const subs = new Set<() => void>();

export function setHeldVideos(m: HeldMap | null | undefined) {
  const next = m && typeof m === 'object' ? m : {};
  if (JSON.stringify(next) === JSON.stringify(held)) return;
  held = next;
  subs.forEach((f) => f());
}
export const isHeld = (id?: string | null) => Boolean(id && held[id]);
export const HELD_TEXT = '현재 앱 내 신고로 인해 이용할 수 없어요';

export function useIsHeld(id?: string | null): boolean {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => isHeld(id),
    () => false,
  );
}
