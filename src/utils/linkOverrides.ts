import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * 관리자가 직접 고친 연동 정보 (Firestore config/linkOverrides)
 * - shorts: 쇼츠 → 본영상 직접 지정 ('' 이면 자동 연결 끊기)
 * - ignored: 방송과 관계없어서 '연동 안 된 목록'에서 숨긴 영상·쇼츠
 */
export type LinkOverrides = { shorts: Record<string, string>; ignored: Record<string, true> };

const KEY = 'uzuhama_link_overrides_v1';
let cache: LinkOverrides = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { shorts: {}, ignored: {} }; } catch { return { shorts: {}, ignored: {} }; }
})();
const listeners = new Set<(o: LinkOverrides) => void>();
let loaded = false;

function emit(next: LinkOverrides) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  listeners.forEach((l) => l(next));
}

function ensure() {
  if (loaded) return;
  loaded = true;
  getDoc(doc(db, 'config', 'linkOverrides'))
    .then((snap) => {
      const d = (snap.exists() ? snap.data() : {}) as Partial<LinkOverrides>;
      emit({ shorts: d.shorts || {}, ignored: d.ignored || {} });
    })
    .catch(() => { /* 없거나 못 읽음: 저장해 둔 값 그대로 */ });
}

export function useLinkOverrides(): LinkOverrides {
  const [o, setO] = useState(cache);
  useEffect(() => {
    listeners.add(setO);
    ensure();
    return () => { listeners.delete(setO); };
  }, []);
  return o;
}

/** 자동 연결 지도에 관리자 수정을 덮어씀 */
export function applyShortsOverrides(map: Record<string, string>, o: LinkOverrides): Record<string, string> {
  const keys = Object.keys(o.shorts || {});
  if (!keys.length) return map;
  const out = { ...map };
  keys.forEach((sid) => { const v = o.shorts[sid]; if (v) out[sid] = v; else delete out[sid]; });
  return out;
}

/** 쇼츠의 본영상 지정: videoId / '' (연결 끊기) / null (자동으로 되돌리기) */
export async function setShortsLink(shortId: string, videoId: string | null) {
  await setDoc(doc(db, 'config', 'linkOverrides'), { shorts: { [shortId]: videoId === null ? deleteField() : videoId } }, { merge: true });
  const shorts = { ...cache.shorts };
  if (videoId === null) delete shorts[shortId]; else shorts[shortId] = videoId;
  emit({ ...cache, shorts });
}

/** 연동 안 된 목록에서 숨기기 / 다시 보이기 */
export async function setIgnored(id: string, ignored: boolean) {
  await setDoc(doc(db, 'config', 'linkOverrides'), { ignored: { [id]: ignored ? true : deleteField() } }, { merge: true });
  const next = { ...cache.ignored };
  if (ignored) next[id] = true; else delete next[id];
  emit({ ...cache, ignored: next });
}
