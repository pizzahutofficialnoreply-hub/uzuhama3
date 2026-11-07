import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Gamepad2, Loader2, Sparkles, X } from 'lucide-react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { fmtTime } from '../../utils/aiSearch';
import { useBackToClose } from '../../hooks/useBackToClose';

/**
 * ⋮ › AI 영상 요약: AI가 영상을 보고 저장해 둔 내용(요약·장면·게임)을 보여 줌
 * 아직 안 본 영상이면 '먼저 봐 줘' 요청 (분석 순서 앞으로)
 */
export const AI_SUMMARY_EVENT = 'uzuhama-ai-summary';
export const openAiSummary = (t: { id: string; title: string; kind?: string }) => window.dispatchEvent(new CustomEvent(AI_SUMMARY_EVENT, { detail: t }));

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

export function AiSummaryHost() {
  const [target, setTarget] = useState<{ id: string; title: string; kind?: string } | null>(null);
  const [data, setData] = useState<any>(null);
  const [playAt, setPlayAt] = useState<number | null>(null);
  const [asked, setAsked] = useState('');
  const [showAll, setShowAll] = useState(false);
  useBackToClose(Boolean(target), () => setTarget(null));

  useEffect(() => {
    const on = (e: any) => { setTarget(e.detail); setData(null); setPlayAt(null); setAsked(''); setShowAll(false); };
    window.addEventListener(AI_SUMMARY_EVENT, on);
    return () => window.removeEventListener(AI_SUMMARY_EVENT, on);
  }, []);
  useEffect(() => {
    if (!target) return;
    let alive = true;
    fetch(`${API_BASE}/api/videos/search-index?ai=video&id=${encodeURIComponent(target.id)}`).then((r) => r.json()).then((j) => { if (alive) setData(j); }).catch(() => { if (alive) setData({ found: false, error: true }); });
    return () => { alive = false; };
  }, [target]);

  const ask = async () => {
    try {
      const j = await (await fetch(`${API_BASE}/api/videos/search-index?ai=prioritize&id=${encodeURIComponent(target!.id)}`)).json();
      setAsked(j.ok ? `요청했어요. 대기 ${j.position}번째예요. 무료 한도 안에서 차례로 봐서 몇 시간~며칠 걸릴 수 있어요.` : j.full ? '요청이 많이 밀려 있어요. 나중에 다시 해 주세요.' : '요청하지 못했어요.');
    } catch { setAsked('요청하지 못했어요.'); }
  };

  const scenes: any[] = data?.scenes || [];
  return createPortal(
    <AnimatePresence>
      {target && (
        <motion.div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTarget(null)} />
          <motion.div
            initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            className="relative w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] shadow-2xl pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
            role="dialog" aria-label="AI 영상 요약"
          >
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-5 pt-4 pb-3 flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800">
              <Sparkles className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-purple-600 dark:text-purple-400">AI 영상 요약</p>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-2">{data?.title || target.title}</h2>
              </div>
              <button type="button" onClick={() => setTarget(null)} className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
            </div>

            {playAt !== null && (
              <div className="relative aspect-video bg-black">
                <iframe key={playAt} ref={trackYoutubeFrame} src={embedSrc(target.id, { start: playAt })} title={target.title} className="absolute inset-0 w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}

            <div className="px-5 py-4 space-y-4">
              {!data && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…</div>}

              {data && !data.found && (
                <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 break-keep">
                  <p>아직 AI가 이 영상을 보지 않았어요. 최신 영상부터 차례로 보고 있어요.</p>
                  {data.requested || asked ? <p className="text-xs font-bold text-purple-600">{asked || '이미 먼저 봐 달라고 요청된 영상이에요.'}</p> : (
                    <button type="button" onClick={ask} className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold cursor-pointer">이 영상 먼저 봐 달라고 하기</button>
                  )}
                </div>
              )}

              {data?.found && (
                <>
                  {data.status !== 'done' && <p className="text-[11px] font-bold text-amber-600">아직 보는 중이에요 ({data.seg || 0}/{data.segTotal || '?'} 구간). 본 데까지만 보여요.</p>}
                  {(data.summary || data.parts?.[0]?.summary) && <p className="text-sm text-zinc-800 dark:text-zinc-100 leading-relaxed break-keep">{data.summary || data.parts[0].summary}</p>}

                  {(data.games || []).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-black text-zinc-500 flex items-center gap-1"><Gamepad2 className="w-3.5 h-3.5" /> 나온 게임</p>
                      {data.games.map((g: any) => (
                        <div key={g.name} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 text-xs space-y-1">
                          <p className="font-bold text-zinc-900 dark:text-white">{g.ko && g.ko !== g.name ? `${g.ko} (${g.name})` : g.name}{g.genre ? <span className="font-medium text-zinc-500"> · {g.genre}</span> : null}{g.horror ? <span className="ml-1 text-red-500">공포</span> : null}</p>
                          {g.about && <p className="text-zinc-600 dark:text-zinc-300 break-keep">{g.about}</p>}
                          {(g.tags || []).length > 0 && <p className="text-zinc-400">{g.tags.slice(0, 8).join(' · ')}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {scenes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-black text-zinc-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 장면 {scenes.length}개 · 시간을 누르면 10초 전부터 재생</p>
                      <ul className="space-y-1">
                        {(showAll ? scenes : scenes.slice(0, 20)).map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <button type="button" onClick={() => setPlayAt(Math.max(0, s.t - 10))} className="shrink-0 font-black text-purple-600 dark:text-purple-400 tabular-nums underline underline-offset-2 cursor-pointer">{fmtTime(s.t)}</button>
                            <span className="text-zinc-700 dark:text-zinc-200 break-keep">{s.d}{s.vague ? <span className="text-zinc-400"> (확실하지 않음)</span> : null}</span>
                          </li>
                        ))}
                      </ul>
                      {scenes.length > 20 && !showAll && <button type="button" onClick={() => setShowAll(true)} className="w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">장면 모두 보기 ({scenes.length})</button>}
                    </div>
                  )}

                  {(data.parts || []).length > 1 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-black text-zinc-500">구간별 요약 ({data.parts.length})</summary>
                      <ul className="mt-1.5 space-y-1.5">{data.parts.map((p: any, i: number) => <li key={i} className="text-zinc-600 dark:text-zinc-300 break-keep"><button type="button" onClick={() => setPlayAt(p.from)} className="font-bold text-purple-600 tabular-nums cursor-pointer">{fmtTime(p.from)}~{fmtTime(p.to)}</button> {p.summary}</li>)}</ul>
                    </details>
                  )}
                  {[...(data.mood || []), ...(data.keywords || [])].length > 0 && (
                    <p className="flex flex-wrap gap-1">{[...(data.mood || []), ...(data.keywords || [])].slice(0, 20).map((k: string) => <span key={k} className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11px] font-semibold">{k}</span>)}</p>
                  )}
                  <p className="text-[10px] text-zinc-400">AI가 영상을 보고 정리한 내용이라 틀릴 수 있어요. 틀린 곳은 ⋮ › 신고로 알려 주세요.</p>
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
