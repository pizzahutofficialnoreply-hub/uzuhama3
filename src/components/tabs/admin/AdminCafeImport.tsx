import { useMemo, useState } from 'react';
import { CheckSquare, ClipboardPaste, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog, LinkItem } from '../../../types';
import { cn } from '../../../utils';
import { parseCafePost, youtubeIdOf, type CafeDay, type CafeLink } from '../../../utils/cafeImport';
import { useChannelVideos } from '../../../hooks/useChannelVideos';

/**
 * 관리자 > 기록 추가 > 카페 정리 글 가져오기
 * 팬카페의 '영상 생방링크 정리' 글을 통째로 붙여 넣으면 날짜별로 나눠서,
 * 기록에 없는 생방·영상·쇼츠 링크만 골라 미리 보여 주고, 확인한 것만 반영
 * - 이미 있는 링크는 건너뜀 (영상 ID 로 비교, 다른 날 기록에 있는 영상도 건너뛰고 알려 줌)
 * - 그날 기록이 없으면 새 기록으로 (시작 시각 등은 비워 둠)
 */
type Plan = {
  day: CafeDay;
  log: BroadcastLog | null;
  lives: CafeLink[];
  videos: CafeLink[];
  shorts: CafeLink[];
  elsewhere: { link: CafeLink; date: string }[];
  status: 'new-log' | 'add' | 'same';
};

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

  // 모든 기록의 링크 → 어느 날 기록에 있는지
  const where = useMemo(() => {
    const m = new Map<string, string>();
    Object.values(data.logs || {}).forEach((l: any) => {
      [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].forEach((x: any) => {
        const id = youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
        if (id && !m.has(id)) m.set(id, l.date);
      });
    });
    return m;
  }, [data.logs]);

  const plans: Plan[] = useMemo(() => (days || []).map((day) => {
    const log = (Object.values(data.logs || {}) as BroadcastLog[]).find((l) => l.date === day.date && !l.isAbsence) || null;
    const elsewhere: Plan['elsewhere'] = [];
    const fresh = (list: CafeLink[]) => list.filter((link) => {
      const at = where.get(link.id);
      if (!at) return true;
      if (at !== day.date) elsewhere.push({ link, date: at });
      return false;
    }).map((l) => ({ ...l, title: titleOf.get(l.id) || l.title || '' }));
    const lives = fresh(day.lives);
    const videos = fresh(day.videos);
    const shorts = fresh(day.shorts);
    const any = lives.length + videos.length + shorts.length > 0;
    return { day, log, lives, videos, shorts, elsewhere, status: !any ? 'same' : log ? 'add' : 'new-log' };
  }), [days, data.logs, where, titleOf]);

  const analyze = () => {
    const parsed = parseCafePost(text);
    setDays(parsed);
    setMessage(parsed.length ? '' : '날짜(예: [생방날짜: 2017. 3. 31])와 유튜브 링크를 찾지 못했어요.');
    setPicked(new Set());
  };
  // 분석이 끝나면 새로 넣을 게 있는 날을 모두 선택해 둠
  const actionable = plans.filter((p) => p.status !== 'same');
  if (days && picked.size === 0 && actionable.length && !busy && !message.startsWith('반영')) {
    setPicked(new Set(actionable.map((p) => p.day.date)));
  }

  const toItem = (l: CafeLink, fallback: string): LinkItem => ({ title: l.title || fallback, url: l.url, ...(source.trim() ? { source: source.trim() } : {}) } as any);

  const apply = async () => {
    const todo = plans.filter((p) => p.status !== 'same' && picked.has(p.day.date));
    if (!todo.length) return;
    if (!confirm(`${todo.length}일치 기록에 반영할까요?\n(새 기록 ${todo.filter((p) => p.status === 'new-log').length}개 포함)`)) return;
    setBusy({ done: 0, total: todo.length });
    let ok = 0;
    for (const p of todo) {
      try {
        if (p.log && onUpdateLog) {
          await onUpdateLog({
            ...p.log,
            vods: [...(p.log.vods || []), ...p.lives.map((l) => toItem(l, '생방송'))],
            edited: [...(p.log.edited || []), ...p.videos.map((l) => toItem(l, '편집본'))],
            shorts: [...(p.log.shorts || []), ...p.shorts.map((l) => toItem(l, '쇼츠'))],
          });
        } else if (!p.log) {
          await onAddLog({
            id: `cafe_${p.day.date.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`,
            date: p.day.date, time: '', game: '', games: [], category: '', durationHours: 0,
            vods: p.lives.map((l) => toItem(l, '생방송')),
            edited: p.videos.map((l) => toItem(l, '편집본')),
            shorts: p.shorts.map((l) => toItem(l, '쇼츠')),
            ...(source.trim() ? { source: source.trim() } : {}),
          } as any);
        }
        ok++;
      } catch (e) { console.error('cafe import', p.day.date, e); }
      setBusy({ done: ok, total: todo.length });
    }
    setBusy(null);
    setMessage(`반영했어요: ${ok}/${todo.length}일. 아래 목록은 반영된 상태로 다시 계산돼요.`);
    setPicked(new Set());
  };

  const count = (k: Plan['status']) => plans.filter((p) => p.status === k).length;
  const toggle = (d: string) => setPicked((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 text-xs sm:text-sm text-purple-900 dark:text-purple-200 leading-relaxed">
        팬카페의 '영상 생방링크 정리' 글을 통째로 복사해서 붙여 넣으세요. 날짜별로 나눠서 <b>기록에 아직 없는 생방·영상·쇼츠 링크만</b> 보여 줘요.
        확인하고 고른 날만 반영돼요. 정리해 준 팬의 글 링크를 출처로 남겨 두면 좋아요.
      </div>

      <div className="space-y-3">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="출처 (선택): 카페 글 링크나 정리해 준 분 닉네임"
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'[생방날짜: 2017. 3. 31]\n생방링크\n: https://youtu.be/...\n영상링크\n: https://youtu.be/...\n영상 제목'}
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

      {days && plans.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold">{plans.length}일 찾음</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold">링크 추가 {count('add')}</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-bold">새 기록 {count('new-log')}</span>
            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 font-bold">이미 다 있음 {count('same')}</span>
            <button type="button" onClick={() => setPicked(picked.size === actionable.length ? new Set() : new Set(actionable.map((p) => p.day.date)))} className="ml-auto text-purple-600 font-bold cursor-pointer">
              {picked.size === actionable.length ? '모두 해제' : '모두 선택'}
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {plans.map((p) => (
              <div key={p.day.date} className={cn('p-3 text-xs', p.status === 'same' && 'opacity-50')}>
                <div className="flex items-center gap-2">
                  {p.status !== 'same' ? (
                    <button type="button" onClick={() => toggle(p.day.date)} className="cursor-pointer" aria-label={`${p.day.date} 선택`}>
                      {picked.has(p.day.date) ? <CheckSquare className="w-4 h-4 text-purple-600" /> : <Square className="w-4 h-4 text-zinc-400" />}
                    </button>
                  ) : <span className="w-4" />}
                  <span className="font-bold tabular-nums">{p.day.date}</span>
                  <span className={cn('px-1.5 py-0.5 rounded font-bold',
                    p.status === 'add' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : p.status === 'new-log' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800')}>
                    {p.status === 'add' ? '기록에 추가' : p.status === 'new-log' ? '새 기록' : '이미 다 있음'}
                  </span>
                  {p.log && <span className="text-zinc-500 truncate">{p.log.game || (p.log.games || []).map((g) => g.name).join(', ')}</span>}
                </div>
                <ul className="mt-1.5 ml-6 space-y-0.5">
                  {p.lives.map((l) => <li key={l.id}><b className="text-purple-600">생방</b> <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-600 dark:text-zinc-300">{l.url}</a></li>)}
                  {p.videos.map((l) => <li key={l.id}><b className="text-red-600">영상</b> {l.title || <i className="text-zinc-400">제목 없음</i>} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                  {p.shorts.map((l) => <li key={l.id}><b className="text-pink-600">쇼츠</b> {l.title || ''} <a href={l.url} target="_blank" rel="noreferrer" className="underline text-zinc-400">{l.id}</a></li>)}
                  {p.elsewhere.map(({ link, date }) => <li key={`e-${link.id}`} className="text-zinc-400">건너뜀: {link.id} 은(는) {date} 기록에 이미 있어요</li>)}
                </ul>
              </div>
            ))}
          </div>

          <button type="button" onClick={apply} disabled={!picked.size || !!busy} className="w-full h-12 rounded-2xl bg-purple-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 반영 중 {busy.done}/{busy.total}</> : `선택한 ${picked.size}일 반영하기`}
          </button>
        </div>
      )}
    </div>
  );
}
