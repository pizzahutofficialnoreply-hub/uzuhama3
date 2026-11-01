/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Tv, BarChart2, Calendar as CalendarIcon, FileText, Lock, X, PlaySquare, ExternalLink, AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { checkMaintenanceStatus, generateMaintenanceNoticeMarkdown, formatMaintenanceRange, parseDateSafe } from './utils/maintenanceUtils';
import { useFirebaseData } from './hooks/useFirebaseData';
import { SummaryTab } from './components/tabs/SummaryTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { DetailedStatsTab } from './components/tabs/DetailedStatsTab';
import { RecommendTab } from './components/tabs/RecommendTab';
import { NoticeModal } from './components/NoticeModal';
import { NoticeBanner } from './components/NoticeBanner';
import { FeedbackModal } from './components/FeedbackModal';
import { PolicyModal } from './components/PolicyModal';
import { TermsRevisionModal } from './components/TermsRevisionModal';
import { FloatingBottomNav } from './components/FloatingBottomNav';
import { CurrentProbability } from './components/CurrentProbability';
import { LoadingScreen } from './components/LoadingScreen';
import { cn, useBodyScrollLock, resetBodyScrollLock } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Tab, NoticeLink } from './types';
import { applyTabGlassCssVars, getSavedTabGlassValue } from './utils/tabGlass';
import { RichTextRenderer } from './components/common/RichTextRenderer';

export function formatNoticeText(text: string): React.ReactNode {
  if (!text) return null;
  return <RichTextRenderer content={text} />;
}

import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRealtimeNotification } from './hooks/useRealtimeNotification';
import { Download, LogIn, ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { SettingsView } from './components/SettingsView';
import { Tutorial, TUTORIAL_START_EVENT } from './components/Tutorial';

// 별도 페이지(관리자·패치노트·약관·라이선스)는 들어갈 때만 불러옴 → 메인 화면 첫 로딩 가볍게
const AdminRoute = lazy(() => import('./components/AdminRoute').then((m) => ({ default: m.AdminRoute })));
const PatchNotesPage = lazy(() => import('./components/PatchNotesPage').then((m) => ({ default: m.PatchNotesPage })));
const PolicyPage = lazy(() => import('./components/PolicyPage').then((m) => ({ default: m.PolicyPage })));
const LicensePage = lazy(() => import('./components/LicensePage').then((m) => ({ default: m.LicensePage })));
import { useAuth } from './hooks/useAuth';

function MainApp() {
  const navigate = useNavigate();
  const { data, loading, loadingProgress, loadingStatusText, isFirstRun, fetchLogsByDateRange, fetchLatestLogs, rateVideo } = useFirebaseData();
  const { isInstallable, promptInstall } = useInstallPrompt();
  const { user, loginWithGoogle, logout } = useAuth();
  const logsList = useMemo(() => Object.values(data?.logs || {}), [data?.logs]);
  useRealtimeNotification(logsList, data?.system); // 실시간 제보 심사 결과 및 최고 확률 안내 알림 수신 브릿지 활성화
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = (localStorage.getItem('uzuhama_active_tab') as Tab) || 'summary';
    // 검색 탭을 마지막으로 앱을 종료했으면 요약 탭에서 시작하도록 강제 리셋
    if (saved === 'recommend') {
      return 'summary';
    }
    return saved;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<'notification' | 'theme' | 'share' | 'channels' | 'disclaimer' | 'preface' | 'fontLicense' | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // 애플 기기 판별 (Apple 기기 제외 닫기 애니메이션 적용)
  const isAppleDevice = typeof window !== 'undefined' && 
    (/iPad|iPhone|iPod|Macintosh|Mac OS X/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isIOSStandalone = isAppleDevice && 
    (('standalone' in window.navigator && (window.navigator as any).standalone) || (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches));

  
  // PWA 및 브라우저 기본 뒤로가기 버튼 지원 (새 탭 없이 / 경로 유지)
  const openSettings = () => {
    setIsSettingsOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      if (window.history.state?.view !== 'settings') {
        window.history.pushState({ view: 'settings' }, '', window.location.pathname);
      }
    } catch {}
  };

  const closeSettings = (isFromPopEvent = false) => {
    setIsSettingsOpen(false);
    setShowFeedbackModal(false);
    setSettingsInitialSection(null);
    try {
      if (window.location.search.includes('settings')) {
        window.history.replaceState(null, '', '/');
      }
    } catch {}
    if (!isFromPopEvent) {
      try {
        if (window.history.state?.view === 'settings') {
          window.history.back();
        }
      } catch {}
    }
  };

  const openFeedback = () => {
    setShowFeedbackModal(true);
    try {
      window.history.pushState({ view: 'feedback' }, '', window.location.pathname);
    } catch {}
  };

  const closeFeedback = (isFromPopEvent = false) => {
    setShowFeedbackModal(false);
    if (!isFromPopEvent) {
      try {
        if (window.history.state?.view === 'feedback') {
          window.history.back();
        }
      } catch {}
    }
  };

  useEffect(() => {
    applyTabGlassCssVars(getSavedTabGlassValue());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('settings') === 'true') {
        setIsSettingsOpen(true);
        window.history.replaceState(null, '', '/');
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      // 기기 뒤로가기 버튼 또는 브라우저 뒤로가기
      // 1. 의견 보내기 모달이 열려있으면: 한 번 나가면 의견 보내기만 닫고 설정창 유지
      if (showFeedbackModal) {
        setShowFeedbackModal(false);
        return;
      }
      // 2. 설정창이 열려있으면: 한 번 더 나가면 설정창 닫고 메인으로
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isSettingsOpen, showFeedbackModal]);

  useEffect(() => {
    localStorage.setItem('uzuhama_active_tab', activeTab);
  }, [activeTab]);

  const [showNotice, setShowNotice] = useState(false);
  const [dismissedSystemNotice, setDismissedSystemNotice] = useState(() => {
    const seen = localStorage.getItem('notice_seen_v2');
    if (!seen) return false;
    const date = new Date(seen);
    const now = new Date();
    // 24시간 내 다시 보지 않기
    if (now.getTime() - date.getTime() < 24 * 60 * 60 * 1000) {
      return true;
    }
    return false;
  });
  const [currentProb, setCurrentProb] = useState<number | null>(null);
  const [isProbVisible, setIsProbVisible] = useState(true);
  
  const [hideSmallNotice, setHideSmallNotice] = useState(false);
  const [policyType, setPolicyType] = useState<'terms' | 'privacy' | null>(null);
  const [forceRender, setForceRender] = useState(0);

  // 모바일 전체화면 설정창이 열려있을 때만 배경 스크롤 차단
  useBodyScrollLock(isSettingsOpen && typeof window !== 'undefined' && window.innerWidth < 1024);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [recommendTargetCategory, setRecommendTargetCategory] = useState<string | null>(null);
  const [recommendTargetSearchTerm, setRecommendTargetSearchTerm] = useState<string | null>(null);
  const [recommendPinnedVideoId, setRecommendPinnedVideoId] = useState<string | null>(null);
  const [globalSearchTerm, setGlobalSearchTerm] = useState(() => {
    try {
      return sessionStorage.getItem('rec_searchTerm') || '';
    } catch {
      return '';
    }
  });

  const isAutoNavigatedRef = useRef<boolean>(false);
  const autoNavSourceTabRef = useRef<Tab | null>(null);

  const handleNavigateToCalendar = (dateStr: string) => {
    isAutoNavigatedRef.current = true;
    autoNavSourceTabRef.current = activeTab;
    setSelectedCalendarDate(dateStr);
    handleTabChange('calendar', false, true);
  };

  const handleNavigateToRecommend = (category?: string, searchTerm?: string, pinnedVideoId?: string) => {
    isAutoNavigatedRef.current = true;
    autoNavSourceTabRef.current = activeTab;
    if (category) setRecommendTargetCategory(category);
    if (searchTerm) {
      setRecommendTargetSearchTerm(searchTerm);
      setGlobalSearchTerm(searchTerm);
    }
    if (pinnedVideoId) {
      setRecommendPinnedVideoId(pinnedVideoId);
    }
    handleTabChange('recommend', false, true);
  };

  const probContainerRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const checkVisibility = () => {
      if (!probContainerRef.current) {
        setIsProbVisible(false);
        return;
      }
      const rect = probContainerRef.current.getBoundingClientRect();
      const isVisible = rect.bottom > 64 && rect.top < window.innerHeight;
      setIsProbVisible(isVisible);
    };

    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', checkVisibility, { passive: true });
    checkVisibility();
    const timer = setTimeout(checkVisibility, 100);

    return () => {
      window.removeEventListener('scroll', checkVisibility);
      window.removeEventListener('resize', checkVisibility);
      clearTimeout(timer);
    };
  }, [loading, activeTab, isSettingsOpen]);

  useEffect(() => {
    resetBodyScrollLock();
  }, []);

  // 점검 모드 시간 체크 (1초마다 갱신하여 시작/종료 시간에 도달하면 즉시 자동 시작 및 자동 종료)
  const [nowTime, setNowTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 탭별 스크롤 위치 기억 맵 (다른 탭 이동 시 기존 스크롤 위치 복원)
  const tabScrollPositions = useRef<Record<Tab, number>>({
    summary: 0,
    calendar: 0,
    detailed: 0,
    recommend: 0,
  });

  // 상단 헤더 스크롤 방향 및 자동 스크롤 오프셋 감지
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isNoticeExpanded, setIsNoticeExpanded] = useState(false);
  const lastScrollYRef = useRef(0);
  const autoScrollBaseYRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const autoScrollTimerRef = useRef<number | null>(null);

  // 사용자의 실제 물리적 조작(터치 스크롤, 마우스 휠, 키보드) 이벤트 감지
  useEffect(() => {
    const handleUserInteraction = () => {
      isUserInteractingRef.current = true;
      if (!isAutoScrollingRef.current) {
        autoScrollBaseYRef.current = window.pageYOffset || document.documentElement.scrollTop || 0;
      }
    };

    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('wheel', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('wheel', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  // 탭의 첫 번째 카드 시작점 Y 좌표 정밀 계산 (스크롤 양이 아닌 탭의 첫 번째 카드 시작점 기준 정렬)
  const computeTabContentStartY = (tab: Tab) => {
    if (typeof window === 'undefined') return 0;
    
    let targetEl: HTMLElement | null = null;
    if (tab === 'calendar') {
      targetEl = document.getElementById('calendar-main-card') || document.getElementById('calendar-tab-view');
    } else if (tab === 'detailed') {
      targetEl = document.getElementById('detailed-main-card') || document.getElementById('detailed-tab-view');
    } else if (tab === 'summary') {
      targetEl = document.getElementById('summary-weekly-trend-card') || document.getElementById('summary-tab-view');
    } else if (tab === 'recommend') {
      targetEl = document.getElementById('recommend-filter-card') || document.getElementById('recommend-tab-view');
    } else {
      targetEl = tabContentRef.current;
    }

    if (!targetEl) {
      targetEl = tabContentRef.current;
    }

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const cardAbsoluteTop = rect.top + currentY;

      let topStickyOffset = 0;
      if (isNoticeExpanded) {
        // 띠 공지 펼치기 상태: 제목 부분이 헤더 역할을 하므로 고정 제목 바(약 52px) + 여백 기준 정렬
        const pinnedBar = document.getElementById('pinned-notice-title-bar');
        const pinnedHeight = pinnedBar ? pinnedBar.offsetHeight : 52;
        topStickyOffset = pinnedHeight + 10;
      } else {
        // 띠 공지 접힘 상태: 상단 메인 헤더 + 접힌 공지 배너 + 여백
        const headerEl = document.getElementById('app-main-header');
        const bannerEl = document.getElementById('notice-banner-container');
        const headerHeight = headerEl ? headerEl.offsetHeight : 64;
        const bannerHeight = (bannerEl && tab !== 'recommend') ? bannerEl.offsetHeight : 0;
        topStickyOffset = headerHeight + bannerHeight + 10;
      }

      // 첫 번째 카드 시작점이 상단 바 바로 아래에 깔끔하게 시작되도록 정렬
      return Math.max(0, Math.round(cardAbsoluteTop - topStickyOffset));
    }
    return 0;
  };

  // 모바일 전용 탭 제목 위치 산출 (하위 호환)
  const computeMobileTabTitleY = () => {
    return computeTabContentStartY(activeTab);
  };

  // 스크롤 시 현재 탭의 스크롤 위치 실시간 기록 및 헤더 숨김/표시 처리
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      tabScrollPositions.current[activeTab] = currentScrollY;

      // 자동 스크롤 진행 중이거나 사용자가 직접 터치/휠 조작을 하지 않은 상태에서는 헤더 숨김 절대 제외 (스크롤 량에 불포함)
      if (isAutoScrollingRef.current || !isUserInteractingRef.current) {
        setIsHeaderHidden(false);
        lastScrollYRef.current = currentScrollY;
        autoScrollBaseYRef.current = currentScrollY;
        return;
      }

      const deltaY = currentScrollY - lastScrollYRef.current;

      // 최상단 근처에서는 항상 헤더 표시
      if (currentScrollY <= 15) {
        setIsHeaderHidden(false);
        autoScrollBaseYRef.current = 0;
      } else if (isSettingsOpen) {
        setIsHeaderHidden(false);
      } else {
        // 자동 스크롤 위치를 완전히 제외한 사용자의 순수 터치/휠 추가 스크롤 량(110px 초과)만 계산
        const effectiveScroll = currentScrollY - (autoScrollBaseYRef.current || 0);

        if (effectiveScroll > 110 && deltaY > 6) {
          // 아래로 스크롤 시 상단 바 사라짐 (위로 사라지는 애니메이션)
          setIsHeaderHidden(true);
        } else if (deltaY < -4) {
          // 위로 스크롤 시 다시 나타남
          setIsHeaderHidden(false);
        }
      }
      lastScrollYRef.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab, isSettingsOpen]);

  // 탭 전환 시 스크롤 위치 제어:
  // - 기록 탭 / 분석 탭 진입 시: 탭 내용 시작점으로 정밀 자동 스크롤
  // - 일반탭 <-> 일반탭: 부드러운 자동 스크롤 애니메이션 ('smooth')
  // - 검색탭 <-> 일반탭: 즉각 이동 및 애니메이션 없음 ('instant')
  const previousTabRef = useRef<Tab>(activeTab);
  const isFirstMountRef = useRef(true);

  useLayoutEffect(() => {
    const isFirstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;

    const previousTab = previousTabRef.current;
    previousTabRef.current = activeTab;

    if (isFirstMount) {
      return;
    }

    const isAutoNav = isAutoNavigatedRef.current;
    let targetY = 0;

    if (activeTab === 'recommend') {
      targetY = isAutoNav ? (tabScrollPositions.current['recommend'] || 0) : 0;
      tabScrollPositions.current['recommend'] = targetY;
    } else if (activeTab === 'calendar' || activeTab === 'detailed') {
      // 기록 탭 및 분석 탭: 탭 첫 번째 카드 시작점으로 정밀 자동 스크롤
      targetY = computeTabContentStartY(activeTab);
      tabScrollPositions.current[activeTab] = targetY;
      if (isNoticeExpanded) {
        setIsHeaderHidden(true);
      }
    } else {
      targetY = tabScrollPositions.current[activeTab] || 0;
    }

    autoScrollBaseYRef.current = targetY;
    lastScrollYRef.current = targetY;

    const isSearchTransition = previousTab === 'recommend' || activeTab === 'recommend';

    if (isSearchTransition) {
      // 검색탭->일반탭 또는 일반탭->검색탭일 경우 애니메이션 없음
      window.scrollTo({ top: targetY, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
      setIsHeaderHidden(false);
    } else {
      // 일반탭 간 전환: 부드러운 스크롤 애니메이션 적용
      // 자동 스크롤 시 헤더 숨기기 스크롤 량에 불포함되도록 플래그 설정
      isAutoScrollingRef.current = true;
      isUserInteractingRef.current = false;
      if (!isNoticeExpanded || (activeTab !== 'calendar' && activeTab !== 'detailed')) {
        setIsHeaderHidden(false);
      }

      if (autoScrollTimerRef.current) {
        window.clearTimeout(autoScrollTimerRef.current);
      }

      window.scrollTo({ top: targetY, left: 0, behavior: 'smooth' as ScrollBehavior });

      // DOM 레이아웃 안정화 후 시작점 미세 오차 보정 (탭 첫 번째 카드 기준)
      requestAnimationFrame(() => {
        const accurateY = computeTabContentStartY(activeTab);
        if (accurateY > 0 && Math.abs(accurateY - targetY) > 6) {
          window.scrollTo({ top: accurateY, left: 0, behavior: 'smooth' as ScrollBehavior });
          autoScrollBaseYRef.current = accurateY;
          lastScrollYRef.current = accurateY;
          if (isNoticeExpanded && (activeTab === 'calendar' || activeTab === 'detailed')) {
            setIsHeaderHidden(true);
          }
        }
      });

      // 스크롤 이동 완료 후 자동 스크롤 플래그 해제 및 기준점 동기화
      autoScrollTimerRef.current = window.setTimeout(() => {
        isAutoScrollingRef.current = false;
        const currentY = window.pageYOffset || document.documentElement.scrollTop || targetY;
        autoScrollBaseYRef.current = currentY;
        lastScrollYRef.current = currentY;
        if (isNoticeExpanded && (activeTab === 'calendar' || activeTab === 'detailed')) {
          setIsHeaderHidden(true);
        } else if (currentY <= 15) {
          setIsHeaderHidden(false);
        }
      }, 700);
    }
  }, [activeTab]);

  const handleTabChangeRef = useRef<(t: Tab) => void>(() => {});
  const handleTabChange = (nextTab: Tab, forceTop = false, isAuto = false) => {
    closeSettings();
    if (nextTab === activeTab && !forceTop) return;

    const previousTab = activeTab;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    // 1. "검색 탭은 검색 밑으로 내려간거 자신이 탭을 바꿨으면 검색결과 등 제외하고 스크롤 위치 저장X, 자동 이동이었으면 저장O."
    if (previousTab === 'recommend') {
      if (isAuto || isAutoNavigatedRef.current) {
        tabScrollPositions.current['recommend'] = currentScrollY;
      } else {
        tabScrollPositions.current['recommend'] = 0;
      }
    } else {
      tabScrollPositions.current[previousTab] = currentScrollY;
    }

    if (isAuto) {
      isAutoNavigatedRef.current = true;
    } else {
      isAutoNavigatedRef.current = false;
    }

    // 기록 탭 및 분석 탭으로 직접 이동 시 항상 시작점 위치로 이동할 수 있도록 위치 초기화
    if (!isAuto && (nextTab === 'calendar' || nextTab === 'detailed')) {
      tabScrollPositions.current[nextTab] = 0;
    }

    // 2. 탭 전환
    setActiveTab(nextTab);
    localStorage.setItem('uzuhama_active_tab', nextTab);

    // 3. 강제 최상단 이동 요청 시
    if (forceTop) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      isAutoNavigatedRef.current = false;
      setIsHeaderHidden(false);
      autoScrollBaseYRef.current = 0;
      return;
    }
  };

  // 내부 리다이렉트 핸들러 (예: redirect://설정/일러두기, redirect://패치노트, redirect://기록 등)
  const handleInternalRedirect = useCallback((url: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim();

    if (trimmed.startsWith('redirect://') || trimmed.startsWith('app://')) {
      const rawPath = decodeURIComponent(trimmed.replace(/^(redirect|app):\/\//, '')).trim();
      const pathLower = rawPath.toLowerCase();

      // 1. 설정창 및 일러두기 등 세부 아코디언 항목
      if (rawPath.includes('일러두기') || pathLower.includes('preface')) {
        setSettingsInitialSection('preface');
        setIsSettingsOpen(true);
        return true;
      }
      if (rawPath.includes('알림') || pathLower.includes('notification')) {
        setSettingsInitialSection('notification');
        setIsSettingsOpen(true);
        return true;
      }
      if (rawPath.includes('테마') || pathLower.includes('theme')) {
        setSettingsInitialSection('theme');
        setIsSettingsOpen(true);
        return true;
      }
      if (rawPath.includes('폰트') || rawPath.includes('라이선스') || pathLower.includes('font')) {
        setSettingsInitialSection('fontLicense');
        setIsSettingsOpen(true);
        return true;
      }
      if (rawPath.includes('약관') || pathLower.includes('terms')) {
        setPolicyType('terms');
        return true;
      }
      if (rawPath.includes('개인정보') || pathLower.includes('privacy')) {
        setPolicyType('privacy');
        return true;
      }
      if (rawPath === '설정' || pathLower === 'settings') {
        setSettingsInitialSection(null);
        setIsSettingsOpen(true);
        return true;
      }

      // 2. 패치노트
      if (rawPath.includes('패치') || pathLower.includes('patch')) {
        setIsSettingsOpen(false);
        navigate('/patch');
        return true;
      }

      // 3. 공지사항 모달
      if (rawPath.includes('공지') || pathLower.includes('notice')) {
        setDismissedSystemNotice(false);
        setShowNotice(true);
        return true;
      }

      // 4. 의견 보내기
      if (rawPath.includes('의견') || rawPath.includes('피드백') || pathLower.includes('feedback')) {
        openFeedback();
        return true;
      }

      // 5. 탭 이동
      if (rawPath.includes('기록') || rawPath.includes('달력') || pathLower.includes('calendar')) {
        handleTabChange('calendar');
        return true;
      }
      if (rawPath.includes('분석') || pathLower.includes('detailed') || pathLower.includes('stats')) {
        handleTabChange('detailed');
        return true;
      }
      if (rawPath.includes('요약') || rawPath.includes('홈') || pathLower.includes('summary')) {
        handleTabChange('summary');
        return true;
      }
      if (rawPath.includes('추천') || rawPath.includes('영상') || pathLower.includes('recommend')) {
        handleTabChange('recommend');
        return true;
      }

      return true;
    }

    if (trimmed.startsWith('/')) {
      if (trimmed === '/patch') {
        navigate('/patch');
        return true;
      }
      if (trimmed === '/terms') {
        setPolicyType('terms');
        return true;
      }
      if (trimmed === '/privacy') {
        setPolicyType('privacy');
        return true;
      }
      navigate(trimmed);
      return true;
    }

    return false;
  }, [navigate, openFeedback]);

  const closeNotice = (neverShowAgain: boolean) => {
    if (neverShowAgain) {
      localStorage.setItem('notice_seen_v1', 'true');
    }
    setShowNotice(false);
  };

  const handleLogout = () => {
    setIsLoggingOut(true);
    setTimeout(() => {
      logout();
      setIsLoggingOut(false);
    }, 800);
  };

  handleTabChangeRef.current = (t: Tab) => handleTabChange(t);

  if (loading || isLoggingOut) {
    return (
      <LoadingScreen 
        progress={isLoggingOut ? 95 : loadingProgress} 
        statusText={isLoggingOut ? '로그아웃 세션을 안전하게 정리하는 중이에요...' : loadingStatusText} 
        isFirstRun={isFirstRun} 
      />
    );
  }

  if (!data) return null;

  const sortedDates = Object.keys(data.logs).map(k => data.logs[k].date).sort();
  const firstYear = sortedDates.length > 0 ? sortedDates[0].substring(0, 4) : '2026';

  const maintenanceStatus = checkMaintenanceStatus(data.system, nowTime);

  if (maintenanceStatus.isInProgress) {
    const endTimeMs = data.system?.maintenanceEnd ? parseDateSafe(data.system.maintenanceEnd) : null;
    const remainingSeconds = endTimeMs && !isNaN(endTimeMs) ? Math.max(0, Math.floor((endTimeMs - nowTime) / 1000)) : null;

    const formatRemaining = (sec: number) => {
      const hours = Math.floor(sec / 3600);
      const minutes = Math.floor((sec % 3600) / 60);
      const seconds = sec % 60;
      if (hours > 0) {
        return `${hours}시간 ${minutes}분 ${seconds}초`;
      }
      return `${minutes}분 ${seconds}초`;
    };

    const startStr = data.system?.maintenanceStart || '';
    const endStr = data.system?.maintenanceEnd || '';
    const { fullText: scheduleFullText } = formatMaintenanceRange(startStr, endStr);

    const changes = data.system?.maintenanceChanges && data.system.maintenanceChanges.length > 0
      ? data.system.maintenanceChanges
      : ['데이터베이스 점검 및 최적화', '서버 연동 점검', '서비스 코드 안정화 및 테스트'];

    const fallbackNoticeMarkdown = generateMaintenanceNoticeMarkdown({
      startStr: startStr || '2026-09-12T10:00',
      endStr: endStr || '2026-09-12T16:00',
      scope: data.system?.maintenanceScope,
      impact: data.system?.maintenanceImpact,
      noticeGuide: data.system?.maintenanceNoticeGuide,
      durationNote: data.system?.maintenanceDurationNote,
      status: data.system?.maintenanceStatusText || '점검 진행 중',
      note: data.system?.maintenanceNote || '없음',
      history: data.system?.maintenanceHistory
    });

    const links: NoticeLink[] = (data.system?.maintenanceLinks && data.system.maintenanceLinks.length > 0)
      ? data.system.maintenanceLinks.filter(l => Boolean(l.url))
      : (data.system?.maintenanceLinkUrl ? [{ url: data.system.maintenanceLinkUrl, title: data.system.maintenanceLinkText || '관련 링크 바로가기' }] : []);

    return (
      <div className="min-h-screen w-full bg-zinc-50 dark:bg-black py-8 sm:py-12 px-3 sm:px-6 overflow-y-auto flex flex-col items-center justify-start text-center select-text">
        <div className="w-full max-w-2xl mx-auto space-y-5 my-2 sm:my-6 pb-20 text-left">
          
          {/* 상단 락 아이콘 & 헤더 */}
          <div className="text-center space-y-2.5 pb-2">
            <div className="inline-flex p-3 sm:p-3.5 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shadow-sm">
              <Lock className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            {(() => {
              const statusText = data.system?.maintenanceStatusText?.trim();
              if (statusText && statusText.includes('완료')) {
                return (
                  <div className="inline-block px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-200 dark:border-purple-800/50">
                    시스템 점검 진행 중
                  </div>
                );
              }
              return (
                <div className="inline-block px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-200 dark:border-purple-800/50">
                  {statusText || "시스템 점검 진행 중"}
                </div>
              );
            })()}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              {data.system?.maintenanceTitle?.trim() || "서비스 안정화를 위한 정기 점검 안내"}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              점검 시간 동안 서비스에 접속 불가해요. 이용에 불편을 드려 죄송해요.
            </p>
          </div>

          {/* 1. 공지사항 카드 (관리자 모드 실시간 미리보기 형태 그대로 렌더링) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center justify-between gap-2">
              <span>{data.system?.maintenanceTitle?.trim() || '서비스 안정화를 위한 정기 점검 안내'}</span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-lg shrink-0">
                점검 공지
              </span>
            </h2>

            <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs sm:text-sm">
              <ReactMarkdown
                components={{
                  h2: ({node, ...props}) => <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 mt-2.5 mb-1" {...props} />,
                  p: ({node, ...props}) => <p className="mb-2 text-zinc-600 dark:text-zinc-300 leading-relaxed" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 mb-2 text-zinc-600 dark:text-zinc-300" {...props} />,
                  li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-zinc-900 dark:text-white" {...props} />,
                  hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />
                }}
              >
                {data.system?.maintenanceContent?.trim() || fallbackNoticeMarkdown}
              </ReactMarkdown>
            </div>
          </div>

          {/* 2. 패치노트 (작업 및 주요 변경 사항 카드) */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 sm:p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">패치노트 (작업 및 주요 변경 사항)</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  이번 점검을 통해 반영되는 개선 사항 및 패치 항목이에요.
                </p>
              </div>
            </div>
            <div className="space-y-2 pt-1">
              {changes.map((item, idx) => (
                <div key={idx} className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">•</span>
                  <span className="flex-1 break-keep">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. 점검 시간 안내 및 남은 시간 카운트다운 */}
          {(startStr || endStr) && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">점검 시간 안내</h3>
                {scheduleFullText && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">{scheduleFullText}</span>
                )}
              </div>
              <div className="space-y-1.5 pt-1 text-xs sm:text-sm">
                {startStr && (
                  <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                    <span>시작 일시:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{startStr.replace('T', ' ')}</span>
                  </div>
                )}
                {endStr && (
                  <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                    <span>종료 예정:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{endStr.replace('T', ' ')}</span>
                  </div>
                )}
              </div>
              {remainingSeconds !== null && remainingSeconds > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-purple-600 dark:text-purple-400 font-bold">남은 점검 시간:</span>
                  <span className="font-extrabold text-purple-600 dark:text-purple-400">
                    {formatRemaining(remainingSeconds)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 4. 점검 공지 관련 링크 버튼 목록 */}
          {links.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              {links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  <span>{link.title || link.url}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30 flex flex-col overflow-x-clip w-full">
      
      {/* System Big Notice Modal (개별 공지 type이 'big' 또는 'both'이거나, 전역 noticeType이 'big' 또는 'both'인 경우) */}
      {(() => {
        if (dismissedSystemNotice) return null;
        
        const activeModalNotices = (data.system?.noticeList || []).filter(n => {
          if (!n.active) return false;
          // 개별 공지 타입이 'big' 또는 'both'이거나, 타입이 지정되지 않은 기존 공지(!n.type)는 기본 팝업에 표시
          if (n.type === 'big' || n.type === 'both' || !n.type) return true;
          // 전역 noticeType이 'big' 또는 'both'일 때, 'small'로 강제 제한되지 않은 공지 표시
          if ((data.system?.noticeType === 'big' || data.system?.noticeType === 'both') && n.type !== 'small') return true;
          return false;
        });

        // 개별 공지 목록이 비어있더라도 noticeContent가 있고 noticeType이 'none'이 아닌 경우 레거시 공지 자동 생성
        if (activeModalNotices.length === 0 && data.system?.noticeType !== 'none' && data.system?.noticeContent) {
          activeModalNotices.push({
            id: 'system_default_modal_notice',
            title: data.system.noticeTitle || '공지사항',
            content: data.system.noticeContent,
            type: (data.system?.noticeType as any) || 'both',
            date: new Date().toISOString().slice(0, 10),
            active: true
          });
        }

        if (activeModalNotices.length === 0) return null;

        return (
          <NoticeModal 
            notices={activeModalNotices} 
            onClose={() => setDismissedSystemNotice(true)} 
            onNavigateInternal={handleInternalRedirect}
          />
        );
      })()}

      {/* 약관 개정 안내 팝업 (일반 7일 사전 공지 / 중요 30일 사전 공지 및 필수 동의) */}
      {data.system?.termsRevision && (() => {
        const rev = data.system.termsRevision;
        const ackKey = `terms_revision_ack_v${rev.version}`;
        const isAcked = localStorage.getItem(ackKey) === 'true';
        if (isAcked) return null;

        return (
          <TermsRevisionModal 
            revision={rev}
            onAcknowledge={() => {
              localStorage.setItem(ackKey, 'true');
              if (user?.uid) {
                localStorage.setItem(`consent_version_${user.uid}`, String(rev.version));
              }
              setForceRender(prev => prev + 1);
            }}
            onClose={rev.type !== 'important' ? () => {
              localStorage.setItem(ackKey, 'true');
              setForceRender(prev => prev + 1);
            } : undefined}
          />
        );
      })()}

      {/* 상단 헤더 숨김 시 페이지 상단 고정 페이드 블러 레이어 (페이지 하단 고정 블러 효과와 동일한 블러) */}
      <div 
        aria-hidden="true"
        style={{
          height: 'calc(env(safe-area-inset-top, 0px) + 56px)',
          WebkitBackdropFilter: 'blur(28px)',
          backdropFilter: 'blur(28px)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 35%, rgba(0,0,0,0.4) 70%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 35%, rgba(0,0,0,0.4) 70%, transparent 100%)',
        }}
        className={cn(
          "fixed inset-x-0 top-0 pointer-events-none z-40 transition-opacity duration-400 ease-out",
          "bg-gradient-to-b from-white/85 via-white/45 to-transparent dark:from-zinc-950/90 dark:via-zinc-950/50 dark:to-transparent",
          isHeaderHidden && !isNoticeExpanded ? "opacity-100" : "opacity-0"
        )}
      />

      <header 
        id="app-main-header"
        style={{ 
          transform: isHeaderHidden ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isHeaderHidden ? 0 : 1,
          filter: isHeaderHidden ? 'blur(2px)' : 'blur(0px)',
          transition: 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.58s cubic-bezier(0.16, 1, 0.3, 1), filter 0.58s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)', 
          backdropFilter: 'blur(28px) saturate(180%)' 
        }}
        className={cn(
          "border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-black/70 backdrop-blur-3xl backdrop-saturate-180 sticky top-0 z-50 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5",
          isHeaderHidden && "pointer-events-none shadow-none border-b-transparent"
        )}
      >
        <div className={cn("mx-auto px-3 sm:px-5 lg:px-8 h-14 sm:h-15 flex items-center justify-between gap-2 transition-all duration-300", isSettingsOpen ? "max-w-[1750px] 2xl:max-w-[1850px]" : "max-w-7xl 2xl:max-w-[1440px]")}>
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              id="header-title-btn"
              onClick={() => {
                handleTabChange('summary', true);
              }}
              className="flex items-center gap-1.5 text-left group cursor-pointer select-none focus:outline-none py-1 px-1 -ml-1 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:scale-95 transition-all touch-manipulation min-w-0"
              title="홈(요약)으로 이동 및 최상단 스크롤"
            >
              <h1 className="text-xl sm:text-[25px] font-extrabold tracking-tight text-zinc-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                우주하마 방송 예측
              </h1>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 text-sm font-bold h-9 shrink-0">
            <AnimatePresence>
              {!isProbVisible && currentProb !== null && !isSettingsOpen && activeTab !== 'recommend' && (
                <motion.div
                  initial={{ opacity: 0, scale: 1.1, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.1, y: 15 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-1 origin-right mr-0.5 sm:mr-1 shrink-0"
                >
                  <span className="hidden md:inline text-xs text-zinc-500 font-medium">현재 확률:</span>
                  <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300 text-xs font-bold">
                    {currentProb?.toFixed(1)}%
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="button"
              id="header-settings-btn"
              onClick={() => {
                if (isSettingsOpen) closeSettings();
                else openSettings();
              }}
              className={cn(
                "flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 sm:px-3 sm:py-1.5 rounded-xl transition-all touch-manipulation cursor-pointer shrink-0 border shadow-2xs",
                isSettingsOpen
                  ? "bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/60 dark:hover:bg-purple-800/60 text-purple-700 dark:text-purple-300 border-purple-300/80 dark:border-purple-700/80"
                  : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 text-zinc-700 dark:text-zinc-300 border-zinc-200/60 dark:border-zinc-700/60"
              )}
              title={isSettingsOpen ? "설정 닫기" : "설정 및 유저 메뉴 열기"}
            >
              <SettingsIcon className={cn("w-4 h-4", isSettingsOpen ? "text-purple-600 dark:text-purple-400" : "text-zinc-700 dark:text-zinc-300")} />
              <span className="hidden sm:inline-block ml-1.5 text-xs font-bold">
                {isSettingsOpen ? "설정 닫기" : "설정"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 바로 밑 위치 띠 공지 (점검 예고는 노란색, 점검 완료는 초록색, 기본 공지는 보라색 유지) */}
      {(() => {
        const bannerNotices = (data.system?.noticeList || []).filter(
          n => n.active && (n.type === 'small' || n.type === 'both' || !n.type || (n.type !== 'big' && (data.system?.noticeType === 'small' || data.system?.noticeType === 'both')))
        );
        const fallback = ((data.system?.noticeType === 'small' || data.system?.noticeType === 'both') && bannerNotices.length === 0)
          ? data.system.noticeContent
          : undefined;

        const hasUpcoming = Boolean(maintenanceStatus.isScheduledToday && maintenanceStatus.upcomingNoticeText);
        const hasCompleted = Boolean(maintenanceStatus.isCompletedRecently && maintenanceStatus.completedNoticeMarkdown);

        if (bannerNotices.length === 0 && !fallback && !hasUpcoming && !hasCompleted) return null;

        return (
          <NoticeBanner
            notices={bannerNotices}
            fallbackContent={fallback}
            maintenanceUpcoming={hasUpcoming ? {
              title: '시스템 점검 예정 안내',
              text: maintenanceStatus.upcomingNoticeText
            } : null}
            maintenanceCompleted={hasCompleted ? {
              title: '시스템 점검 완료 및 업데이트 안내',
              markdown: maintenanceStatus.completedNoticeMarkdown
            } : null}
            onNavigateInternal={handleInternalRedirect}
            activeTab={activeTab}
            isHeaderHidden={isHeaderHidden}
            onExpandedChange={setIsNoticeExpanded}
            systemDismissMode={data.system?.noticeDismissMode || 'session'}
            defaultPrefix={data.system?.defaultNoticePrefix}
          />
        );
      })()}

      <main className={cn(
        "mx-auto px-3 sm:px-5 lg:px-8 pt-3 sm:pt-6 pb-32 sm:pb-36 flex-1 w-full transition-all duration-300",
        isSettingsOpen ? "max-w-[1750px] 2xl:max-w-[1850px]" : "max-w-7xl 2xl:max-w-[1440px]"
      )}>
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start w-full relative">
          {/* Main Content Area: 데스크톱 및 모바일 기본 본문 */}
          <div className="flex-1 min-w-0 w-full transition-all duration-200">
            {/* Main Realtime Indicator & Anonymous Poll (검색/추천 탭 활성 시에는 숨김 처리하되 DOM 위치 보존하여 헤더 흔들림 방지) */}
            <div 
              ref={probContainerRef} 
              id="main-prob-container" 
              className={cn("mb-8 sm:mb-8 space-y-4", activeTab === 'recommend' && "hidden")}
            >
              <CurrentProbability 
                logs={logsList} 
                onProbChange={setCurrentProb} 
                system={data.system} 
                onNavigateToRecommend={handleNavigateToRecommend}
              />
            </div>

            {/* Desktop Tabs Navigation (상단 헤더와 유사한 블러 적용) */}
            <div 
              id="desktop-tab-bar"
              style={{
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                backdropFilter: 'blur(28px) saturate(180%)',
              }}
              className="hidden sm:flex items-center gap-6 overflow-x-auto border-b border-zinc-200/80 dark:border-zinc-800/80 mb-6 backdrop-blur-3xl backdrop-saturate-180 bg-white/70 dark:bg-black/70 px-4 py-0.5 rounded-2xl"
            >
              <button
                onClick={() => handleTabChange('summary')}
                className={cn(
                  "flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                  activeTab === 'summary' 
                    ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-400" 
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <FileText className="w-4 h-4" />
                요약
              </button>
              
              <button
                onClick={() => handleTabChange('calendar')}
                className={cn(
                  "flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                  activeTab === 'calendar' 
                    ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-400" 
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <CalendarIcon className="w-4 h-4" />
                방송 기록
              </button>
              
              <button
                onClick={() => handleTabChange('detailed')}
                className={cn(
                  "flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                  activeTab === 'detailed' 
                    ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-400" 
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <BarChart2 className="w-4 h-4" />
                상세 분석
              </button>
              
              <button
                onClick={() => handleTabChange('recommend')}
                className={cn(
                  "flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap",
                  activeTab === 'recommend' 
                    ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-400" 
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                <PlaySquare className="w-4 h-4" />
                추천 영상
              </button>
            </div>

            {/* Tab Content */}
            <div ref={tabContentRef} id="tab-content-container" className="pb-24 sm:pb-8">
              <div id="summary-tab-view" className={activeTab === 'summary' ? 'block' : 'hidden'}>
                <SummaryTab data={data} fetchLogs={fetchLogsByDateRange} isActive={activeTab === 'summary'} />
              </div>
              <div id="calendar-tab-view" className={activeTab === 'calendar' ? 'block' : 'hidden'}>
                <CalendarTab 
                  data={data} 
                  fetchLogs={fetchLogsByDateRange} 
                  selectedDateStr={selectedCalendarDate}
                  onClearSelectedDate={() => setSelectedCalendarDate(null)}
                  isActive={activeTab === 'calendar'}
                />
              </div>
              <div id="detailed-tab-view" className={activeTab === 'detailed' ? 'block' : 'hidden'}>
                <DetailedStatsTab 
                  data={data} 
                  fetchLogs={fetchLogsByDateRange} 
                  isActive={activeTab === 'detailed'} 
                  onNavigateToCalendar={handleNavigateToCalendar}
                  onNavigateToRecommend={handleNavigateToRecommend}
                />
              </div>
              <div id="recommend-tab-view" className={activeTab === 'recommend' ? 'block' : 'hidden'}>
                <RecommendTab 
                  data={data} 
                  rateVideo={rateVideo} 
                  targetCategory={recommendTargetCategory}
                  targetSearchTerm={recommendTargetSearchTerm}
                  pinnedVideoId={recommendPinnedVideoId}
                  searchTerm={globalSearchTerm}
                  onSearchTermChange={setGlobalSearchTerm}
                  onClearTarget={() => {
                    setRecommendTargetCategory(null);
                    setRecommendTargetSearchTerm(null);
                    setRecommendPinnedVideoId(null);
                  }}
                  onNavigateToCalendar={handleNavigateToCalendar}
                  isActive={activeTab === 'recommend'}
                />
              </div>
            </div>
          </div>

          {/* 설정 뷰: PC에서는 우측 분할 패널(Split-Screen) 밀어내기 카드 슬라이드 인/아웃 */}
          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div
                key="settings-desktop-panel"
                initial={{ opacity: 0, x: 40, width: 0 }}
                animate={{ opacity: 1, x: 0, width: '450px' }}
                exit={{ opacity: 0, x: 40, width: 0, transition: { type: 'spring', damping: 34, stiffness: 340 } }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                className="hidden lg:block shrink-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar overflow-x-hidden"
              >
                <div className="w-[450px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-5 sm:p-6 shadow-lg relative">
                  <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2.5">
                      <SettingsIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <h2 className="text-lg font-bold text-zinc-900 dark:text-white">설정 및 정보</h2>
                    </div>
                    <button
                      onClick={() => closeSettings()}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                      title="설정 패널 닫기"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <SettingsView 
                    user={user}
                    system={data.system}
                    firstYear={firstYear}
                    onLogout={handleLogout}
                    onClose={() => closeSettings()}
                    onOpenFeedback={openFeedback}
                onOpenTutorial={data.system?.tutorialEnabled !== false ? () => { closeSettings(); window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 450); } : undefined}
                    onOpenNotice={() => {
                      setShowNotice(true);
                      setDismissedSystemNotice(false);
                    }}
                    onOpenTerms={() => setPolicyType('terms')}
                    onOpenPrivacy={() => setPolicyType('privacy')}
                    onOpenPatchNotes={() => {
                      setIsSettingsOpen(false);
                      navigate('/patch', { state: { fromSettings: true } });
                    }}
                    initialSection={settingsInitialSection}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 모바일 설정창 (열고 닫을 때 모두 iOS 화면 전환처럼 옆으로 밀림) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            key="settings-mobile-drawer"
            initial={{ x: '100%', boxShadow: '-12px 0 40px rgba(0,0,0,0)' }}
            animate={{ x: 0, boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }}
            // iOS 뒤로가기처럼 오른쪽으로 밀려 나감 (모든 기기)
            exit={{ x: '100%', boxShadow: '-12px 0 40px rgba(0,0,0,0)', transition: { type: 'spring', damping: 36, stiffness: 360, mass: 0.9 } }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
            className="lg:hidden fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto"
          >
            {/* 모바일 설정 상단 헤더: 메인 헤더와 동일한 Safe Area 패딩 및 높이 적용 */}
            <div className="sticky top-0 z-20 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-md px-4 sm:px-6 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5 min-h-[56px] sm:min-h-[60px]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => closeSettings()}
                  className="p-1.5 -ml-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                  title="뒤로가기"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">설정</h2>
              </div>
              <button
                type="button"
                onClick={() => closeSettings()}
                className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 pb-28">
              <SettingsView 
                user={user}
                system={data.system}
                firstYear={firstYear}
                onLogout={handleLogout}
                onClose={() => closeSettings()}
                onOpenFeedback={openFeedback}
                onOpenTutorial={data.system?.tutorialEnabled !== false ? () => { closeSettings(); window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 450); } : undefined}
                onOpenNotice={() => {
                  setShowNotice(true);
                  setDismissedSystemNotice(false);
                }}
                onOpenTerms={() => setPolicyType('terms')}
                onOpenPrivacy={() => setPolicyType('privacy')}
                onOpenPatchNotes={() => {
                  setIsSettingsOpen(false);
                  navigate('/patch', { state: { fromSettings: true } });
                }}
                initialSection={settingsInitialSection}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Floating Bottom Nav Dock (Unified Island Tab Bar + Floating '+' Action Button) */}
      <Tutorial
        enabled={data.system?.tutorialEnabled !== false}
        activeTab={activeTab}
        onTabChange={(t) => handleTabChangeRef.current(t)}
      />

      <FloatingBottomNav 
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => closeSettings()}
        system={data.system}
        logs={data.logs}
        searchTerm={globalSearchTerm}
        onSearchTermChange={setGlobalSearchTerm}
      />

      {/* Policies & Modals */}
      {policyType && (
        <PolicyModal 
          type={policyType} 
          system={data.system} 
          onClose={() => setPolicyType(null)} 
        />
      )}

      {/* 의견 보내기 모달 (모든 오버레이 및 모바일 설정창 상단에 항상 최상위 레이어로 렌더링) */}
      {showFeedbackModal && (
        <FeedbackModal onClose={() => closeFeedback()} system={data.system} data={data} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen progress={60} statusText="페이지를 불러오는 중이에요..." />}>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/patch" element={<PatchNotesPage />} />
        <Route path="/patch-:version" element={<PatchNotesPage />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/licenses" element={<LicensePage />} />
      </Routes>
    </Suspense>
  );
}
