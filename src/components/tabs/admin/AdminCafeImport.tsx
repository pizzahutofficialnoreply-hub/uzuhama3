import { useMemo, useState } from 'react';
import { CheckSquare, ClipboardPaste, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog, LinkItem } from '../../../types';
import { cn } from '../../../utils';
import { parseCafePost, planCafeImport, type CafeDay, type CafeLink, type CafePlan } from '../../../utils/cafeImport';
import { useChannelVideos } from '../../../hooks/useChannelVideos';

/**
 * 관리자 > 기록 추가 > 카페 정리 글 가져오기
 * 팬카페의 '영상 생방링크 정리' 글을 통째로 붙여 넣으면 날짜별로 나눠서,
 * 기록에 없는 생방·영상·쇼츠 링크만 골라 미리 보여 주고, 확인한 것만 반영
 * - 이미 있는 링크는 건너뜀 (영상 ID 로 비교, 다른 날 기록에 있는 영상도 건너뛰고 알려 줌)
 * - 그날 기록이 없으면 새 기록으로 (시작 시각 등은 비워 둠)
 */
type Plan = CafePlan;

export function AdminCafeImport({ data, onAddLog, onUpdateLog }: {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog?: (log: BroadcastLog) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [days, setDays] = useState<CafeDay[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const channelVideos = useChannelVideos();
  const titleOf = useMemo(() => new Map(channelVideos.map((v) => [v.videoId, v.title] as const)), [channelVideos]);

  /**
   * 영상 링크 기준으로 맞춤:
   * 1) 사이트에 이미 있는 영상이면 → 그 영상이 들어 있는 방송 기록에, 없는 생방 링크만 추가
   * 2) 사이트에 없는 영상이면 → 글의 날짜 기록에 영상·생방 추가 (그날 기록이 없으면 새 기록)
   */
  const { plans, skipped, already } = useMemo(() => planCafeImport(days || [], Object.values(data.logs || {}) as BroadcastLog[], titleOf), [days, data.logs, titleOf]);

  const analyze = () => {
    const parsed = parseCafePost(text);
    setDays(parsed);
    setMessage(parsed.length ? '' : '날짜(예: [생방날짜: 2017. 3. 31])와 유튜브 링크를 찾지 못했어요.');
    setPicked(new Set());
  };
  // 분석이 끝나면 모두 선택해 둠
  const actionable = plans;
  if (days && picked.size === 0 && actionable.length && !busy && !message.startsWith('반영')) {
    setPicked(new Set(actionable.map((p) => p.key)));
  }

  const toItem = (l: CafeLink, fallback: string): LinkItem => ({ title: l.title || fallback, url: l.url, ...(source.trim() ? { source: source.trim() } : {}) } as any);

  const apply = async () => {
    const todo = plans.filter((p) => picked.has(p.key));
    if (!todo.length) return;
    if (!confirm(`${todo.length}일치 기록에 반영할까요?\n(새 기록 ${todo.filter((p) => p.status === 'new-log').length}개 포함)`)) return;
    setBusy({ done: 0, total: todo.length });
    let ok = 0;
    const fails: string[] = [];
    for (const p of todo) {
      try {
        if (p.log) {
          if (!onUpdateLog) throw new Error('기록 수정 기능을 못 찾았어요');
          await onUpdateLog({
            ...p.log,
            vods: [...(p.log.vods || []), ...p.lives.map((l) => toItem(l, '생방송'))],
            edited: [...(p.log.edited || []), ...p.videos.map((l) => toItem(l, '편집본'))],
            shorts: [...(p.log.shorts || []), ...p.shorts.map((l) => toItem(l, '쇼츠'))],
          });
        } else {
          await onAddLog({
            id: `cafe_${p.date.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`,
            date: p.date, time: '', game: '', games: [], category: '', durationHours: 0,
            vods: p.lives.map((l) => toItem(l, '생방송')),
            edited: p.videos.map((l) => toItem(l, '편집본')),
            shorts: p.shorts.map((l) => toItem(l, '쇼츠')),
            ...(source.trim() ? { source: source.trim() } : {}),
          } as any);
        }
        ok++;
      } catch (e: any) { console.error('cafe import', p.date, e); fails.push(`${p.date}: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok, total: todo.length });
    }
    setBusy(null);
    setMessage(`반영했어요: ${ok}/${todo.length}일.${fails.length ? ` 실패 ${fails.length}개 — ${fails.slice(0, 3).join(' / ')}` : ' 아래 목록은 반영된 상태로 다시 계산돼요.'}`);
    setPicked(new Set());
  };

  const count = (k: Plan['status']) => plans.filter((p) => p.status === k).length;
  const liveCount = plans.reduce((a, p) => a + p.lives.length, 0);
  const toggle = (d: string) => setPicked((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 text-xs sm:text-sm text-purple-900 dark:text-purple-200 leading-relaxed">
        팬카페의 '영상 생방링크 정리' 글을 통째로 복사해서 붙여 넣으세요. 날짜별로 나눠서 <b>기록에 아직 없는 링크만</b> 보여 줘요.
        사이트에 이미 있는 영상이면 <b>그 영상이 들어 있는 방송 기록에 생방 링크</b>를 넣어요. 확인하고 고른 것만 반영돼요. 정리해 준 팬의 글 링크를 출처로 남겨 두면 좋아요.
      </div>

      <div className="space-y-3">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="출처 (선택): 카페 글 링크나 정리해 준 분 닉네임"
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'• 2022.05.06\n• 영상: 영상 제목, https://youtu.be/...\n• 게임: 게임 이름, https://store.steampowered.com/...\n• 생방: https://youtu.be/...'}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-purple-500" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { /* 권한 없음 */ } }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">
            <ClipboardPaste className="w-4 h-4" /> 붙여넣기
          </button>
          <button type="button" onClick={analyze} disabled={!text.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
            <Wand2 className="w-4 h-4" /> 분석하기
          </button>
        </div>
        {message && <p className="text-xs font-bold text-purple-700 dark:text-purple-300">{message}</p>}
      </div>

      {days && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold">글에서 {days.length}일 · 영상 {days.reduce((a, d) => a + d.pairs.length, 0)}개 · 생방 {days.reduce((a, d) => a + d.lives.length, 0)}개 찾음</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold">넣을 생방 링크 {liveCount}</span>
            {count('new-log') > 0 && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-bold">새 기록 {count('new-log')}</span>}
            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 font-bold">이미 있음 {already}</span>
            {plans.length > 0 && (
              <button type="button" onClick={() => setPicked(picked.size === actionable.length ? new Set() : new Set(actionable.map((p) => p.key)))} className="ml-auto text-purple-600 font-bold cursor-pointer">
                {picked.size === actionable.length ? '모두 해제' : '모두 선택'}
              </button>
            )}
          </div>

          {plans.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">넣을 게 없어요. 글의 링크가 모두 기록에 이미 있어요.</p>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              {plans.map((p) => (
                <div key={p.key} className="p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => toggle(p.key)} className="cursor-pointer" aria-label={`${p.date} 선택`}>
                      {picked.has(p.key) ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </button>
                    <span className="font-bold tabular-nums">{p.date}</span>
                    <span className={cn('px-1.5 py-0.5 rounded font-bold', p.status === 'add' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300')}>
                      {p.status === 'add' ? '기록에 추가' : '새 기록'}
                    </span>
                    {p.log && <span className="text-zinc-500 truncate">{p.log.game || (p.log.games || []).map((g) => g.name).join(', ')}</span>}
                  </div>
                  <ul className="mt-1.5 ml-6 space-y-0.5">
                    {p.via.map((v) => <li key={v.title} className="text-zinc-500">영상 「{v.title}」 기준</li>)}
                    {p.lives.map((l) => <li key={l.id}><b className="text-purple-600">+ 생방</b> <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-600 dark:text-zinc-300">{l.url}</a></li>)}
                    {p.videos.map((l) => <li key={l.id}><b className="text-red-600">+ 영상</b> {l.title || <i className="text-zinc-400">제목 없음</i>} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                    {p.shorts.map((l) => <li key={l.id}><b className="text-pink-600">+ 쇼츠</b> {l.title || ''} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                    {p.notes.map((n) => <li key={n} className="text-amber-600">{n}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {skipped.length > 0 && (
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer font-bold">건너뛴 링크 {skipped.length}개 (다른 기록에 이미 있음)</summary>
              <ul className="mt-1.5 ml-4 list-disc space-y-0.5">{skipped.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
          )}

          {plans.length > 0 && (
            <button type="button" onClick={apply} disabled={!picked.size || !!busy} className="w-full h-12 rounded-2xl bg-purple-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 반영 중 {busy.done}/{busy.total}</> : `선택한 ${picked.size}개 기록 반영하기`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
