import React, { useMemo, useRef } from 'react';
import { liveTitle } from '../../utils/liveTitle';
import { VideoCardInfo } from './VideoCardInfo';
import type { BroadcastLog } from '../../types';
import { useVideoMeta, formatDuration, formatRelativeTime } from '../../hooks/useVideoDuration';

/**
 * 펼친 영상 아래 '비슷한 영상' (유튜브 앱처럼 영상 밑에 이어서)
 * 방송 기록에서 같은 게임 > 같은 카테고리 > 제목·AI 키워드가 겹치는 영상 순으로 고름 (같은 영상 빼고)
 */
type Cand = { id: string; title: string; games: string[]; cats: string[]; date: string; kind: 'video' | 'live' };
const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/)([\w-]{11})/) || [])[1] || '';
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const words = (s: string) => String(s || '').toLowerCase().split(/[^0-9a-z가-힣]+/).filter((w) => w.length >= 2);

let cache: { logs: any; list: Cand[] } | null = null;
function candidates(logs: Record<string, BroadcastLog>): Cand[] {
  if (cache && cache.logs === logs) return cache.list;
  const by = new Map<string, Cand>();
  for (const l of Object.values(logs || {})) {
    if (!l || l.isAbsence) continue;
    const lg = (l.games || []).map((g) => g.name).filter(Boolean);
    const lc = [...new Set([...(l.games || []).map((g) => g.category || ''), l.category || ''].flatMap((c) => c.split(/[,/]/)).map((c) => c.trim()).filter(Boolean))];
    const add = (it: any, kind: 'video' | 'live') => {
      const id = ytId(it?.url);
      if (!id) return;
      const games = (it.games || []).length ? it.games.map((g: any) => g.name) : lg;
      const e = by.get(id);
      if (e) { e.games = [...new Set([...e.games, ...games])]; return; }
      by.set(id, { id, title: it.title || '', games, cats: lc, date: l.date, kind });
    };
    (l.edited || []).forEach((v) => add(v, 'video'));
    (l.vods || []).forEach((v) => add(v, 'live'));
  }
  cache = { logs, list: [...by.values()] };
  return cache.list;
}

export function SimilarVideos({ id, title, logs, ai, onPick, onShorts, part }: {
  /** linked: 연결된 생방송·쇼츠만 (AI 요약 위) / similar: 추천 영상만 (맨 아래) / 없으면 둘 다 */
  part?: 'linked' | 'similar';
  id: string; title: string; logs?: Record<string, BroadcastLog>; ai?: any; onPick: (id: string, title: string, el: Element | null) => void; onShorts?: (items: { url: string; title?: string }[], index: number, games: string[]) => void }) {
  const list = useMemo(() => {
    if (!logs) return [];
    const all = candidates(logs);
    const me = all.find((c) => c.id === id);
    const myGames = new Set([...(me?.games || []), ...((ai?.games || []).flatMap((g: any) => [g.name, g.ko]))].filter(Boolean).map(norm));
    const myCats = new Set((me?.cats || []).map(norm));
    const myWords = new Set([...words(title), ...((ai?.keywords || []) as string[]).map((k) => k.toLowerCase())]);
    const scored = all.filter((c) => c.id !== id).map((c) => {
      let s = 0;
      if (c.games.some((g) => myGames.has(norm(g)))) s += 10;
      s += Math.min(3, c.cats.filter((x) => myCats.has(norm(x))).length) * 2;
      s += Math.min(4, words(c.title).filter((w) => myWords.has(w)).length);
      if (c.kind === 'video') s += 0.5; // 편집본을 조금 먼저
      return { c, s };
    }).filter((x) => x.s >= 2);
    // 같은 점수면 최근 것 먼저, 한 게임이 목록을 다 차지하지 않게 게임마다 3개까지
    scored.sort((a, b) => b.s - a.s || b.c.date.localeCompare(a.c.date));
    const per = new Map<string, number>();
    const out: Cand[] = [];
    for (const { c } of scored) {
      const k = norm(c.games[0] || c.id);
      if ((per.get(k) || 0) >= 3) continue;
      per.set(k, (per.get(k) || 0) + 1);
      out.push(c);
      if (out.length >= 10) break;
    }
    return out;
  }, [id, title, logs, ai]);

  // 연결된 것: 이 영상이 들어 있는 기록의 생방송·편집 영상·쇼츠 (생방송이면 영상·쇼츠, 영상이면 생방송·쇼츠)
  const linked = useMemo(() => {
    const out: { id: string; title: string; kind: 'video' | 'live' | 'short'; date: string; games: string[] }[] = [];
    if (!logs) return out;
    const seen = new Set<string>([id]);
    for (const l of Object.values(logs)) {
      if (!l || l.isAbsence) continue;
      const has = [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].some((v) => ytId(v?.url) === id);
      if (!has) continue;
      const games = (l.games || []).map((g) => g.name).filter(Boolean);
      const isLive = (l.vods || []).some((v) => ytId(v?.url) === id);
      const push = (v: any, kind: 'video' | 'live' | 'short') => { const vid = ytId(v?.url); if (!vid || seen.has(vid)) return; seen.add(vid); out.push({ id: vid, title: v.title || '', kind, date: l.date, games }); };
      if (!isLive) (l.vods || []).forEach((v) => push(v, 'live'));
      (l.edited || []).forEach((v) => push(v, 'video'));
      (l.shorts || []).forEach((v) => push(v, 'short'));
    }
    return out.slice(0, 12);
  }, [id, logs]);
  const linkedIds = new Set(linked.map((x) => x.id));
  const rest = list.filter((c) => !linkedIds.has(c.id));
  const shorts = linked.filter((x) => x.kind === 'short');
  const others = linked.filter((x) => x.kind !== 'short');

  const showLinked = part !== 'similar', showRest = part !== 'linked';
  if (!(showRest && rest.length) && !(showLinked && linked.length)) return null;
  return (
    <>
      {showLinked && others.length > 0 && (
        <section className="mt-6" aria-label="연결된 영상">
          <h3 className="mb-2.5 text-[length:calc(13px*var(--fs,1))] font-black text-zinc-900 dark:text-white">{others.some((x) => x.kind === 'live') ? '이 영상의 생방송' : '이 방송의 영상'}</h3>
          <div className="space-y-3">{others.map((c) => <Card key={c.id} c={{ ...c, cats: [] }} onPick={onPick} logs={logs} />)}</div>
        </section>
      )}
      {showLinked && shorts.length > 0 && (
        <section className="mt-6" aria-label="연결된 쇼츠">
          <h3 className="mb-2.5 text-[length:calc(13px*var(--fs,1))] font-black text-zinc-900 dark:text-white">연결된 쇼츠</h3>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1" data-no-swipe>
            {shorts.map((x, i) => (
              <button key={x.id} type="button" onClick={() => onShorts?.(shorts.map((y) => ({ url: `https://www.youtube.com/shorts/${y.id}`, title: y.title })), i, x.games)}
                className="shrink-0 w-[136px] sm:w-[156px] text-left cursor-pointer">
                <span className="block aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-800"><img src={`https://i.ytimg.com/vi/${x.id}/oardefault.jpg`} onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`; }} alt="" loading="lazy" className="w-full h-full object-cover" /></span>
                <span className="mt-1.5 block text-[length:calc(12.5px*var(--fs,1))] font-bold text-zinc-800 dark:text-zinc-100 leading-snug line-clamp-2 break-keep">{x.title || '쇼츠'}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {showRest && rest.length > 0 && (
        <section className="mt-6" aria-label="추천 영상">
          <h3 className="mb-2.5 text-[length:calc(13px*var(--fs,1))] font-black text-zinc-900 dark:text-white">추천 영상</h3>
          <div className="space-y-3">{rest.map((c) => <Card key={c.id} c={c} onPick={onPick} logs={logs} />)}</div>
        </section>
      )}
    </>
  );
}

/** 검색 탭 영상 카드와 같은 모양 (썸네일 · 재생 시간 · 생방일 / 제목 · ⋯ / 업로드일 / 게임 태그 / 유튜브로 보기) */
function Card({ c, onPick, logs, below }: { c: Cand | (Omit<Cand, 'kind'> & { kind: string }); onPick: (id: string, title: string, el: Element | null) => void; logs?: Record<string, BroadcastLog>; below?: React.ReactNode }) {
  const meta = useVideoMeta(c.id);
  const ref = useRef<HTMLDivElement>(null);
  // 생방송은 '날짜 생방송'(방제가 있으면 그대로) · 게임 이름을 붙이지 않음
  const title = c.kind === 'live' ? liveTitle(c.title, c.date) : (c.title || c.games.join(', ') || `${c.date} 방송`);
  const pick = () => onPick(c.id, title, ref.current);
  return (
    <div className="relative isolate flex flex-col rounded-[24px] overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div ref={ref} data-thumb data-thumb-radius="24px 24px 0 0" className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <button type="button" onClick={pick} className="block w-full h-full cursor-pointer" aria-label={`${title} 보기`}>
          <img src={`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
        </button>
        {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
          <span className="absolute bottom-2 right-2 z-20 bg-black/80 text-white font-bold rounded backdrop-blur-sm shadow-sm select-none tabular-nums pointer-events-none text-xs px-1.5 py-1">{formatDuration(meta.durationSec)}</span>
        )}
        {c.kind === 'live' ? (
          <span className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/60 text-white text-[length:calc(10.5px*var(--fs,1))] font-bold pointer-events-none">생방송</span>
        ) : c.date ? (
          <span className="absolute bottom-2 left-2 z-20 bg-black/80 text-white font-normal rounded backdrop-blur-sm shadow-sm select-none whitespace-nowrap text-xs px-2 py-1 pointer-events-none">생방일: {c.date}</span>
        ) : null}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        {below}
        <VideoCardInfo id={c.id} title={title} logs={logs} card onTitle={pick} />
      </div>
    </div>
  );
}

function Row({ c, onPick }: { c: Cand; onPick: (id: string, title: string, el: Element | null) => void }) {
  const meta = useVideoMeta(c.id);
  const title = c.kind === 'live' ? liveTitle(c.title, c.date) : (c.title || c.games.join(', ') || `${c.date} 방송`);
  const sub = [c.kind === 'live' ? `${c.date} 생방송` : c.games.slice(0, 2).join(' · '), meta?.publishedAt ? formatRelativeTime(meta.publishedAt) : ''].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={(e) => onPick(c.id, title, (e.currentTarget.querySelector('[data-thumb]') as Element) || e.currentTarget)}
        className="w-full flex items-start gap-3 p-1.5 rounded-xl text-left hover:bg-white/5 active:bg-white/10 cursor-pointer">
        <span data-thumb className="relative w-[44%] max-w-[180px] aspect-video rounded-lg overflow-hidden bg-zinc-800 shrink-0">
          <img src={`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
          {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
            <span className="absolute bottom-1 right-1 px-1 py-px rounded bg-black/80 text-white text-[length:calc(10.5px*var(--fs,1))] font-bold tabular-nums">{formatDuration(meta.durationSec)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block text-[length:calc(13px*var(--fs,1))] font-bold text-zinc-100 leading-snug line-clamp-2 break-keep">{title}</span>
          {sub && <span className="block mt-1 text-[length:calc(11.5px*var(--fs,1))] text-zinc-400 truncate">{sub}</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * 웃음참기처럼 여러 생방송을 모은 영상: 들어 있는 생방송을 카드로 (모은 순서대로)
 * 생방송 분석이 끝나면 이 영상의 어디(몇 분~몇 분)에 그 방송 장면이 나오는지 · 누르면 위 영상이 그 시간부터
 */
export function CompLives({ id, logs, ranges, onPick, onSeek }: { id: string; logs?: Record<string, BroadcastLog>; ranges?: { id: string; date: string; from: number; to: number }[]; onPick: (id: string, title: string, el: Element | null) => void; onSeek: (t: number) => void }) {
  const lives = useMemo(() => {
    if (!logs) return [] as Cand[];
    const all = Object.values(logs).filter((l) => l && !l.isAbsence);
    let dates: string[] = [];
    for (const l of all) {
      const e: any = (l.edited || []).find((v: any) => ytId(v?.url) === id);
      if (e) { dates = (e.allBroadcastDates?.length ? e.allBroadcastDates : [l.date]) as string[]; if (dates.length > 1) break; }
    }
    const out: Cand[] = [];
    for (const d of dates) for (const l of all.filter((x) => x.date === d)) for (const v of l.vods || []) {
      const vid = ytId((v as any)?.url);
      if (vid && !out.some((x) => x.id === vid)) out.push({ id: vid, title: (v as any).title || '', games: (l.games || []).map((g) => g.name).filter(Boolean), cats: [], date: l.date, kind: 'live' });
    }
    return out;
  }, [id, logs]);
  if (!lives.length) return null;
  const fmt = (t: number) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60); return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`; };
  return (
    <section className="mt-6" aria-label="들어 있는 생방송">
      <h3 className="px-1 mb-1 text-[length:calc(13px*var(--fs,1))] font-black text-white">들어 있는 생방송 {lives.length}개</h3>
      <p className="px-1 mb-2.5 text-[length:calc(11px*var(--fs,1))] text-zinc-400 break-keep">{(ranges || []).length ? '시간을 누르면 위 영상에서 그 방송 장면부터 재생돼요. AI가 맞춘 거라 틀릴 수 있어요.' : '생방송 AI 요약이 끝나면 이 영상의 어디에 나오는지도 보여 드려요.'}</p>
      <div className="space-y-3">
        {lives.map((c) => {
          const rs = (ranges || []).filter((r) => r.id === c.id);
          return (
            <Card key={c.id} c={c} onPick={onPick} logs={logs} below={rs.length > 0 && (
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500">이 영상에서</span>
                {rs.map((r, i) => (
                  <button key={i} type="button" onClick={() => onSeek(r.from)} className="px-2 py-0.5 rounded-md bg-purple-600/15 text-purple-300 text-[length:calc(11px*var(--fs,1))] font-black tabular-nums cursor-pointer active:scale-95">{fmt(r.from)}~{fmt(r.to)}</button>
                ))}
              </div>
            )} />
          );
        })}
      </div>
    </section>
  );
}
