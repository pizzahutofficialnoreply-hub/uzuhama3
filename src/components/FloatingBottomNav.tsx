import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  FileText, 
  Calendar as CalendarIcon, 
  BarChart2, 
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';

// iOS 키보드·Liquid Glass 처럼 살짝 감기며 멈추는 스프링 (감쇠비 약 0.86)
const KB_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1, restDelta: 0.5 };
import { Tab, SystemConfig, BroadcastLog } from '../types';
import { cn } from '../utils';
import { useTabGlass } from '../hooks/useTabGlass';

interface FloatingBottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isSettingsOpen: boolean;
  onCloseSettings?: () => void;
  system?: SystemConfig;
  logs?: Record<string, BroadcastLog>;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
}

// 탭바 및 검색창 고정 규격: 전체 가로길이 340px로 모든 모드에서 일치 (페이지 맨 끝까지 과도하게 움직이지 않도록 여백 확보)
const TAB_NAV_WIDTH = 268;
const FIXED_SLOT_WIDTH = (TAB_NAV_WIDTH - 8) / 3; // 86.666px

export function FloatingBottomNav({
  activeTab,
  onTabChange,
  isSettingsOpen,
  searchTerm,
  onSearchTermChange
}: FloatingBottomNavProps) {
  const tabGlass = useTabGlass();

  // 다크 모드 감지 (실시간 동기화)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('uzuhama-theme-changed', checkDark);
    return () => {
      observer.disconnect();
      window.removeEventListener('uzuhama-theme-changed', checkDark);
    };
  }, []);

  // 3개 기본 메뉴: 요약, 기록, 분석
  const navTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'summary', label: '요약', icon: FileText },
    { id: 'calendar', label: '기록', icon: CalendarIcon },
    { id: 'detailed', label: '분석', icon: BarChart2 },
  ];

  const lastStandardTabRef = useRef<Tab>('summary');
  useEffect(() => {
    if (activeTab !== 'recommend') {
      lastStandardTabRef.current = activeTab;
    }
  }, [activeTab]);

  const isSearchActive = activeTab === 'recommend';
  const inputRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);

  // 실시간 탭바 글래스모피즘 스타일 (설정 슬라이더 값에 따라 실시간 블러 및 투명도 반응)
  const glassStyle: React.CSSProperties = {
    WebkitBackdropFilter: `blur(${Math.max(20, tabGlass.config.blurPx)}px) saturate(180%)`,
    backdropFilter: `blur(${Math.max(20, tabGlass.config.blurPx)}px) saturate(180%)`,
    backgroundColor: isDark ? tabGlass.config.darkBg : tabGlass.config.lightBg,
    borderColor: isDark ? tabGlass.config.darkBorder : tabGlass.config.lightBorder,
  };

  // 키보드 상태: 사용자가 검색창을 직접 탭했을 때만 키보드가 활성화됨 (자동 포커스 금지)
  // isKeyboardUp 은 "버튼 접기/펼치기" 같은 부가 연출용이며, 도크 이동은 아래 transform 로직이 전담
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);

  // 탭바 하단 여백: 내비게이션 바와 간섭 없이 바로 위 높이까지 밀착 (하단 여백 살짝 축소)
  const defaultBottomStyle = 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 8px))';

  // 탭바 및 바닥으로 깔리는 정밀 점진적 블러 높이 (탭바를 포함하여 바닥까지 넉넉하고 자연스럽게 깔림)
  const defaultBlurHeight = 'calc(env(safe-area-inset-bottom, 0px) + 96px)';
  const defaultBlurMask = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 35%, rgba(0,0,0,0.45) 75%, transparent 100%)';

  // ── 키보드 연동 (iOS 식 스프링 움직임) ──
  // - 키보드가 올라오는 순간: 키보드 높이만큼 스프링으로 함께 올라감 (살짝 감기는 자연스러운 감속, 먼저 튀어 오르지 않음)
  //   왼쪽 버튼 접힘·검색창 늘어남도 같은 스프링으로 동시에
  // - 올라온 뒤: 높이는 고정. 스크롤로 화면(visualViewport)이 밀려도 그만큼 매 프레임 되돌려 키보드 바로 위에 붙어 있음
  // - 내려갈 때: 같은 스프링으로 함께 내려감
  // iOS: 레이아웃 뷰포트는 그대로이고 visualViewport 만 줄어듦 → 줄어든 만큼 도크를 위로 이동
  // Android(interactive-widget=resizes-content): 레이아웃 자체가 줄어 이동량 0 (fixed 도크가 자동으로 키보드 위)
  const isIOSDevice = typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const KB_GAP = 10;
  const appliedOffsetRef = useRef(0);
  const lockedKbRef = useRef(0);
  const keyboardUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kbY = useMotionValue(0); // 키보드 높이만큼 올라간 양 (스프링)
  const vvY = useMotionValue(0); // 스크롤로 밀린 화면 보정 (즉시)
  const dockY = useTransform(() => kbY.get() + vvY.get());

  const getDockBaseBottom = useCallback(() => {
    const el = dockRef.current;
    if (!el) return 0;
    return parseFloat(getComputedStyle(el).bottom) || 0;
  }, []);

  /** 도크와 하단 블러를 같은 양만큼 이동 */
  const setDockOffset = useCallback((kbHeight: number, animated: boolean) => {
    const kb = kbHeight > 40 ? kbHeight : 0;
    const target = kb > 0 ? Math.max(0, kb + KB_GAP - getDockBaseBottom()) : 0;
    if (Math.abs(target - appliedOffsetRef.current) < 1) return;
    appliedOffsetRef.current = target;
    if (animated) animate(kbY, -target, KB_SPRING);
    else kbY.jump(-target);
  }, [getDockBaseBottom, kbY]);

  /** 키보드 높이: 화면 높이 - 보이는 영역 높이 (스크롤 위치 offsetTop 은 별도로 보정) */
  const measureKeyboard = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return 0;
    return Math.max(0, Math.round(window.innerHeight - vv.height));
  }, []);

  /** 키보드가 떠 있는 동안 스크롤로 보이는 영역이 밀린 만큼(offsetTop) 도크를 되돌림 → 딸려 올라가지 않음 */
  const syncViewportShift = useCallback(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const shift = vv && lockedKbRef.current > 0 ? Math.max(0, vv.offsetTop) : 0;
    if (Math.abs(shift - vvY.get()) >= 0.5) vvY.set(shift);
  }, [vvY]);

  const syncKeyboard = useCallback(() => {
    if (document.activeElement !== inputRef.current) return;
    const kb = measureKeyboard();
    if (kb <= 40) return; // 아직 안 올라왔거나(올라오는 신호 대기) Android
    if (Math.abs(kb - lockedKbRef.current) < 4) return;
    lockedKbRef.current = kb;
    setDockOffset(kb, true);
    syncViewportShift();
    // 검색창이 옆으로 늘어나는 것(왼쪽 버튼 접힘)도 올라가는 순간 같은 곡선으로 동시에
    if (keyboardUpTimerRef.current) clearTimeout(keyboardUpTimerRef.current);
    setIsKeyboardUp(true);
  }, [measureKeyboard, setDockOffset, syncViewportShift]);

  useEffect(() => {
    if (!isSearchActive || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    // 손가락으로 스크롤하는 동안엔 매 프레임 보정 (이벤트만 기다리면 한 박자 늦게 따라와 흔들림)
    let raf = 0;
    let until = 0;
    const loop = () => {
      syncViewportShift();
      raf = performance.now() < until ? requestAnimationFrame(loop) : 0;
    };
    const kick = (ms: number) => {
      until = Math.max(until, performance.now() + ms);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onTouchStart = () => kick(60000);
    const onTouchEnd = () => { until = performance.now() + 1200; kick(1200); }; // 관성 스크롤까지
    const onShift = () => { syncViewportShift(); kick(300); };
    vv.addEventListener('resize', syncKeyboard);
    vv.addEventListener('scroll', onShift);
    window.addEventListener('scroll', onShift, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      vv.removeEventListener('resize', syncKeyboard);
      vv.removeEventListener('scroll', onShift);
      window.removeEventListener('scroll', onShift);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isSearchActive, syncKeyboard, syncViewportShift]);

  const resetKeyboardState = useCallback((animated = true) => {
    if (keyboardUpTimerRef.current) clearTimeout(keyboardUpTimerRef.current);
    lockedKbRef.current = 0;
    setIsKeyboardUp(false);
    vvY.set(0);
    setDockOffset(0, animated);
  }, [setDockOffset, vvY]);

  // 검색 모드 해제 시 키보드 상태 및 위치 초기화
  useEffect(() => {
    if (!isSearchActive) resetKeyboardState(false);
  }, [isSearchActive, resetKeyboardState]);

  // iOS: 입력창을 탭할 때 페이지가 위로 밀려 올라갔다 내려오는 기본 스크롤을 막고 직접 포커스
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !isIOSDevice) return;
    const onTouchEnd = (e: TouchEvent) => {
      if (document.activeElement === el) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
    };
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => el.removeEventListener('touchend', onTouchEnd);
  }, [isSearchActive, isIOSDevice]);

  const handleSearchFocus = () => {
    // 이미 키보드가 떠 있는 경우(다른 입력창에서 넘어옴)엔 바로 맞추고, 아니면 resize 신호를 기다림
    syncKeyboard();
    // 키보드 resize 신호가 늦게 오는 기기 대비: 짧게 몇 번 더 확인
    [120, 280, 520].forEach((ms) => setTimeout(syncKeyboard, ms));
    // 키보드 높이를 알 수 없는 기기(Android 등): 포커스 직후 바로 늘림
    if (keyboardUpTimerRef.current) clearTimeout(keyboardUpTimerRef.current);
    keyboardUpTimerRef.current = setTimeout(() => setIsKeyboardUp(true), 600);
  };

  const handleSearchBlur = () => {
    setTimeout(() => {
      if (document.activeElement !== inputRef.current) resetKeyboardState(true);
    }, 60);
  };

  const handleReturnFromSearch = () => {
    inputRef.current?.blur();
    resetKeyboardState();
    onTabChange(lastStandardTabRef.current || 'summary');
  };

  // 이전 활성 탭의 아이콘
  const getTabIcon = (tabId: Tab) => {
    switch (tabId) {
      case 'summary':
        return FileText;
      case 'calendar':
        return CalendarIcon;
      case 'detailed':
        return BarChart2;
      default:
        return FileText;
    }
  };
  const PrevTabIcon = getTabIcon(lastStandardTabRef.current || 'summary');

  // ==========================================
  // [회색 원 드래그 및 끊김 없는 GPU 모션 엔진]
  // ==========================================
  const effectiveTab = activeTab === 'recommend' ? (lastStandardTabRef.current || 'summary') : activeTab;
  const activeIndex = effectiveTab === 'summary' ? 0 : effectiveTab === 'calendar' ? 1 : effectiveTab === 'detailed' ? 2 : 0;

  const navRef = useRef<HTMLElement>(null);
  const [slotWidth, setSlotWidth] = useState(FIXED_SLOT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const pillX = useMotionValue(activeIndex * FIXED_SLOT_WIDTH);

  const measureSlot = useCallback(() => {
    if (navRef.current) {
      const innerWidth = navRef.current.clientWidth - 8;
      if (innerWidth > 60) {
        const newSlot = innerWidth / 3;
        setSlotWidth(prev => Math.abs(prev - newSlot) > 0.5 ? newSlot : prev);
      }
    }
  }, []);

  useEffect(() => {
    measureSlot();
    window.addEventListener('resize', measureSlot);
    return () => window.removeEventListener('resize', measureSlot);
  }, [measureSlot, isSearchActive]);

  const isFirstMountRef = useRef(true);
  useEffect(() => {
    isFirstMountRef.current = false;
  }, []);

  // 활성 탭 인덱스 또는 슬롯 폭 변경 시 부드럽게 글라이딩 이동
  useEffect(() => {
    if (slotWidth > 0 && !isDragging) {
      animate(pillX, activeIndex * slotWidth, {
        type: "spring",
        stiffness: 520,
        damping: 40,
        mass: 0.7
      });
    }
  }, [activeIndex, slotWidth, isDragging, pillX]);

  return (
    <>
      {/* 탭바 밑 화면 하단 고정 페이드 블러 레이어: 탭바 중후반부부터 바닥으로 자연스럽게 깔림 */}
      {!isSettingsOpen && (
        <motion.div 
          ref={blurRef}
          aria-hidden="true"
          style={{
            y: dockY,
            bottom: '0px',
            height: defaultBlurHeight,
            WebkitBackdropFilter: `blur(${Math.max(16, tabGlass.config.blurPx)}px)`,
            backdropFilter: `blur(${Math.max(16, tabGlass.config.blurPx)}px)`,
            WebkitMaskImage: defaultBlurMask,
            maskImage: defaultBlurMask,
            background: isDark
              ? `linear-gradient(to top, ${tabGlass.config.bottomFadeDark}, transparent)`
              : `linear-gradient(to top, ${tabGlass.config.bottomFadeLight}, transparent)`,
          }}
          className="sm:hidden fixed inset-x-0 pointer-events-none z-40 transition-opacity duration-200 opacity-100 rounded-t-2xl overflow-hidden backdrop-blur-xl"
        />
      )}

      {/* Floating Bottom Nav Container: px-2로 안정적인 여백 유지 */}
      {!isSettingsOpen && (
        <motion.div 
          ref={dockRef}
          id="floating-bottom-dock"
          style={{
            y: dockY,
            bottom: defaultBottomStyle,
          }}
          className="sm:hidden fixed inset-x-0 z-50 flex items-center justify-center pointer-events-none px-2 select-none"
        >
          {/* 플로팅 바 래퍼: 키보드가 올라오면 자연스럽게 확장되며 시원하게 늘어나는 레이아웃 */}
          <div className={cn(
            "flex items-center justify-center pointer-events-auto w-full relative",
            "max-w-[348px]"
          )}>
            <AnimatePresence mode="popLayout" initial={false}>
              {!isSearchActive ? (
                // ==========================================
                // [기본 상태: 3개 탭 탭바 + 우측 검색 플로팅 버튼]
                // 유기적 액체 유리: 실시간 투명 블러가 살아있는 반투명 프로스트 글래스
                // ==========================================
                <motion.div
                  key="standard-tab-dock"
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ type: "spring", stiffness: 280, damping: 23, mass: 0.75 }}
                  className="flex items-center gap-2 w-full justify-between"
                >
                  {/* 3개 탭 캡슐 네비게이션: 실시간 블러 적용 반투명 글래스 */}
                  <nav 
                    ref={navRef}
                    aria-label="하단 네비게이션"
                    style={glassStyle}
                    className={cn(
                      "relative w-[268px] flex items-center h-[64px] p-1 rounded-full select-none touch-manipulation shrink-0 border backdrop-blur-xl",
                      "shadow-[0_10px_32px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    )}
                  >
                    {/* 단일 GPU 가속 회색 원 인디케이터 */}
                    <motion.div
                      drag="x"
                      dragConstraints={{ left: 0, right: slotWidth * 2 }}
                      dragElastic={0.08}
                      dragMomentum={false}
                      style={{
                        x: pillX,
                        width: slotWidth,
                      }}
                      onDragStart={() => {
                        setIsDragging(true);
                        isDraggingRef.current = true;
                      }}
                      onDragEnd={() => {
                        const currentX = pillX.get();
                        const targetIndex = Math.min(2, Math.max(0, Math.round(currentX / slotWidth)));
                        const targetTab = navTabs[targetIndex].id;
                        
                        animate(pillX, targetIndex * slotWidth, {
                          type: "spring",
                          stiffness: 520,
                          damping: 40,
                          mass: 0.7
                        });
                        
                        onTabChange(targetTab);

                        setTimeout(() => {
                          setIsDragging(false);
                          isDraggingRef.current = false;
                        }, 60);
                      }}
                      className="absolute top-1 bottom-1 left-1 rounded-full bg-zinc-200/90 dark:bg-white/20 dark:border dark:border-white/10 shadow-xs cursor-grab active:cursor-grabbing z-10 touch-none"
                    />

                    {/* 3개 탭 버튼들 */}
                    {navTabs.map((tab) => {
                      const isActive = effectiveTab === tab.id;
                      const Icon = tab.icon;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            if (!isDraggingRef.current) {
                              onTabChange(tab.id);
                            }
                          }}
                          className={cn(
                            "relative z-20 flex-1 flex flex-col items-center justify-center h-full rounded-full touch-manipulation cursor-pointer select-none active:scale-95 outline-none focus:outline-none ring-0 border-0 p-0",
                            isActive
                              ? "dark:text-white text-zinc-950 font-bold"
                              : "dark:text-zinc-400 dark:hover:text-zinc-200 text-zinc-500 hover:text-zinc-900 font-medium"
                          )}
                          title={tab.label}
                        >
                          <div className="flex flex-col items-center justify-center pointer-events-none">
                            <Icon className={cn("w-5.5 h-5.5", isActive ? "scale-105" : "scale-100")} />
                            <span className="text-[11.5px] font-bold tracking-tight mt-0.5">
                              {tab.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </nav>

                  {/* 우측 분리된 독립 검색 플로팅 원형 버튼 (64px) */}
                  <button
                    type="button"
                    onClick={() => {
                      onTabChange('recommend');
                    }}
                    aria-label="영상 검색 및 추천"
                    style={glassStyle}
                    className={cn(
                      "relative flex items-center justify-center w-[64px] h-[64px] rounded-full active:scale-95 duration-150 touch-manipulation cursor-pointer select-none outline-none focus:outline-none ring-0 shrink-0 border backdrop-blur-xl",
                      "shadow-[0_10px_32px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    )}
                    title="영상 검색"
                  >
                    <Search className="w-6 h-6 stroke-[2.3] text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white" />
                  </button>
                </motion.div>
              ) : (
                // ==========================================
                // [검색창 모드: 키보드 나오며 시원하게 늘어나는 스프링 애니메이션]
                // ==========================================
                <motion.div
                  key="search-mode-dock"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ type: "spring", stiffness: 280, damping: 23, mass: 0.75 }}
                  className="w-full flex items-center gap-2"
                >
                  {/* 좌측 이전 탭 복귀 원형 버튼 (48px) - 키보드 등장 시 자연스럽게 0으로 수축 */}
                  <motion.button
                    type="button"
                    onClick={handleReturnFromSearch}
                    aria-label="이전 탭으로 돌아가기"
                    initial={false}
                    animate={isKeyboardUp ? {
                      width: 0,
                      opacity: 0,
                      scale: 0.6,
                      marginRight: -8,
                      pointerEvents: 'none'
                    } : {
                      width: 48,
                      opacity: 1,
                      scale: 1,
                      marginRight: 0,
                      pointerEvents: 'auto'
                    }}
                    transition={KB_SPRING}
                    style={glassStyle}
                    className={cn(
                      "relative flex items-center justify-center h-[48px] rounded-full active:scale-95 touch-manipulation cursor-pointer select-none outline-none focus:outline-none ring-0 shrink-0 overflow-hidden border",
                      "shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    )}
                    title="이전 탭으로 돌아가기"
                  >
                    <PrevTabIcon className="w-5 h-5 stroke-[2.3] shrink-0 text-zinc-700 dark:text-zinc-200" />
                  </motion.button>

                  {/* 단일 지속형 중앙 검색창: 키보드가 올라올 때 시원하게 좌우로 길어지는 스프링 애니메이션 */}
                  <motion.div
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                    style={glassStyle}
                    className={cn(
                      "relative flex items-center h-[48px] px-3.5 rounded-full flex-1 min-w-0 border",
                      "shadow-[0_10px_32px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    )}
                  >
                    <Search className="w-4 h-4 shrink-0 ml-0.5 text-zinc-500 dark:text-zinc-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      name="search_query"
                      inputMode="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-form-type="other"
                      value={searchTerm || ''}
                      onFocus={handleSearchFocus}
                      onBlur={handleSearchBlur}
                      onChange={(e) => onSearchTermChange?.(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const term = (searchTerm || '').trim();
                          if (term.length >= 2) {
                            try {
                              const saved = JSON.parse(localStorage.getItem('uzuhama_recent_searches') || '[]');
                              const next = [term, ...saved.filter((s: string) => s.toLowerCase() !== term.toLowerCase())].slice(0, 10);
                              localStorage.setItem('uzuhama_recent_searches', JSON.stringify(next));
                            } catch {}
                          }
                          inputRef.current?.blur();
                        }
                      }}
                      placeholder="영상 및 방송 검색..."
                      className="w-full bg-transparent px-2.5 py-1 text-[16px] text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none border-0 font-medium select-text font-hanna font-pro placeholder:font-hanna placeholder:font-pro"
                    />
                    {Boolean(searchTerm) && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSearchTermChange?.('');
                          inputRef.current?.focus({ preventScroll: true });
                        }}
                        className="w-4.5 h-4.5 rounded-full bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500 text-zinc-700 dark:text-zinc-200 flex items-center justify-center mr-0.5 transition-colors cursor-pointer shrink-0"
                        title="검색어 지우기"
                      >
                        <X className="w-3 h-3 stroke-[2.2]" />
                      </button>
                    )}
                  </motion.div>

                  {/* 우측 원형 닫기 (X) 버튼 (48px) */}
                  <motion.button
                    type="button"
                    onClick={handleReturnFromSearch}
                    aria-label="검색 닫기"
                    style={glassStyle}
                    className={cn(
                      "relative flex items-center justify-center w-[48px] h-[48px] rounded-full active:scale-95 duration-150 touch-manipulation cursor-pointer select-none outline-none focus:outline-none ring-0 shrink-0 border",
                      "shadow-[0_8px_24px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    )}
                    title="검색 닫기"
                  >
                    <X className="w-5 h-5 stroke-[2.3] text-zinc-700 dark:text-zinc-200" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </>
  );
}
