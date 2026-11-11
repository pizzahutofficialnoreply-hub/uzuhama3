import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, EyeOff, Eye, Sparkles, X } from 'lucide-react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { useBackToClose } from '../../hooks/useBackToClose';
import { SummaryBody, loadDetail, goSearch, openAiSummary } from './AiSummaryHost';
import { GlassPlayButton } from './MediaIcons';
import { Skeleton } from './Skeleton';

/**
 * 실험실 · 카드 펼쳐 요약과 함께 보기
 *  - AI 요약이 끝난 영상(쇼츠 제외)의 카드 썸네일을 누르면 그 카드가 커지며 열림
 *  - 맨 위: 바로 재생 / 제목 아래: AI 요약 펼침(접기 가능) / 스포 가리기
 */
export const AI_CARD_EVENT = 'uzuhama-ai-card';
type Rect = { top: number; left: number; width: number; height: number };
type Target = { id: string; title: string; sub?: string; from: Rect };

export function openAiCard(id: string, title: string, el: Element | null, sub?: string) {
  const r = el?.getBoundingClientRect();
  const from = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : { top: window.innerHeight / 2 - 100, left: 16, width: window.innerWidth - 32, height: 200 };
  window.dispatchEvent(new CustomEvent(AI_CARD_EVENT, { detail: { id, title, sub, from } satisfies Target }));
}

const SPOIL_KEY = 'uzuhama_ai_card_spoil';
const spring = { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 } as const;

function finalRect(): Rect {
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(560, vw - 16);
  const top = vw < 640 ? 10 : 24;
  return { top, left: (vw - width) / 2, width, height: vh - top - (vw < 640 ? 10 : 24) };
}

export function AiCardExpandHost() {
  const [t, setT] = useState<Target | null>(null);
  const [closing, setClosing] = useState(false);
  const [to, setTo] = useState<Rect>(() => (typeof window !== 'undefined' ? finalRect() : { top: 0, left: 0, width: 0, height: 0 }));
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [spoil, setSpoil] = useState(() => { try { return localStorage.getItem(SPOIL_KEY) !== '0'; } catch { return true; } });
  const [play, setPlay] = useState<{ t: number } | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const back = useRef<Rect | null>(null);

  useEffect(() => {
    const on = (e: any) => { setTo(finalRect()); setT(e.detail); setClosing(false); setData(null); setOpen(true); setPlay(null); back.current = null; };
    window.addEventListener(AI_CARD_EVENT, on);
    const rs = () => setTo(finalRect());
    window.addEventListener('resize', rs);
    return () => { window.removeEventListener(AI_CARD_EVENT, on); window.removeEventListener('resize', rs); };
  }, []);
  useEffect(() => {
    if (!t) return;
    let alive = true;
    loadDetail(t.id).then((j) => { if (alive) setData(j); }).catch(() => { if (alive) setData({ found: false }); });
    return () => { alive = false; };
  }, [t]);

  const close = () => {
    if (!t || closing) return;
    // 원래 카드가 아직 화면에 있으면 그 자리로 돌아감
    const el = document.querySelector(`[data-ai-card="${t.id}"]`);
    const r = el?.getBoundingClientRect();
    back.current = r && r.bottom > 0 && r.top < window.innerHeight ? { top: r.top, left: r.left, width: r.width, height: r.height } : { ...t.from, top: window.innerHeight + 40 };
    setPlay(null);
    setClosing(true);
  };
  useBackToClose(Boolean(t) && !closing, close);
  useEffect(() => {
    if (!t) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const seek = (s: number) => {
    const w = frame.current?.contentWindow;
    if (play && w) {
      w.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [s, true] }), '*');
      w.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    } else setPlay({ t: s });
  };
  const toggleSpoil = () => setSpoil((v) => { try { localStorage.setItem(SPOIL_KEY, v ? '0' : '1'); } catch { /* */ } return !v; });
  const ready = data?.found && !data.pending && !data.compilation;
  const target = closing ? back.current || t?.from : to;

  return createPortal(
    <AnimatePresence>
      {t && (
        <motion.div key="ai-card" className="fixed inset-0 z-[320]" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: closing ? 0 : 1 }} transition={{ duration: 0.25 }} onClick={close} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={`${t.title} · AI 요약과 함께 보기`} data-testid="ai-card"
            initial={{ ...t.from, borderRadius: 24 }}
            animate={{ ...target!, borderRadius: closing ? 24 : 28 }}
            transition={spring}
            onAnimationComplete={() => { if (closing) { setT(null); setClosing(false); } }}
            className="fixed overflow-hidden bg-white dark:bg-zinc-900 shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800"
          >
            {/* 맨 위: 바로 재생 */}
            <div className="relative w-full aspect-video bg-black shrink-0">
              {play ? (
                <iframe
                  ref={(el) => { frame.current = el; trackYoutubeFrame(el); }}
                  src={embedSrc(t.id, play.t ? { start: Math.floor(play.t) } : {})}
                  title={t.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button type="button" onClick={() => setPlay({ t: 0 })} className="absolute inset-0 w-full h-full cursor-pointer" aria-label="여기서 재생">
                  <img src={`https://img.youtube.com/vi/${t.id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/10"><GlassPlayButton size="md" /></span>
                </button>
              )}
              <button type="button" onClick={close} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/65 hover:bg-black text-white flex items-center justify-center cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
            </div>

            <motion.div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: closing ? 0 : 1, y: closing ? 8 : 0 }} transition={{ delay: closing ? 0 : 0.12, duration: 0.22 }}>
              <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
                <h2 className="text-[16px] font-black leading-snug text-zinc-900 dark:text-white break-keep">{data?.title || t.title}</h2>
                {t.sub && <p className="mt-1 text-[12px] text-zinc-500 tabular-nums">{t.sub}</p>}

                <div className="mt-4 rounded-2xl border border-purple-100 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer">
                      <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />
                      <span className="text-[13px] font-black text-purple-700 dark:text-purple-300">AI 영상 요약</span>
                      <motion.span animate={{ rotate: open ? 180 : 0 }} className="ml-0.5 text-purple-400"><ChevronDown className="w-4 h-4" /></motion.span>
                      <span className="sr-only">{open ? '접기' : '펼치기'}</span>
                    </button>
                    <button type="button" onClick={toggleSpoil} aria-pressed={spoil} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${spoil ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'}`}>
                      {spoil ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} 스포 가리기
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                        <div className="px-4 pb-4">
                          {!data ? (
                            <div className="space-y-2" aria-busy="true" aria-label="불러오는 중">
                              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-2/3" />
                              <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
                            </div>
                          ) : ready ? (
                            <SummaryBody d={data} spoil={spoil} onSeek={(s) => seek(s)} onSearch={(q) => { close(); goSearch(q); }} />
                          ) : (
                            <div className="text-[13px] text-zinc-600 dark:text-zinc-300 break-keep">
                              요약을 불러오지 못했어요.{' '}
                              <button type="button" className="font-bold text-purple-600 underline cursor-pointer" onClick={() => { close(); openAiSummary({ id: t.id, title: t.title }); }}>요약 창으로 보기</button>
                            </div>
                          )}
                          <p className="mt-4 text-[10.5px] text-zinc-400 break-keep">AI가 영상을 보고 정리한 내용이라 틀릴 수 있어요. 시간을 누르면 위에서 그 장면부터 재생돼요.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
