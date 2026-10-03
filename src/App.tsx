/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Tv, BarChart2, Calendar as CalendarIcon, FileText, Lock, X, PlaySquare, ExternalLink } from 'lucide-react';
import { useFirebaseData } from './hooks/useFirebaseData';
import { SummaryTab } from './components/tabs/SummaryTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { DetailedStatsTab } from './components/tabs/DetailedStatsTab';
import { RecommendTab } from './components/tabs/RecommendTab';
import { AdminRoute } from './components/AdminRoute';
import { NoticeModal } from './components/NoticeModal';
import { FeedbackModal } from './components/FeedbackModal';
import { PolicyModal } from './components/PolicyModal';
import { PolicyPage } from './components/PolicyPage';
import { TermsRevisionModal } from './components/TermsRevisionModal';
import { FloatingBottomNav } from './components/FloatingBottomNav';
import { LicensePage } from './components/LicensePage';
import { PatchNotesPage } from './components/PatchNotesPage';
import { CurrentProbability } from './components/CurrentProbability';
import { AnonymousPollCard } from './components/AnonymousPollCard';
import { LoadingScreen } from './components/LoadingScreen';
import { cn, useBodyScrollLock, resetBodyScrollLock } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Tab, NoticeLink } from './types';
import { applyTabGlassCssVars, getSavedTabGlassValue } from './utils/tabGlass';

export function formatNoticeText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Escape HTML first to prevent XSS if we use dangerouslySetInnerHTML
    let safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Auto-link URLs
    safeLine = safeLine.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 hover:underline break-all">$1</a>'
    );
    
    // Basic regex replacement for *bold*, _italic_, ~strike~
    let formatted = safeLine
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>');
      
    return (
      <React.Fragment key={i}>
        <span dangerouslySetInnerHTML={{ __html: formatted }} />
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRealtimeNotification } from './hooks/useRealtimeNotification';
import { Download, LogIn, ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { SettingsView } from './components/SettingsView';
import { useAuth } from './hooks/useAuth';

function MainApp() {
  const navigate = useNavigate();
  const { data, loading, loadingProgress, loadingStatusText, isFirstRun, fetchLogsByDateRange, fetchLatestLogs, rateVideo } = useFirebaseData();
  const { isInstallable, promptInstall } = useInstallPrompt();
  const { user, loginWithGoogle, logout } = useAuth();
  useRealtimeNotification(Object.values(data?.logs || {})); // 실시간 제보 심사 결과 및 최고 확률 안내 알림 수신 브릿지 활성화
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = (localStorage.getItem('uzuhama_active_tab') as Tab) || 'summary';
    // 검색 탭을 마지막으로 앱을 종료했으면 요약 탭에서 시작하도록 강제 리셋
    if (saved === 'recommend') {
      return 'summary';
    }
    return saved;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  const handleNavigateToRecommend = (category?: string, searchTerm?: string) => {
    isAutoNavigatedRef.current = true;
    autoNavSourceTabRef.current = activeTab;
    if (category) setRecommendTargetCategory(category);
    if (searchTerm) {
      setRecommendTargetSearchTerm(searchTerm);
      setGlobalSearchTerm(searchTerm);
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
    const noticeSeen = localStorage.getItem('notice_seen_v1');
    if (!noticeSeen) {
      setShowNotice(true);
    }
  }, []);

  // 점검 모드 시간 체크 (1초마다 갱신하여 점검 종료 시간에 도달하면 즉시 자동 종료)
  const [nowTime, setNowTime] = useState(() => Date.now());
  useEffect(() => {
    if (data?.system?.maintenance) {
      const timer = window.setInterval(() => {
        setNowTime(Date.now());
      }, 1000);
      return () => window.clearInterval(timer);
    }
  }, [data?.system?.maintenance]);

  // 탭별 스크롤 위치 기억 맵 (다른 탭 이동 시 기존 스크롤 위치 복원)
  const tabScrollPositions = useRef<Record<Tab, number>>({
    summary: 0,
    calendar: 0,
    detailed: 0,
    recommend: 0,
  });

  // 상단 헤더 스크롤 방향 및 자동 스크롤 오프셋 감지
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const autoScrollBaseYRef = useRef(0);

  // 모바일 전용 탭 제목 위치 산출
  const computeMobileTabTitleY = () => {
    if (typeof window === 'undefined') return 0;
    if (window.innerWidth >= 640) return 0; // 모바일에서만 작동
    if (tabContentRef.current) {
      const rect = tabContentRef.current.getBoundingClientRect();
      const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
      return Math.max(0, currentY + rect.top - 62);
    }
    return 0;
  };

  // 스크롤 시 현재 탭의 스크롤 위치 실시간 기록 및 헤더 숨김/표시 처리
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      tabScrollPositions.current[activeTab] = currentScrollY;

      const deltaY = currentScrollY - lastScrollYRef.current;

      // 최상단 근처에서는 항상 헤더 표시
      if (currentScrollY <= 15) {
        setIsHeaderHidden(false);
        autoScrollBaseYRef.current = 0;
      } else if (isSettingsOpen) {
        setIsHeaderHidden(false);
      } else {
        // "자동 스크롤양을 제외한 어느 정도 스크롤이 이루어졌을 시" (사라지는 스크롤 정도를 약간 더 길게 조정: 110px)
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
  // - 일반탭 <-> 일반탭: 탭 시작 지점으로 부드러운 자동 스크롤 애니메이션 ('smooth')
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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    if (activeTab === 'recommend') {
      targetY = isAutoNav ? (tabScrollPositions.current['recommend'] || 0) : 0;
      tabScrollPositions.current['recommend'] = targetY;
    } else {
      const saved = tabScrollPositions.current[activeTab] || 0;
      if (isMobile && saved === 0) {
        // 모바일에서 아직 스크롤하지 않은 탭은 탭 시작 지점(제목 부분)으로 자동 스크롤
        targetY = computeMobileTabTitleY();
        autoScrollBaseYRef.current = targetY;
      } else {
        targetY = saved;
      }
    }

    const isSearchTransition = previousTab === 'recommend' || activeTab === 'recommend';

    if (isSearchTransition) {
      // 검색탭->일반탭 또는 일반탭->검색탭일 경우 애니메이션 없음
      window.scrollTo({ top: targetY, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
    } else {
      // 일반탭 간 전환일 경우 탭 시작 지점으로 부드러운 스크롤 애니메이션 적용
      window.scrollTo({ top: targetY, left: 0, behavior: 'smooth' as ScrollBehavior });
    }
  }, [activeTab]);

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

  if (loading || isLoggingOut) {
    return (
      <LoadingScreen 
        progress={isLoggingOut ? 95 : loadingProgress} 
        statusText={isLoggingOut ? '로그아웃 세션을 안전하게 정리하는 중입니다...' : loadingStatusText} 
        isFirstRun={isFirstRun} 
      />
    );
  }

  if (!data) return null;

  const sortedDates = Object.keys(data.logs).map(k => data.logs[k].date).sort();
  const firstYear = sortedDates.length > 0 ? sortedDates[0].substring(0, 4) : '2026';

  const isMaintenanceActive = (() => {
    if (!data.system?.maintenance) return false;
    
    // 시작 시간이 설정되어 있는 경우 (예약 점검): 시작 시간 전이면 아직 점검 시작 전
    if (data.system.maintenanceStart) {
      const startTime = new Date(data.system.maintenanceStart).getTime();
      if (!isNaN(startTime) && nowTime < startTime) {
        return false;
      }
    }

    // 종료 시간이 설정되어 있는 경우: 종료 시간이 경과했으면 점검 자동 종료
    if (data.system.maintenanceEnd) {
      const endTime = new Date(data.system.maintenanceEnd).getTime();
      if (!isNaN(endTime) && nowTime >= endTime) {
        return false;
      }
    }
    return true;
  })();

  if (isMaintenanceActive) {
    const endTimeMs = data.system?.maintenanceEnd ? new Date(data.system.maintenanceEnd).getTime() : null;
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

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center p-6 text-center">
        <Lock className="w-16 h-16 text-zinc-400 mb-6" />
        <h1 className="text-3xl font-black text-zinc-900 dark:text-white mb-4">
          {data.system?.maintenanceTitle?.trim() || "점검 중입니다"}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed whitespace-pre-wrap">
          {data.system?.maintenanceContent?.trim() 
            ? formatNoticeText(data.system.maintenanceContent) 
            : (data.system?.noticeContent 
                ? formatNoticeText(data.system.noticeContent) 
                : "현재 사이트 업데이트 및 점검 작업이 진행 중입니다.\n이용에 불편을 드려 죄송합니다.")}
        </p>

        {/* 점검 공지 관련 링크 버튼 목록 */}
        {(() => {
          const links: NoticeLink[] = (data.system?.maintenanceLinks && data.system.maintenanceLinks.length > 0)
            ? data.system.maintenanceLinks.filter(l => Boolean(l.url))
            : (data.system?.maintenanceLinkUrl ? [{ url: data.system.maintenanceLinkUrl, title: data.system.maintenanceLinkText || '관련 링크 바로가기' }] : []);

          if (links.length === 0) return null;

          return (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 max-w-md w-full mx-auto">
              {links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-sm font-bold shadow-sm transition-all touch-manipulation cursor-pointer"
                >
                  <span>{link.title || link.url}</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </a>
              ))}
            </div>
          );
        })()}

        {(data.system?.maintenanceStart || data.system?.maintenanceEnd) && (
          <div className="mt-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 w-full max-w-md text-left shadow-sm">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">점검 시간 안내</h2>
            {data.system.maintenanceStart && (
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-zinc-500">시작:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {data.system.maintenanceStart.replace('T', ' ')}
                </span>
              </div>
            )}
            {data.system.maintenanceEnd && (
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-zinc-500">종료 예정:</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {data.system.maintenanceEnd.replace('T', ' ')}
                </span>
              </div>
            )}
            {remainingSeconds !== null && remainingSeconds > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-sm">
                <span className="text-purple-600 dark:text-purple-400 font-bold">남은 시간:</span>
                <span className="font-extrabold text-purple-600 dark:text-purple-400">
                  {formatRemaining(remainingSeconds)}
                </span>
              </div>
            )}
          </div>
        )}

        <Link to="/admin" className="mt-8 text-xs text-transparent select-none transition-colors">
          Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30 flex flex-col overflow-x-clip w-full">
      
      {/* System Big Notice Modal */}
      {data.system?.noticeType === 'big' && !dismissedSystemNotice && data.system.noticeList && data.system.noticeList.filter(n => n.active).length > 0 && (
        <NoticeModal 
          notices={data.system.noticeList.filter(n => n.active)} 
          onClose={() => setDismissedSystemNotice(true)} 
        />
      )}

      {showFeedbackModal && (
        <FeedbackModal onClose={() => closeFeedback()} system={data.system} />
      )}

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

      {/* Notice Modal (Default disclaimer) */}
      {showNotice && data.system?.noticeType !== 'big' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-5 sm:p-7 max-w-md w-full shadow-2xl relative">
            <button onClick={() => closeNotice(false)} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">알림</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed text-xs">
              본 사이트의 데이터는 생방송 패턴을 바탕으로 분석된 예측치이며, 
              실제 일정과 다를 수 있습니다. 이 점 참고하여 이용해 주시기 바랍니다. ({firstYear}년 이후 데이터만 수집/분석됩니다)
            </p>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hideSmallNotice}
                  onChange={(e) => setHideSmallNotice(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-zinc-300 dark:border-zinc-700 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">다시 보지 않기</span>
              </label>
              <button 
                onClick={() => closeNotice(hideSmallNotice)} 
                className="px-6 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
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
          isHeaderHidden ? "opacity-100" : "opacity-0"
        )}
      />

      <header 
        id="app-main-header"
        style={{ 
          transform: isHeaderHidden ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isHeaderHidden ? 0 : 1,
          transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)', 
          backdropFilter: 'blur(28px) saturate(180%)' 
        }}
        className={cn(
          "border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-black/70 backdrop-blur-3xl backdrop-saturate-180 sticky top-0 z-50 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5",
          isHeaderHidden && "pointer-events-none shadow-none border-b-transparent"
        )}
      >
        {data.system?.noticeType === 'small' && data.system.noticeContent && (
          <div className="bg-purple-600 text-white text-xs sm:text-sm font-medium py-2 px-3 sm:px-4 text-center leading-relaxed">
            {formatNoticeText(data.system.noticeContent)}
          </div>
        )}
        {data.system?.noticeList?.filter(n => n.active && n.type === 'small').map(n => {
          const links = (n.links && n.links.length > 0)
            ? n.links
            : (n.linkUrl ? [{ url: n.linkUrl, title: n.linkText || '자세히 보기' }] : []);

          return (
            <div key={n.id} className="bg-purple-700 text-white text-xs sm:text-sm font-medium py-2 px-3 sm:px-4 text-center leading-relaxed flex items-center justify-center gap-2 flex-wrap border-b border-purple-800/40">
              <span>{formatNoticeText(n.content || n.title)}</span>
              {links.map((link, lIdx) => (
                <a
                  key={lIdx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline text-white hover:text-purple-200 inline-flex items-center gap-1 ml-1 bg-purple-800/60 px-2 py-0.5 rounded text-xs transition-colors"
                >
                  <span>{link.title || '자세히 보기'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          );
        })}
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
              <CurrentProbability logs={Object.values(data.logs)} onProbChange={setCurrentProb} system={data.system} />
              <AnonymousPollCard system={data.system} polls={data.polls} />
            </div>

            {/* Desktop Tabs Navigation (상단 헤더와 유사한 블러 적용) */}
            <div 
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
                  searchTerm={globalSearchTerm}
                  onSearchTermChange={setGlobalSearchTerm}
                  onClearTarget={() => {
                    setRecommendTargetCategory(null);
                    setRecommendTargetSearchTerm(null);
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
                exit={
                  isAppleDevice 
                    ? { opacity: 0, width: 0, transition: { duration: 0.15 } }
                    : { opacity: 0, x: 40, width: 0, transition: { duration: 0.24, ease: [0.32, 0, 0.67, 0] } }
                }
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
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 모바일 설정창 (모든 기기 여는 애니메이션 적용, 애플 기기 제외 닫기 애니메이션 적용) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            key="settings-mobile-drawer"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={
              isAppleDevice 
                ? { opacity: 0, transition: { duration: 0 } } 
                : { opacity: 0, x: '100%', transition: { duration: 0.24, ease: [0.32, 0, 0.67, 0] } }
            }
            transition={{ type: 'spring', damping: 28, stiffness: 300, mass: 0.8 }}
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
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Floating Bottom Nav Dock (Unified Island Tab Bar + Floating '+' Action Button) */}
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
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/patch" element={<PatchNotesPage />} />
        <Route path="/patch-:version" element={<PatchNotesPage />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/licenses" element={<LicensePage />} />
      </Routes>
    </>
  );
}
