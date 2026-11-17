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

export function SimilarVideos({ id, title, logs, ai, onPick }: { id: string; title: string; logs?: Record<string, BroadcastLog>; ai?: any; onPick: (id: string, title: string, el: Element | null) => void }) {
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

  if (!list.length) return null;
  return (
    <section className="mt-6" aria-label="비슷한 영상">
      <h3 className="px-1 mb-2 text-[13px] font-black text-white">비슷한 영상</h3>
      <ul className="space-y-1">
        {list.map((c) => <Row key={c.id} c={c} onPick={onPick} />)}
      </ul>
    </section>
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
