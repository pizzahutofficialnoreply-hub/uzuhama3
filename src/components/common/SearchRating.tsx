import React, { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../utils';
import { checkSubmit, noteSubmit, visitorId } from '../../utils/submitGuard';

/**
 * 검색 도우미가 검색어를 해석한 경우(말하듯 검색·줄임말·오타 보정) 아래에 "결과에 만족하시나요?"
 * 👍/👎 (+👎면 한 줄 의견) → 제보함(feedbacks, type search_rating) → 하루 한 번 검색 조정에 쓰임
 * 같은 검색어는 이 기기에서 한 번만 물어봄
 */
const KEY = 'uzuhama_search_rated_v1';
const rated = (): Record<string, 1> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

export function SearchRating({ query, understood, resultCount }: { query: string; understood: string; resultCount: number }) {
  const k = query.trim().toLowerCase();
  const [state, setState] = useState<'ask' | 'note' | 'done' | 'hidden'>(() => (rated()[k] ? 'hidden' : 'ask'));
  const [note, setNote] = useState('');
  useEffect(() => { setState(rated()[k] ? 'hidden' : 'ask'); setNote(''); }, [k]);
  if (!k || state === 'hidden') return null;

  const send = async (good: boolean, n = '') => {
    if (checkSubmit('rating')) { setState('done'); return; } // 너무 많이 보냈으면 조용히 넘어감
    noteSubmit('rating');
    try {
      const all = rated(); all[k] = 1;
      const keys = Object.keys(all); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((x) => delete all[x]);
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* 무시 */ }
    setState('done');
    try {
      await addDoc(collection(db, 'feedbacks'), {
        type: 'search_rating', vid: visitorId(), good, query: query.trim(), understood: understood || null, resultCount, note: n.trim() || null,
        title: `[검색 ${good ? '만족' : '불만족'}] ${query.trim()}`.slice(0, 100),
        content: [`해석: ${understood || '-'}`, `결과 ${resultCount}개`, n.trim() ? `의견: ${n.trim()}` : ''].filter(Boolean).join('\n'),
        createdAt: serverTimestamp(),
      });
    } catch { /* 못 보내도 조용히 */ }
  };

  if (state === 'done') return <p className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">고마워요! 검색을 고칠 때 참고할게요.</p>;
  if (state === 'note') {
    return (
      <div className="flex items-center gap-1.5">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(false, note)} maxLength={200} autoFocus
          placeholder="어떤 걸 찾으셨나요? (선택)" className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-purple-500" />
        <button type="button" onClick={() => send(false, note)} className="shrink-0 px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold cursor-pointer">보내기</button>
      </div>
    );
  }
  const b = 'p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer';
  return (
    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
      검색 결과에 만족하시나요?
      <button type="button" onClick={() => send(true)} className={cn(b, 'ml-0.5')} aria-label="만족해요"><ThumbsUp className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => setState('note')} className={b} aria-label="아쉬워요"><ThumbsDown className="w-3.5 h-3.5" /></button>
    </p>
  );
}
