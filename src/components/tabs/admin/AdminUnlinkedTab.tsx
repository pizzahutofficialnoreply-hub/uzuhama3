import React, { useMemo, useState } from 'react';
import { Check, ExternalLink, Link2, Loader2, Search } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { useChannelVideos } from '../../../hooks/useChannelVideos';
import { useChannelShorts } from '../recommend/ShortsFeed';
import { Pagination } from '../../common/Pagination';
import { cn } from '../../../utils';

/**
 * 관리자 > 연동: 유튜브 채널에는 있지만 방송 기록에 연결 안 된 영상·쇼츠
 * 날짜를 고르면 그날 방송(게임)을 바로 보여 주고, '연결'을 누르면 그 방송 기록의 편집본/쇼츠에 추가
 * - 날짜는 업로드일 기준 가장 가까운 이전 방송을 미리 채워 둠
 */
const PER_PAGE = 20;
const kstDate = (iso: string) => (iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10) : '');

export function AdminUnlinkedTab({ data, onUpdateLog }: { data: AppData; onUpdateLog: (log: BroadcastLog) => Promise<void> }) {
  const videos = useChannelVideos();
  const shorts = useChannelShorts();
  const [kind, setKind] = useState<'video' | 'short'>('video');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const logs = useMemo(() => Object.values(data?.logs || {}).filter((l: any) => l?.date && !l.isAbsence) as BroadcastLog[], [data?.logs]);
  const logDates = useMemo(() => [...new Set(logs.map((l) => l.date))].sort(), [logs]);

  // 기록에 이미 들어 있는 유튜브 영상 ID
  const linked = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l: any) => {
      [...(l.edited || []), ...(l.shorts || []), ...(l.vods || [])].forEach((it: any) => {
        const id = extractYoutubeId(typeof it === 'string' ? it : it?.url || '');
        if (id) set.add(id);
      });
    });
    return set;
  }, [logs]);

  const list = useMemo(() => {
    const src = kind === 'video' ? videos : shorts;
    const term = q.trim().toLowerCase();
    return src
      .filter((v) => !linked.has(v.videoId) && !done[v.videoId])
      .filter((v) => !term || v.title.toLowerCase().includes(term))
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  }, [kind, videos, shorts, linked, q, done]);

  /** 업로드일 이전(같은 날 포함) 가장 가까운 방송일 */
  const guessDate = (publishedAt: string) => {
    const d = kstDate(publishedAt);
    if (!d) return '';
    let best = '';
    for (const ld of logDates) { if (ld <= d) best = ld; else break; }
    return best;
  };

  const link = async (v: { videoId: string; title: string }, date: string, logId: string) => {
    const log = logs.find((l) => l.id === logId);
    if (!log) return;
    setBusy(v.videoId);
    try {
      const item = kind === 'video'
        ? { title: v.title, url: `https://www.youtube.com/watch?v=${v.videoId}` }
        : { title: v.title, url: `https://www.youtube.com/shorts/${v.videoId}` };
      const next: BroadcastLog = kind === 'video'
        ? { ...log, edited: [...(log.edited || []), item] }
        : { ...log, shorts: [...(log.shorts || []), item] };
      await onUpdateLog(next);
      setDone((d) => ({ ...d, [v.videoId]: date }));
    } catch (e: any) {
      alert('연결 중 오류: ' + (e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const pageItems = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const doneCount = Object.keys(done).length;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 연동 안 된 영상·쇼츠
        </h3>
        <p className="text-[11px] text-zinc-500">유튜브 채널에는 있지만 방송 기록에 연결되지 않은 것들이에요. 날짜를 고르면 그날 방송이 보이고, 연결을 누르면 그 기록의 {kind === 'video' ? '편집본' : '쇼츠'}에 추가돼요. 연결 안 된 영상도 사이트 홈에는 업로드일 기준으로 보여요.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl">
            {([['video', `영상 ${videos.filter((v) => !linked.has(v.videoId)).length}`], ['short', `쇼츠 ${shorts.filter((v) => !linked.has(v.videoId)).length}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }} className={cn('px-3 py-1 text-xs font-bold rounded-lg cursor-pointer', kind === k ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs' : 'text-zinc-500')}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="제목으로 찾기" className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
          </div>
          {doneCount > 0 && <span className="text-xs font-bold text-emerald-600">이번에 {doneCount}개 연결</span>}
        </div>
        {!videos.length && kind === 'video' && <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 채널 영상 목록을 불러오는 중…</p>}
      </div>

      {pageItems.map((v) => {
        const date = dates[v.videoId] ?? guessDate(v.publishedAt);
        const dayLogs = logs.filter((l) => l.date === date);
        return (
          <div key={v.videoId} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row gap-3">
            <a href={kind === 'video' ? `https://www.youtube.com/watch?v=${v.videoId}` : `https://www.youtube.com/shorts/${v.videoId}`} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" className={cn('rounded-xl object-cover bg-zinc-200', kind === 'video' ? 'w-full sm:w-44 aspect-video' : 'w-24 aspect-[9/16]')} loading="lazy" />
            </a>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-2">{v.title}</p>
                <p className="text-[11px] text-zinc-500 flex items-center gap-1">{kstDate(v.publishedAt)} 업로드 <ExternalLink className="w-3 h-3" /></p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">방송일</label>
                <input type="date" value={date} onChange={(e) => setDates((d) => ({ ...d, [v.videoId]: e.target.value }))} className="px-2 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
              </div>
              {date && (dayLogs.length ? (
                <div className="space-y-1.5">
                  {dayLogs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <span className="font-bold text-zinc-800 dark:text-zinc-100">{l.date} {l.time || ''}</span>
                        <span className="ml-1.5 text-zinc-500 truncate">{(l.games?.length ? l.games.map((g) => g.name).join(', ') : l.game) || '게임 정보 없음'}</span>
                        <span className="ml-1.5 text-zinc-400">· 편집본 {l.edited?.length || 0} · 쇼츠 {l.shorts?.length || 0}</span>
                      </div>
                      <button type="button" disabled={busy === v.videoId} onClick={() => link(v, date, l.id)} className="shrink-0 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60">
                        {busy === v.videoId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 연결
                      </button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-amber-600">이 날짜에는 방송 기록이 없어요.</p>)}
            </div>
          </div>
        );
      })}
      {list.length === 0 && (videos.length > 0 || kind === 'short') && (
        <div className="py-10 text-center text-sm text-zinc-500">연동 안 된 {kind === 'video' ? '영상' : '쇼츠'}가 없어요.</div>
      )}
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
