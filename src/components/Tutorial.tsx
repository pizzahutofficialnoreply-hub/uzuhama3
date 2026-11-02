import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Check, Pointer } from 'lucide-react';
import type { Tab } from '../types';
import { INSTALL_SEEN_KEY, needsIOSInstall, openSetupGuide } from '../utils/setupStatus';

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
  /** 이 단계 들어올 때 맞춰 둘 탭 */
  tab?: Tab;
  scrollTop?: boolean;
  /**
   * 직접 해 보는 단계: 강조된 부분만 누를 수 있고, 조건이 맞으면 다음 설명으로 자동 진행
   * (아무 곳이나 눌러 넘기는 일반 단계와 구분)
   */
  action?: { hint: string; done: (ctx: { activeTab: Tab }) => boolean; reset?: () => void };
  /** 설정 패널처럼 안쪽에서 스크롤되는 곳의 요소: 그 상자 안에서 보이게 스크롤 */
  scrollIntoView?: boolean;
  /** 말풍선 안의 버튼 (예: 설치 방법 보기, 알림 켜기) */
  extra?: { label: string; onClick: () => void };
  /** 이 단계에 들어오면 설정 패널을 닫음 */
  closeSettings?: boolean;
};

// 같은 요소가 모바일·PC 용으로 두 번 있을 수 있어서, 화면에 보이는 것만 봄
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].some((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});
const IOS_INSTALL_FIRST = needsIOSInstall();

const detailsOpen = () => document.querySelector('[data-tour="prob-details"]')?.getAttribute('aria-expanded') === 'true';
const closeDetails = () => {
  const btn = document.querySelector<HTMLButtonElement>('[data-tour="prob-details"]');
  if (btn?.getAttribute('aria-expanded') === 'true') btn.click();
};

// 누구나 아는 건 짧게, 숨은 기능은 직접 눌러 보며 알아가도록
const STEPS: Step[] = [
  {
    id: 'welcome',
    title: '우주하마 방송 예측에 오신 걸 환영해요',
    body: '처음이라 볼 게 많죠? 숨은 기능 위주로 직접 눌러 보며 알려 드릴게요.\n언제든 오른쪽 위 X로 닫을 수 있어요.',
  },
  {
    id: 'prob',
    title: '지금 방송이 켜질 확률',
    body: '요일, 최근 방송 간격, 평소 시작 시간을 보고 1분마다 다시 계산해요.',
    target: { mobile: '#current-prob-card, #current-prob-live-card', desktop: '#current-prob-card, #current-prob-live-card' },
    tab: 'summary',
    scrollTop: true,
  },
  {
    id: 'details-try',
    title: '어떻게 나온 숫자인지 볼까요?',
    body: '',
    target: { mobile: '[data-tour="prob-details"]', desktop: '[data-tour="prob-details"]' },
    tab: 'summary',
    action: { hint: "'확률 계산 자세히 보기'를 눌러 보세요", done: () => detailsOpen(), reset: closeDetails },
  },
  {
    id: 'details',
    title: '단계별 계산',
    body: '요일 → 방송 간격 → 휴방 여부 → 남은 시간 순서로 확률이 바뀌는 과정이에요. 마지막 줄이 위의 큰 숫자와 같아요.',
    target: { mobile: '[data-tour="prob-details-area"]', desktop: '[data-tour="prob-details-area"]' },
    tab: 'summary',
  },
  {
    id: 'tab-try',
    title: '방송 기록으로 가 볼까요?',
    body: '',
    target: { mobile: 'nav[aria-label="하단 네비게이션"]', desktop: '#desktop-tab-bar' },
    tab: 'summary',
    action: {
      hint: "탭바에서 '기록'을 눌러 보세요. 회색 동그라미를 옆으로 끌어도 넘어가요",
      done: ({ activeTab }) => activeTab === 'calendar',
    },
  },
  {
    id: 'calendar',
    title: '방송 기록 달력',
    body: '방송한 날에 표시가 있어요. 날짜를 누르면 그날 한 게임, 다시보기, 편집 영상, 쇼츠가 한곳에 모여 나와요.',
    target: { mobile: '#calendar-main-card', desktop: '#calendar-main-card' },
    tab: 'calendar',
  },
  {
    id: 'calendar-export',
    title: '내 캘린더에 넣기',
    body: "'캘린더 구독'을 하면 새 방송이 기록될 때마다 아이폰·구글 캘린더에 자동으로 들어와요. '선택 등록'은 원하는 날만 골라 한 번에 추가해요.",
    target: { mobile: '[data-tour="calendar-export"]', desktop: '[data-tour="calendar-export"]' },
    tab: 'calendar',
  },
  {
    id: 'detailed-try',
    title: '이번엔 분석 탭',
    body: '',
    target: { mobile: 'nav[aria-label="하단 네비게이션"]', desktop: '#desktop-tab-bar' },
    tab: 'calendar',
    action: { hint: "'분석'을 눌러 보세요", done: ({ activeTab }) => activeTab === 'detailed' },
  },
  {
    id: 'detailed',
    title: '기간별 상세 분석',
    body: '기간을 골라 조회하면 방송 추이, 요일·시간 패턴, 게임 카테고리가 나와요. 그래프 점을 누르면 그 주에 방송한 날짜가 보이고, CSV·PDF로 내보낼 수도 있어요.',
    target: { mobile: '#detailed-main-card', desktop: '#detailed-main-card' },
    tab: 'detailed',
  },
  {
    id: 'search-try',
    title: '영상 찾기',
    body: '',
    target: { mobile: 'button[aria-label="영상 검색 및 추천"]', desktop: '#desktop-tab-bar > button:nth-of-type(4)' },
    tab: 'detailed',
    action: { hint: '돋보기(추천 영상)를 눌러 보세요', done: ({ activeTab }) => activeTab === 'recommend' },
  },
  {
    id: 'search',
    title: '영상은 여기서',
    body: '홈 · 추천 · 동영상 · Shorts · 재생목록으로 나뉘어 있어요. 게임 이름뿐 아니라 유튜브·치지직 링크를 붙여 넣어도 그 방송을 찾아 줘요. 카드/목록 버튼으로 보기 방식도 바꿀 수 있어요.',
    target: { mobile: '#recommend-cards-top', desktop: '#recommend-cards-top' },
    tab: 'recommend',
    scrollTop: true,
  },
  {
    id: 'settings-try',
    title: '마지막으로 설정',
    body: '',
    target: { mobile: '#header-settings-btn', desktop: '#header-settings-btn' },
    tab: 'summary',
    scrollTop: true,
    action: { hint: '오른쪽 위 톱니바퀴(설정)를 눌러 보세요', done: () => visible('[data-tour="settings-notify"]') },
  },
  IOS_INSTALL_FIRST
    ? {
        id: 'settings-notify',
        title: '아이폰은 앱 설치가 먼저예요',
        body: '아이폰은 홈 화면에 추가한 앱에서만 방송 알림이 와요. 설치하고 그 앱으로 열면 여기서 알림을 켤 수 있어요.',
        target: { mobile: '[data-tour="settings-notify"]', desktop: '[data-tour="settings-notify"]' },
        scrollIntoView: true,
        extra: { label: '설치 방법 보기', onClick: () => { try { sessionStorage.setItem(INSTALL_SEEN_KEY, '1'); } catch { /* 무시 */ } openSetupGuide('install'); } },
      }
    : {
        id: 'settings-notify',
        title: '여기서 알림을 켜요',
        body: '방송 시작, 휴방 공지, 오늘 유력 시간 몇 분 전 알림을 골라서 켤 수 있어요.',
        target: { mobile: '[data-tour="settings-notify"]', desktop: '[data-tour="settings-notify"]' },
        scrollIntoView: true,
        extra: { label: '지금 알림 켜기', onClick: () => openSetupGuide('notify') },
      },
  {
    id: 'settings-setup',
    title: '안내는 여기서 다시',
    body: '앱 설치 · 알림 · 캘린더 등록 안내는 언제든 여기서 다시 볼 수 있어요. 바로 아래에서 이 둘러보기도 다시 볼 수 있어요.',
    target: { mobile: '[data-tour="settings-setup"]', desktop: '[data-tour="settings-setup"]' },
    scrollIntoView: true,
  },
  {
    id: 'done',
    title: '준비 끝!',
    body: '이제 편하게 둘러보세요. 방송 켜지는 날 같이 기다려요.',
    closeSettings: true,
  },
];

const PAD = 8;
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 1 };

type Rect = { x: number; y: number; w: number; h: number; r: number };

function findTarget(step: Step, isMobile: boolean): HTMLElement | null {
  const sel = isMobile ? step.target?.mobile : step.target?.desktop;
  if (!sel) return null;
  for (const one of sel.split(',').map((s) => s.trim())) {
    for (const el of document.querySelectorAll<HTMLElement>(one)) {
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

export function Tutorial({ enabled, activeTab, onTabChange, onCloseSettings, autoStart = true }: {
  enabled: boolean;
  onCloseSettings?: () => void;
  /** false 면 스스로 시작하지 않음 (처음 시작 화면이 끝날 때 시작시킴) */
  autoStart?: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 390, h: typeof window !== 'undefined' ? window.innerHeight : 844 });
  const rootRef = useRef<HTMLDivElement>(null);
  const originalTabRef = useRef<Tab>(activeTab);
  const demoTimers = useRef<number[]>([]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [actionDone, setActionDone] = useState(false);
  const [nudgeKey, setNudgeKey] = useState(0);
  // 처음 보는 둘러보기인지 (끝나면 '더 알아볼까요?' 를 이어서 보여 줌)
  const firstRunRef = useRef(false);
  // 강조 칸: 단계가 바뀔 때만 부드럽게 옮기고, 스크롤 등으로 따라갈 때는 바로 붙음
  const [settling, setSettling] = useState(true);
  runningRef.current = running;
  const isMobile = vp.w < 640;
  const step = STEPS[index];

  // ── 시작 조건: 처음 방문 + 관리자 허용 + 다른 팝업이 다 닫힌 뒤 ──
  useEffect(() => {
    if (!enabled || !autoStart) return;
    let done = false;
    try { done = localStorage.getItem(TUTORIAL_DONE_KEY) === '1'; } catch {}
    if (done || running) return;
    let calm = 0;
    const id = window.setInterval(() => {
      calm = isOtherOverlayOpen(rootRef.current) ? 0 : calm + 1;
      if (calm >= 3) { // 약 0.9초 동안 팝업 없음
        window.clearInterval(id);
        if (runningRef.current) return;
        firstRunRef.current = true;
        originalTabRef.current = activeTab;
        setIndex(0);
        setRunning(true);
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [enabled, autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // 설정의 '둘러보기 다시 보기'
  useEffect(() => {
    const start = () => {
      // 이미 진행 중이면 무시 (시작 신호가 두 번 오면 첫 단계로 되돌아가 '다음'이 안 먹는 것처럼 보였음)
      if (runningRef.current) return;
      try { firstRunRef.current = localStorage.getItem(TUTORIAL_DONE_KEY) !== '1'; } catch { firstRunRef.current = false; }
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
  }, []);

  const finish = useCallback((completed = false) => {
    clearDemo();
    try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch {}
    setRunning(false);
    setRect(null);
    onCloseSettings?.();
    onTabChange(originalTabRef.current === 'recommend' ? 'summary' : originalTabRef.current);
    // 처음 둘러보기를 끝까지 봤으면 '더 알아볼까요?' (아이폰은 앱 설치 안내부터)
    if (completed && firstRunRef.current) window.setTimeout(() => openSetupGuide(undefined, 'after-tour'), 450);
    firstRunRef.current = false;
  }, [clearDemo, onTabChange, onCloseSettings]);

  const next = useCallback(() => {
    clearDemo();
    setIndex((i) => {
      if (i >= STEPS.length - 1) { window.setTimeout(() => finish(true), 0); return i; }
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
    setActionDone(false);
    setSettling(true);
    const settle = window.setTimeout(() => setSettling(false), 650);
    demoTimers.current.push(settle as unknown as number);
    if (step.closeSettings) onCloseSettings?.();
    if (step.tab) onTabChange(step.tab);
    step.action?.reset?.();
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
      if (step.scrollIntoView) {
        // 설정 패널 안쪽처럼 따로 스크롤되는 상자: 그 상자 안에서 가운데로
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const again = window.setTimeout(() => { if (!cancelled) (findTarget(step, isMobile) || el).scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 500);
        demoTimers.current.push(again as unknown as number);
        return;
      }
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
    };
    const t = window.setTimeout(locate, 120);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [running, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 직접 해 보는 단계: 조건이 맞으면 잠깐 칭찬 후 다음 설명으로 ──
  useEffect(() => {
    if (!running || !step.action) return;
    let fired = false;
    const id = window.setInterval(() => {
      if (fired) return;
      if (step.action!.done({ activeTab: activeTabRef.current })) {
        fired = true;
        setActionDone(true);
        window.setTimeout(() => setIndex((i) => (STEPS[i]?.id === step.id ? Math.min(i + 1, STEPS.length - 1) : i)), 650);
      }
    }, 120);
    return () => window.clearInterval(id);
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
      if (e.key === 'Escape') finish(false);
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

  const isAction = Boolean(step.action);
  const nudge = () => {
    setNudgeKey((k) => k + 1);
  };
  // 직접 해 보는 단계: 강조된 구멍 밖만 막고(누르면 말풍선이 살짝 흔들림), 구멍 안은 실제 화면을 누를 수 있음
  const blockers = isAction && rect
    ? [
        { left: 0, top: 0, width: vp.w, height: Math.max(0, rect.y) },
        { left: 0, top: rect.y + rect.h, width: vp.w, height: Math.max(0, vp.h - rect.y - rect.h) },
        { left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h },
        { left: rect.x + rect.w, top: rect.y, width: Math.max(0, vp.w - rect.x - rect.w), height: rect.h },
      ]
    : null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[400] select-none pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="사이트 둘러보기"
    >
      {blockers ? (
        blockers.map((b, i) => (
          <div key={i} className="absolute pointer-events-auto" style={{ ...b, touchAction: 'none' }} onClick={nudge} />
        ))
      ) : (
        <div className="absolute inset-0 pointer-events-auto" style={{ touchAction: 'none' }} onClick={next} />
      )}
      {/* 어둡게 덮고 대상 부분만 뚫기 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" width={vp.w} height={vp.h} aria-hidden="true">
        <defs>
          <mask id="tutorial-hole">
            <rect x="0" y="0" width={vp.w} height={vp.h} fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h, rx: rect.r }}
                transition={settling ? SPRING : { duration: 0 }}
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
          transition={settling ? SPRING : { duration: 0 }}
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
        className="absolute pointer-events-auto"
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
          <motion.div key={`nudge-${nudgeKey}`} initial={{ x: 0 }} animate={nudgeKey > 0 ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
          <div className="rounded-[22px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 p-5">
            {centered && (
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 tabular-nums">{index + 1} / {total}</p>
              <button type="button" onClick={() => finish(false)} className="-mt-2 -mr-2 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="둘러보기 닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="mt-0.5 text-base sm:text-lg font-extrabold leading-snug break-keep">{step.title}</h3>
            {step.body && <p className="mt-1.5 text-[13px] sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line break-keep">{step.body}</p>}
            {step.extra && (
              <button type="button" onClick={step.extra.onClick} className="mt-3 w-full h-10 rounded-xl bg-purple-600/10 dark:bg-purple-400/15 text-purple-700 dark:text-purple-200 text-[13px] font-bold cursor-pointer active:scale-[0.98] transition">
                {step.extra.label}
              </button>
            )}
            {step.action && (
              <div className={`mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-colors ${actionDone ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'}`}>
                {actionDone ? <Check className="w-4 h-4 shrink-0" /> : <Pointer className="w-4 h-4 shrink-0 animate-bounce" />}
                <span className="break-keep">{actionDone ? '잘했어요!' : step.action.hint}</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span />
              <div className="flex items-center gap-2">
                {index > 0 && index < total - 1 && (
                  <button type="button" onClick={prev} className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    이전
                  </button>
                )}
                <button type="button" onClick={index < total - 1 ? next : () => finish(true)} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${isAction ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
                  {index === 0 ? '둘러보기 시작' : isAction ? '넘어가기' : index < total - 1 ? '다음' : '시작하기'}
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
        </motion.div>
      </AnimatePresence>
      </div>
    </div>
  );
}
