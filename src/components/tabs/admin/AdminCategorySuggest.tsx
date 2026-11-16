import { useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { mutate } from './system/SearchTuningCard';
import { loadFreshLogs } from '../../../hooks/useFirebaseData';

/**
 * 관리자 › 기록 추가 › 게임 카테고리 제안
 * AI가 영상을 분석할 때 게임마다 차례로(한 번에 2개씩), 같은 카테고리에 묶인 게임들과 얼마나 비슷한지 보고
 * 다른 카테고리가 훨씬(20점 넘게) 더 맞으면 제안만 남김 → 여기서 하나씩 적용 (그 게임이 들어간 기록 전부)
 */
export function AdminCategorySuggest({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [list, setList] = useState<any[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = async () => {
    setBusy('load');
    try { const r = await mutate('aiVideo', { op: 'status' }); setList(r.categorySuggest || []); setChecked(r.categoryChecked || 0); }
    catch (e: any) { setMsg(`못 불러왔어요: ${e?.message || e}`); }
    setBusy('');
  };
  const apply = async (s: any) => {
    if (!onUpdateLog) return;
    setBusy(s.key);
    try {
      const ids = Object.values(data.logs as Record<string, any>).filter((l: any) => (l.games || []).some((g: any) => g?.name === s.name && g?.category === s.current)).map((l: any) => l.id);
      const fresh = await loadFreshLogs(ids.map((id) => String((data.logs as any)[id]?.date || '').slice(0, 7)), ids);
      let n = 0;
      for (const id of ids) {
        const l: any = fresh[id];
        if (!l) continue;
        await onUpdateLog({ ...l, games: (l.games || []).map((g: any) => (g?.name === s.name && g?.category === s.current ? { ...g, category: s.best } : g)) });
        n++;
      }
      await mutate('aiVideo', { op: 'categoryMark', key: s.key, mark: 'applied' });
      setList((x) => (x || []).filter((y) => y.key !== s.key));
      setMsg(`「${s.name}」 기록 ${n}개를 「${s.best}」로 바꿨어요`);
    } catch (e: any) { setMsg(`못 했어요: ${e?.message || e}`); }
    setBusy('');
  };
  const ignore = async (s: any) => {
    setBusy(s.key);
    try { await mutate('aiVideo', { op: 'categoryMark', key: s.key, mark: 'ignored' }); setList((x) => (x || []).filter((y) => y.key !== s.key)); } catch { /* */ }
    setBusy('');
  };
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs">
      <div className="flex items-center gap-2"><Tags className="w-4 h-4 text-sky-500" /><b className="text-sm text-zinc-900 dark:text-white">게임 카테고리 제안 (AI)</b></div>
      <p className="text-zinc-500 break-keep leading-relaxed">AI가 영상을 분석하면서 게임을 차례로(한 번에 2개씩) 보고, 같은 카테고리에 묶인 게임들과 비슷한지 판단해요. 다른 카테고리가 훨씬 더 맞을 때만 여기에 제안으로 남고, 바로 고치지는 않아요.</p>
      <button type="button" disabled={!!busy} onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold bg-zinc-100 dark:bg-zinc-800 cursor-pointer disabled:opacity-50">{busy === 'load' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} 제안 보기</button>
      {list && <p className="text-zinc-500">확인한 게임 {checked}개 · 제안 {list.length}개</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-800">
          {list.map((s) => (
            <li key={s.key} className="p-2.5 space-y-1">
              <p className="text-zinc-800 dark:text-zinc-100 break-keep"><b>{s.name}</b>: {s.current} ({s.currentScore}점) → <b>{s.best}</b> ({s.bestScore}점)</p>
              {s.reason && <p className="text-zinc-500 break-keep">{s.reason}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={!!busy || !onUpdateLog} onClick={() => void apply(s)} className="px-2.5 py-1 rounded-lg font-bold bg-sky-600 text-white cursor-pointer disabled:opacity-50">{busy === s.key ? '바꾸는 중…' : '적용'}</button>
                <button type="button" disabled={!!busy} onClick={() => void ignore(s)} className="px-2.5 py-1 rounded-lg font-bold bg-zinc-100 dark:bg-zinc-800 cursor-pointer disabled:opacity-50">무시</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
