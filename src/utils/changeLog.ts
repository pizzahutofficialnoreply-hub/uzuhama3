/**
 * 수정 기록 (changes 컬렉션)
 *  - 관리자가 몰아보기·설정 문서를 바꾸면 { path: '컬렉션/문서', op, at } 한 줄을 남김
 *  - 사이트는 마지막으로 본 시각 뒤의 기록만 읽고(없으면 읽기 1회), 거기 적힌 문서만 다시 읽음
 *    → 전체를 다시 불러오지 않음
 */
import { addDoc, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type Change = { path: string; op: 'set' | 'delete'; at: string };

/** 관리자 화면에서 문서를 바꾼 뒤 부름 (실패해도 원래 작업은 그대로) */
export async function markChanged(path: string, op: 'set' | 'delete' = 'set') {
  try { await addDoc(collection(db, 'changes'), { path, op, at: new Date().toISOString() }); } catch { /* 기록 실패는 무시 (하루 한 번 전체 확인으로 메워짐) */ }
}

const SEEN_KEY = 'uzuhama_changes_seen_v1';
export const changesSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } };
export const setChangesSeen = (at: string) => { try { localStorage.setItem(SEEN_KEY, at); } catch { /* */ } };

export const CHANGES_PAGE = 100;
/** 마지막으로 본 뒤의 수정 기록 (같은 문서는 마지막 것만) · 너무 많으면 full=true (전체를 한 번 다시 읽는 게 나음) */
export async function readChangesSince(since: string): Promise<{ changes: Change[]; latest: string; full: boolean; count: number }> {
  const snap = await getDocs(query(collection(db, 'changes'), where('at', '>', since), orderBy('at'), limit(CHANGES_PAGE)));
  const by = new Map<string, Change>();
  let latest = since;
  snap.forEach((d) => {
    const c = d.data() as Change;
    if (!c?.path || typeof c.at !== 'string') return;
    by.set(c.path, c);
    if (c.at > latest) latest = c.at;
  });
  return { changes: [...by.values()], latest, full: snap.size >= CHANGES_PAGE, count: snap.size };
}
