import { makeMatcher } from '../utils/textMatch';
import { usePrefs } from '../utils/userPrefs';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { ChevronLeft, PauseCircle, PlayCircle, Search, Trash2, X } from 'lucide-react';
import { cn } from '../utils';
import { formatDuration } from '../hooks/useVideoDuration';
import { clearWatchEntries, progressOf, recordWatch, removeWatch, useWatchHistory, watchUrl, type WatchEntry } from '../utils/watchHistory';
import { isInterestPaused, setInterestPaused } from '../utils/interest';
import { ItemMenu } from './common/ItemMenu';
import { ProgressBar } from './common/ProgressBar';
import { useBackToClose } from '../hooks/useBackToClose';

/**
 * 시청 기록 전체 보기 (유튜브 '기록' 화면처럼)
 * - 날짜별로 묶어서: 그날 본 쇼츠는 가로 줄, 영상·생방송은 목록
 * - 검색, 종류(전체·동영상·Shorts·라이브), 하나씩 삭제, 모두 지우기, 기록 일시 중지
 * - 누르면 보던 곳부터 유튜브에서 이어 보기
 * 기록은 이 기기에만 있어요
 */
export const OPEN_HISTORY_EVENT = 'uzuhama-open-history';
export const openWatchHistory = () => window.dispatchEvent(new Event(OPEN_HISTORY_EVENT));

type Filter = 'all' | 'video' | 'short' | 'live';
const FILTERS: [Filter, string][] = [['all', '전체'], ['video', '동영상'], ['short', 'Shorts'], ['live', '라이브']];
const DAY = 86400000;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(t: number) {
  const today = startOfDay(Date.now());
  const d = startOfDay(t);
  const diff = Math.round((today - d) / DAY);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  const date = new Date(t);
  if (diff < 7) return ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][date.getDay()];
  if (date.getFullYear() === new Date().getFullYear()) return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}
const timeLabel = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const KIND_LABEL: Record<string, string> = { video: '동영상', short: 'Shorts', live: '생방송' };
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/${'mqdefault'}.jpg`;

export function WatchHistoryPage({ onClose }: { onClose: () => void }) {
  const all = useWatchHistory();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(80);
  const [paused, setPaused] = useState(isInterestPaused);
  useBackToClose(true, onClose);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  const prefs = usePrefs();
  const list = useMemo(() => {
    const m = makeMatcher(q, prefs, all.map((e) => e.title || ''));
    return all.filter((e) => (filter === 'all' || e.kind === filter) && m(e.title || ''));
  }, [all, q, filter, prefs]);
  const groups = useMemo(() => {
    const out: { label: string; shorts: WatchEntry[]; rows: WatchEntry[] }[] = [];
    list.slice(0, limit).forEach((e) => {
      const label = dayLabel(e.at);
      let g = out[out.length - 1];
      if (!g || g.label !== label) { g = { label, shorts: [], rows: [] }; out.push(g); }
      (e.kind === 'short' && filter !== 'short' ? g.shorts : g.rows).push(e);
    });
    return out;
  }, [list, limit, filter]);

  const open = (e: WatchEntry) => { recordWatch({ id: e.id, kind: e.kind, title: e.title }); window.open(watchUrl(e.id, { kind: e.kind }), '_blank', 'noopener'); };
  const menu = (e: WatchEntry, compact = false) => (
    <ItemMenu id={e.id} kind={e.kind} title={e.title} compact={compact} noReport
      shareText={() => `${e.title}\n${e.kind === 'short' ? `https://www.youtube.com/shorts/${e.id}` : `https://youtu.be/${e.id}`}`}
      extraItems={[{ label: '시청 기록에서 삭제', icon: <Trash2 className="w-4 h-4" />, onClick: () => removeWatch(e.id), danger: true }]} />
  );

  return createPortal(
    <motion.div
      role="dialog" aria-modal="true" aria-label="시청 기록"
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      className="fixed inset-0 z-[350] bg-white dark:bg-zinc-950 overflow-y-auto overscroll-contain"
    >
      <div className="max-w-3xl mx-auto pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between px-2 h-14">
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="뒤로"><ChevronLeft className="w-6 h-6" /></button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { const n = !paused; setInterestPaused(n); setPaused(n); }} className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                {paused ? <><PlayCircle className="w-4 h-4" /> 기록 다시 켜기</> : <><PauseCircle className="w-4 h-4" /> 기록 일시 중지</>}
              </button>
              {all.length > 0 && (
                <button type="button" onClick={() => window.confirm('시청 기록을 모두 지울까요? (이어 보기 위치도 지워져요)') && clearWatchEntries()} className="px-3 py-1.5 rounded-full text-xs font-bold text-red-600 flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer">
                  <Trash2 className="w-4 h-4" /> 모두 지우기
                </button>
              )}
            </div>
          </div>
          <h1 className="px-4 pb-3 text-3xl font-black text-zinc-900 dark:text-white">기록</h1>
          <div className="px-4 pb-3">
            <label className="flex items-center gap-2.5 px-3.5 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/80">
              <Search className="w-5 h-5 text-zinc-400 shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="시청 기록 검색" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
              {q && <button type="button" onClick={() => setQ('')} className="p-1 text-zinc-400 cursor-pointer" aria-label="지우기"><X className="w-4 h-4" /></button>}
            </label>
          </div>
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn('shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors', filter === k ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200')}>{label}</button>
            ))}
          </div>
        </header>

        {paused && <p className="mx-4 mb-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">기록이 일시 중지돼 있어요. 지금 보는 영상은 기록되지 않아요.</p>}

        {groups.length === 0 ? (
          <p className="py-20 text-center text-sm text-zinc-500">{all.length ? '찾는 기록이 없어요.' : '아직 본 영상이 없어요. 사이트에서 영상을 열면 여기에 쌓여요.'}</p>
        ) : groups.map((g) => (
          <section key={g.label} className="mt-2">
            <h2 className="px-4 py-2 text-xl font-black text-zinc-900 dark:text-white">{g.label}</h2>
            {g.shorts.length > 0 && (
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-3" data-no-swipe>
                {g.shorts.map((e) => (
                  <div key={e.id} className="relative shrink-0 w-[34%] max-w-[150px]">
                    <button type="button" onClick={() => open(e)} className="block w-full text-left cursor-pointer">
                      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                        <img src={`https://i.ytimg.com/vi/${e.id}/oardefault.jpg`} onError={(ev) => { (ev.currentTarget as HTMLImageElement).src = thumb(e.id); }} alt="" loading="lazy" className="w-full h-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                        <span className="absolute left-2 right-2 bottom-2 text-white text-[13px] font-bold leading-snug line-clamp-2">{e.title || 'Shorts'}</span>
                      </div>
                    </button>
                    <div className="absolute top-1 right-1 bg-black/30 rounded-lg text-white">{menu(e, true)}</div>
                  </div>
                ))}
              </div>
            )}
            <ul>
              {g.rows.map((e) => {
                const p = progressOf(e);
                return (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-2">
                    <button type="button" onClick={() => open(e)} className="flex flex-1 min-w-0 items-start gap-3 text-left cursor-pointer">
                      <div className="relative w-[44%] max-w-[220px] aspect-video rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0">
                        <img src={thumb(e.id)} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {e.dur ? <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold tabular-nums">{formatDuration(e.dur)}</span> : null}
                        {p > 0.02 && <ProgressBar value={p} />}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-3">{e.title || '제목 없음'}</p>
                        <p className="mt-1 text-xs text-zinc-500">{KIND_LABEL[e.kind] || '동영상'} · {timeLabel(e.at)}{e.pos && e.dur && p < 0.97 ? ` · ${formatDuration(e.pos)}까지 봄` : ''}</p>
                      </div>
                    </button>
                    <div className="-mr-2 pt-0.5">{menu(e)}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {list.length > limit && (
          <div className="px-4 py-4"><button type="button" onClick={() => setLimit((n) => n + 80)} className="w-full h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm font-bold cursor-pointer">더 보기 ({list.length - limit}개 남음)</button></div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
