import React, { useEffect, useMemo, useState } from 'react';
import { Pin, Play, Sparkles, X } from 'lucide-react';
import { cn } from '../../utils';
import { squash } from '../../utils/smartSearch';
import { useSearchTuning } from '../../hooks/useSearchTuning';
import { embedSrc, trackYoutubeFrame, watchUrl } from '../../utils/watchHistory';
import { aiSearch, fmtTime, lastExpanded, type AiResult } from '../../utils/aiSearch';

/**
 * 검색 결과 맨 위에 붙는 두 가지
 *  1) 제보·관리자가 추가한 검색 결과 (config/searchTuning.pins) — 검색어가 같으면 항상
 *  2) AI 검색 — AI가 영상을 미리 보고 정리해 둔 장면에서 찾은 것 (설정에서 끌 수 있음)
 * 장면 시간을 누르면 그 10초 전부터 재생
 */
type Card = { id: string; title: string; kind?: string; summary?: string; scenes: { t: number; d?: string; vague?: boolean }[]; games?: string[]; from: 'pin' | 'ai'; partial?: boolean; note?: string };

const KIND_LABEL: Record<string, string> = { short: '쇼츠', live: '생방송', video: '영상' };

function ExtraCard({ c }: { c: Card }) {
  const [playAt, setPlayAt] = useState<number | null>(null);
  const first = c.scenes[0];
  const play = (t: number | null) => setPlayAt(t === null ? -1 : Math.max(0, t - 10));
  return (
    <div className="rounded-2xl border border-purple-200/80 dark:border-purple-800/50 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex gap-3 p-3">
        <button type="button" onClick={() => play(first ? first.t : null)} className="relative shrink-0 w-32 sm:w-40 aspect-video rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer group" aria-label="재생">
          <img src={`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
            <Play className="w-7 h-7 text-white drop-shadow fill-white/90" />
          </span>
          {first && <span className="absolute bottom-1 right-1 px-1 rounded bg-black/75 text-white text-[10px] font-bold tabular-nums">{fmtTime(first.t)}</span>}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            {c.from === 'ai' ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-black"><Sparkles className="w-3 h-3" /> AI 검색</span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black"><Pin className="w-3 h-3" /> 추천 결과</span>
            )}
            {c.kind && <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold">{KIND_LABEL[c.kind] || c.kind}</span>}
            {c.games?.slice(0, 2).map((g) => <span key={g} className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-semibold truncate max-w-[9rem]">{g}</span>)}
          </div>
          <a href={watchUrl(c.id, { t: first ? Math.max(0, first.t - 10) : undefined, kind: c.kind === 'short' ? 'short' : undefined })} target="_blank" rel="noreferrer" className="block text-sm font-bold text-zinc-900 dark:text-white leading-snug line-clamp-2 hover:text-purple-600 dark:hover:text-purple-400">{c.title || '영상'}</a>
          {c.summary && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 break-keep">{c.summary}</p>}
          {c.note && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 break-keep">{c.note}</p>}
        </div>
      </div>
      {c.scenes.length > 0 && (
        <div className="px-3 pb-3 space-y-1">
          {c.scenes.slice(0, 3).map((s, i) => (
            <p key={i} className="text-xs text-zinc-700 dark:text-zinc-300 break-keep">
              {i === 0 ? '찾으신 장면은 ' : '이 장면도 있어요: '}
              <button type="button" onClick={() => play(s.t)} className="font-black text-purple-600 dark:text-purple-400 underline underline-offset-2 tabular-nums cursor-pointer">{fmtTime(s.t)}</button>
              {i === 0 ? '에 나와요' : ''}
              {s.d && <span className="text-zinc-500 dark:text-zinc-400"> · {s.d}</span>}
              {s.vague && <span className="text-[10px] text-amber-600"> (확실하지 않음)</span>}
            </p>
          ))}
          <p className="text-[10px] text-zinc-400">시간을 누르면 10초 전부터 재생돼요{c.partial ? ' · 아직 영상 앞부분만 분석했어요' : ''}</p>
        </div>
      )}
      {playAt !== null && (
        <div className="relative aspect-video bg-black">
          <iframe
            key={playAt}
            ref={trackYoutubeFrame}
            src={embedSrc(c.id, playAt >= 0 ? { start: playAt } : {})}
            title={c.title}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <button type="button" onClick={() => setPlayAt(null)} className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/80 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"><X className="w-3.5 h-3.5" /> 닫기</button>
        </div>
      )}
    </div>
  );
}

export function SearchExtras({ query, aiEnabled }: { query: string; aiEnabled: boolean }) {
  const tuning = useSearchTuning() as any;
  const q = query.trim();
  const [ai, setAi] = useState<{ q: string; results: AiResult[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!aiEnabled || q.length < 2 || q.startsWith('#') || /youtu|chzzk|https?:/.test(q)) { setAi(null); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      setLoading(true);
      aiSearch(q).then((r) => { if (alive) setAi({ q, results: r }); }).finally(() => { if (alive) setLoading(false); });
    }, 650);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, aiEnabled]);

  const cards = useMemo(() => {
    const out: Card[] = [];
    const seen = new Set<string>();
    ((tuning?.pins || {})[squash(q)] || []).forEach((p: any) => {
      const k = `${p.id}|${p.t || 0}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id: p.id, title: p.title, scenes: p.t ? [{ t: p.t, d: '' }] : [], from: 'pin', note: p.note });
    });
    if (ai && ai.q === q) {
      ai.results.forEach((r) => {
        if (out.some((c) => c.id === r.id)) return;
        out.push({ id: r.id, title: r.title, kind: r.kind, summary: r.summary, scenes: r.scenes, games: r.games, from: 'ai', partial: r.partial });
      });
    }
    return out.slice(0, 6);
  }, [tuning, q, ai]);

  if (!q || (!cards.length && !loading)) return null;
  return (
    <section className="mb-5 space-y-2" aria-label="AI 검색">
      <h3 className="px-1 text-sm font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-purple-500" /> 콕 집어 찾은 결과
        {loading && !cards.length && <span className="text-[11px] font-semibold text-zinc-400 ml-1">AI가 정리해 둔 장면에서 찾는 중…</span>}
      </h3>
      {(lastExpanded.get(q.toLowerCase()) || []).length > 0 && ai?.q === q && (
        <p className="px-1 text-[11px] text-zinc-500">AI가 '{q}'를 <b>{(lastExpanded.get(q.toLowerCase()) || []).slice(0, 5).join(' · ')}</b>(으)로도 찾아봤어요</p>
      )}
      <div className={cn('grid gap-2.5', cards.length > 1 && 'lg:grid-cols-2')}>
        {cards.map((c) => <ExtraCard key={`${c.from}-${c.id}-${c.scenes[0]?.t || 0}`} c={c} />)}
      </div>
    </section>
  );
}
