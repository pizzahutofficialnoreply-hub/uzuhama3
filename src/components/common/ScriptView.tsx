import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * 스크립트: AI가 영상을 보며 받아 적은 대사를 시간과 함께
 * - 시간을 누르면 그때로 이동, 재생 중이면 지금 말하는 줄이 강조되고 따라 내려감 (자막처럼)
 * - 생방송은 자막이 없어서 AI가 소리를 듣고 적은 것 → 틀릴 수 있음
 */
export type ScriptLine = { t: number; s: string; w?: string };
export type Script = { found: boolean; lines: ScriptLine[]; covered?: [number, number][] };

const API = (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
const cache = new Map<string, Promise<Script>>();
export function loadScript(id: string): Promise<Script> {
  if (!cache.has(id)) {
    const p = fetch(`${API}/api/videos/search-index?ai=script&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { found: false, lines: [] }))
      .catch(() => ({ found: false, lines: [] }));
    p.then((s) => { if (!s?.found) window.setTimeout(() => cache.delete(id), 60000); });
    cache.set(id, p);
  }
  return cache.get(id)!;
}

const fmt = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

/** 지금 시각에 말하고 있는 줄 */
export function lineAt(lines: ScriptLine[], now: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= now) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  // 마지막 말에서 15초 넘게 지났으면 말 없는 중
  if (ans >= 0 && now - lines[ans].t > 15 && (lines[ans + 1]?.t ?? Infinity) > now) return -1;
  return ans;
}

export function ScriptView({ script, now, playing, onSeek }: { script: Script | null; now: number; playing: boolean; onSeek: (t: number) => void }) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement | null>(null);
  const userScroll = useRef(0);
  const lines = script?.lines || [];
  const cur = useMemo(() => lineAt(lines, now), [lines, now]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return lines.map((l, i) => ({ l, i })).filter(({ l }) => !k || l.s.toLowerCase().includes(k) || (l.w || '').toLowerCase().includes(k));
  }, [lines, q]);
  // 재생 중이면 지금 줄을 가운데로 (방금 직접 스크롤했으면 4초 동안은 안 따라감)
  useEffect(() => {
    if (!playing || cur < 0 || q || Date.now() - userScroll.current < 4000) return;
    const el = box.current?.querySelector(`[data-line="${cur}"]`) as HTMLElement | null;
    const b = box.current;
    if (el && b) b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [cur, playing, q]);

  if (!script) return <p className="text-[12px] text-zinc-400">불러오는 중…</p>;
  if (!lines.length) return <p className="text-[12px] text-zinc-500 break-keep">아직 스크립트가 없어요. AI가 이 영상을 보면서 대사를 받아 적으면 여기에 나와요.</p>;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 px-3 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
        <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대사에서 찾기" className="flex-1 min-w-0 bg-transparent text-[13px] text-zinc-900 dark:text-white focus:outline-none" />
        {q && <span className="text-[11px] text-zinc-400 shrink-0">{shown.length}줄</span>}
      </label>
      <div ref={box} onWheel={() => { userScroll.current = Date.now(); }} onTouchMove={() => { userScroll.current = Date.now(); }}
        className="relative max-h-[55vh] overflow-y-auto overscroll-contain -mx-1 px-1" data-testid="ai-script" data-no-swipe>
        <ol className="space-y-0.5">
          {shown.map(({ l, i }) => {
            const on = i === cur;
            return (
              <li key={i} data-line={i}>
                <button type="button" onClick={() => onSeek(l.t)}
                  className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${on ? 'bg-purple-100 dark:bg-purple-900/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/70'}`}>
                  <span className={`shrink-0 w-[52px] pt-px text-[11.5px] font-bold tabular-nums ${on ? 'text-purple-700 dark:text-purple-300' : 'text-zinc-400'}`}>{fmt(l.t)}</span>
                  <span className={`min-w-0 text-[13px] leading-relaxed break-keep ${on ? 'text-zinc-900 dark:text-white font-semibold' : l.w === '게임' ? 'text-zinc-500 dark:text-zinc-400 italic' : 'text-zinc-700 dark:text-zinc-200'}`}>
                    {l.w && <span className="mr-1 text-[11px] font-bold text-zinc-400 not-italic">{l.w}</span>}
                    {l.s}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="text-[10.5px] text-zinc-400 break-keep">AI가 소리를 듣고 받아 적은 거라 틀린 말이 있을 수 있어요. 생방송은 자막이 없어서 특히 그래요. 이름이 없는 줄은 우주하마가 한 말이에요.</p>
    </div>
  );
}
