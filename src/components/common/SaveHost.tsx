import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Flag, ListPlus, Plus, X } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { REPORT_EVENT, type ReportTarget } from './ItemMenu';
import { addToYoutubePlaylist, createYoutubePlaylist, listMyYoutubePlaylists, onYoutubeConfig, youtubeSaveEnabled, type YtPlaylist } from '../../utils/youtubeAccount';
import { cn } from '../../utils';
import {
  SAVE_EVENT, addToList, createList, getMyPlaylists, listsContaining, removeFromList, setDefaultList, setDefaultYoutube, useMyPlaylists, type MyItem,
} from '../../utils/myPlaylists';
import { YoutubeLogo } from './MediaIcons';

/**
 * 저장 버튼을 누르면 뜨는 창 + 저장 알림 (App 에 한 번만 둠)
 * - 기본 목록이 정해져 있으면 묻지 않고 바로 저장하고 아래에 '저장했어요 · 바꾸기' 알림
 * - 아니면 '어디에 저장할까요?' 창: 내 재생목록(여러 개 체크) · 새 목록 · 유튜브에서 저장 · 다음부터 묻지 않기
 */
type Item = Omit<MyItem, 'addedAt'>;

const REASONS = (t: ReportTarget) => [
  ...(t.search.concepts.length ? [{ key: 'not_match', label: `'${t.search.concepts.join(' · ')}'에 안 맞아요` }] : t.search.query ? [{ key: 'not_match', label: `'${t.search.query}' 검색 결과에 안 맞아요` }] : []),
  { key: 'wrong_link', label: '연결된 생방송·쇼츠·편집본이 틀려요' },
  { key: 'wrong_game_name', label: '게임 이름이 달라요' },
  { key: 'wrong_game_link', label: '게임 링크가 달라요' },
  { key: 'wrong_date', label: '방송 날짜가 달라요' },
  { key: 'other', label: '기타' },
];

/** ⋮ > 신고: 이유 고르기 + 한 줄 의견 → 제보함(feedbacks)에. 하루 한 번 검색 조정에 쓰임 */
function ReportSheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const reasons = REASONS(target);
  const [reason, setReason] = useState(reasons[0].key);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const label = reasons.find((r) => r.key === reason)?.label || reason;
      await addDoc(collection(db, 'feedbacks'), {
        type: 'search_report',
        reason,
        // 연결·게임·날짜 문제는 관리자 '연동' 탭으로
        route: reason.startsWith('wrong_') ? (reason === 'wrong_game_name' || reason === 'wrong_game_link' ? 'game' : 'link') : null,
        videoId: target.id,
        kind: target.kind,
        query: target.search.query || null,
        concepts: target.search.concepts,
        understood: target.search.understood || null,
        note: note.trim() || null,
        title: `[검색 신고] ${label}`,
        content: [`영상: ${target.title}`, `https://youtu.be/${target.id}`, target.search.query ? `검색어: ${target.search.query}` : '', target.search.understood ? `해석: ${target.search.understood}` : '', note.trim() ? `의견: ${note.trim()}` : ''].filter(Boolean).join('\n'),
        createdAt: serverTimestamp(),
      });
      setDone(true);
      window.setTimeout(onClose, 1100);
    } catch (e) {
      console.error(e);
      alert('보내지 못했어요. 잠시 후 다시 해 주세요.');
    } finally { setBusy(false); }
  };
  return (
    <motion.div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label="신고하기"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="relative w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-1.5"><Flag className="w-4 h-4 text-red-500" /> 무엇이 문제인가요?</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{target.title}</p>
        {done ? (
          <p className="py-8 text-center text-sm font-bold text-purple-600">고마워요! 검색을 고칠 때 참고할게요.</p>
        ) : (
          <>
            <div className="mt-4 space-y-1" role="radiogroup">
              {reasons.map((r) => (
                <button key={r.key} type="button" role="radio" aria-checked={reason === r.key} onClick={() => setReason(r.key)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold cursor-pointer', reason === r.key ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200')}>
                  <span className={cn('w-4 h-4 rounded-full border-2 shrink-0', reason === r.key ? 'border-purple-600 bg-purple-600 shadow-[inset_0_0_0_2px_white] dark:shadow-[inset_0_0_0_2px_#18181b]' : 'border-zinc-300 dark:border-zinc-600')} />
                  {r.label}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="더 알려 주실 게 있으면 (선택)" className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-2 focus:ring-purple-500" />
            {reason === 'not_match' && <p className="mt-1.5 text-[11px] text-zinc-500">모인 신고는 하루 한 번 검색에 반영돼요. 이 검색어에서는 이 영상이 빠지게 돼요.</p>}
            {reason.startsWith('wrong_') && <p className="mt-1.5 text-[11px] text-zinc-500">관리자가 확인하고 고칠게요. 맞는 링크나 이름을 알면 위에 적어 주세요.</p>}
            <button type="button" disabled={busy} onClick={send} className="mt-3 w-full h-11 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold cursor-pointer disabled:opacity-60">보내기</button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function SaveHost() {
  const [report, setReport] = useState<ReportTarget | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReport((e as CustomEvent).detail as ReportTarget);
    window.addEventListener(REPORT_EVENT, on);
    return () => window.removeEventListener(REPORT_EVENT, on);
  }, []);
  return (
    <>
      <SaveSheetHost />
      {createPortal(<AnimatePresence>{report && <ReportSheet key="report" target={report} onClose={() => setReport(null)} />}</AnimatePresence>, document.body)}
    </>
  );
}

function SaveSheetHost() {
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
      // 기본이 '내 유튜브 재생목록'이면 바로 담기 (로그인이 필요하면 구글 창이 뜸)
      if (s.defaultYoutube && youtubeSaveEnabled() && !forceAsk && it.kind !== 'short') {
        const yt = s.defaultYoutube;
        addToYoutubePlaylist(yt.id, it.id)
          .then(() => setToast({ text: `유튜브 '${yt.title}'에 저장했어요`, item: it }))
          .catch((err) => setToast({ text: String(err?.message || err), item: it }));
        return;
      }
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
      setYt({ state: 'idle' });
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
    if (item && remember && yt.picked) {
      setDefaultYoutube(yt.picked);
    } else if (item && remember) {
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
  // 내 유튜브 재생목록 (관리자가 클라이언트 ID 를 넣었을 때)
  const [ytOn, setYtOn] = useState(youtubeSaveEnabled());
  useEffect(() => onYoutubeConfig(() => setYtOn(youtubeSaveEnabled())), []);
  const [yt, setYt] = useState<{ state: 'idle' | 'loading' | 'list' | 'error'; lists?: YtPlaylist[]; done?: Set<string>; picked?: { id: string; title: string }; error?: string }>({ state: 'idle' });
  const [ytNew, setYtNew] = useState('');
  const openYoutube = () => {
    setYt({ state: 'loading' });
    listMyYoutubePlaylists().then((lists) => setYt({ state: 'list', lists, done: new Set() })).catch((e) => setYt({ state: 'error', error: String(e?.message || e) }));
  };
  const addYt = async (p: YtPlaylist) => {
    if (!item) return;
    try {
      await addToYoutubePlaylist(p.id, item.id);
      setYt((s) => ({ ...s, done: new Set([...(s.done || []), p.id]), picked: { id: p.id, title: p.title } }));
    } catch (e: any) { setYt((s) => ({ ...s, error: String(e?.message || e) })); }
  };
  const newYt = async () => {
    try {
      const p = await createYoutubePlaylist(ytNew || '우주하마 모아 보기');
      setYtNew('');
      setYt((s) => ({ ...s, lists: [p, ...(s.lists || [])] }));
      await addYt(p);
    } catch (e: any) { setYt((s) => ({ ...s, error: String(e?.message || e) })); }
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
                다음부터 묻지 않고 마지막에 고른 목록에 바로 저장
              </label>

              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                {ytOn && item.kind !== 'short' ? (
                  yt.state === 'list' ? (
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold text-zinc-500 flex items-center gap-1"><YoutubeLogo className="w-3.5 h-3.5 text-red-600" /> 내 유튜브 재생목록</p>
                      <div className="max-h-44 overflow-y-auto -mx-1 px-1 space-y-1">
                        {(yt.lists || []).map((p) => {
                          const on = yt.done?.has(p.id);
                          return (
                            <button key={p.id} type="button" disabled={on} onClick={() => addYt(p)} className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left cursor-pointer', on ? 'bg-red-50 dark:bg-red-950/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
                              <span className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0', on ? 'bg-red-600 border-red-600' : 'border-zinc-300 dark:border-zinc-600')}>{on && <Check className="w-3.5 h-3.5 text-white" />}</span>
                              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{p.title}</span>
                              <span className="text-[11px] text-zinc-400">{p.count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <input value={ytNew} onChange={(e) => setYtNew(e.target.value)} placeholder="새 유튜브 재생목록 (비공개)" className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                        <button type="button" onClick={newYt} className="shrink-0 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> 만들기</button>
                      </div>
                      {yt.error && <p className="mt-1.5 text-[11px] text-red-600">{yt.error}</p>}
                    </div>
                  ) : (
                    <button type="button" onClick={openYoutube} disabled={yt.state === 'loading'} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer">
                      <YoutubeLogo className="w-5 h-5 text-red-600 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">{yt.state === 'loading' ? '유튜브 재생목록 불러오는 중…' : '내 유튜브 재생목록에 저장'}</span>
                        <span className={cn('block text-[11px]', yt.state === 'error' ? 'text-red-600' : 'text-zinc-500')}>{yt.state === 'error' ? yt.error : '구글 계정으로 로그인하면 바로 담아요'}</span>
                      </span>
                    </button>
                  )
                ) : (
                  <a href={ytUrl} target="_blank" rel="noreferrer" onClick={close} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <YoutubeLogo className="w-5 h-5 text-red-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">유튜브에서 저장</span>
                      <span className="block text-[11px] text-zinc-500">유튜브가 열리면 '저장'을 눌러 주세요</span>
                    </span>
                  </a>
                )}
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
