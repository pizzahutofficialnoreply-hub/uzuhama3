/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Tv, BarChart2, Calendar as CalendarIcon, FileText, Lock, X, PlaySquare, ExternalLink } from 'lucide-react';
import { useFirebaseData } from './hooks/useFirebaseData';
import { SummaryTab } from './components/tabs/SummaryTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { DetailedStatsTab } from './components/tabs/DetailedStatsTab';
import { RecommendTab } from './components/tabs/RecommendTab';
import { AdminRoute } from './components/AdminRoute';
import { NoticeModal } from './components/NoticeModal';
import { FeedbackModal } from './components/FeedbackModal';
import { LoginOnboardingModal } from './components/LoginOnboardingModal';
import { PolicyModal } from './components/PolicyModal';
import { PolicyPage } from './components/PolicyPage';
import { ReAgreementModal } from './components/ReAgreementModal';
import { TermsRevisionModal } from './components/TermsRevisionModal';
import { FloatingActionMenu } from './components/FloatingActionMenu';
import { LicensePage } from './components/LicensePage';
import { CurrentProbability } from './components/CurrentProbability';
import { cn } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';

type Tab = 'summary' | 'calendar' | 'detailed' | 'recommend';

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
import { Download, LogIn } from 'lucide-react';
import { UserMenu } from './components/UserMenu';
import { useAuth } from './hooks/useAuth';

function MainApp() {
  const { data, loading, fetchLogsByDateRange, fetchLatestLogs, rateVideo } = useFirebaseData();
  const { isInstallable, promptInstall } = useInstallPrompt();
  const { user, loginWithGoogle, logout } = useAuth();
  useRealtimeNotification(Object.values(data?.logs || {})); // 실시간 제보 심사 결과 및 최고 확률 안내 알림 수신 브릿지 활성화
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (localStorage.getItem('uzuhama_active_tab') as Tab) || 'summary';
  });
  
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
  
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [hideSmallNotice, setHideSmallNotice] = useState(false);
  const [policyType, setPolicyType] = useState<'terms' | 'privacy' | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [recommendTargetCategory, setRecommendTargetCategory] = useState<string | null>(null);
  const [recommendTargetSearchTerm, setRecommendTargetSearchTerm] = useState<string | null>(null);

  const handleNavigateToCalendar = (dateStr: string) => {
    setSelectedCalendarDate(dateStr);
    handleTabChange('calendar');
  };

  const handleNavigateToRecommend = (category?: string, searchTerm?: string) => {
    if (category) setRecommendTargetCategory(category);
    if (searchTerm) setRecommendTargetSearchTerm(searchTerm);
    handleTabChange('recommend');
  };

  // 로그인 시도 핸들러: 기존 로그인 이력이 있는 사용자는 약관 동의 및 혜택 안내 팝업 없이 즉시 구글 로그인
  const handleInitiateLogin = async () => {
    const hasLoggedInBefore = localStorage.getItem('has_logged_in_before') === 'true';
    if (hasLoggedInBefore) {
      try {
        const result = await loginWithGoogle();
        if (result && result.user) {
          localStorage.setItem('has_logged_in_before', 'true');
          localStorage.setItem(`consent_${result.user.uid}`, 'true');
          localStorage.setItem(`consent_version_${result.user.uid}`, String(data?.system?.termsVersion || 1));
        }
      } catch (e) {
        console.error('Login error:', e);
      }
    } else {
      // 첫 방문/기존 로그인 이력이 없는 경우에만 혜택 안내 및 약관 동의 팝업 표시
      setShowLoginModal(true);
    }
  };

  const probContainerRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!probContainerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsProbVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    observer.observe(probContainerRef.current);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
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

  
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tabContentRef.current) {
      const y = tabContentRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center text-zinc-500">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p>{isLoggingOut ? '로그아웃 중입니다...' : '데이터를 불러오는 중입니다...'}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sortedDates = Object.keys(data.logs).map(k => data.logs[k].date).sort();
  const firstYear = sortedDates.length > 0 ? sortedDates[0].substring(0, 4) : '2026';

  const isMaintenanceActive = (() => {
    if (!data.system?.maintenance) return false;
    if (data.system.maintenanceEnd) {
      const endTime = new Date(data.system.maintenanceEnd).getTime();
      // 설정된 종료 시간이 지나면 자동으로 점검 모드 종료
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
        <h1 className="text-3xl font-black text-zinc-900 dark:text-white mb-4">점검 중입니다</h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed whitespace-pre-wrap">
          {data.system?.noticeContent ? formatNoticeText(data.system.noticeContent) : "현재 사이트 업데이트 및 점검 작업이 진행 중입니다.\n이용에 불편을 드려 죄송합니다."}
        </p>

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
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30">
      
      {/* System Big Notice Modal */}
      {data.system?.noticeType === 'big' && !dismissedSystemNotice && data.system.noticeList && data.system.noticeList.filter(n => n.active).length > 0 && (
        <NoticeModal 
          notices={data.system.noticeList.filter(n => n.active)} 
          onClose={() => setDismissedSystemNotice(true)} 
        />
      )}

      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
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
            adminEmail={data.system?.adminEmail || 'admin@example.com'}
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

      {user && data.system?.termsVersion && !data.system?.termsRevision && localStorage.getItem(`consent_version_${user.uid}`) !== String(data.system.termsVersion) && (
        <ReAgreementModal 
          onAgree={() => {
            localStorage.setItem(`consent_version_${user.uid}`, String(data.system!.termsVersion));
            // Force re-render
            setForceRender(prev => prev + 1); 
          }}
          onLogout={handleLogout}
        />
      )}

      {showLoginModal && (
        <LoginOnboardingModal 
          onClose={() => setShowLoginModal(false)}
          onLogin={async () => {
            setShowLoginModal(false);
            try {
              const result = await loginWithGoogle();
              if (result && result.user) {
                localStorage.setItem('has_logged_in_before', 'true');
                localStorage.setItem(`consent_${result.user.uid}`, 'true');
                localStorage.setItem(`consent_version_${result.user.uid}`, String(data.system?.termsVersion || 1));
              }
            } catch(e) {}
          }}
        />
      )}

      {/* Notice Modal (Default disclaimer) */}
      {showNotice && data.system?.noticeType !== 'big' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => closeNotice(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
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
                className="px-6 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
        {data.system?.noticeType === 'small' && data.system.noticeContent && (
          <div className="bg-purple-600 text-white text-xs sm:text-sm font-medium py-2 px-4 text-center leading-relaxed">
            {formatNoticeText(data.system.noticeContent)}
          </div>
        )}
        {data.system?.noticeList?.filter(n => n.active && n.type === 'small').map(n => {
          const links = (n.links && n.links.length > 0)
            ? n.links
            : (n.linkUrl ? [{ url: n.linkUrl, title: n.linkText || '자세히 보기' }] : []);

          return (
            <div key={n.id} className="bg-purple-700 text-white text-xs sm:text-sm font-medium py-2 px-4 text-center leading-relaxed flex items-center justify-center gap-2 flex-wrap border-b border-purple-800/40">
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
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              우주하마 방송 예측
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold h-8">
            <AnimatePresence>
              {!isProbVisible && currentProb !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 1.2, y: 30, x: -30 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, scale: 1.2, y: 30, x: -30 }}
                  transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
                  className="flex items-center gap-2 origin-right mr-2"
                >
                  <span className="hidden sm:inline text-zinc-500">현재 확률:</span>
                  <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    {currentProb?.toFixed(1)}%
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {user ? (
              <UserMenu 
                user={user} 
                onLogout={handleLogout} 
                system={data.system} 
                onOpenNotice={() => {
                  setShowNotice(true);
                  setDismissedSystemNotice(false);
                }} 
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleInitiateLogin}
                  className="flex items-center justify-center p-2 sm:px-3 sm:py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-full transition-colors"
                  title="로그인"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline-block ml-1.5 text-xs font-bold">로그인</span>
                </button>
                <UserMenu 
                  user={null} 
                  onLogin={handleInitiateLogin}
                  onLogout={handleLogout} 
                  system={data.system} 
                  onOpenNotice={() => {
                    setShowNotice(true);
                    setDismissedSystemNotice(false);
                  }} 
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        
        {/* Main Realtime Indicator (Always visible on top) */}
        <div ref={probContainerRef} id="main-prob-container" className="mb-12">
          <CurrentProbability logs={Object.values(data.logs)} onProbChange={setCurrentProb} system={data.system} />
        </div>

        {/* Desktop Tabs Navigation */}
        <div className="hidden sm:flex items-center gap-6 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 mb-8">
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
        <div ref={tabContentRef} className="pb-32 sm:pb-0">
          <div className={activeTab === 'summary' ? 'block' : 'hidden'}>
            <SummaryTab data={data} fetchLogs={fetchLogsByDateRange} isActive={activeTab === 'summary'} />
          </div>
          <div className={activeTab === 'calendar' ? 'block' : 'hidden'}>
            <CalendarTab 
              data={data} 
              fetchLogs={fetchLogsByDateRange} 
              selectedDateStr={selectedCalendarDate}
              onClearSelectedDate={() => setSelectedCalendarDate(null)}
              isActive={activeTab === 'calendar'}
            />
          </div>
          <div className={activeTab === 'detailed' ? 'block' : 'hidden'}>
            <DetailedStatsTab 
              data={data} 
              fetchLogs={fetchLogsByDateRange} 
              isActive={activeTab === 'detailed'} 
              onNavigateToCalendar={handleNavigateToCalendar}
              onNavigateToRecommend={handleNavigateToRecommend}
            />
          </div>
          <div className={activeTab === 'recommend' ? 'block' : 'hidden'}>
            <RecommendTab 
              data={data} 
              rateVideo={rateVideo} 
              targetCategory={recommendTargetCategory}
              targetSearchTerm={recommendTargetSearchTerm}
              onClearTarget={() => {
                setRecommendTargetCategory(null);
                setRecommendTargetSearchTerm(null);
              }}
              isActive={activeTab === 'recommend'}
            />
          </div>
        </div>
      </main>
      
      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 z-50 pt-1 pb-[calc(max(env(safe-area-inset-bottom),10px)+8px)] shadow-lg transition-all duration-200">
        <div className="flex items-center justify-around h-14">
          <button
            onClick={() => handleTabChange('summary')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full py-1 space-y-1 transition-colors",
              activeTab === 'summary' 
                ? "text-purple-600 dark:text-purple-400" 
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">요약</span>
          </button>
          
          <button
            onClick={() => handleTabChange('calendar')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full py-1 space-y-1 transition-colors",
              activeTab === 'calendar' 
                ? "text-purple-600 dark:text-purple-400" 
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium">기록</span>
          </button>
          
          <button
            onClick={() => handleTabChange('detailed')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full py-1 space-y-1 transition-colors",
              activeTab === 'detailed' 
                ? "text-purple-600 dark:text-purple-400" 
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            <BarChart2 className="w-5 h-5" />
            <span className="text-[10px] font-medium">분석</span>
          </button>

          <button
            onClick={() => handleTabChange('recommend')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full py-1 space-y-1 transition-colors",
              activeTab === 'recommend' 
                ? "text-purple-600 dark:text-purple-400" 
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            <PlaySquare className="w-5 h-5" />
            <span className="text-[10px] font-medium">추천</span>
          </button>
        </div>
      </nav>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-zinc-500 dark:text-zinc-500 text-sm mb-24 sm:mb-0">
        <p>※ 본 데이터는 {firstYear}년 이후 데이터만 포함하며, 생방송 패턴을 바탕으로 분석된 예측치이므로 실제 일정과 다를 수 있습니다.</p>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          본 데이터 중 {firstYear}~2025년의 데이터는 {data.system?.archiveSourceUrl ? (
            <a 
              href={data.system.archiveSourceUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="text-purple-600 dark:text-purple-400 font-semibold underline hover:text-purple-700"
            >
              우주하마 생방송 스프레드시트
            </a>
          ) : (
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">우주하마 생방송 스프레드시트</span>
          )}에서 가져왔습니다.
        </p>
        
        <p className="mt-2 text-[10px] text-zinc-400">※ 본 사이트는 사용자 설정 유지를 위해 브라우저의 로컬 저장소를 일부 사용합니다.</p>
        
        
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm font-bold">
          <a href="https://www.youtube.com/@uzuhama" target="_blank" rel="noreferrer" className="text-zinc-600 dark:text-zinc-400 hover:text-red-500 transition-colors">유튜브</a>
          <a href="https://chzzk.naver.com/c6e1c8cf1b128bd321cc2684c92b5a00" target="_blank" rel="noreferrer" className="text-zinc-600 dark:text-zinc-400 hover:text-green-500 transition-colors">치지직</a>
          <a href="https://cafe.naver.com/uzuhama" target="_blank" rel="noreferrer" className="text-zinc-600 dark:text-zinc-400 hover:text-green-600 transition-colors">우주하마 팬카페</a>
        </div>
        
        <div className="mt-6 flex flex-col items-center gap-2">
          <a 
            href="/licenses"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 uppercase tracking-widest font-bold transition-colors"
          >
            Open Source Licenses
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs">
          <span>&copy; {new Date().getFullYear()} 우주하마 방송 예측</span>
          <span>|</span>
          <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-purple-500 transition-colors">이용약관</a>
          <span>|</span>
          <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-purple-500 transition-colors">개인정보처리방침</a>
          <span>|</span>
          <a 
            href={`mailto:${data.system?.adminEmail || 'example@gmail.com'}`} 
            className="hover:text-purple-500 transition-colors"
          >
            문의: {data.system?.adminEmail || 'example@gmail.com'}
          </a>
        </div>
      </footer>
      
      {policyType && (
        <PolicyModal 
          type={policyType} 
          system={data.system} 
          onClose={() => setPolicyType(null)} 
        />
      )}
      <FloatingActionMenu system={data.system} logs={data.logs} />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/licenses" element={<LicensePage />} />
      </Routes>
    </>
  );
}
