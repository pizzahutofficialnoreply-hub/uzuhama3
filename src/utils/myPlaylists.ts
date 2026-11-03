import { useEffect, useState } from 'react';

/**
 * 내 재생목록 (이 기기에 저장, 로그인 없음)
 * - 카드·목록·쇼츠의 저장 버튼으로 담음
 * - 처음 저장할 때 어디에 넣을지 묻고, '다음부터 묻지 않기'를 고르면 그 목록에 바로 저장 (설정에서 다시 묻게 할 수 있음)
 */
export type MyItemKind = 'video' | 'short' | 'live';
export type MyItem = { id: string; kind: MyItemKind; title: string; addedAt: number };
export type MyList = { id: string; name: string; items: MyItem[]; createdAt: number; updatedAt: number };
type Store = { lists: MyList[]; defaultListId: string | null };

const KEY = 'uzuhama_my_playlists_v1';
const EVENT = 'uzuhama-my-playlists-change';
const uid = () => `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.lists)) return { lists: s.lists, defaultListId: s.defaultListId ?? null };
  } catch { /* 처음이거나 저장 불가 */ }
  return { lists: [], defaultListId: null };
}
let cache: Store = read();
function write(next: Store) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 가득 참 */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* 무시 */ }
}

export function getMyPlaylists(): Store { return cache; }

export function useMyPlaylists(): Store {
  const [s, setS] = useState(cache);
  useEffect(() => {
    const on = () => setS(cache);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = read(); setS(cache); } };
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', onStorage); };
  }, []);
  return s;
}

export function createList(name: string): MyList {
  const list: MyList = { id: uid(), name: name.trim() || '새 재생목록', items: [], createdAt: Date.now(), updatedAt: Date.now() };
  write({ ...cache, lists: [...cache.lists, list] });
  return list;
}
export function renameList(id: string, name: string) {
  write({ ...cache, lists: cache.lists.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name, updatedAt: Date.now() } : l)) });
}
export function deleteList(id: string) {
  write({ lists: cache.lists.filter((l) => l.id !== id), defaultListId: cache.defaultListId === id ? null : cache.defaultListId });
}
export function addToList(listId: string, item: Omit<MyItem, 'addedAt'>) {
  write({
    ...cache,
    lists: cache.lists.map((l) => (l.id !== listId || l.items.some((x) => x.id === item.id) ? l : { ...l, items: [...l.items, { ...item, addedAt: Date.now() }], updatedAt: Date.now() })),
  });
}
export function removeFromList(listId: string, itemId: string) {
  write({ ...cache, lists: cache.lists.map((l) => (l.id === listId ? { ...l, items: l.items.filter((x) => x.id !== itemId), updatedAt: Date.now() } : l)) });
}
export function moveItem(listId: string, itemId: string, dir: -1 | 1) {
  write({
    ...cache,
    lists: cache.lists.map((l) => {
      if (l.id !== listId) return l;
      const i = l.items.findIndex((x) => x.id === itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.items.length) return l;
      const items = [...l.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...l, items, updatedAt: Date.now() };
    }),
  });
}
/** 다음부터 묻지 않고 바로 저장할 목록 (null 이면 매번 물어봄) */
export function setDefaultList(id: string | null) { write({ ...cache, defaultListId: id }); }
export function listsContaining(itemId: string): string[] { return cache.lists.filter((l) => l.items.some((x) => x.id === itemId)).map((l) => l.id); }

/**
 * 유튜브에서 이어 보기: 영상 ID 를 이어 붙인 임시 재생목록 주소 (로그인·API 없이, 최대 50개)
 * 유튜브가 열리면 거기서 '저장'을 눌러 내 유튜브 재생목록으로 옮길 수 있음
 */
export const youtubeQueueUrl = (ids: string[]) => `https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, 50).join(',')}`;
/** 사이트 안에서 이어서 재생 (유튜브 퍼가기) */
export const embedQueueUrl = (ids: string[]) => (ids.length ? `https://www.youtube.com/embed/${ids[0]}?playlist=${ids.slice(1, 200).join(',')}&autoplay=1&rel=0` : '');

// ── 저장 창 열기 (SaveHost 가 받아서 띄움) ──
export const SAVE_EVENT = 'uzuhama-open-save';
export function requestSave(item: Omit<MyItem, 'addedAt'>, forceAsk = false) {
  window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail: { item, forceAsk } }));
}
