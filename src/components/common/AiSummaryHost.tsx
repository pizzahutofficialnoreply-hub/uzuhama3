import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ChevronRight, Flag, Gamepad2, Loader2, Search, Sparkles, Star, X } from 'lucide-react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { aiSearch, fmtTime, type AiResult } from '../../utils/aiSearch';
import { useBackToClose } from '../../hooks/useBackToClose';
import { requestReport } from './ItemMenu';

/**
 * ⋮ › AI 영상 요약: AI가 영상을 다 보고 정리한 내용
 *  - 맨 위: 전체 요약 → 이야기·사건별 흐름(구간) → 게임별 줄거리·결과·하이라이트
 *  - 장면 하나하나는 보여 주지 않음 (검색에는 쓰임)
 *  - 아직 보는 중이면 진행 상황만
 *  - 시간을 누르면 열린 플레이어에서 그 시간으로 바로 이동 (멈추거나 다시 불러오지 않음)
 *  - 게임·분위기·키워드를 누르면 검색 탭에서 그 말로 검색
 *  - 위 검색칸: 다른 영상 요약까지 자연어로 찾기 (예: 소녀가 실종되는 스토리 게임)
 */
export const AI_SUMMARY_EVENT = 'uzuhama-ai-summary';
export const GO_SEARCH_EVENT = 'uzuhama-go-search';
type Target = { id: string; title: string; kind?: string; t?: number };
export const openAiSummary = (t: Target) => window.dispatchEvent(new CustomEvent(AI_SUMMARY_EVENT, { detail: t }));
export const goSearch = (q: string) => window.dispatchEvent(new CustomEvent(GO_SEARCH_EVENT, { detail: { q } }));

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const detailCache = new Map<string, Promise<any>>();
function loadDetail(id: string, fresh = false) {
  if (fresh || !detailCache.has(id)) {
    const p = fetch(`${API_BASE}/api/videos/search-index?ai=video&id=${encodeURIComponent(id)}`).then((r) => r.json());
    p.catch(() => detailCache.delete(id));
    detailCache.set(id, p);
  }
  return detailCache.get(id)!;
}
/** AI가 보기 시작한 영상 (⋮ 메뉴에 'AI 영상 요약' 보여 줄지) — 10분마다 새로 */
let startedIds: Set<string> | null = null;
let startedAt = 0;
let startedP: Promise<Set<string>> | null = null;
export function aiStartedIds(): Promise<Set<string>> {
  if (startedIds && Date.now() - startedAt < 600000) return Promise.resolve(startedIds);
  if (!startedP) {
    startedP = fetch(`${API_BASE}/api/videos/search-index?ai=ids`).then((r) => r.json()).then((j) => {
      startedIds = new Set<string>(Array.isArray(j?.ids) ? j.ids : []);
      startedAt = Date.now();
      return startedIds;
    }).catch(() => startedIds || new Set<string>()).finally(() => { startedP = null; });
  }
  return startedP;
}
export function useAiStarted(id: string, enabled: boolean) {
  const [on, setOn] = React.useState(() => Boolean(startedIds?.has(id)));
  React.useEffect(() => {
    if (!enabled || !/^[\w-]{11}$/.test(id)) return;
    let alive = true;
    aiStartedIds().then((s) => { if (alive) setOn(s.has(id)); });
    return () => { alive = false; };
  }, [id, enabled]);
  return on;
}

/** 다 끝난 AI 요약이 있는 영상인지 (신고 이유에 'AI 요약이 틀려요'를 넣을지) */
export async function hasAiSummary(id: string): Promise<boolean> {
  try { const d = await loadDetail(id); return Boolean(d?.found && !d.pending); } catch { return false; }
}

function Chip({ label, onClick, tone = 'purple' }: { label: string; onClick: () => void; tone?: 'purple' | 'zinc' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={tone === 'purple'
        ? 'px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11.5px] font-bold cursor-pointer active:scale-95 hover:bg-purple-100 dark:hover:bg-purple-900/50'
        : 'px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[11.5px] font-bold cursor-pointer active:scale-95 hover:bg-zinc-200 dark:hover:bg-zinc-700'}
      title={`'${label}' 검색`}
    >
      {label}
    </button>
  );
}

function TimeBtn({ t, onClick, to }: { t: number; to?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 px-1.5 py-0.5 rounded-md bg-purple-600/10 text-purple-700 dark:text-purple-300 text-[11px] font-black tabular-nums cursor-pointer active:scale-95">
      {fmtTime(t)}{to && to > t ? `~${fmtTime(to)}` : ''}
    </button>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-black text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">{icon} {title}</h3>
      {children}
    </section>
  );
}

/** 한 영상의 요약 본문 (몰아보기 원본에도 같이 씀) */
function SummaryBody({ d, onSeek, onSearch }: { d: any; onSeek: (t: number) => void; onSearch: (q: string) => void }) {
  const chapters: any[] = d.chapters || [];
  const stories: any[] = d.gameStories || [];
  const games: any[] = d.games || [];
  const parts: any[] = d.parts || [];
  const storyOf = (g: any) => stories.find((s) => [g.name, g.ko].filter(Boolean).some((n: string) => n && (s.name === n || s.name.includes(n) || n.includes(s.name))));
  const extraStories = stories.filter((s) => !games.some((g) => storyOf(g) === s));
  const chips = [...new Set([...(d.mood || []), ...(d.keywords || [])].map((x: string) => String(x).trim()).filter(Boolean))].slice(0, 18);
  return (
    <div className="space-y-5">
      {d.summary && <p className="text-[14px] text-zinc-800 dark:text-zinc-100 leading-relaxed break-keep">{d.summary}</p>}

      {d.opanmu && (
        <button type="button" onClick={() => onSearch('오팬무')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[12.5px] font-bold text-zinc-800 dark:text-zinc-100 cursor-pointer">
          <span className="text-purple-600 dark:text-purple-400">오팬무</span> {d.opanmu}
        </button>
      )}

      {d.nogari && (
        <Section icon={<span className="text-[13px]">💬</span>} title="노가리">
          <p className="text-[13px] text-zinc-700 dark:text-zinc-200 leading-relaxed break-keep whitespace-pre-line">{d.nogari}</p>
        </Section>
      )}

      {chapters.length > 0 ? (
        <Section icon={<BookOpen className="w-3.5 h-3.5" />} title="흐름 · 이야기별 요약">
          <ol className="relative space-y-2.5 pl-4 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-700">
            {chapters.map((c, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-4 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-purple-500 bg-white dark:bg-zinc-900" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <TimeBtn t={c.from} to={c.to} onClick={() => onSeek(c.from)} />
                  <span className="text-[13px] font-bold text-zinc-900 dark:text-white break-keep">{c.title}</span>
                  {c.game && <button type="button" onClick={() => onSearch(c.game)} className="text-[10.5px] font-semibold text-zinc-400 hover:text-purple-600 cursor-pointer">#{c.game}</button>}
                </div>
                {c.summary && <p className="mt-0.5 text-[12.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed break-keep">{c.summary}</p>}
              </li>
            ))}
          </ol>
        </Section>
      ) : parts.length > 1 ? (
        <Section icon={<BookOpen className="w-3.5 h-3.5" />} title="구간별 요약">
          <ul className="space-y-2">
            {parts.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-zinc-600 dark:text-zinc-300 break-keep"><TimeBtn t={p.from} to={p.to} onClick={() => onSeek(p.from)} /> <span>{p.summary}</span></li>
            ))}
          </ul>
        </Section>
      ) : null}

      {(games.length > 0 || extraStories.length > 0) && (
        <Section icon={<Gamepad2 className="w-3.5 h-3.5" />} title="게임별 요약">
          <div className="space-y-2.5">
            {[...games.map((g) => ({ g, s: storyOf(g) })), ...extraStories.map((s) => ({ g: { name: s.name }, s }))].map(({ g, s }, i) => (
              <div key={`${g.name}-${i}`} className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => onSearch(g.ko || g.name)} className="text-left min-w-0 cursor-pointer group">
                    <p className="text-[13.5px] font-black text-zinc-900 dark:text-white group-hover:text-purple-600 break-keep">{g.ko && g.ko !== g.name ? `${g.ko}` : g.name}</p>
                    {g.ko && g.ko !== g.name && <p className="text-[11px] text-zinc-400 truncate">{g.name}</p>}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {g.horror && <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 text-[10px] font-black">공포</span>}
                    {s?.result && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black">{s.result}</span>}
                  </div>
                </div>
                {s?.story ? <p className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed break-keep">{s.story}</p> : g.about ? <p className="text-[12.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed break-keep">{g.about}</p> : null}
                {(s?.highlights || []).length > 0 && (
                  <ul className="space-y-1">
                    {s.highlights.map((h: any, j: number) => (
                      <li key={j} className="flex items-start gap-2 text-[12px] text-zinc-600 dark:text-zinc-300 break-keep"><Star className="w-3 h-3 mt-1 text-amber-500 shrink-0" /><TimeBtn t={h.t} onClick={() => onSeek(Math.max(0, h.t - 5))} /><span>{h.d}</span></li>
                    ))}
                  </ul>
                )}
                {(g.genre || (g.tags || []).length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {[g.genre, ...(g.tags || [])].filter(Boolean).slice(0, 6).map((t: string) => <Chip key={t} label={t} tone="zinc" onClick={() => onSearch(t)} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{chips.map((k) => <Chip key={k} label={k} onClick={() => onSearch(k)} />)}</div>
      )}
    </div>
  );
}

export function AiSummaryHost() {
  const [target, setTarget] = useState<Target | null>(null);
  const [data, setData] = useState<any>(null);
  const [play, setPlay] = useState<{ id: string; t: number } | null>(null);
  const [asked, setAsked] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; r: AiResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  useBackToClose(Boolean(target), () => setTarget(null));

  const open = useCallback((t: Target) => {
    setTarget(t); setData(null); setAsked('');
    setPlay(typeof t.t === 'number' ? { id: t.id, t: Math.max(0, t.t) } : null);
    scroller.current?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const on = (e: any) => { open(e.detail); setQ(''); setFound(null); };
    window.addEventListener(AI_SUMMARY_EVENT, on);
    return () => window.removeEventListener(AI_SUMMARY_EVENT, on);
  }, [open]);
  useEffect(() => {
    if (!target) return;
    let alive = true;
    loadDetail(target.id, true).then((j) => { if (alive) setData(j); }).catch(() => { if (alive) setData({ found: false, error: true }); });
    return () => { alive = false; };
  }, [target]);

  /** 시간 이동: 같은 영상이 이미 열려 있으면 플레이어에 명령만 (끊기지 않게) */
  const seek = (t: number, vid?: string) => {
    const id = vid || target!.id;
    const w = frame.current?.contentWindow;
    if (play && play.id === id && w) {
      const post = (func: string, args: any[] = []) => w.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      post('seekTo', [t, true]);
      post('playVideo');
    } else {
      setPlay({ id, t });
    }
  };
  const search = (word: string) => { setTarget(null); goSearch(word); };

  const runFind = async () => {
    const s = q.trim();
    if (s.length < 2) return;
    setSearching(true);
    try { setFound({ q: s, r: (await aiSearch(s)).filter((x) => x.hasSummary !== false) }); } finally { setSearching(false); }
  };

  const ask = async () => {
    try {
      const j = await (await fetch(`${API_BASE}/api/videos/search-index?ai=prioritize&id=${encodeURIComponent(target!.id)}`)).json();
      setAsked(j.ok ? `요청했어요. 대기 ${j.position}번째예요. 무료 한도 안에서 차례로 봐서 몇 시간~며칠 걸릴 수 있어요.` : j.full ? '요청이 많이 밀려 있어요. 나중에 다시 해 주세요.' : '요청하지 못했어요.');
    } catch { setAsked('요청하지 못했어요.'); }
  };

  const ready = data?.found && !data.pending;
  return createPortal(
    <AnimatePresence>
      {target && (
        <motion.div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTarget(null)} />
          <motion.div
            ref={scroller}
            initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            className="sheet-fill relative w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] shadow-2xl pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
            role="dialog" aria-label="AI 영상 요약" data-testid="ai-summary"
          >
            {/* 머리 + 플레이어: 내려도 위에 붙어 있음 → 아래 시간을 눌러도 바로 보임 */}
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-100 dark:border-zinc-800">
              <div className="px-5 pt-4 pb-3 flex items-start gap-2">
                <Sparkles className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-purple-600 dark:text-purple-400">AI 영상 요약</p>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-2">{data?.title || target.title}</h2>
                </div>
                <button type="button" onClick={() => setTarget(null)} className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
              </div>
              {play && (
                <div className="relative aspect-video bg-black">
                  <iframe
                    key={play.id}
                    ref={(el) => { frame.current = el; trackYoutubeFrame(el); }}
                    src={embedSrc(play.id, { start: play.t })}
                    title={target.title}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                  <button type="button" onClick={() => setPlay(null)} className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white cursor-pointer" aria-label="플레이어 닫기"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* 모든 AI 요약에서 찾기 */}
              <form onSubmit={(e) => { e.preventDefault(); runFind(); }} className="flex items-center gap-2 h-10 px-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" placeholder="AI 요약에서 찾기 (예: 소녀가 실종되는 스토리)" className="flex-1 min-w-0 bg-transparent text-[14px] outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400" />
                {searching ? <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> : q && <button type="button" onClick={() => { setQ(''); setFound(null); }} className="text-zinc-400 cursor-pointer" aria-label="지우기"><X className="w-4 h-4" /></button>}
              </form>
              {found && (
                <div className="space-y-1.5 -mt-2">
                  {found.r.length === 0 && <p className="text-[12px] text-zinc-500 px-1">'{found.q}'에 맞는 요약을 아직 못 찾았어요.</p>}
                  {found.r.map((r) => (
                    <button key={r.id} type="button" onClick={() => { open({ id: r.id, title: r.title, kind: r.kind, t: r.scenes[0] ? Math.max(0, r.scenes[0].t - 5) : undefined }); }} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left cursor-pointer">
                      <img src={`https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-24 aspect-video rounded-lg object-cover shrink-0 bg-zinc-100" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold text-zinc-900 dark:text-white line-clamp-2">{r.title}</span>
                        {r.scenes[0] && <span className="block text-[11px] text-zinc-500 line-clamp-1"><b className="text-purple-600 tabular-nums">{fmtTime(r.scenes[0].t)}</b> {r.scenes[0].d}</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!data && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…</div>}

              {data && !data.found && !data.compilation && (
                <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 break-keep">
                  <p>아직 AI가 이 영상을 보지 않았어요. 최신 영상부터 차례로 보고 있어요.</p>
                  {data.requested || asked ? <p className="text-xs font-bold text-purple-600">{asked || '이미 먼저 봐 달라고 요청된 영상이에요.'}</p> : (
                    <button type="button" onClick={ask} className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold cursor-pointer">이 영상 먼저 봐 달라고 하기</button>
                  )}
                </div>
              )}

              {data?.pending && (
                <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-2">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-purple-500" /> AI가 이 영상을 보는 중이에요</p>
                  {data.duration > 0 && (
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, Math.round(((data.pos || 0) / data.duration) * 100))}%` }} /></div>
                  )}
                  <p className="text-[12px] text-zinc-500 break-keep">{data.status === 'finishing' ? '다 보고 이야기별로 정리하는 중이에요.' : `${fmtTime(data.pos || 0)}${data.duration ? ` / ${fmtTime(data.duration)}` : ''}까지 봤어요.`} 다 보면 요약이 나와요.</p>
                </div>
              )}

              {data?.compilation && (
                <div className="space-y-4">
                  {data.overview && (data.overview.opening || data.overview.theme) && (
                    <div className="rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 p-3.5 space-y-2">
                      {data.overview.theme && <p className="text-[13px] font-bold text-zinc-900 dark:text-white break-keep">{data.overview.theme}</p>}
                      {data.overview.opening && <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 break-keep leading-relaxed"><b className="text-purple-600">오프닝</b> {data.overview.opening}</p>}
                      {(data.topics || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(data.topics || []).map((t: any, i: number) => (
                            <button key={i} type="button" onClick={() => (t.t != null ? seek(t.t) : search(t.title))} className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-purple-200/70 dark:border-purple-900/60 text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer">
                              {t.t != null && <b className="text-purple-600 tabular-nums mr-1">{fmtTime(t.t)}</b>}{t.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 break-keep">몰아보기 영상이라 들어 있는 방송 {data.dates?.length || 0}개의 원본 영상 {data.sourceCount || 0}개 중 AI가 다 본 {data.sources?.length || 0}개를 모아 보여줘요. 시간은 원본 영상 기준이에요.</p>
                  {!(data.sources || []).length && <p className="text-xs font-bold text-amber-600">아직 원본 영상을 AI가 다 보지 않았어요.</p>}
                  {(data.sources || []).map((src: any) => (
                    <div key={src.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 p-3.5 space-y-3">
                      <button type="button" onClick={() => seek(0, src.id)} className="text-left text-[13px] font-black text-zinc-900 dark:text-white line-clamp-2 cursor-pointer">{src.title}</button>
                      <SummaryBody d={src} onSeek={(t) => seek(t, src.id)} onSearch={search} />
                    </div>
                  ))}
                </div>
              )}

              {ready && !data.compilation && (
                <>
                  <SummaryBody d={data} onSeek={(t) => seek(t)} onSearch={search} />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10.5px] text-zinc-400 break-keep">AI가 영상을 보고 정리한 내용이라 틀릴 수 있어요.</p>
                    <button
                      type="button"
                      onClick={() => requestReport({ id: target.id, kind: (target.kind === 'short' ? 'short' : 'video') as any, title: data.title || target.title, search: { query: '', concepts: [], understood: '' }, aiSummary: true, reason: 'wrong_ai_summary' })}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer"
                    >
                      <Flag className="w-3 h-3" /> 요약이 틀려요
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
