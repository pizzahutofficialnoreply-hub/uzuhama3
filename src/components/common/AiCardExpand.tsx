import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from 'motion/react';
import { ChevronDown, EyeOff, Eye, Sparkles, X } from 'lucide-react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { useBackToClose } from '../../hooks/useBackToClose';
import { SummaryBody, CompilationSummary, loadDetail, goSearch, openAiSummary } from './AiSummaryHost';
import { GlassPlayButton } from './MediaIcons';
import { Skeleton } from './Skeleton';

/**
 * 실험실 · 카드 펼쳐 요약과 함께 보기
 *  - AI 요약이 끝난 영상(쇼츠 제외)의 카드 썸네일을 누르면 그 카드가 커지며 열림
 *  - 맨 위: 바로 재생 / 제목 아래: AI 요약 펼침(접기 가능) / 스포 가리기
 */
export const AI_CARD_EVENT = 'uzuhama-ai-card';
type Rect = { top: number; left: number; width: number; height: number };
export type CardOpts = {
  /** 몰아보기: 요약이 있을 때만 요약 칸, 없으면 바로 아래 목록 */
  compilation?: boolean;
  /** 요약 칸 없이 (재생목록) */
  noSummary?: boolean;
  /** 요약 아래에 붙는 내용 (들어 있는 방송·재생목록 영상) */
  extra?: (close: () => void) => ReactNode;
  /** 맨 위 플레이어 주소 (재생목록 등) */
  embed?: string;
  thumb?: string;
};
type Target = { id: string; title: string; sub?: string; from: Rect; src?: HTMLElement | null } & CardOpts;

export function openAiCard(id: string, title: string, el: Element | null, sub?: string, opts: CardOpts = {}) {
  const r = el?.getBoundingClientRect();
  const from = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : { top: window.innerHeight / 2 - 100, left: 16, width: window.innerWidth - 32, height: 200 };
  window.dispatchEvent(new CustomEvent(AI_CARD_EVENT, { detail: { id, title, sub, from, src: el as HTMLElement | null, ...opts } satisfies Target }));
}

const SPOIL_KEY = 'uzuhama_ai_card_spoil';
// 튀지 않게 (넘침 거의 없음)
// 시간 고정 곡선: 끝에서 질질 끌지 않고 딱 멈춤 (스프링은 끝이 길어 닫힌 뒤 잠깐 멈춰 보였음)
const OPEN_T = { duration: 0.44, ease: [0.2, 0.9, 0.1, 1] } as const;
const CLOSE_T = { duration: 0.34, ease: [0.4, 0, 0.2, 1] } as const;

/** 상태 표시줄·홈 표시줄 높이 (아이폰 노치 등) */
function safeInsets(): { top: number; bottom: number } {
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
    document.body.appendChild(d);
    const cs = getComputedStyle(d);
    const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    d.remove();
    return r;
  } catch { return { top: 0, bottom: 0 }; }
}

/** 전체 화면 (넓은 화면은 가운데 세로로 꽉) */
function finalRect(): Rect {
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = vw < 640 ? vw : Math.min(640, vw - 48);
  return { top: 0, left: (vw - width) / 2, width, height: vh };
}

/** 카드 자리(from)를 펼친 화면(to) 기준의 변환으로: 폭을 맞춰 같은 비율로 줄이고 위(상태 표시줄 칸)·아래는 잘라서 원래 카드 모양 */
function fromTransform(f: Rect, to: Rect, safeTop: number, radius = 24) {
  const s = Math.max(0.05, f.width / to.width);
  const visibleH = Math.min(to.height - safeTop, f.height / s);
  return {
    x: f.left - to.left,
    y: f.top - to.top - safeTop * s,
    scale: s,
    clipPath: `inset(${safeTop}px 0px ${Math.max(0, to.height - safeTop - visibleH)}px 0px round ${radius / s}px)`,
  };
}
const OPEN_SHAPE = { x: 0, y: 0, scale: 1, clipPath: 'inset(0px 0px 0px 0px round 0px)' };
const DRAG_CLOSE = 110;

export function AiCardExpandHost() {
  const [t, setT] = useState<Target | null>(null);
  const [closing, setClosing] = useState(false);
  const [to, setTo] = useState<Rect>(() => (typeof window !== 'undefined' ? finalRect() : { top: 0, left: 0, width: 0, height: 0 }));
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [spoil, setSpoil] = useState(() => { try { return localStorage.getItem(SPOIL_KEY) !== '0'; } catch { return true; } });
  const [play, setPlay] = useState<{ t: number; id?: string } | null>(null);
  /** 다 펼쳐진 뒤에 재생 버튼 */
  const [settled, setSettled] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const back = useRef<Rect | null>(null);
  const [safeTop, setSafeTop] = useState(0);
  // 위에서 아래로 끌어 내리면 닫기
  const dragY = useMotionValue(0);
  const dragScale = useTransform(dragY, [0, 600], [1, 0.86]);
  const dragRadius = useTransform(dragY, [0, 120], [0, 28]);
  const shadeOpacity = useTransform(dragY, [0, 400], [1, 0.25]);
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y0: number; x0: number; on: boolean; dead: boolean; video: boolean; moved: boolean } | null>(null);
  /** 재생기 상태 (1 재생, 2 멈춤) — 영상 위를 누르면 재생/멈춤 */
  const ytState = useRef(-1);
  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (!frame.current || ev.source !== frame.current.contentWindow) return;
      try { const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; const st = d?.info?.playerState ?? (d?.event === 'onStateChange' ? d.info : undefined); if (typeof st === 'number') ytState.current = st; } catch { /* */ }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  const togglePlayback = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const playing = ytState.current === 1 || ytState.current === 3;
    w.postMessage(JSON.stringify({ event: 'command', func: playing ? 'pauseVideo' : 'playVideo', args: [] }), '*');
    ytState.current = playing ? 2 : 1;
  };

  useEffect(() => {
    const on = (e: any) => {
      setTo(finalRect()); setSafeTop(safeInsets().top); dragY.set(0); setT(e.detail); setClosing(false); setData(null); setOpen(true); setPlay(null); setSettled(false); back.current = null;
      // 원래 카드는 들려 올라간 것처럼 자리만 남김
      try { if (e.detail?.src) e.detail.src.style.visibility = 'hidden'; } catch { /* */ }
    };
    window.addEventListener(AI_CARD_EVENT, on);
    const rs = () => setTo(finalRect());
    window.addEventListener('resize', rs);
    return () => { window.removeEventListener(AI_CARD_EVENT, on); window.removeEventListener('resize', rs); };
  }, []);
  useEffect(() => {
    if (!t || t.noSummary) return;
    let alive = true;
    loadDetail(t.id).then((j) => { if (alive) setData(j); }).catch(() => { if (alive) setData({ found: false }); });
    return () => { alive = false; };
  }, [t]);

  const close = () => {
    if (!t || closing) return;
    // 원래 카드가 아직 화면에 있으면 그 자리로 돌아감
    const el = (t.src && t.src.isConnected ? t.src : document.querySelector(`[data-ai-card="${t.id}"]`)) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    back.current = r && r.bottom > 0 && r.top < window.innerHeight ? { top: r.top, left: r.left, width: r.width, height: r.height } : { ...t.from, top: window.innerHeight + 40 };
    setPlay(null);
    setSettled(false);
    setClosing(true);
    animate(dragY, 0, { duration: 0.3, ease: [0.4, 0, 0.2, 1] });
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (closing || e.touches.length !== 1) { drag.current = null; return; }
    // 내용이 맨 위일 때만 (아래로 스크롤해 둔 상태면 그냥 스크롤)
    const atTop = (scrollEl.current?.scrollTop || 0) <= 0;
    const el = e.target as HTMLElement;
    // 영상 위에서 끌어 내려도 닫힘 (내용 스크롤 위치와 상관없이)
    const video = Boolean(el.closest('[data-video-drag]'));
    drag.current = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, on: false, video, moved: false, dead: (!atTop && !video) || Boolean(el.closest('[data-swipe-row] [data-swipe-btn], input, textarea')) };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d || d.dead) return;
    const dy = e.touches[0].clientY - d.y0;
    if (Math.abs(dy) > 6 || Math.abs(e.touches[0].clientX - d.x0) > 6) d.moved = true;
    if (!d.on) {
      if (dy > 8 && (d.video || (scrollEl.current?.scrollTop || 0) <= 0)) d.on = true;
      else if (dy < -4) { d.dead = true; return; } else return;
    }
    dragY.set(Math.max(0, dy - 8));
  };
  const onTouchEnd = (e?: React.TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    // 영상 위를 톡 누르면 재생/멈춤
    if (d?.video && !d.moved && !d.on) { e?.preventDefault?.(); togglePlayback(); return; }
    if (!d?.on) return;
    if (dragY.get() > DRAG_CLOSE) close();
    else animate(dragY, 0, { type: 'spring', stiffness: 500, damping: 40 });
  };
  useBackToClose(Boolean(t) && !closing, close);
  useEffect(() => {
    if (!t) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const seek = (s: number, vid?: string) => {
    const w = frame.current?.contentWindow;
    if (vid && vid !== (play?.id || t?.id)) { setPlay({ t: s, id: vid }); return; }
    if (play && w) {
      w.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [s, true] }), '*');
      w.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    } else setPlay({ t: s });
  };
  const toggleSpoil = () => setSpoil((v) => { try { localStorage.setItem(SPOIL_KEY, v ? '0' : '1'); } catch { /* */ } return !v; });
  const ready = data?.found && !data.pending && !data.compilation;
  const compHas = Boolean(data?.compilation && ((data.sources || []).length || data.overview?.opening || data.overview?.theme));
  // 몰아보기는 요약이 있을 때만, 재생목록은 없음
  const showSummary = t && !t.noSummary && (!t.compilation || !data || compHas);
  const finish = () => {
    if (closing) {
      try { if (t?.src) t.src.style.visibility = ''; } catch { /* */ }
      setT(null); setClosing(false);
    } else {
      setSettled(true);
      // 펼쳐지면 바로 재생
      setPlay((p) => p || { t: 0 });
    }
  };

  return createPortal(
    <AnimatePresence>
      {t && (
        <motion.div key="ai-card" className="fixed inset-0 z-[320]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }}>
          <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: closing ? 0 : 1 }} transition={{ duration: closing ? 0.3 : 0.35 }} onClick={close}>
            <motion.div className="absolute inset-0 bg-black" style={{ opacity: shadeOpacity }} />
          </motion.div>
          <motion.div
            role="dialog" aria-modal="true" aria-label={`${t.title} · 펼쳐 보기`} data-testid="ai-card"
            initial={fromTransform(t.from, to, safeTop)}
            animate={closing ? fromTransform(back.current || t.from, to, safeTop) : OPEN_SHAPE}
            transition={closing ? CLOSE_T : OPEN_T}
            onAnimationComplete={finish}
            style={{ top: to.top, left: to.left, width: to.width, height: to.height, transformOrigin: '0 0', willChange: 'transform, clip-path' }}
            className="fixed"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
          >
           <motion.div className="dark absolute inset-0 overflow-hidden bg-black text-white flex flex-col" style={{ y: dragY, scale: dragScale, borderRadius: dragRadius, transformOrigin: '50% 0%' }}>
            {/* 상태 표시줄 칸 + 맨 위: 바로 재생 */}
            <div className="shrink-0 bg-black" style={{ height: 'env(safe-area-inset-top)' }} />
            <div className="relative w-full aspect-video bg-black shrink-0">
              {play ? (
                <iframe
                  ref={(el) => { frame.current = el; trackYoutubeFrame(el); }}
                  src={t.embed && !play.id ? t.embed : embedSrc(play.id || t.id, play.t ? { start: Math.floor(play.t) } : {})}
                  title={t.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : null}
              {/* 영상 위 투명 막: 끌어 내리면 닫기, 톡 누르면 재생/멈춤 (아래 조작 막대 자리는 비워 둠) */}
              {play && settled && (
                <div data-video-drag className="absolute inset-x-0 top-0 bottom-12 z-[5] cursor-pointer" onClick={(e) => { if (e.detail > 0 && !('ontouchstart' in window)) togglePlayback(); }} aria-hidden />
              )}
              {play ? null : (
                <button type="button" onClick={() => setPlay({ t: 0 })} className="absolute inset-0 w-full h-full cursor-pointer" aria-label="여기서 재생">
                  <img src={t.thumb || `https://img.youtube.com/vi/${t.id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                  <AnimatePresence>{settled && <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex items-center justify-center bg-black/10"><GlassPlayButton size="md" /></motion.span>}</AnimatePresence>
                </button>
              )}
              <button type="button" onClick={close} style={{ opacity: settled ? 1 : 0, transition: 'opacity .2s' }} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/65 hover:bg-black text-white flex items-center justify-center cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
            </div>

            <div className="relative flex-1 min-h-0">
            {/* 영상과 아래 내용 사이: 영상 아랫부분이 비치는 빛 + 밑으로 지나가는 내용은 흐리게 (한 덩어리로 이어 보이게) */}
            {/* 영상 바로 아래: 밑으로 지나가는 내용을 실시간으로 흐리게 (위로 갈수록 더 흐리고 어둡게, 단계 없이 이어지게) */}
            <div className="ai-card-seam pointer-events-none absolute inset-x-0 top-0 z-10 h-[72px]" aria-hidden>
              <span className="seam-l1" /><span className="seam-l2" /><span className="seam-l3" />
            </div>
            <motion.div ref={scrollEl} className="absolute inset-0 overflow-y-auto overscroll-contain" initial={{ opacity: 0.35 }} animate={{ opacity: closing ? 0 : 1 }} transition={{ duration: closing ? 0.14 : 0.24 }}>
              <div className="px-5 pt-9 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
                <h2 className="text-[16px] font-black leading-snug text-zinc-900 dark:text-white break-keep">{data?.title || t.title}</h2>
                {t.sub && <p className="mt-1 text-[12px] text-zinc-500 tabular-nums">{t.sub}</p>}

                {showSummary && <div className="mt-4 rounded-2xl border border-purple-100 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20">
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
                          ) : compHas ? (
                            <CompilationSummary data={data} spoil={spoil} onSeek={(s, id) => seek(s, id)} onSearch={(q) => { close(); goSearch(q); }} />
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
                </div>}
                {t.extra && <div className="mt-4 -mx-3">{t.extra(close)}</div>}
              </div>
            </motion.div>
            </div>
           </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
