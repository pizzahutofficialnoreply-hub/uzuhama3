import { useMemo } from 'react';
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

export function SimilarVideos({ id, title, logs, ai, onPick, onShorts }: { id: string; title: string; logs?: Record<string, BroadcastLog>; ai?: any; onPick: (id: string, title: string, el: Element | null) => void; onShorts?: (items: { url: string; title?: string }[], index: number, games: string[]) => void }) {
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

  if (!rest.length && !linked.length) return null;
  return (
    <>
      {others.length > 0 && (
        <section className="mt-6" aria-label="연결된 영상">
          <h3 className="px-1 mb-2.5 text-[13px] font-black text-white">{others.some((x) => x.kind === 'live') ? '이 영상의 생방송' : '이 방송의 영상'}</h3>
          <div className="space-y-3">{others.map((c) => <Card key={c.id} c={{ ...c, cats: [] }} onPick={onPick} />)}</div>
        </section>
      )}
      {shorts.length > 0 && (
        <section className="mt-6" aria-label="연결된 쇼츠">
          <h3 className="px-1 mb-2.5 text-[13px] font-black text-white">연결된 쇼츠</h3>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1" data-no-swipe>
            {shorts.map((x, i) => (
              <button key={x.id} type="button" onClick={() => onShorts?.(shorts.map((y) => ({ url: `https://www.youtube.com/shorts/${y.id}`, title: y.title })), i, x.games)}
                className="shrink-0 w-[110px] text-left cursor-pointer">
                <span className="block aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-800"><img src={`https://i.ytimg.com/vi/${x.id}/oardefault.jpg`} onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`; }} alt="" loading="lazy" className="w-full h-full object-cover" /></span>
                <span className="mt-1.5 block text-[12px] font-bold text-zinc-100 leading-snug line-clamp-2 break-keep">{x.title || '쇼츠'}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {rest.length > 0 && (
        <section className="mt-6" aria-label="추천 영상">
          <h3 className="px-1 mb-2.5 text-[13px] font-black text-white">추천 영상</h3>
          <div className="space-y-3">{rest.map((c) => <Card key={c.id} c={c} onPick={onPick} />)}</div>
        </section>
      )}
    </>
  );
}

/** 사이트 카드 모양 (썸네일 위 · 제목 · 날짜) */
function Card({ c, onPick }: { c: Cand | (Omit<Cand, 'kind'> & { kind: string }); onPick: (id: string, title: string, el: Element | null) => void }) {
  const meta = useVideoMeta(c.id);
  const generic = !c.title || /^우주하마\s*생방송!?$/.test(c.title);
  const title = generic ? (c.kind === 'live' ? `${c.date} 생방송${c.games.length ? ` · ${c.games.slice(0, 2).join(', ')}` : ''}` : c.games.join(', ') || `${c.date} 방송`) : c.title;
  const sub = [c.kind === 'live' ? '생방송' : '', c.games.slice(0, 2).join(' · '), meta?.publishedAt ? formatRelativeTime(meta.publishedAt) : c.date].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={(e) => onPick(c.id, title, (e.currentTarget.querySelector('[data-thumb]') as Element) || e.currentTarget)}
      className="w-full text-left rounded-[20px] overflow-hidden bg-zinc-900 border border-zinc-800 shadow-sm active:scale-[0.99] transition-transform cursor-pointer">
      <span data-thumb data-thumb-radius="20px 20px 0 0" className="relative block aspect-video bg-zinc-800">
        <img src={`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
        {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 text-white text-[11px] font-bold tabular-nums">{formatDuration(meta.durationSec)}</span>
        )}
        {c.kind === 'live' && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10.5px] font-bold">생방송</span>}
      </span>
      <span className="block px-3.5 pt-2.5 pb-3">
        <span className="block text-[14px] font-bold text-white leading-snug line-clamp-2 break-keep">{title}</span>
        {sub && <span className="block mt-1 text-[12px] text-zinc-400 truncate">{sub}</span>}
      </span>
    </button>
  );
}

function Row({ c, onPick }: { c: Cand; onPick: (id: string, title: string, el: Element | null) => void }) {
  const meta = useVideoMeta(c.id);
  const title = c.title || c.games.join(', ') || `${c.date} 방송`;
  const sub = [c.kind === 'live' ? `${c.date} 생방송` : c.games.slice(0, 2).join(' · '), meta?.publishedAt ? formatRelativeTime(meta.publishedAt) : ''].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={(e) => onPick(c.id, title, (e.currentTarget.querySelector('[data-thumb]') as Element) || e.currentTarget)}
        className="w-full flex items-start gap-3 p-1.5 rounded-xl text-left hover:bg-white/5 active:bg-white/10 cursor-pointer">
        <span data-thumb className="relative w-[44%] max-w-[180px] aspect-video rounded-lg overflow-hidden bg-zinc-800 shrink-0">
          <img src={`https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
          {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
            <span className="absolute bottom-1 right-1 px-1 py-px rounded bg-black/80 text-white text-[10.5px] font-bold tabular-nums">{formatDuration(meta.durationSec)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block text-[13px] font-bold text-zinc-100 leading-snug line-clamp-2 break-keep">{title}</span>
          {sub && <span className="block mt-1 text-[11.5px] text-zinc-400 truncate">{sub}</span>}
        </span>
      </button>
    </li>
  );
}
