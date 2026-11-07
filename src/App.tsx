/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense, lazy, startTransition } from 'react';
import { importList, parseImport } from './utils/myPlaylists';
import { toast } from './components/common/ItemMenu';
import { OPEN_HISTORY_EVENT, WatchHistoryPage } from './components/WatchHistoryPage';
import { layerHandledPop } from './hooks/useBackToClose';
import { setYoutubeClientId } from './utils/youtubeAccount';
import { SaveHost } from './components/common/SaveHost';
import { Routes, Route, Link, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import { Tv, BarChart2, Calendar as CalendarIcon, FileText, Lock, X, PlaySquare, ExternalLink, AlertTriangle, CheckCircle2, Check, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { checkMaintenanceStatus, effectiveMaintenanceSystem, generateMaintenanceNoticeMarkdown, formatMaintenanceRange, parseDateSafe } from './utils/maintenanceUtils';
import { useFirebaseData } from './hooks/useFirebaseData';
import { SummaryTab } from './components/tabs/SummaryTab';
// 요약 탭만 처음에 바로 불러오고, 나머지 탭은 처음 열 때(또는 화면이 한가할 때 미리) 불러옴 → 첫 로딩 가벼움
const loadCalendarTab = () => import('./components/tabs/CalendarTab');
const loadDetailedTab = () => import('./components/tabs/DetailedStatsTab');
const loadRecommendTab = () => import('./components/tabs/RecommendTab');
const CalendarTab = lazy(() => loadCalendarTab().then((m) => ({ default: m.CalendarTab })));
const DetailedStatsTab = lazy(() => loadDetailedTab().then((m) => ({ default: m.DetailedStatsTab })));
const RecommendTab = lazy(() => loadRecommendTab().then((m) => ({ default: m.RecommendTab })));
const onboardingSeenVersion = () => { try { return Number(localStorage.getItem('uzuhama_onboarding_version') || 0); } catch { return 0; } };
const TabSpinner = () => (
  <div className="py-24 flex justify-center" role="status" aria-label="불러오는 중">
    <div className="w-7 h-7 border-[3px] border-purple-500 border-t-transparent rounded-full animate-spin" />
  </div>
);
import { NoticeModal } from './components/NoticeModal';
import { NoticeBanner } from './components/NoticeBanner';
import { HeaderDday } from './components/common/HeaderDday';
import { FeedbackModal } from './components/FeedbackModal';
import { PolicyModal } from './components/PolicyModal';
import { TermsRevisionModal } from './components/TermsRevisionModal';
import { FloatingBottomNav } from './components/FloatingBottomNav';
import { CurrentProbability } from './components/CurrentProbability';
import { LoadingScreen } from './components/LoadingScreen';
import { AFTER_INSTALL_KEY, OPEN_SETUP_EVENT, isStandaloneMode, isIOSDevice, type GuideKind, type SetupMode } from './utils/setupStatus';
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
// 설정·처음 시작 화면은 열 때만 불러옴
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
import { Tutorial, TUTORIAL_START_EVENT } from './components/Tutorial';
const NoticesView = lazy(() => import('./components/NoticesView').then((m) => ({ default: m.NoticesView })));
const SetupGuides = lazy(() => import('./components/SetupGuides'));
const AfterInstallPrompt = lazy(() => import('./components/SetupGuides').then((m) => ({ default: m.AfterInstallPrompt })));
const Onboarding = lazy(() => import('./components/Onboarding').then((m) => ({ default: m.Onboarding })));

// 별도 페이지(관리자·패치노트·약관·라이선스)는 들어갈 때만 불러옴 → 메인 화면 첫 로딩 가볍게
const AdminRoute = lazy(() => import('./components/AdminRoute').then((m) => ({ default: m.AdminRoute })));
const PatchNotesPage = lazy(() => import('./components/PatchNotesPage').then((m) => ({ default: m.PatchNotesPage })));
const PolicyPage = lazy(() => import('./components/PolicyPage').then((m) => ({ default: m.PolicyPage })));
const LicensePage = lazy(() => import('./components/LicensePage').then((m) => ({ default: m.LicensePage })));
import { useAuth } from './hooks/useAuth';
import { RELOAD_LINK, reloadToNewVersion, useNewBuildAvailable } from './utils/appVersion';
import { MaintenancePager } from './components/MaintenancePager';
import { SELFTEST_FLAG } from './selftest/flag';
const SelfTestPage = lazy(() => import('./components/SelfTestPage').then((m) => ({ default: m.SelfTestPage })));
import { AiSummaryHost, GO_SEARCH_EVENT } from './components/common/AiSummaryHost';
import { activeDdays } from './utils/dday';
import { FluidBackdrop } from './components/common/FluidBackdrop';

function SlugRoute() {
  const { slug = '' } = useParams<{ slug: string }>();
  const m = slug.match(/^patch-v?(\d+(?:\.\d+){1,3})$/i);
  if (m) return <PatchNotesPage version={m[1]} />;
  return <Navigate to="/" replace />;
}

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
  // 아이폰 쓸어서 뒤로 가기로 설정을 닫을 때는 효과 없이 바로
  const settingsInstantExitRef = useRef(false);
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

  // 시청 기록 전체 보기 (설정 > 맞춤 추천·시청 기록, 홈 '보던 영상')
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    const on = () => setHistoryOpen(true);
    window.addEventListener(OPEN_HISTORY_EVENT, on);
    return () => window.removeEventListener(OPEN_HISTORY_EVENT, on);
  }, []);
  // 설정 > 공지사항: 지난 공지까지 카드 목록으로
  const [showNoticesPage, setShowNoticesPage] = useState(false);
  // 앱 설치 · 알림 · 캘린더 안내 (어디서든 openSetupGuide() 로 열림)
  const [setupGuide, setSetupGuide] = useState<{ kind?: GuideKind; mode?: SetupMode } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setSetupGuide({ kind: (e as CustomEvent).detail?.kind, mode: (e as CustomEvent).detail?.mode });
    window.addEventListener(OPEN_SETUP_EVENT, on);
    return () => window.removeEventListener(OPEN_SETUP_EVENT, on);
  }, []);
  const [afterInstall] = useState(() => {
    try { return isStandaloneMode() && localStorage.getItem(AFTER_INSTALL_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const handlePopState = () => {
      // 시청 기록·저장 창·쇼츠 화면처럼 따로 뒤로 가기를 처리한 창이면 건너뜀
      if (layerHandledPop()) return;
      // 기기 뒤로가기 버튼 또는 브라우저 뒤로가기
      // 0. 공지사항 화면이 열려 있으면: 공지사항만 닫고 설정창은 유지
      if (setupGuide) return; // 안내 화면이 스스로 닫힘
      if (showNoticesPage) {
        setShowNoticesPage(false);
        return;
      }
      // 1. 의견 보내기 모달이 열려있으면: 한 번 나가면 의견 보내기만 닫고 설정창 유지
      if (showFeedbackModal) {
        setShowFeedbackModal(false);
        return;
      }
      // 2. 설정창이 열려있으면: 한 번 더 나가면 설정창 닫고 메인으로
      // 아이폰은 쓸어서 뒤로 가기 할 때 사파리가 이미 화면을 밀어 주므로, 우리 쪽 밀려 나가는 효과는 끔
      if (isSettingsOpen) {
        if (isIOSDevice()) settingsInstantExitRef.current = true;
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isSettingsOpen, showFeedbackModal, showNoticesPage, setupGuide]);

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

  // 내 유튜브 재생목록 저장: 관리자가 넣은 구글 클라이언트 ID
  useEffect(() => { setYoutubeClientId(data?.system?.youtubeOAuthClientId); }, [data?.system?.youtubeOAuthClientId]);
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

  // AI 요약 등에서 게임·카테고리·키워드를 누르면 검색 탭으로 (검색어 그대로)
  const navRecRef = useRef(handleNavigateToRecommend);
  navRecRef.current = handleNavigateToRecommend;
  useEffect(() => {
    const on = (e: any) => { const q = String(e?.detail?.q || '').trim(); if (q) navRecRef.current(undefined, q); };
    window.addEventListener(GO_SEARCH_EVENT, on);
    return () => window.removeEventListener(GO_SEARCH_EVENT, on);
  }, []);

  // 링크로 들어온 경우: ?v=영상ID (공유 미리보기 링크) / ?q=검색어 → 검색 탭에서 바로
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || loading) return;
    deepLinkDone.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('v');
      const q = params.get('q');
      // ?pl=... : 다른 기기·친구가 보낸 내 재생목록 가져오기
      const pl = params.get('pl');
      if (pl) {
        const parsed = parseImport(pl);
        if (parsed && window.confirm(`'${parsed.name}' 재생목록(${parsed.items.length}개)을 이 기기의 내 재생목록으로 가져올까요?`)) {
          importList(parsed);
          window.setTimeout(() => toast(`'${parsed.name}'을 가져왔어요 · 검색 › 재생목록에서 볼 수 있어요`), 300);
        }
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      if (v && /^[\w-]{11}$/.test(v)) handleNavigateToRecommend(undefined, params.get('kind') === 'short' ? v : undefined, params.get('kind') === 'short' ? undefined : v);
      else if (q && q.trim()) handleNavigateToRecommend(undefined, q.trim().slice(0, 60));
      if (v || q) window.history.replaceState(window.history.state, '', window.location.pathname);
    } catch { /* 무시 */ }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 한 번이라도 연 탭 (처음엔 지금 탭만 그림)
  const [mountedTabsState, setMountedTabs] = useState<Set<string>>(() => new Set([activeTab]));
  const mountedTabs = mountedTabsState.has(activeTab) ? mountedTabsState : new Set([...mountedTabsState, activeTab]);
  useEffect(() => {
    if (!mountedTabsState.has(activeTab)) setMountedTabs((prev) => new Set([...prev, activeTab]));
  }, [activeTab, mountedTabsState]);
  // 첫 화면이 다 뜬 뒤 한가할 때 다른 탭 코드를 미리 받아 둠 (데이터는 이미 있으니 Firestore 읽기는 그대로)
  useEffect(() => {
    const idle = (cb: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500));
    idle(() => { loadCalendarTab(); loadDetailedTab(); loadRecommendTab(); });
  }, []);
  const scrollDirAccRef = useRef(0);
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

        // 방향이 바뀐 뒤 일정 거리 이상 같은 방향으로 움직였을 때만 바꿈 (손가락 떨림에 깜빡이지 않게)
        const acc = scrollDirAccRef.current;
        scrollDirAccRef.current = (deltaY > 0) === (acc > 0) ? acc + deltaY : deltaY;
        if (effectiveScroll > 110 && scrollDirAccRef.current > 28) {
          // 아래로 스크롤 시 상단 바 사라짐 (위로 사라지는 애니메이션)
          setIsHeaderHidden(true);
        } else if (scrollDirAccRef.current < -20) {
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
  const closeSettingsRef = useRef<(() => void) | null>(null);
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

    // 2. 탭 전환: 무거운 화면을 그리는 동안에도 탭바가 바로 반응하도록 '급하지 않은 업데이트'로
    //    (빠르게 연달아 눌러도 마지막으로 누른 탭이 이기고, 도중의 화면 그리기는 건너뜀)
    startTransition(() => setActiveTab(nextTab));
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
  const newBuild = useNewBuildAvailable();
  const handleInternalRedirect = useCallback((url: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim();
    if (trimmed === RELOAD_LINK) { reloadToNewVersion(); return true; }

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
        // 'app://패치노트/v1.1.0' 처럼 버전이 있으면 그 버전 글로
        const ver = rawPath.match(/v?(\d+(?:\.\d+){1,3})/)?.[1];
        navigate(ver ? `/patch-v${ver}` : '/patch');
        window.scrollTo({ top: 0 });
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
      if (/^\/patch(-v?[\d.]+)?\/?$/.test(trimmed) || /^\/patch\/v?[\d.]+$/.test(trimmed)) {
        setIsSettingsOpen(false);
        const ver = trimmed.match(/v?(\d+(?:\.\d+){1,3})/)?.[1];
        navigate(ver ? `/patch-v${ver}` : '/patch');
        window.scrollTo({ top: 0 });
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
  closeSettingsRef.current = () => { if (isSettingsOpen) closeSettings(); };

  // 설정 › 알림: 게임 이름 찾기·카테고리 고르기용 (이미 받은 방송 기록에서만)
  const notifyChoices = useMemo(() => {
    const games = new Set<string>();
    const cats = new Map<string, number>();
    const addCat = (c: any) => String(c || '').split(',').map((x) => x.trim()).filter((x) => x && x.length <= 20).forEach((x) => cats.set(x, (cats.get(x) || 0) + 1));
    Object.values(data?.logs || {}).forEach((l: any) => {
      if (l?.game) games.add(String(l.game).trim());
      (l?.games || []).forEach((g: any) => { if (g?.name) games.add(String(g.name).trim()); addCat(g?.category); });
      addCat(l?.category);
    });
    return { gameNames: [...games].filter(Boolean), categories: [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) };
  }, [data?.logs]);
  if (loading || isLoggingOut) {
    return (
      <LoadingScreen 
        progress={isLoggingOut ? 95 : loadingProgress} 
        statusText={isLoggingOut ? '로그아웃하는 중' : loadingStatusText} 
        isFirstRun={isFirstRun} 
      />
    );
  }

  if (!data) return null;

  const sortedDates = Object.keys(data.logs).map(k => data.logs[k].date).sort();
  const firstYear = sortedDates.length > 0 ? sortedDates[0].substring(0, 4) : '2026';

  // 정기 점검(자동 켜기)이 설정돼 있으면 이번 회차 일정을 넣어서 판단
  const maintSystem = effectiveMaintenanceSystem(data.system, nowTime);
  const maintenanceStatus = checkMaintenanceStatus(maintSystem, nowTime);

  // 주간 자동 점검(브라우저 자동화)은 점검 화면을 건너뛰고 실제 화면을 시험함
  const automationBypass = (typeof navigator !== 'undefined' && (navigator as any).webdriver === true)
    // 관리자의 화면·기능 전체 점검 중 (15분)
    || (() => { try { return Number(localStorage.getItem(SELFTEST_FLAG) || 0) > Date.now(); } catch { return false; } })();
  if (maintenanceStatus.isInProgress && !automationBypass) {
    const endTimeMs = maintSystem?.maintenanceEnd ? parseDateSafe(maintSystem.maintenanceEnd) : null;
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

    const startStr = maintSystem?.maintenanceStart || '';
    const endStr = maintSystem?.maintenanceEnd || '';
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

    // 점검 중에는 '예정' 문구 대신 진행 중으로
    const inProgressText = (md: string) => md.replace(/점검 예정/g, '점검 진행 중').replace(/시작 예정/g, '시작').replace(/하겠어요\./g, '할 거예요.').replace(/하시겠어요\?/g, '할까요?');
    const history = data.system?.maintenanceHistory || [];
    const extended = history.some((h) => /연장/.test(h.event || ''));
    const originalEnd = history.find((h) => /종료 예정/.test(h.event || ''))?.time || '';
    const fmtDay = (v: string) => {
      const ms = parseDateSafe(v);
      if (!ms) return '';
      const d = new Date(ms + 9 * 3600000);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
    };
    const fmtHm = (v: string) => {
      const ms = parseDateSafe(v);
      if (!ms) return '';
      const d = new Date(ms + 9 * 3600000);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    const sameDay = fmtDay(startStr) === fmtDay(endStr);
    const mdComponents = {
      h2: ({ node, ...props }: any) => <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5" {...props} />,
      h3: ({ node, ...props }: any) => <h3 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 mt-2.5 mb-1" {...props} />,
      p: ({ node, ...props }: any) => <p className="mb-2 text-zinc-600 dark:text-zinc-300 leading-relaxed" {...props} />,
      ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 space-y-1 mb-2 text-zinc-600 dark:text-zinc-300" {...props} />,
      li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
      strong: ({ node, ...props }: any) => <strong className="font-bold text-zinc-900 dark:text-white" {...props} />,
      hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />,
    };

    return (
      <MaintenancePager
        first={(goDetail) => (
          <div className="relative h-full flex flex-col items-center justify-center px-6 text-center">
          <FluidBackdrop />
          <div className="relative flex flex-col items-center">
          <div className="inline-flex p-5 rounded-[28px] bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shadow-sm">
            <Lock className="w-12 h-12 sm:w-14 sm:h-14" />
          </div>
          <h1 className="mt-6 text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
            {extended ? '점검이 연장됐어요' : '점검 중이에요'}
          </h1>
          {(startStr || endStr) && (
            <div className="mt-4 space-y-1">
              <p className="text-base sm:text-lg font-bold text-zinc-700 dark:text-zinc-200">
                {fmtDay(startStr || endStr)}{!sameDay && endStr ? ` ~ ${fmtDay(endStr)}` : ''}
              </p>
              <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 tabular-nums">
                {startStr ? fmtHm(startStr) : ''}{endStr ? ` ~ ${fmtHm(endStr)}` : ''}
              </p>
              {remainingSeconds !== null && remainingSeconds > 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{formatRemaining(remainingSeconds)} 남았어요</p>
              )}
            </div>
          )}
          </div>
          <button
            type="button"
            onClick={goDetail}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-500 dark:text-zinc-400 text-sm font-bold cursor-pointer"
          >
            자세히 보기
            <ChevronDown className="w-6 h-6 animate-bounce" />
          </button>
        </div>
        )}
        detail={(
          <>
        {/* 아래로 내리면: 연장 공지 · 점검 공지 · 바뀌는 것 · 링크 */}
        <div id="maint-detail" className="w-full max-w-2xl mx-auto px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-20 space-y-5 text-left">
          <p className="text-center text-[11px] text-zinc-400">맨 위에서 아래로 끌면 처음 화면으로 돌아가요</p>
          {extended && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-1.5">
              <h2 className="text-base font-extrabold text-amber-800 dark:text-amber-200">⏰ 점검 연장 안내</h2>
              <p className="text-sm text-amber-800 dark:text-amber-200 break-keep">
                점검이 예정보다 길어지고 있어요. 끝나는 시간이 {originalEnd ? <b>{fmtHm(originalEnd.replace(' ', 'T'))}</b> : '예정 시간'}에서 <b>{fmtHm(endStr)}</b>(으)로 바뀌었어요. 기다리게 해서 미안해요.
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 pt-1">
                {history.filter((h) => /연장/.test(h.event || '')).map((h, i) => <li key={i}>• {h.time} {h.event}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center justify-between gap-2">
              <span>{data.system?.maintenanceTitle?.trim() || '서비스 안정화를 위한 정기 점검 안내'}</span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-lg shrink-0">점검 공지</span>
            </h2>
            <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs sm:text-sm">
              <ReactMarkdown components={mdComponents}>
                {inProgressText(data.system?.maintenanceContent?.trim() || fallbackNoticeMarkdown)}
              </ReactMarkdown>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 sm:p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">이번 점검에서 하는 것</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">점검이 끝나면 바로 반영돼요.</p>
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

          {scheduleFullText && (
            <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">점검 시간: {scheduleFullText}</p>
          )}

          {links.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              {links.map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer">
                  <span>{link.title || link.url}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] min-h-screen bg-[#f2f2f7] dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30 flex flex-col overflow-x-clip w-full">
      
      {/* System Big Notice Modal (개별 공지 type이 'big' 또는 'both'이거나, 전역 noticeType이 'big' 또는 'both'인 경우) */}
      {(() => {
        if (dismissedSystemNotice) return null;
        
        const activeModalNotices = (data.system?.noticeList || []).map(n => (newBuild && String(n.id).startsWith('auto-patch')
          ? { ...n, links: [{ title: '새로고침해서 새 버전 쓰기', url: RELOAD_LINK }, ...(n.links || [])] }
          : n)).filter(n => {
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
          "bg-gradient-to-b from-[#f2f2f7]/85 via-[#f2f2f7]/45 to-transparent dark:from-zinc-950/90 dark:via-zinc-950/50 dark:to-transparent",
          isHeaderHidden && !isNoticeExpanded ? "opacity-100" : "opacity-0"
        )}
      />

      <header 
        id="app-main-header"
        style={{ 
          // iOS 처럼 부드럽게: 흐림(filter)은 배경 흐림과 겹치면 버벅여서 빼고, 이동·투명도만 GPU 로
          transform: isHeaderHidden ? 'translate3d(0,-100%,0)' : 'translate3d(0,0,0)',
          opacity: isHeaderHidden ? 0 : 1,
          transition: isHeaderHidden
            ? 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.32s ease-out, background-color 0.2s'
            : 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.38s ease-out 0.04s, background-color 0.2s',
          willChange: 'transform, opacity',
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
            {(() => { const dd = activeDdays(data?.system?.events); return dd.length > 0 ? <HeaderDday items={dd} /> : null; })()}
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
        ).map(n => (newBuild && String(n.id).startsWith('auto-patch')
          // 새 버전이 나왔는데 아직 예전 화면이면: 공지에 새로고침 버튼
          ? { ...n, links: [{ title: '새로고침해서 새 버전 쓰기', url: RELOAD_LINK }, ...(n.links || [])] }
          : n)).map(n => (String(n.id).startsWith('auto-patch')
          ? { ...n, links: (n.links || []).map(l => (l.title === '패치노트 보기' ? { ...l, title: '패치노트 읽기' } : l)) }
          : n));
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
              markdown: maintenanceStatus.completedNoticeMarkdown.replace(/하겠어요\./g, '할 거예요.')
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

            {/* Tab Content (한 번 연 탭은 계속 붙여 둬서 다시 열 때 바로 보임) */}
            <div ref={tabContentRef} id="tab-content-container" className="pb-24 sm:pb-8">
              <div id="summary-tab-view" className={activeTab === 'summary' ? 'block' : 'hidden'}>
                <SummaryTab data={data} fetchLogs={fetchLogsByDateRange} isActive={activeTab === 'summary'} />
              </div>
 {mountedTabs.has('calendar') && (
              <div id="calendar-tab-view" className={activeTab === 'calendar' ? 'block' : 'hidden'}>
                <Suspense fallback={<TabSpinner />}>
                <CalendarTab 
                  data={data} 
                  fetchLogs={fetchLogsByDateRange} 
                  selectedDateStr={selectedCalendarDate}
                  onClearSelectedDate={() => setSelectedCalendarDate(null)}
                  isActive={activeTab === 'calendar'}
                />
                </Suspense>
              </div>
              )}
              {mountedTabs.has('detailed') && (
              <div id="detailed-tab-view" className={activeTab === 'detailed' ? 'block' : 'hidden'}>
                <Suspense fallback={<TabSpinner />}>
                <DetailedStatsTab 
                  data={data} 
                  fetchLogs={fetchLogsByDateRange} 
                  isActive={activeTab === 'detailed'} 
                  onNavigateToCalendar={handleNavigateToCalendar}
                  onNavigateToRecommend={handleNavigateToRecommend}
                />
                </Suspense>
              </div>
              )}
              {mountedTabs.has('recommend') && (
              <div id="recommend-tab-view" className={activeTab === 'recommend' ? 'block' : 'hidden'}>
                <Suspense fallback={<TabSpinner />}>
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
                </Suspense>
              </div>
              )}
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

                  <Suspense fallback={null}>
                  <SettingsView 
                    notifyChoices={notifyChoices}
                    user={user}
                    system={data.system}
                    firstYear={firstYear}
                    onLogout={handleLogout}
                    onClose={() => closeSettings()}
                    onOpenFeedback={openFeedback}
                onOpenSetup={() => setSetupGuide({})}
                onOpenTutorial={data.system?.tutorialEnabled !== false ? () => { closeSettings(); window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 450); } : undefined}
                    onOpenNotice={() => setShowNoticesPage(true)}
                    onOpenTerms={() => setPolicyType('terms')}
                    onOpenPrivacy={() => setPolicyType('privacy')}
                    onOpenPatchNotes={() => {
                      setIsSettingsOpen(false);
                      navigate('/patch', { state: { fromSettings: true } });
                    }}
                    initialSection={settingsInitialSection}
                  />
              </Suspense>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 모바일 설정창 (열고 닫을 때 모두 iOS 화면 전환처럼 옆으로 밀림) */}
      <AnimatePresence custom={settingsInstantExitRef.current} onExitComplete={() => { settingsInstantExitRef.current = false; }}>
        {isSettingsOpen && (
          <motion.div
            key="settings-mobile-drawer"
            initial={{ x: '100%', boxShadow: '-12px 0 40px rgba(0,0,0,0)' }}
            animate={{ x: 0, boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }}
            // 오른쪽으로 밀려 나감, 단 아이폰에서 쓸어서 뒤로 가기면 바로 사라짐 (사파리 효과와 겹치지 않게)
            variants={{ gone: (instant: boolean) => (instant
              ? { opacity: 0, transition: { duration: 0 } }
              : { x: '100%', boxShadow: '-12px 0 40px rgba(0,0,0,0)', transition: { type: 'spring', damping: 36, stiffness: 360, mass: 0.9 } }) }}
            exit="gone"
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
              <Suspense fallback={null}>
              <SettingsView 
                notifyChoices={notifyChoices}
                user={user}
                system={data.system}
                firstYear={firstYear}
                onLogout={handleLogout}
                onClose={() => closeSettings()}
                onOpenFeedback={openFeedback}
                onOpenSetup={() => setSetupGuide({})}
                onOpenTutorial={data.system?.tutorialEnabled !== false ? () => { closeSettings(); window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 450); } : undefined}
                onOpenNotice={() => setShowNoticesPage(true)}
                onOpenTerms={() => setPolicyType('terms')}
                onOpenPrivacy={() => setPolicyType('privacy')}
                onOpenPatchNotes={() => {
                  setIsSettingsOpen(false);
                  navigate('/patch', { state: { fromSettings: true } });
                }}
                initialSection={settingsInitialSection}
              />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Floating Bottom Nav Dock (Unified Island Tab Bar + Floating '+' Action Button) */}
      <AnimatePresence>
        {showNoticesPage && (
          <Suspense fallback={null}>
            <NoticesView key="notices" system={data.system} onClose={() => setShowNoticesPage(false)} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {setupGuide && (
          <Suspense fallback={null}>
            <SetupGuides key="setup-guides" initial={setupGuide.kind} mode={setupGuide.mode} onClose={() => setSetupGuide(null)} />
          </Suspense>
        )}
      </AnimatePresence>
      {/* 저장 버튼 → 저장할 곳 고르기 창·알림 */}
      <AiSummaryHost />
      <SaveHost />
      {/* 시청 기록 전체 보기 */}
      <AnimatePresence>{historyOpen && <WatchHistoryPage key="history" onClose={() => setHistoryOpen(false)} />}</AnimatePresence>
      {afterInstall && (
        <Suspense fallback={null}>
          <AfterInstallPrompt onOpen={(k) => setSetupGuide({ kind: k })} />
        </Suspense>
      )}
      {/* 처음 시작 화면: 아직 안 본(또는 관리자가 버전을 올린) 경우에만 불러옴 */}
      {data.system?.onboardingEnabled !== false && onboardingSeenVersion() < (Number(data.system?.onboardingVersion) || 1) && (
        <Suspense fallback={null}>
          <Onboarding
            enabled
            version={Number(data.system?.onboardingVersion) || 1}
            system={data.system}
            tutorialEnabled={data.system?.tutorialEnabled !== false}
          />
        </Suspense>
      )}
      <Tutorial
        enabled={data.system?.tutorialEnabled !== false}
        autoStart={data.system?.onboardingEnabled === false}
        activeTab={activeTab}
        onTabChange={(t) => handleTabChangeRef.current(t)}
        onCloseSettings={() => closeSettingsRef.current?.()}
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
    <Suspense fallback={<LoadingScreen progress={60} statusText="불러오는 중" />}>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/patch" element={<PatchNotesPage />} />
        <Route path="/patch/:version" element={<PatchNotesPage />} />
        <Route path="/selftest" element={<Suspense fallback={null}><SelfTestPage /></Suspense>} />
        {/* '/patch-1.1.0' · '/patch-v1.1.0' (라우터는 'patch-:version' 같은 반쪽 주소를 못 읽어서 직접 나눔) */}
        <Route path="/:slug" element={<SlugRoute />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/licenses" element={<LicensePage />} />
      </Routes>
    </Suspense>
  );
}
