/**
 * 내가 가린 영상 (이 기기에만 저장)
 *  - 가리면 10초 동안 흐리게 남아 있다가(되돌리기 가능) 사라지고, 아래 영상이 올라옴
 *  - 설정 › 시청 기록 › 숨긴 영상에서 다시 보이게 할 수 있음
 */
import { useSyncExternalStore } from 'react';

export type HiddenItem = { id: string; title: string; kind?: string; at: number };
const KEY = 'uzuhama_hidden_videos_v1';
export const HIDE_DELAY = 10_000;
/** 10초 뒤 흐려지며 접히는 시간 */
export const LEAVE_MS = 650;

const read = (): Record<string, HiddenItem> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
let map: Record<string, HiddenItem> = typeof window !== 'undefined' ? read() : {};
/** 방금 가려서 아직 10초가 안 지난 것: id → 사라지는 시각 */
const pending = new Map<string, number>();
const timers = new Map<string, number>();
const leaving = new Set<string>();
const subs = new Set<() => void>();
let ver = 0;
const emit = () => { ver++; subs.forEach((f) => f()); };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* */ } emit(); };

if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { map = read(); emit(); } });

export function hideVideo(it: { id: string; title: string; kind?: string }) {
  if (!it.id) return;
  map = { ...map, [it.id]: { id: it.id, title: it.title || '', kind: it.kind, at: Date.now() } };
  const until = Date.now() + HIDE_DELAY;
  pending.set(it.id, until);
  window.clearTimeout(timers.get(it.id));
  timers.set(it.id, window.setTimeout(() => {
    leaving.add(it.id); emit();
    timers.set(it.id, window.setTimeout(() => { leaving.delete(it.id); pending.delete(it.id); timers.delete(it.id); emit(); }, LEAVE_MS));
  }, HIDE_DELAY));
  save();
}
export function unhideVideo(id: string) {
  pending.delete(id);
  leaving.delete(id);
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  if (!map[id]) return emit();
  const { [id]: _, ...rest } = map;
  map = rest;
  save();
}
export const hiddenList = (): HiddenItem[] => Object.values(map).sort((a, b) => b.at - a.at);

/** 'none' | 'pending'(가린 직후 10초) | 'leaving'(사라지는 중) | 'hidden' */
export type HiddenState = { state: 'none' | 'pending' | 'leaving' | 'hidden'; until: number };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const cache = new Map<string, HiddenState>();
function stateOf(id?: string | null): HiddenState {
  if (!id || !map[id]) return NONE;
  const until = pending.get(id) || 0;
  const state = leaving.has(id) ? 'leaving' : until ? 'pending' : 'hidden';
  const old = cache.get(id);
  if (old && old.state === state && old.until === until) return old;
  const v: HiddenState = { state, until };
  cache.set(id, v);
  return v;
}
const NONE: HiddenState = { state: 'none', until: 0 };
export function useHidden(id?: string | null): HiddenState {
  return useSyncExternalStore(sub, () => stateOf(id), () => NONE);
}
export function useHiddenList(): HiddenItem[] {
  useSyncExternalStore(sub, () => ver, () => 0);
  return hiddenList();
}
