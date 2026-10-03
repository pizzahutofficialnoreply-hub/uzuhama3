import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  FileText, 
  Calendar as CalendarIcon, 
  BarChart2, 
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
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
  const scrollYBeforeFocusRef = useRef(0);
  const isSuppressingBrowserScrollRef = useRef(false);

  const recordScrollBeforeFocus = useCallback(() => {
    if (typeof window !== 'undefined') {
      scrollYBeforeFocusRef.current = window.pageYOffset || document.documentElement.scrollTop || 0;
    }
  }, []);

  // 실시간 탭바 글래스모피즘 스타일 (설정 슬라이더 값에 따라 실시간 블러 및 투명도 반응)
  const glassStyle: React.CSSProperties = {
    WebkitBackdropFilter: `blur(${tabGlass.config.blurPx}px) saturate(180%)`,
    backdropFilter: `blur(${tabGlass.config.blurPx}px) saturate(180%)`,
    backgroundColor: isDark ? tabGlass.config.darkBg : tabGlass.config.lightBg,
    borderColor: isDark ? tabGlass.config.darkBorder : tabGlass.config.lightBorder,
  };

  // 키보드 상태: 사용자가 검색창을 직접 탭했을 때만 키보드가 활성화됨 (자동 포커스 금지)
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);

  // 탭바 하단 여백: 내비게이션 바와 간섭 없이 바로 위 높이까지 밀착
  const defaultBottomStyle = 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 2px))';

  // 키보드 위치 동기화: 키보드 올리고 내릴 때 실제 키보드 움직임에 맞춰 부드럽게 연동 (여백 10px)
  const applyDockPosition = useCallback((kbHeight: number, isRealtimeTracking = false) => {
    // 키보드 등장/퇴장 시의 트랜지션
    const transitionStr = isRealtimeTracking
      ? 'bottom 0.14s ease-out'
      : 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
    if (dockRef.current) {
      dockRef.current.style.transition = transitionStr;
      if (kbHeight > 40) {
        dockRef.current.style.bottom = `${kbHeight + 10}px`;
      } else {
        dockRef.current.style.bottom = defaultBottomStyle;
      }
    }
    if (blurRef.current) {
      blurRef.current.style.transition = isRealtimeTracking
        ? 'bottom 0.14s ease-out, height 0.14s ease-out'
        : 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1), height 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
      if (kbHeight > 40) {
        // 키보드 아래 영역(0px)부터 시작하여 검색창 위쪽(+84px)까지 여유있고 자연스럽게 페이드 블러
        blurRef.current.style.bottom = '0px';
        blurRef.current.style.height = `${kbHeight + 84}px`;
        const solidTop = kbHeight + 15;
        const fadeTop = kbHeight + 84;
        blurRef.current.style.webkitMaskImage = `linear-gradient(to top, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${solidTop}px, rgba(0,0,0,0.5) ${kbHeight + 50}px, transparent ${fadeTop}px)`;
        blurRef.current.style.maskImage = `linear-gradient(to top, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${solidTop}px, rgba(0,0,0,0.5) ${kbHeight + 50}px, transparent ${fadeTop}px)`;
        blurRef.current.style.background = isDark
          ? `linear-gradient(to top, ${tabGlass.config.bottomFadeDark} 0px, ${tabGlass.config.bottomFadeDark} ${solidTop}px, transparent ${fadeTop}px)`
          : `linear-gradient(to top, ${tabGlass.config.bottomFadeLight} 0px, ${tabGlass.config.bottomFadeLight} ${solidTop}px, transparent ${fadeTop}px)`;
      } else {
        blurRef.current.style.bottom = '0px';
        blurRef.current.style.height = 'calc(env(safe-area-inset-bottom, 0px) + 84px)';
        blurRef.current.style.webkitMaskImage = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.3) 70%, transparent 100%)';
        blurRef.current.style.maskImage = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.3) 70%, transparent 100%)';
        blurRef.current.style.background = isDark
          ? `linear-gradient(to top, ${tabGlass.config.bottomFadeDark}, transparent)`
          : `linear-gradient(to top, ${tabGlass.config.bottomFadeLight}, transparent)`;
      }
    }
  }, [defaultBottomStyle, isDark, tabGlass.config]);

  const updateKeyboardOffset = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isSearchActive) {
      applyDockPosition(0);
      setIsKeyboardUp(false);
      return;
    }
    if (!window.visualViewport) return;

    const vv = window.visualViewport;
    const keyboardHeight = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    const offset = keyboardHeight > 40 ? keyboardHeight : 0;
    
    // 키보드 실제 높이에 따라 상승 애니메이션 적용 (키보드에 따라 이동)
    applyDockPosition(offset, true);

    if (offset > 40) {
      setIsKeyboardUp(true);
    } else if (document.activeElement !== inputRef.current) {
      setIsKeyboardUp(false);
    }
  }, [isSearchActive, applyDockPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleViewportChange = () => {
      updateKeyboardOffset();
      if (isSuppressingBrowserScrollRef.current) {
        const savedY = scrollYBeforeFocusRef.current;
        const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (Math.abs(currentY - savedY) > 1) {
          window.scrollTo({ top: savedY, left: 0, behavior: 'instant' as ScrollBehavior });
          if (document.documentElement) document.documentElement.scrollTop = savedY;
          if (document.body) document.body.scrollTop = savedY;
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
      updateKeyboardOffset();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, [isSearchActive, updateKeyboardOffset]);

  // 검색 모드 해제 시 키보드 상태 및 위치 초기화 (자동 포커스 금지: 사용자가 원할 때만 입력창 탭)
  useEffect(() => {
    if (!isSearchActive) {
      setIsKeyboardUp(false);
      applyDockPosition(0);
    }
  }, [isSearchActive, applyDockPosition]);

  const handleReturnFromSearch = () => {
    inputRef.current?.blur();
    setIsKeyboardUp(false);
    applyDockPosition(0);
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
      {/* 탭바 밑 화면 하단 고정 페이드 블러 레이어: 불투명하지 않고 뒤 배경이 실시간 블러되도록 반투명 농도 조절 */}
      {!isSettingsOpen && (
        <div 
          ref={blurRef}
          aria-hidden="true"
          style={{
            bottom: '0px',
            height: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
            WebkitBackdropFilter: `blur(${Math.max(12, tabGlass.config.blurPx - 4)}px)`,
            backdropFilter: `blur(${Math.max(12, tabGlass.config.blurPx - 4)}px)`,
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.3) 70%, transparent 100%)',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.3) 70%, transparent 100%)',
            background: isDark
              ? `linear-gradient(to top, ${tabGlass.config.bottomFadeDark}, transparent)`
              : `linear-gradient(to top, ${tabGlass.config.bottomFadeLight}, transparent)`,
          }}
          className="sm:hidden fixed inset-x-0 pointer-events-none z-40 transition-opacity duration-200 opacity-100"
        />
      )}

      {/* Floating Bottom Nav Container: px-2로 안정적인 여백 유지 */}
      {!isSettingsOpen && (
        <div 
          ref={dockRef}
          id="floating-bottom-dock"
          style={{
            bottom: defaultBottomStyle,
          }}
          className="sm:hidden fixed inset-x-0 z-50 flex items-center justify-center pointer-events-none px-2 select-none"
        >
          {/* 플로팅 바 래퍼: 키보드가 올라오면 자연스럽게 확장되며 시원하게 늘어나는 레이아웃 */}
          <div className={cn(
            "flex items-center justify-center pointer-events-auto w-full transition-all duration-300 relative",
            isKeyboardUp ? "max-w-[356px]" : "max-w-[340px]"
          )}>
            <AnimatePresence mode="popLayout" initial={false}>
              {!isSearchActive ? (
                // ==========================================
                // [기본 상태: 3개 탭 탭바 + 우측 검색 플로팅 버튼]
                // 유기적 액체 유리: 실시간 투명 블러가 살아있는 반투명 프로스트 글래스
                // ==========================================
                <motion.div
                  key="standard-tab-dock"
                  initial={{ opacity: 0, x: -60, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -60, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 280, damping: 23, mass: 0.75 }}
                  className="flex items-center gap-2 w-full justify-between"
                >
                  {/* 3개 탭 캡슐 네비게이션: 실시간 블러 적용 반투명 글래스 */}
                  <nav 
                    ref={navRef}
                    aria-label="하단 네비게이션"
                    style={glassStyle}
                    className={cn(
                      "relative w-[268px] flex items-center h-[64px] p-1 rounded-full select-none touch-manipulation shrink-0 border",
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
                      "relative flex items-center justify-center w-[64px] h-[64px] rounded-full active:scale-95 duration-150 touch-manipulation cursor-pointer select-none outline-none focus:outline-none ring-0 shrink-0 border",
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
                  initial={{ opacity: 0, x: 60, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 60, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 280, damping: 23, mass: 0.75 }}
                  className="w-full flex items-center gap-2"
                >
                  {/* 좌측 이전 탭 복귀 원형 버튼 (48px) - 키보드 등장 시 자연스럽게 0으로 수축 */}
                  <motion.button
                    layout
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
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
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
                    layout
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
                      onTouchStart={recordScrollBeforeFocus}
                      onPointerDown={recordScrollBeforeFocus}
                      onMouseDown={recordScrollBeforeFocus}
                      onFocus={() => {
                        setIsKeyboardUp(true);
                        recordScrollBeforeFocus();
                        const targetY = scrollYBeforeFocusRef.current;
                        isSuppressingBrowserScrollRef.current = true;

                        let stopped = false;
                        const stopSuppression = () => {
                          if (stopped) return;
                          stopped = true;
                          isSuppressingBrowserScrollRef.current = false;
                        };

                        // 사용자가 화면을 직접 스크롤하면 즉시 자동 스크롤 억제를 해제하여 자유로운 수동 스크롤 보장
                        window.addEventListener('touchmove', stopSuppression, { once: true, passive: true });
                        window.addEventListener('wheel', stopSuppression, { once: true, passive: true });

                        const holdScroll = () => {
                          if (stopped) return;
                          const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
                          if (Math.abs(currentY - targetY) > 1) {
                            window.scrollTo({ top: targetY, left: 0, behavior: 'instant' as ScrollBehavior });
                            if (document.documentElement) document.documentElement.scrollTop = targetY;
                            if (document.body) document.body.scrollTop = targetY;
                          }
                        };

                        // 브라우저의 키보드 팝업 시 강제 자동 스크롤(화면이 밑으로 밀려 내려가는 현상)을 완벽 억제
                        const rafId = requestAnimationFrame(holdScroll);
                        const t1 = setTimeout(holdScroll, 15);
                        const t2 = setTimeout(holdScroll, 45);
                        const t3 = setTimeout(holdScroll, 90);
                        const t4 = setTimeout(holdScroll, 150);
                        const t5 = setTimeout(holdScroll, 240);
                        const t6 = setTimeout(holdScroll, 350);

                        setTimeout(() => {
                          stopSuppression();
                          window.removeEventListener('touchmove', stopSuppression);
                          window.removeEventListener('wheel', stopSuppression);
                          cancelAnimationFrame(rafId);
                          clearTimeout(t1);
                          clearTimeout(t2);
                          clearTimeout(t3);
                          clearTimeout(t4);
                          clearTimeout(t5);
                          clearTimeout(t6);
                        }, 400);
                      }}
                      onBlur={() => {
                        isSuppressingBrowserScrollRef.current = false;
                        setTimeout(() => {
                          if (document.activeElement !== inputRef.current) {
                            setIsKeyboardUp(false);
                            applyDockPosition(0);
                          }
                        }, 80);
                      }}
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
                      className="w-full bg-transparent px-2.5 py-1 text-[16px] text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none border-0 font-medium select-text"
                    />
                    {Boolean(searchTerm) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSearchTermChange?.('');
                          recordScrollBeforeFocus();
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
                    layout
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
        </div>
      )}
    </>
  );
}
