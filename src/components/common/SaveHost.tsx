import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ListPlus, Plus, X } from 'lucide-react';
import { cn } from '../../utils';
import {
  SAVE_EVENT, addToList, createList, getMyPlaylists, listsContaining, removeFromList, setDefaultList, useMyPlaylists, type MyItem,
} from '../../utils/myPlaylists';
import { YoutubeLogo } from './MediaIcons';

/**
 * 저장 버튼을 누르면 뜨는 창 + 저장 알림 (App 에 한 번만 둠)
 * - 기본 목록이 정해져 있으면 묻지 않고 바로 저장하고 아래에 '저장했어요 · 바꾸기' 알림
 * - 아니면 '어디에 저장할까요?' 창: 내 재생목록(여러 개 체크) · 새 목록 · 유튜브에서 저장 · 다음부터 묻지 않기
 */
type Item = Omit<MyItem, 'addedAt'>;

export function SaveHost() {
  const store = useMyPlaylists();
  const [item, setItem] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ text: string; item: Item } | null>(null);
  const [newName, setNewName] = useState('');
  const [remember, setRemember] = useState(false);
  const [rememberId, setRememberId] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const { item: it, forceAsk } = (e as CustomEvent).detail as { item: Item; forceAsk?: boolean };
      const s = getMyPlaylists();
      const def = s.defaultListId && s.lists.find((l) => l.id === s.defaultListId);
      if (def && !forceAsk) {
        if (def.items.some((x) => x.id === it.id)) {
          removeFromList(def.id, it.id);
          setToast({ text: `'${def.name}'에서 뺐어요`, item: it });
        } else {
          addToList(def.id, it);
          setToast({ text: `'${def.name}'에 저장했어요`, item: it });
        }
        return;
      }
      setItem(it);
      setNewName('');
      setRemember(false);
      setRememberId(s.defaultListId);
    };
    window.addEventListener(SAVE_EVENT, on);
    return () => window.removeEventListener(SAVE_EVENT, on);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const close = () => {
    if (item && remember) {
      // 체크한 목록 중 하나(마지막으로 고른 것)를 기본으로
      const inLists = listsContaining(item.id);
      const pick = rememberId && inLists.includes(rememberId) ? rememberId : inLists[inLists.length - 1];
      if (pick) setDefaultList(pick);
    }
    setItem(null);
  };

  const inLists = item ? store.lists.filter((l) => l.items.some((x) => x.id === item.id)).map((l) => l.id) : [];
  const toggle = (id: string) => {
    if (!item) return;
    if (inLists.includes(id)) removeFromList(id, item.id);
    else { addToList(id, item); setRememberId(id); }
  };
  const addNew = () => {
    if (!item) return;
    const l = createList(newName || (store.lists.length ? `재생목록 ${store.lists.length + 1}` : '나중에 볼 영상'));
    addToList(l.id, item);
    setRememberId(l.id);
    setNewName('');
  };
  const ytUrl = item ? (item.kind === 'short' ? `https://www.youtube.com/shorts/${item.id}` : `https://www.youtube.com/watch?v=${item.id}`) : '';

  return createPortal(
    <>
      <AnimatePresence>
        {item && (
          <motion.div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />
            <motion.div
              role="dialog" aria-modal="true" aria-label="저장할 곳 고르기"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="relative w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-black text-zinc-900 dark:text-white">어디에 저장할까요?</h3>
                <button type="button" onClick={close} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{item.title}</p>

              <p className="mt-4 mb-1.5 text-[11px] font-bold text-zinc-500">이 사이트의 내 재생목록 (이 기기에 저장)</p>
              <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1">
                {store.lists.map((l) => {
                  const on = inLists.includes(l.id);
                  return (
                    <button key={l.id} type="button" onClick={() => toggle(l.id)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors', on ? 'bg-purple-50 dark:bg-purple-950/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
                      <span className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0', on ? 'bg-purple-600 border-purple-600' : 'border-zinc-300 dark:border-zinc-600')}>{on && <Check className="w-3.5 h-3.5 text-white" />}</span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{l.name}</span>
                      <span className="text-[11px] text-zinc-400">{l.items.length}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNew()} placeholder={store.lists.length ? '새 재생목록 이름' : '나중에 볼 영상'} className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-purple-500" />
                <button type="button" onClick={addNew} className="shrink-0 px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> 새로 만들기</button>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-purple-600" />
                다음부터 묻지 않고 고른 목록에 바로 저장
              </label>

              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <a href={ytUrl} target="_blank" rel="noreferrer" onClick={close} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <YoutubeLogo className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">유튜브 내 재생목록에 저장</span>
                    <span className="block text-[11px] text-zinc-500">유튜브가 열리면 '저장'을 눌러 주세요</span>
                  </span>
                </a>
              </div>

              <button type="button" onClick={close} className="mt-3 w-full h-11 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold cursor-pointer">완료</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[390] flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl bg-zinc-900/95 text-white text-sm shadow-xl"
          >
            <ListPlus className="w-4 h-4 text-purple-300 shrink-0" />
            <span className="font-semibold">{toast.text}</span>
            <button type="button" onClick={() => { const it = toast.item; setToast(null); setItem(it); setRemember(false); setRememberId(getMyPlaylists().defaultListId); }} className="px-2.5 py-1 rounded-lg bg-white/15 text-xs font-bold cursor-pointer">바꾸기</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
