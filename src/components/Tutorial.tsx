import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import type { Tab } from '../types';

/**
 * 처음 방문한 사람을 위한 둘러보기
 * - 환영 화면 → 화면 아무 곳이나 누르면 다음 단계
 * - 각 단계마다 실제 화면 요소 위치를 재서(화면 비율과 상관없이) 그 부분만 밝게 뚫고 테두리로 강조
 * - 탭바 단계에서는 탭을 실제로 넘겨 보이는 시연, 확률 단계에서는 '자세히 보기'를 직접 열어 보임
 * - 한 번 끝내거나 건너뛰면 다시 안 뜸 (설정에서 다시 보기 가능). 관리자가 전체 차단 가능 (system.tutorialEnabled = false)
 */

export const TUTORIAL_DONE_KEY = 'uzuhama_tutorial_done_v1';
export const TUTORIAL_START_EVENT = 'uzuhama-start-tutorial';

type Step = {
  id: string;
  title: string;
  body: string;
  /** 강조할 요소 (모바일/PC 각각, 쉼표로 여러 후보) — 없으면 가운데 카드 */
  target?: { mobile?: string; desktop?: string };
  tab?: Tab;
  scrollTop?: boolean;
  /** 단계에 들어올 때 / 나갈 때 시연 */
  demo?: 'tabs' | 'details';
};

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: '우주하마 방송 예측에 오신 걸 환영해요',
    body: '처음이라 볼 게 많죠? 중요한 것만 하나씩 짚어 드릴게요.\n화면 아무 곳이나 누르면 다음으로 넘어가요.',
  },
  {
    id: 'prob',
    title: '지금 방송이 켜질 확률',
    body: '요일, 최근 방송 간격, 평소 시작 시간을 바탕으로 1분마다 다시 계산해요. 아래에는 오늘 가장 유력한 시간도 나와요.',
    target: { mobile: '#current-prob-card, #current-prob-live-card', desktop: '#current-prob-card, #current-prob-live-card' },
    tab: 'summary',
    scrollTop: true,
  },
  {
    id: 'details',
    title: '어떻게 계산됐는지도 볼 수 있어요',
    body: "'확률 계산 자세히 보기'를 누르면 단계별로 확률이 어떻게 바뀌었는지 펼쳐져요.",
    target: { mobile: '[data-tour="prob-details-area"]', desktop: '[data-tour="prob-details-area"]' },
    tab: 'summary',
    demo: 'details',
  },
  {
    id: 'summary',
    title: '최근 방송 흐름',
    body: '최근 주간 방송 횟수와 요일별 집중도를 차트로 보여줘요. 오른쪽 위 버튼으로 이미지로 공유할 수도 있어요.',
    target: { mobile: '#summary-weekly-trend-card', desktop: '#summary-weekly-trend-card' },
    tab: 'summary',
  },
  {
    id: 'tabs',
    title: '탭으로 화면을 옮겨요',
    body: '요약 · 기록 · 분석 탭이에요. 눌러도 되고, 회색 동그라미를 옆으로 끌어도 넘어가요.',
    target: { mobile: 'nav[aria-label="하단 네비게이션"]', desktop: '#desktop-tab-bar' },
    tab: 'summary',
    demo: 'tabs',
  },
  {
    id: 'calendar',
    title: '방송 기록 달력',
    body: '방송한 날이 표시돼요. 날짜를 누르면 그날 한 게임, 다시보기, 편집 영상, 쇼츠가 나와요.',
    target: { mobile: '#calendar-main-card', desktop: '#calendar-main-card' },
    tab: 'calendar',
  },
  {
    id: 'detailed',
    title: '기간별 상세 분석',
    body: '기간을 골라 방송 추이, 요일별 패턴, 게임 카테고리를 분석해 볼 수 있어요.',
    target: { mobile: '#detailed-main-card', desktop: '#detailed-main-card' },
    tab: 'detailed',
  },
  {
    id: 'search',
    title: '영상 찾기',
    body: '편집 영상, 쇼츠, 재생목록을 모아 둔 곳이에요. 게임 이름이나 영상 링크로 검색해 보세요.',
    target: { mobile: 'button[aria-label="영상 검색 및 추천"]', desktop: '#desktop-tab-bar > button:nth-of-type(4)' },
    tab: 'summary',
    scrollTop: true,
  },
  {
    id: 'settings',
    title: '알림과 설정',
    body: '방송 시작 알림, 테마, 캘린더 구독은 여기서 켤 수 있어요. 이 둘러보기도 설정에서 다시 볼 수 있어요.',
    target: { mobile: '#header-settings-btn', desktop: '#header-settings-btn' },
    tab: 'summary',
    scrollTop: true,
  },
  {
    id: 'done',
    title: '준비 끝!',
    body: '이제 편하게 둘러보세요. 방송 켜지는 날 같이 기다려요.',
  },
];

const PAD = 8;
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 1 };

type Rect = { x: number; y: number; w: number; h: number; r: number };

function findTarget(step: Step, isMobile: boolean): HTMLElement | null {
  const sel = isMobile ? step.target?.mobile : step.target?.desktop;
  if (!sel) return null;
  for (const one of sel.split(',').map((s) => s.trim())) {
    const el = document.querySelector<HTMLElement>(one);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** 다른 팝업(공지·약관·설정·로딩)이 떠 있으면 기다림 */
function isOtherOverlayOpen(root: HTMLElement | null) {
  const nodes = document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"]');
  for (const n of nodes) {
    if (root && root.contains(n)) continue;
    const st = getComputedStyle(n);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    if (st.pointerEvents === 'none') continue;
    const r = n.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.6) return true;
  }
  return false;
}

export function Tutorial({ enabled, activeTab, onTabChange }: {
  enabled: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 390, h: typeof window !== 'undefined' ? window.innerHeight : 844 });
  const rootRef = useRef<HTMLDivElement>(null);
  const originalTabRef = useRef<Tab>(activeTab);
  const demoTimers = useRef<number[]>([]);
  const openedDetailsRef = useRef(false);
  const isMobile = vp.w < 640;
  const step = STEPS[index];

  // ── 시작 조건: 처음 방문 + 관리자 허용 + 다른 팝업이 다 닫힌 뒤 ──
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    try { done = localStorage.getItem(TUTORIAL_DONE_KEY) === '1'; } catch {}
    if (done || running) return;
    let calm = 0;
    const id = window.setInterval(() => {
      calm = isOtherOverlayOpen(rootRef.current) ? 0 : calm + 1;
      if (calm >= 3) { // 약 0.9초 동안 팝업 없음
        window.clearInterval(id);
        originalTabRef.current = activeTab;
        setIndex(0);
        setRunning(true);
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // 설정의 '둘러보기 다시 보기'
  useEffect(() => {
    const start = () => {
      originalTabRef.current = activeTab;
      setIndex(0);
      setRunning(true);
    };
    window.addEventListener(TUTORIAL_START_EVENT, start);
    return () => window.removeEventListener(TUTORIAL_START_EVENT, start);
  }, [activeTab]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clearDemo = useCallback(() => {
    demoTimers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    demoTimers.current = [];
    if (openedDetailsRef.current) {
      const btn = document.querySelector<HTMLButtonElement>('[data-tour="prob-details"]');
      if (btn?.getAttribute('aria-expanded') === 'true') btn.click();
      openedDetailsRef.current = false;
    }
  }, []);

  const finish = useCallback(() => {
    clearDemo();
    try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch {}
    setRunning(false);
    setRect(null);
    onTabChange(originalTabRef.current === 'recommend' ? 'summary' : originalTabRef.current);
  }, [clearDemo, onTabChange]);

  const next = useCallback(() => {
    clearDemo();
    setIndex((i) => {
      if (i >= STEPS.length - 1) { window.setTimeout(finish, 0); return i; }
      return i + 1;
    });
  }, [clearDemo, finish]);

  const prev = useCallback(() => {
    clearDemo();
    setIndex((i) => Math.max(0, i - 1));
  }, [clearDemo]);

  // ── 단계 진입: 탭 이동 → 대상 찾기 → 화면 안으로 스크롤 → 시연 ──
  useEffect(() => {
    if (!running) return;
    setRect(null);
    if (step.tab) onTabChange(step.tab);
    if (!step.target) return;
    let cancelled = false;
    let tries = 0;
    const locate = () => {
      if (cancelled) return;
      const el = findTarget(step, isMobile);
      if (!el) {
        if (++tries < 25) { window.setTimeout(locate, 80); return; }
        next(); // 이 화면에 없는 요소(예: 방송 중이라 다른 카드)면 건너뜀
        return;
      }
      const isFixed = (() => { let n: HTMLElement | null = el; while (n) { if (getComputedStyle(n).position === 'fixed') return true; n = n.parentElement; } return false; })();
      // 대상이 화면 밖에 있으면 보이는 곳으로 (탭 전환 뒤 스크롤 복원이 늦게 와도 다시 맞춤)
      const ensureVisible = () => {
        if (cancelled || isFixed) return;
        const cur = findTarget(step, isMobile) || el;
        if (step.scrollTop) {
          if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const r = cur.getBoundingClientRect();
        const topSafe = 90;
        const bottomSafe = window.innerHeight - (isMobile ? 120 : 40);
        const fits = r.height <= bottomSafe - topSafe;
        const needs = fits ? (r.top < topSafe - 2 || r.bottom > bottomSafe + 2) : Math.abs(r.top - topSafe) > 24;
        if (needs) {
          const offset = fits ? Math.max(topSafe, (window.innerHeight - r.height) / 2 - 40) : topSafe;
          window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: 'smooth' });
        }
      };
      if (step.scrollTop && isFixed) window.scrollTo({ top: 0, behavior: 'smooth' });
      ensureVisible();
      const iv = window.setInterval(ensureVisible, 700);
      demoTimers.current.push(iv as unknown as number);
      // 시연
      if (step.demo === 'tabs' && isMobile) {
        const order: Tab[] = ['calendar', 'detailed', 'summary'];
        order.forEach((t, i) => demoTimers.current.push(window.setTimeout(() => onTabChange(t), 900 + i * 1100)));
      } else if (step.demo === 'details') {
        demoTimers.current.push(window.setTimeout(() => {
          const btn = document.querySelector<HTMLButtonElement>('[data-tour="prob-details"]');
          if (btn && btn.getAttribute('aria-expanded') !== 'true') { btn.click(); openedDetailsRef.current = true; }
        }, 700));
      }
    };
    const t = window.setTimeout(locate, 120);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 대상 위치를 매 프레임 따라감 (스크롤·펼침·화면 회전에도 정확히) ──
  useLayoutEffect(() => {
    if (!running || !step.target) return;
    let raf = 0;
    const tick = () => {
      const el = findTarget(step, isMobile);
      if (el) {
        const r = el.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
        const nx = Math.round(r.left - PAD), ny = Math.round(r.top - PAD);
        const nw = Math.round(r.width + PAD * 2), nh = Math.round(r.height + PAD * 2);
        setRect((prev) => (prev && prev.x === nx && prev.y === ny && prev.w === nw && prev.h === nh ? prev : { x: nx, y: ny, w: nw, h: nh, r: Math.min(radius + PAD, nh / 2) }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, index, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // 키보드: → / Enter 다음, ← 이전, Esc 건너뛰기
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, next, prev, finish]);

  useEffect(() => () => clearDemo(), [clearDemo]);

  // ── 말풍선 위치: 대상 아래 공간이 넉넉하면 아래, 아니면 위 ──
  const bubble = useMemo(() => {
    const w = Math.min(340, vp.w - 32);
    const NEED = 230; // 말풍선이 들어갈 최소 높이
    if (!rect) return { left: (vp.w - w) / 2, top: vp.h / 2, w, center: true, below: true, dock: false };
    const spaceBelow = vp.h - (rect.y + rect.h);
    const left = Math.min(Math.max(16, rect.x + rect.w / 2 - w / 2), vp.w - w - 16);
    if (spaceBelow >= NEED) return { left, top: rect.y + rect.h + 14, w, center: false, below: true, dock: false };
    if (rect.y >= NEED) return { left, top: rect.y - 14, w, center: false, below: false, dock: false };
    // 대상이 화면을 거의 다 차지하면 화면 아래쪽(모바일은 탭바 위)에 붙여 보여줌
    return { left: (vp.w - w) / 2, top: vp.h - (vp.w < 640 ? 104 : 24), w, center: false, below: false, dock: true };
  }, [rect, vp]);

  if (!running) return null;
  const centered = !step.target;
  const total = STEPS.length;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[400] select-none"
      style={{ touchAction: 'none' }}
      onClick={next}
      role="dialog"
      aria-modal="true"
      aria-label="사이트 둘러보기"
    >
      {/* 어둡게 덮고 대상 부분만 뚫기 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" width={vp.w} height={vp.h} aria-hidden="true">
        <defs>
          <mask id="tutorial-hole">
            <rect x="0" y="0" width={vp.w} height={vp.h} fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: rect.r }}
                transition={SPRING}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <motion.rect
          x="0" y="0" width={vp.w} height={vp.h}
          fill="rgba(0,0,0,0.62)"
          mask="url(#tutorial-hole)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      </svg>

      {/* 강조 테두리 + 숨 쉬는 빛 */}
      {rect && (
        <motion.div
          className="absolute pointer-events-none"
          initial={false}
          animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r }}
          transition={SPRING}
        >
          <div className="absolute inset-0 rounded-[inherit] ring-2 ring-white/90 shadow-[0_0_0_4px_rgba(168,85,247,0.45)]" />
          <motion.div
            className="absolute inset-0 rounded-[inherit] ring-2 ring-purple-400"
            animate={{ opacity: [0.7, 0, 0.7], scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}

      {/* 말풍선 (바깥 상자가 자리를 잡고, 안쪽만 스프링으로 등장) */}
      <div
        className="absolute"
        style={centered
          ? { left: bubble.left, top: '50%', width: bubble.w, transform: 'translateY(-50%)' }
          : { left: bubble.left, top: bubble.top, width: bubble.w, transform: bubble.below ? undefined : 'translateY(-100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: bubble.below ? 8 : -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={SPRING}
        >
          <div className="rounded-[22px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 p-5">
            {centered && (
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
            )}
            <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 tabular-nums">{index + 1} / {total}</p>
            <h3 className="mt-1 text-base sm:text-lg font-extrabold leading-snug break-keep">{step.title}</h3>
            <p className="mt-1.5 text-[13px] sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line break-keep">{step.body}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              {index < total - 1 ? (
                <button type="button" onClick={finish} className="px-2 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer">
                  건너뛰기
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                {index > 0 && index < total - 1 && (
                  <button type="button" onClick={prev} className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    이전
                  </button>
                )}
                <button type="button" onClick={index < total - 1 ? next : finish} className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white cursor-pointer">
                  {index === 0 ? '둘러보기 시작' : index < total - 1 ? '다음' : '시작하기'}
                </button>
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-1" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span key={s.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-purple-600' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'}`} />
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
      </div>
    </div>
  );
}
