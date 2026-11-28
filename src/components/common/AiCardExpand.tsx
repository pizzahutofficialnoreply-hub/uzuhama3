import { requestReveal, waitForCard, settleIntoView } from '../../utils/revealVideo';
import { videoGames } from '../../utils/videoGames';
import { GameLinkCard } from './GameLinkCard';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from 'motion/react';
import { ChevronDown, EyeOff, Eye, X, ChevronLeft } from 'lucide-react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { useBackToClose } from '../../hooks/useBackToClose';
import { SummaryBody, CompilationSummary, loadDetail, goSearch, useDetailUpdates } from './AiSummaryHost';
import { SimilarVideos, CompLives } from './SimilarVideos';
import { ShortsPlayer } from './ShortsPlayer';
import { recommendShorts } from '../../utils/relatedShorts';
import { ScriptView, loadScript, lineAt, type Script } from './ScriptView';
import { GlassPlayButton } from './MediaIcons';
import { Skeleton } from './Skeleton';
import { VideoCardInfo, findVideo } from './VideoCardInfo';
import { CardFind } from './CardFind';
import { fullHeight, bottomBase } from '../../utils/viewport';

/**
 * 실험실 · 카드 펼쳐 요약과 함께 보기
 *  - AI 요약이 끝난 영상(쇼츠 제외)의 카드 썸네일을 누르면 그 카드가 커지며 열림
 *  - 맨 위: 바로 재생 / 제목 아래: AI 요약 펼침(접기 가능) / 스포 가리기
 */
export const AI_CARD_EVENT = 'uzuhama-ai-card';
/** 펼친 영상 화면이 다 닫혔을 때 (결산처럼 아래에 있던 화면이 다시 앞으로) */
export const AI_CARD_CLOSED = 'uzuhama-ai-card-closed';
type Rect = { top: number; left: number; width: number; height: number; wide?: boolean; pc?: boolean };
export type CardOpts = {
  /** 몰아보기: 요약이 있을 때만 요약 칸, 없으면 바로 아래 목록 */
  compilation?: boolean;
  /** 요약 칸 없이 (재생목록) */
  noSummary?: boolean;
  /** 요약 아래에 붙는 내용 (들어 있는 방송·재생목록 영상) */
  /** pick: 안쪽 영상을 누르면 이 카드가 그 영상의 통합 카드로 바뀜 (← 로 돌아오기) */
  extra?: (close: () => void, pick: (id: string, title: string, sub?: string) => void) => ReactNode;
  /** 맨 위 플레이어 주소 (재생목록 등) */
  embed?: string;
  thumb?: string;
  /** 이 시간(초)부터 재생 (검색에서 찾은 장면) */
  start?: number;
  /** 닫을 때 다른 화면의 이 영상 자리로 줄어듦 (요약 탭 새 영상 → 검색 탭 동영상 목록) */
  revealOnClose?: boolean;
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
  const vw = window.innerWidth, vh = fullHeight();
  // 가로로 넓은 화면(휴대폰 가로·PC): 영상은 왼쪽, 요약·스크립트는 오른쪽에 나란히
  //  - 휴대폰 가로: 화면 꽉 채움 / PC: 가운데 큰 창 (위아래 여백)
  if (vw >= 700 && vw > vh * 1.15) {
    const pc = vh >= 520;
    const width = pc ? Math.min(1240, vw - 64) : vw;
    const height = pc ? Math.min(vh - 48, Math.round(width * 0.62)) : vh;
    return { top: pc ? Math.round((vh - height) / 2) : 0, left: (vw - width) / 2, width, height, wide: true, pc };
  }
  const width = vw < 640 ? vw : Math.min(640, vw - 48);
  return { top: 0, left: (vw - width) / 2, width, height: vh };
}
/** 넓은 화면에서 열고 닫는 모양: 카드에서 늘어나는 대신 살짝 커지며 나타남 */
const WIDE_FROM = { x: 0, y: 24, scale: 0.96, opacity: 0, clipPath: 'inset(0px 0px 0px 0px round 0px)' };
const WIDE_OPEN = { x: 0, y: 0, scale: 1, opacity: 1, clipPath: 'inset(0px 0px 0px 0px round 0px)' };

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
/** 상태 표시줄 아래 손잡이 막대 높이 */
const BAR_H = 40;

/** 재생기가 붙을 자리: 카드·줄 안의 썸네일 */
function thumbOf(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el || !el.isConnected) return null;
  return (el.matches('[data-thumb]') ? el : el.querySelector('[data-thumb]')) as HTMLElement | null || el;
}

/** 앱 전체 방송 기록 (기록을 따로 받지 못한 화면에서 공유 글 등을 만들 때) */
export let appLogs: Record<string, any> | undefined;
export function AiCardExpandHost({ logs }: { logs?: Record<string, any> } = {}) {
  appLogs = logs;
  const [t, setT] = useState<Target | null>(null);
  const [closing, setClosing] = useState(false);
  const [to, setTo] = useState<Rect>(() => (typeof window !== 'undefined' ? finalRect() : { top: 0, left: 0, width: 0, height: 0 }));
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [spoil, setSpoil] = useState(() => { try { return localStorage.getItem(SPOIL_KEY) !== '0'; } catch { return true; } });
  const [play, setPlay] = useState<{ t: number; id?: string } | null>(null);
  /** 닫았는데 재생 중이던 영상: 원래 카드 썸네일 자리에서 계속 재생 (누르면 다시 펼침) */
  const [dock, setDock] = useState<Target | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [tab, setTab] = useState<'sum' | 'script'>('sum');
  const [subOn, setSubOn] = useState(false);
  const [shortsView, setShortsView] = useState<{ items: { url: string; title?: string }[]; i: number } | null>(null);
  const keepPlay = useRef(false);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  /** 다 펼쳐진 뒤에 재생 버튼 */
  const [settled, setSettled] = useState(false);
  /** 펼치는 움직임이 끝난 뒤에야 내용 그리기·불러오기 (움직임과 로딩을 겹치지 않게 → 안 끊김). 닫는 동안엔 그대로 둠 */
  const [bodyReady, setBodyReady] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const back = useRef<Rect | null>(null);
  const [safeTop, setSafeTop] = useState(0);
  // 위에서 아래로 끌어 내리면 닫기
  const dragY = useMotionValue(0);
  const dragScale = useTransform(dragY, [0, 600], [1, 0.86]);
  const dragRadius = useTransform(dragY, [0, 120], [0, 28]);
  const shadeOpacity = useTransform(dragY, [0, 400], [1, 0.25]);
  const scrollEl = useRef<HTMLDivElement | null>(null);
  // 카드 안(따로 스크롤되는 칸)에서는 아이폰이 '늦게 불러오기(lazy)' 그림을 제때 안 불러와 썸네일이 비는 일이 있어서 바로 불러옴
  useEffect(() => {
    const root = scrollEl.current;
    if (!root) return;
    const fix = () => root.querySelectorAll('img[loading="lazy"]').forEach((im) => { (im as HTMLImageElement).loading = 'eager'; });
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [t, bodyReady]);
  const drag = useRef<{ y0: number; x0: number; on: boolean; dead: boolean; video: boolean; moved: boolean } | null>(null);
  /** 재생기 상태 (1 재생, 2 멈춤) — 영상 위를 누르면 재생/멈춤 */
  const ytState = useRef(-1);
  /** 지금 재생 위치 (스크립트를 자막처럼 따라가려고) */
  const [now, setNow] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (!frame.current || ev.source !== frame.current.contentWindow) return;
      try {
        const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        const st = d?.info?.playerState ?? (d?.event === 'onStateChange' ? d.info : undefined);
        if (typeof st === 'number') { ytState.current = st; setIsPlaying(st === 1 || st === 3); }
        const ct = d?.info?.currentTime;
        if (typeof ct === 'number') setNow((p) => (Math.abs(p - ct) >= 0.5 ? ct : p));
      } catch { /* */ }
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
      // 썸네일 자리에서 재생 중이던 같은 영상을 다시 펼치면 재생은 그대로
      const same = dockRef.current && dockRef.current.id === e.detail?.id;
      setTo(finalRect()); setSafeTop(safeInsets().top); dragY.set(0); setT(e.detail); setClosing(false); setData(null); setOpen(true); setSettled(false); setBodyReady(false); back.current = null; setParentT(null);
      if (!same) setPlay(typeof e.detail?.start === 'number' ? { t: e.detail.start } : null);
      setDock(null); keepPlay.current = false;
      // 원래 카드는 들려 올라간 것처럼 자리만 남김
      try { if (e.detail?.src) e.detail.src.style.visibility = 'hidden'; } catch { /* */ }
    };
    window.addEventListener(AI_CARD_EVENT, on);
    const rs = () => setTo(finalRect());
    window.addEventListener('resize', rs);
    return () => { window.removeEventListener(AI_CARD_EVENT, on); window.removeEventListener('resize', rs); };
  }, []);
  const dockRef = useRef<Target | null>(null);
  dockRef.current = dock;
  useDetailUpdates(t?.id, setData);
  useEffect(() => {
    setScript(null); setTab('sum'); setNow(0);
    if (!t || t.compilation || t.embed || !bodyReady) return;
    let alive = true;
    loadScript(t.id).then((s) => { if (alive) setScript(s); });
    return () => { alive = false; };
  }, [t?.id, bodyReady]);
  const hasScript = Boolean(script?.lines?.length);
  const subLine = subOn && hasScript && play ? (script!.lines[lineAt(script!.lines, now)] || null) : null;
  // 재생기 자리 맞추기: 펼친 동안엔 위 영상 칸, 닫힌 뒤엔 원래 썸네일 위 (매 프레임)
  useEffect(() => {
    if (!play || (!t && !dock)) return;
    let raf = 0;
    const tick = () => {
      const L = layerRef.current;
      let r: DOMRect | null = null;
      let radius = '0px';
      if (t) r = slotRef.current?.getBoundingClientRect() || null;
      else if (dock) {
        const el = thumbOf(dock.src) || thumbOf(document.querySelector(`[data-ai-card="${dock.id}"]`) as HTMLElement | null);
        if (!el) { setPlay(null); setDock(null); return; } // 그 화면을 떠남 → 멈춤
        r = el.getBoundingClientRect();
        radius = el.getAttribute('data-thumb-radius') || getComputedStyle(el).borderRadius || '12px';
        if (!r.width || !r.height) { setPlay(null); setDock(null); return; }
      }
      if (L && r) {
        L.style.transform = `translate(${r.left}px, ${r.top}px)`;
        L.style.width = `${r.width}px`; L.style.height = `${r.height}px`;
        L.style.borderRadius = radius;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [play, t, dock]);
  const reopenDock = () => {
    if (!dock) return;
    const el = thumbOf(dock.src) || (document.querySelector(`[data-ai-card="${dock.id}"]`) as HTMLElement | null);
    const card = (dock.src && dock.src.isConnected ? dock.src : el) as HTMLElement | null;
    const r = (el || card)?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent(AI_CARD_EVENT, { detail: { ...dock, from: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : dock.from, src: card } }));
  };
  useEffect(() => {
    if (!t || t.noSummary || !bodyReady) return;
    let alive = true;
    loadDetail(t.id).then((j) => { if (alive) setData(j); }).catch(() => { if (alive) setData({ found: false }); });
    return () => { alive = false; };
  }, [t, bodyReady]);

  const revealing = useRef(false);
  const close = () => {
    if (!t || closing || revealing.current) return;
    // 요약 탭 '새 영상'에서 연 카드: 검색 탭 동영상 목록(기본 정렬)으로 넘기고 그 영상 칸으로 줄어듦
    if (t.revealOnClose) {
      revealing.current = true;
      const old = t.src;
      requestReveal(t.id);
      waitForCard(t.id).then((el) => (el ? settleIntoView(el) : null)).then((el) => {
        revealing.current = false;
        try { if (old) old.style.visibility = ''; } catch { /* */ }
        if (el) { try { el.style.visibility = 'hidden'; } catch { /* */ } }
        t.src = el; t.revealOnClose = false;
        close();
      });
      return;
    }
    // 원래 카드가 아직 화면에 있으면 그 자리로 돌아감
    const el = (t.src && t.src.isConnected ? t.src : document.querySelector(`[data-ai-card="${t.id}"]`)) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    back.current = r && r.bottom > 0 && r.top < window.innerHeight ? { top: r.top, left: r.left, width: r.width, height: r.height } : { ...t.from, top: window.innerHeight + 40 };
    // 재생 중이면 닫아도 카드 썸네일 자리에서 계속 재생 (화면 밖이면 멈춤)
    keepPlay.current = Boolean(play && (ytState.current === 1 || ytState.current === 3) && el && r && r.bottom > 0 && r.top < window.innerHeight && !(el as HTMLElement).closest?.('[data-no-dock]'));
    if (!keepPlay.current) setPlay(null);
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
    if (d?.video && !d.moved && !d.on) return;
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
  /** 비슷한 영상 누름: 펼친 채로 그 영상으로 바꿔 바로 재생 */
  // 몰아보기·재생목록 안에서 고른 영상으로 바뀌었을 때 돌아갈 원래 카드
  const [parentT, setParentT] = useState<any>(null);
  const pickFromList = (id: string, title: string, sub?: string) => {
    if (!t) return;
    setParentT(t);
    setT({ id, title, sub, from: t.from, src: null });
    setData(null); setPlay({ t: 0 }); setBodyReady(true);
    scrollEl.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const backToParent = () => {
    if (!parentT) return;
    const p = parentT; setParentT(null);
    setT(p); setData(null); setPlay({ t: 0 }); setBodyReady(true);
    scrollEl.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const switchTo = (id: string, title: string, start = 0) => {
    if (!t) return;
    try { if (t.src) t.src.style.visibility = ''; } catch { /* */ }
    const el = document.querySelector(`[data-ai-card="${id}"]`) as HTMLElement | null;
    setT({ id, title, from: t.from, src: el && el.getBoundingClientRect().width ? el : null });
    setData(null); setOpen(true); setPlay({ t: start });
    scrollEl.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toggleSpoil = () => setSpoil((v) => { try { localStorage.setItem(SPOIL_KEY, v ? '0' : '1'); } catch { /* */ } return !v; });
  const ready = data?.found && !data.pending && !data.compilation;
  const compHas = Boolean(data?.compilation && ((data.sources || []).length || data.overview?.opening || data.overview?.theme));
  // 몰아보기는 요약이 있을 때만, 재생목록은 없음
  // 요약이 없는 영상(아직 안 봄)은 요약 칸 없이
  // 웃음참기: 들어 있는 생방송을 카드로 + 이 영상의 어디에 나오는지
  const isLaugh = /웃음\s*참기/.test(String(t?.title || data?.title || ''));
  const showSummary = t && !t.noSummary && (!data || (t.compilation ? compHas || ready : ready));
  const finish = () => {
    if (closing) {
      try { if (t?.src) t.src.style.visibility = ''; } catch { /* */ }
      if (keepPlay.current && t) {
        const el = (t.src && t.src.isConnected ? t.src : document.querySelector(`[data-ai-card="${t.id}"]`)) as HTMLElement | null;
        setDock({ ...t, src: el });
      }
      keepPlay.current = false;
      setT(null); setClosing(false);
      window.dispatchEvent(new Event(AI_CARD_CLOSED));
    } else {
      setSettled(true);
      setBodyReady(true);
      // 펼쳐지면 재생 (내용 그리기와 겹치지 않게 한 박자 뒤에)
      setTimeout(() => setPlay((p) => p || { t: 0 }), 120);
    }
  };

  const cur = t || dock;
  return createPortal(
    <>
    <AnimatePresence>
      {t && (
        <motion.div key="ai-card" className="fixed inset-0 z-[320]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }}>
          <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: closing ? 0 : 1 }} transition={{ duration: closing ? 0.3 : 0.35 }} onClick={close}>
            {/* PC 큰 창: 뒤 화면이 살짝 비치게 (휴대폰은 꽉 채워 가림) */}
            <motion.div className={`absolute inset-0 ${to.pc ? 'bg-black/70 backdrop-blur-sm' : 'bg-black'}`} style={{ opacity: shadeOpacity }} />
          </motion.div>
          <motion.div
            role="dialog" aria-modal="true" aria-label={`${t.title} · 펼쳐 보기`} data-testid="ai-card"
            initial={to.wide ? WIDE_FROM : fromTransform(t.from, to, safeTop + BAR_H)}
            animate={to.wide ? (closing ? WIDE_FROM : WIDE_OPEN) : closing ? fromTransform(back.current || t.from, to, safeTop + BAR_H) : OPEN_SHAPE}
            transition={closing ? CLOSE_T : OPEN_T}
            onAnimationComplete={finish}
            style={{ top: to.top, left: to.left, width: to.width, height: to.height, transformOrigin: '0 0', willChange: 'transform, clip-path' }}
            className="fixed"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
          >
           <motion.div className={`dark absolute inset-0 overflow-hidden bg-black text-white flex ${to.wide ? 'flex-row' : 'flex-col'}`} style={{ y: dragY, scale: dragScale, borderRadius: to.pc ? 24 : dragRadius, transformOrigin: '50% 0%', ...(to.pc ? { background: '#0c0c0e', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.08)' } : {}) }}>
            {to.wide && <button type="button" data-tour="card-close" onClick={close} className="absolute z-30 right-[calc(env(safe-area-inset-right,0px)+10px)] top-2.5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>}
            {/* 넓은 화면: 영상·자막을 왼쪽 칸으로 묶음 (좁은 화면에선 그대로 위에서 아래로) */}
            <div className={to.wide ? 'relative w-[58%] shrink-0 flex flex-col justify-center bg-black pl-[env(safe-area-inset-left,0px)]' : 'contents'}>
            {/* 상태 표시줄 칸 + 맨 위: 바로 재생 */}
            {/* 맨 위 막대: 상태 표시줄 아래 손잡이 + 닫기 — 영상 위에는 아무것도 안 덮음 (유튜브 자막·설정 버튼이 눌리게) */}
            {!to.wide && <div data-video-drag className="shrink-0 bg-black relative flex items-end justify-center cursor-grab" style={{ height: `calc(env(safe-area-inset-top) + ${BAR_H}px)` }}>
              <span className="mb-[14px] h-1 w-10 rounded-full bg-white/40" aria-hidden />
              <button type="button" data-tour="card-close" onClick={close} style={{ opacity: settled ? 1 : 0, transition: 'opacity .2s' }} className="absolute right-2 bottom-1 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer" aria-label="닫기"><X className="w-4 h-4" /></button>
            </div>}
            <div ref={slotRef} className="relative w-full aspect-video bg-black shrink-0">
              {play ? null : (
                <button type="button" onClick={() => setPlay({ t: 0 })} className="absolute inset-0 w-full h-full cursor-pointer" aria-label="여기서 재생">
                  <img src={t.thumb || `https://img.youtube.com/vi/${t.id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                  <AnimatePresence>{settled && <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex items-center justify-center bg-black/10"><GlassPlayButton size="md" /></motion.span>}</AnimatePresence>
                </button>
              )}
            </div>

            {subOn && hasScript && (
              <div className="shrink-0 min-h-[40px] px-4 py-2 bg-black text-center text-[length:calc(13.5px*var(--fs,1))] font-semibold text-white leading-snug break-keep" aria-live="polite" data-testid="ai-subtitle">
                {subLine ? <>{subLine.w && <span className="mr-1 text-[length:calc(11px*var(--fs,1))] text-zinc-400">{subLine.w}</span>}{subLine.s}</> : <span className="text-zinc-500 text-[length:calc(12px*var(--fs,1))]">{play ? '…' : '재생하면 여기에 대사가 나와요'}</span>}
              </div>
            )}
            </div>
            <div className="relative flex-1 min-h-0">
            {/* 영상과 아래 내용 사이: 영상 아랫부분이 비치는 빛 + 밑으로 지나가는 내용은 흐리게 (한 덩어리로 이어 보이게) */}
            {/* 영상 바로 아래: 밑으로 지나가는 내용을 실시간으로 흐리게 (위로 갈수록 더 흐리고 어둡게, 단계 없이 이어지게) */}
            {!to.wide && <div className="ai-card-seam pointer-events-none absolute inset-x-0 top-0 z-10 h-11" aria-hidden>
              <span className="seam-l1" /><span className="seam-l2" /><span className="seam-l3" />
            </div>}
            <motion.div ref={scrollEl} className="absolute inset-0 overflow-y-auto overscroll-contain" initial={{ opacity: 0.35 }} animate={{ opacity: closing ? 0 : 1 }} transition={{ duration: closing ? 0.14 : 0.24 }}>
              <div className={to.wide ? 'pl-5 pr-[calc(env(safe-area-inset-right,0px)+20px)] pt-12 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]' : 'px-5 pt-16 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]'}>
                {parentT && (
                  <button type="button" onClick={backToParent} className="press-row -ml-2 mb-2 inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-[length:calc(13px*var(--fs,1))] font-bold text-purple-700 dark:text-purple-300 cursor-pointer">
                    <ChevronLeft className="w-4 h-4" />{parentT.compilation ? '몰아보기 목록으로' : '목록으로'}
                  </button>
                )}
                {t.embed || t.compilation || !bodyReady ? (<>
                  <h2 className="text-[length:calc(16px*var(--fs,1))] font-black leading-snug text-zinc-900 dark:text-white break-keep">{data?.title || t.title}</h2>
                  {t.sub && <p className="mt-1 text-[length:calc(12px*var(--fs,1))] text-zinc-500 tabular-nums">{t.sub}</p>}
                </>) : <VideoCardInfo key={t.id} id={t.id} title={data?.title || t.title} sub={t.sub} logs={logs} hideGames={!t.compilation && !t.embed} />}
                {bodyReady && <>
                {/* AI 요약·스크립트가 있을 때만 찾기 칸 (없으면 찾을 게 없음) */}
                {!t.embed && (ready || hasScript || compHas) && <CardFind key={`f-${t.id}`} id={t.id} onSeek={(x) => seek(x)} onOpen={(id, title, x) => switchTo(id, title, x)} />}

                {/* 연결된 생방송·쇼츠를 AI 요약보다 먼저 (유튜브로 보기는 위 제목 칸에 그대로) */}
                {!t.compilation && !t.embed && (
                  <div className="-mt-2">
                    <SimilarVideos part="linked" id={t.id} title={data?.title || t.title} logs={logs} onPick={(id, title) => switchTo(id, title)} onShorts={(items, i, games) => {
                      try { frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'); } catch { /* */ }
                      setShortsView({ items: [...items, ...recommendShorts(logs, games, items.map((x) => x.url))], i });
                    }} />
                  </div>
                )}
                {/* 이 방송의 게임: 기록 탭과 같은 게임 화면 썸네일 카드 (AI 요약은 접혀 있을 때가 많아 늘 보여 줌 · 몰아보기 제외) */}
                {!t.compilation && !t.embed && (() => {
                  const fv = findVideo(t.id, logs);
                  const items = fv ? (fv.kind === 'video' ? videoGames(fv.it, fv.log).games : (fv.log?.games || []).filter((g: any) => g?.name)) : [];
                  if (!items.length) return null;
                  return (
                    <div className="mt-4">
                      <p className="mb-2 text-[length:calc(13px*var(--fs,1))] font-black text-zinc-900 dark:text-white">이 방송의 게임</p>
                      <div className="space-y-2">{items.map((g: any, i: number) => <GameLinkCard key={`${g.name}-${i}`} name={g.name} link={g.link} category={g.category} />)}</div>
                    </div>
                  );
                })()}
                {/* 몰아보기·재생목록: 들어 있는 영상(연결된 것)을 먼저, 그다음 AI 요약 */}
                {t.compilation && isLaugh ? (
                  <div className="-mx-1.5"><CompLives id={t.id} logs={logs} ranges={data?.ranges} onPick={(id, title) => switchTo(id, title)} onSeek={(s) => seek(s)} /></div>
                ) : t.extra && <div className="mt-4 -mx-3">{t.extra(close, pickFromList)}</div>}
                {(showSummary || hasScript) && <div data-tour="card-summary" data-open={open ? '1' : '0'} className="mt-4 rounded-2xl border border-purple-100 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20">
                  <div className="flex items-center gap-2 px-4 py-3">
                    {showSummary && hasScript ? (
                      <div className="flex-1 min-w-0 flex items-center gap-1" role="tablist">
                        {([['sum', 'AI 영상 요약'], ['script', '스크립트']] as const).map(([k, l]) => (
                          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setOpen(true); }}
                            className={`px-2.5 py-1 rounded-full text-[length:calc(12.5px*var(--fs,1))] font-black cursor-pointer ${tab === k ? 'bg-purple-600 text-white' : 'text-purple-700 dark:text-purple-300'}`}>{l}</button>
                        ))}
                        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? '접기' : '펼치기'} className="ml-0.5 text-purple-400 cursor-pointer"><motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-block"><ChevronDown className="w-4 h-4" /></motion.span></button>
                      </div>
                    ) : (
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer">
                      <span className="text-[length:calc(13px*var(--fs,1))] font-black text-purple-700 dark:text-purple-300">{showSummary ? 'AI 영상 요약' : '스크립트'}</span>
                      <motion.span animate={{ rotate: open ? 180 : 0 }} className="ml-0.5 text-purple-400"><ChevronDown className="w-4 h-4" /></motion.span>
                      <span className="sr-only">{open ? '접기' : '펼치기'}</span>
                    </button>
                    )}
                    {(tab === 'script' || !showSummary) ? (
                      <button type="button" onClick={() => { setSubOn((v) => !v); if (!play) setPlay({ t: 0 }); }} aria-pressed={subOn} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[length:calc(11px*var(--fs,1))] font-bold cursor-pointer ${subOn ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'}`}>자막처럼 보기</button>
                    ) : (
                    <button type="button" onClick={toggleSpoil} aria-pressed={spoil} className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[length:calc(11px*var(--fs,1))] font-bold cursor-pointer ${spoil ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'}`}>
                      {spoil ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} 스포 가리기
                    </button>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                        <div className="px-4 pb-4">
                          {(tab === 'script' || !showSummary) ? (
                            <ScriptView script={script} now={now} playing={isPlaying} onSeek={(s) => seek(s)} />
                          ) : !data ? (
                            <div className="space-y-2" aria-busy="true" aria-label="불러오는 중">
                              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-2/3" />
                              <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
                            </div>
                          ) : ready ? (
                            <SummaryBody d={data} date={findVideo(t.id, logs)?.log?.date} gameItems={findVideo(t.id, logs)?.log?.games} spoil={spoil} onSeek={(s) => seek(s)} onSearch={(q) => { close(); goSearch(q); }} />
                          ) : compHas ? (
                            <CompilationSummary data={data} spoil={spoil} onSeek={(s, id) => seek(s, id)} onSearch={(q) => { close(); goSearch(q); }} />
                          ) : null}
                          {tab === 'sum' && showSummary && <p className="mt-4 text-[length:calc(10.5px*var(--fs,1))] text-zinc-400 break-keep">AI가 영상을 보고 정리한 내용이라 틀릴 수 있어요. 시간을 누르면 위에서 그 장면부터 재생돼요.</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>}
                {!t.compilation && !t.embed && (
                  <div className="-mx-1.5">
                    <SimilarVideos part="similar" id={t.id} title={data?.title || t.title} logs={logs} ai={ready ? data : null} onPick={(id, title) => switchTo(id, title)} onShorts={(items, i, games) => {
                      // 쇼츠 보기: 연결된 쇼츠를 다 보고 나면 추천 쇼츠로 이어서 (영상은 멈춤)
                      try { frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'); } catch { /* */ }
                      setShortsView({ items: [...items, ...recommendShorts(logs, games, items.map((x) => x.url))], i });
                    }} />
                  </div>
                )}
                </>}
              </div>
            </motion.div>
            </div>
           </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {shortsView && <ShortsPlayer items={shortsView.items} startIndex={shortsView.i} onClose={() => setShortsView(null)} allLogs={logs} autoNext zIndex={340} />}
    {play && cur && (
      <div ref={layerRef} className="fixed left-0 top-0 overflow-hidden bg-black" style={{ zIndex: t ? 321 : 40, willChange: 'transform' }} data-testid="ai-card-player">
        <iframe
          ref={(el) => { frame.current = el; trackYoutubeFrame(el); }}
          src={cur.embed && !play.id ? cur.embed : embedSrc(play.id || cur.id, play.t ? { start: Math.floor(play.t) } : {})}
          title={cur.title}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {/* 긴 영상은 유튜브 플레이어에 2배속(꾹 누르기)이 이미 있어서 사이트 쪽 가장자리 칸은 뺌 (전체화면 버튼도 가리지 않게) */}
        {!t && dock && (
          <>
            {/* 썸네일 자리에서 재생 중: 누르면 다시 펼쳐서 거기서 조정 */}
            <button type="button" onClick={reopenDock} className="absolute inset-0 w-full h-full cursor-pointer" aria-label={`${dock.title} 펼쳐서 보기`} data-testid="ai-card-dock" />
            <button type="button" onClick={() => { setPlay(null); setDock(null); }} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer" aria-label="재생 멈추기"><X className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
    )}
    </>,
    document.body,
  );
}
