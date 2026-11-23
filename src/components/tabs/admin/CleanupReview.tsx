import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Check, Loader2, Wand2 } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { noteReads } from '../../../utils/readStats';
import type { AppData, BroadcastLog } from '../../../types';

/**
 * 한 번 정리(스팀 이름·링크·카페 대조)에서 자동으로 못 정한 것들 (admin_data/cleanup_review 문서 하나 · 읽기 1번)
 * - 제안대로: 그 기록의 게임 이름·링크를 제안 값으로 / 직접 고치기: 이름·링크를 적어서 / 그대로 두기
 */
type Item = { id: string; kind: string; logId: string; date: string; i?: number; name?: string; link?: string; why: string; suggest?: { name?: string; link?: string; date?: string }; done?: string };
const REF = () => doc(db, 'admin_data', 'cleanup_review');

export function CleanupReview({ data, onUpdateLog }: { data: AppData; onUpdateLog: (log: BroadcastLog) => Promise<void> }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<Record<string, { name: string; link: string }>>({});
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { getDoc(REF()).then((d) => { noteReads('cleanup_review(관리자)', 1); setItems((d.data()?.items as Item[]) || []); }).catch(() => setItems([])); }, []);
  if (!items || !items.length) return null;

  const save = async (next: Item[]) => { setItems(next); await setDoc(REF(), { items: next, updatedAt: new Date().toISOString() }, { merge: true }); };
  const mark = (it: Item, done: string) => save(items.map((x) => (x.id === it.id ? { ...x, done } : x)));
  const applyGame = async (it: Item, to: { name?: string; link?: string }) => {
    const l: any = data.logs[it.logId];
    if (!l) { alert('그 방송 기록을 못 찾았어요'); return; }
    const games = [...(l.games || [])];
    let i = typeof it.i === 'number' && games[it.i]?.name === it.name ? it.i : games.findIndex((g: any) => g?.name === it.name);
    if (i < 0) { alert('기록에서 그 게임을 못 찾았어요 (이미 고쳐졌을 수 있어요)'); await mark(it, 'gone'); return; }
    games[i] = { ...games[i], ...(to.name ? { name: to.name } : {}), ...(to.link !== undefined ? { link: to.link } : {}) };
    const next: any = { ...l, games };
    if (i === 0 && to.name) next.game = games.map((g: any) => g.name).join(', ');
    await onUpdateLog(next);
  };
  const act = async (it: Item, what: 'suggest' | 'edit' | 'keep') => {
    setBusy(it.id);
    try {
      if (what === 'keep') { await mark(it, 'kept'); return; }
      const to: { name?: string; link?: string; date?: string } | undefined = what === 'suggest' ? it.suggest || {} : (edit[it.id] || { name: it.suggest?.name || it.name || '', link: it.suggest?.link ?? it.link ?? '' });
      if (!to) return;
      if (to.date) {
        const l: any = data.logs[it.logId];
        if (l) await onUpdateLog({ ...l, date: to.date });
      } else await applyGame(it, to);
      await mark(it, 'fixed');
    } catch (e: any) { alert('못 했어요: ' + (e?.message || e)); } finally { setBusy(''); }
  };
  const open = items.filter((x) => !x.done);
  const list = showDone ? items : open;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-purple-300/60 dark:border-purple-700/50 rounded-2xl p-5 shadow-sm space-y-3">
      <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Wand2 className="w-4 h-4 text-purple-500" /> 정리 확인 (스팀·카페 대조에서 보낸 것) <span className="text-xs font-bold text-purple-600">{open.length}개 남음</span></h3>
      <p className="text-[11px] text-zinc-500 break-keep">확실한 것은 이미 고쳤고, 겹치거나 애매한 것만 여기 모았어요. 제안이 맞으면 '제안대로', 다르면 직접 적어서 '고치기', 지금이 맞으면 '그대로 두기'.</p>
      <button type="button" onClick={() => setShowDone((v) => !v)} className="text-[11px] font-bold text-zinc-500 underline cursor-pointer">{showDone ? '남은 것만 보기' : `끝난 것도 보기 (${items.length - open.length}개)`}</button>
      <ul className="space-y-2">
        {list.slice(0, 200).map((it) => {
          const e = edit[it.id] || { name: it.suggest?.name || it.name || '', link: it.suggest?.link ?? it.link ?? '' };
          return (
            <li key={it.id} className={`rounded-xl border p-3 text-xs space-y-1.5 ${it.done ? 'opacity-50 border-zinc-200 dark:border-zinc-800' : 'border-zinc-200 dark:border-zinc-700'}`}>
              <p className="font-bold text-zinc-900 dark:text-white break-keep">{it.date} · {it.name || it.kind}{it.done ? ` · ${it.done === 'fixed' ? '고침' : it.done === 'kept' ? '그대로' : '없어짐'}` : ''}</p>
              <p className="text-zinc-600 dark:text-zinc-300 break-keep">{it.why}</p>
              {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="block text-blue-600 dark:text-blue-400 truncate">{it.link}</a>}
              {it.suggest && <p className="text-emerald-700 dark:text-emerald-400 break-keep">제안: {[it.suggest.name, it.suggest.date, it.suggest.link].filter(Boolean).join(' · ')}</p>}
              {!it.done && (
                <>
                  {it.kind !== 'date' && (
                    <div className="flex flex-col sm:flex-row gap-1.5">
                      <input value={e.name} onChange={(ev) => setEdit((s) => ({ ...s, [it.id]: { ...e, name: ev.target.value } }))} placeholder="게임 이름" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                      <input value={e.link} onChange={(ev) => setEdit((s) => ({ ...s, [it.id]: { ...e, link: ev.target.value } }))} placeholder="링크" className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {it.suggest && <button type="button" disabled={!!busy} onClick={() => act(it, 'suggest')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1">{busy === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 제안대로</button>}
                    {it.kind !== 'date' && <button type="button" disabled={!!busy} onClick={() => act(it, 'edit')} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold cursor-pointer disabled:opacity-50">고치기</button>}
                    <button type="button" disabled={!!busy} onClick={() => act(it, 'keep')} className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold cursor-pointer">그대로 두기</button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > 200 && <p className="text-[11px] text-zinc-500">처음 200개만 보여요. 처리하면 다음 것이 나와요.</p>}
    </div>
  );
}
