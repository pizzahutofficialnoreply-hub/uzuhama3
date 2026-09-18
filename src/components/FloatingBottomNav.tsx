import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, 
  Calendar as CalendarIcon, 
  BarChart2, 
  PlaySquare, 
  Plus, 
  X,
  Radio,
  Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tab, SystemConfig, BroadcastLog } from '../types';
import { useAuth } from '../hooks/useAuth';
import { UserContributeModal } from './UserContributeModal';
import { LoginOnboardingModal } from './LoginOnboardingModal';
import { cn } from '../utils';

interface FloatingBottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  system?: SystemConfig;
  logs?: Record<string, BroadcastLog>;
}

const ShortsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.23 6.74l1.2.49L6 14.93a3.75 3.75 0 003.5 6.63l8.5-4.5a3.74 3.74 0 00-.23-6.74zM10 14.65v-5.3L15 12l-5 2.65z" />
  </svg>
);

export function FloatingBottomNav({
  activeTab,
  onTabChange,
  isSettingsOpen,
  onCloseSettings,
  system,
  logs
}: FloatingBottomNavProps) {
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<'live' | 'video' | 'shorts' | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'live' | 'video' | 'shorts' | null>(null);

  const plusMenuRef = useRef<HTMLDivElement>(null);
  const { user, loginWithGoogle } = useAuth();

  const navTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'summary', label: '요약', icon: FileText },
    { id: 'calendar', label: '기록', icon: CalendarIcon },
    { id: 'detailed', label: '분석', icon: BarChart2 },
    { id: 'recommend', label: '추천', icon: PlaySquare },
  ];

  // Close plus menu on outside click or scroll
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    };

    if (isPlusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      window.addEventListener('scroll', () => setIsPlusMenuOpen(false), { passive: true });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', () => setIsPlusMenuOpen(false));
    };
  }, [isPlusMenuOpen]);

  const handleAction = async (type: 'live' | 'video' | 'shorts') => {
    if (!user) {
      setPendingAction(type);
      setIsPlusMenuOpen(false);
      const hasLoggedInBefore = localStorage.getItem('has_logged_in_before') === 'true';
      if (hasLoggedInBefore) {
        try {
          const result = await loginWithGoogle();
          if (result && result.user) {
            localStorage.setItem('has_logged_in_before', 'true');
            localStorage.setItem(`consent_${result.user.uid}`, 'true');
            setModalType(type);
            setPendingAction(null);
          }
        } catch (e) {
          console.error('Login error:', e);
        }
      } else {
        setShowLoginModal(true);
      }
      return;
    }

    setIsPlusMenuOpen(false);
    setModalType(type);
  };

  return (
    <>
      {/* Backdrop when '+' menu is open */}
      <AnimatePresence>
        {isPlusMenuOpen && (
          <motion.div
            key="plus-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsPlusMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs touch-none"
          />
        )}
      </AnimatePresence>

      {/* 탭바 밑부분 맨 끝부터 점차 탭바로 갈수록 연하게 처리되는 점진적 그래디언트 블러 레이어 (높이를 줄여 탭바/컨텐츠 겹침 방지) */}
      {!isSettingsOpen && (
        <div 
          aria-hidden="true"
          className="sm:hidden fixed bottom-0 inset-x-0 h-14 pointer-events-none z-20 transition-opacity duration-300"
          style={{
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}

      {/* Floating Dock Container (모바일 전용 sm:hidden) - PWA 기준 아래 여백 및 세로 길이 조정 */}
      {!isSettingsOpen && (
        <div 
          id="floating-bottom-dock"
          className="sm:hidden fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-1.5 pointer-events-none px-3 select-none pb-[max(0rem,calc(env(safe-area-inset-bottom)-20px))]"
        >
          {/* Main Tab Capsule Dock */}
          <nav 
            aria-label="하단 네비게이션"
            style={{ WebkitBackdropFilter: 'blur(32px) saturate(190%)', backdropFilter: 'blur(32px) saturate(190%)' }}
            className={cn(
              "pointer-events-auto flex items-center h-[62px] p-1 rounded-full backdrop-blur-3xl backdrop-saturate-180 transition-all duration-300 gap-1",
              // Dark Mode: translucent deep dark glass with ultra blur & subtle rim border
              "dark:bg-zinc-950/80 dark:border dark:border-white/15 dark:shadow-[0_12px_36px_rgba(0,0,0,0.7)]",
              // Light Mode: translucent white glass with ultra blur & soft shadow
              "bg-white/80 border border-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
            )}
          >
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-[68px] h-[54px] rounded-full transition-colors duration-150 touch-manipulation cursor-pointer select-none active:scale-95 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ring-0 border-0",
                    isActive
                      ? "dark:text-white text-zinc-950 font-bold"
                      : "dark:text-zinc-400 dark:hover:text-zinc-200 text-zinc-500 hover:text-zinc-900 font-medium"
                  )}
                  title={tab.label}
                >
                  {/* 원래의 매끄러운 탭바 인디케이터 애니메이션 복원 & 크기 살짝 키움(inset-0) & 블러 적용 & 그림자 제거 */}
                  {isActive && (
                    <motion.div
                      layoutId="floatingActiveTabPill"
                      style={{ WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
                      className="absolute inset-0 rounded-full bg-zinc-300/60 dark:bg-white/20 dark:border dark:border-white/10 backdrop-blur-md"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    />
                  )}

                  <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                    <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive && "scale-105")} />
                    <span className="text-[10px] tracking-tight mt-0.5">
                      {tab.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Circular '+' Button & Simple Menu Container */}
          <div 
            className="pointer-events-auto relative shrink-0" 
            ref={plusMenuRef}
          >
            {/* Popover Menu: + 버튼 위치에서 완전히 처음부터 솟아오르는(origin bottom-right) 새로운 애니메이션 */}
            <AnimatePresence>
              {isPlusMenuOpen && (
                <motion.div 
                  key="plus-floating-menu"
                  initial={{ opacity: 0, scale: 0.25, y: 35, x: 10 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    y: 0, 
                    x: 0,
                    transition: {
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                      mass: 0.8,
                      staggerChildren: 0.05,
                      delayChildren: 0.02
                    }
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0.25, 
                    y: 25, 
                    x: 8,
                    transition: {
                      duration: 0.16,
                      ease: "easeIn",
                      staggerChildren: 0.03,
                      staggerDirection: -1
                    }
                  }}
                  style={{ transformOrigin: 'bottom right' }}
                  className="absolute bottom-full right-0 mb-3 flex flex-col-reverse gap-2 items-end min-w-[145px]"
                >
                  {/* 1. 생방송 추가 */}
                  <motion.button
                    type="button"
                    style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
                    variants={{
                      hidden: { opacity: 0, scale: 0.4, y: 20 },
                      show: { 
                        opacity: 1, 
                        scale: 1, 
                        y: 0, 
                        transition: { type: "spring", stiffness: 420, damping: 24 } 
                      },
                      exit: { 
                        opacity: 0, 
                        scale: 0.4, 
                        y: 14, 
                        transition: { duration: 0.12, ease: "easeIn" } 
                      }
                    }}
                    onClick={() => handleAction('live')}
                    className="w-full flex items-center justify-between gap-4 pl-4 pr-3.5 py-2.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl active:scale-95 cursor-pointer transition-transform"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium text-[13px] tracking-tight">생방송 추가</span>
                    <PlaySquare className="w-4.5 h-4.5 text-purple-500 dark:text-purple-400" />
                  </motion.button>

                  {/* 2. 영상 추가 */}
                  <motion.button
                    type="button"
                    style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
                    variants={{
                      hidden: { opacity: 0, scale: 0.4, y: 20 },
                      show: { 
                        opacity: 1, 
                        scale: 1, 
                        y: 0, 
                        transition: { type: "spring", stiffness: 420, damping: 24 } 
                      },
                      exit: { 
                        opacity: 0, 
                        scale: 0.4, 
                        y: 14, 
                        transition: { duration: 0.12, ease: "easeIn" } 
                      }
                    }}
                    onClick={() => handleAction('video')}
                    className="w-full flex items-center justify-between gap-4 pl-4 pr-3.5 py-2.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl active:scale-95 cursor-pointer transition-transform"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium text-[13px] tracking-tight">영상 추가</span>
                    <Video className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
                  </motion.button>

                  {/* 3. 쇼츠 추가 */}
                  <motion.button
                    type="button"
                    style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
                    variants={{
                      hidden: { opacity: 0, scale: 0.4, y: 20 },
                      show: { 
                        opacity: 1, 
                        scale: 1, 
                        y: 0, 
                        transition: { type: "spring", stiffness: 420, damping: 24 } 
                      },
                      exit: { 
                        opacity: 0, 
                        scale: 0.4, 
                        y: 14, 
                        transition: { duration: 0.12, ease: "easeIn" } 
                      }
                    }}
                    onClick={() => handleAction('shorts')}
                    className="w-full flex items-center justify-between gap-4 pl-4 pr-3.5 py-2.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl active:scale-95 cursor-pointer transition-transform"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium text-[13px] tracking-tight">쇼츠 추가</span>
                    <ShortsIcon className="w-4.5 h-4.5 text-red-500 dark:text-red-400" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* '+' Action Button */}
            <button
              type="button"
              onClick={() => setIsPlusMenuOpen(prev => !prev)}
              aria-label={isPlusMenuOpen ? "메뉴 닫기" : "새 콘텐츠 제보"}
              style={{ WebkitBackdropFilter: 'blur(32px) saturate(190%)', backdropFilter: 'blur(32px) saturate(190%)' }}
              className={cn(
                "flex items-center justify-center w-[62px] h-[62px] rounded-full backdrop-blur-3xl backdrop-saturate-180 transition-colors duration-150 touch-manipulation cursor-pointer select-none outline-none focus:outline-none focus:ring-0 ring-0",
                "dark:bg-zinc-950/80 dark:border dark:border-white/15 dark:shadow-[0_12px_36px_rgba(0,0,0,0.7)] dark:text-zinc-200",
                "bg-white/80 border border-black/5 shadow-[0_12px_30px_rgba(0,0,0,0.12)] text-zinc-700",
                isPlusMenuOpen && "dark:bg-zinc-800 dark:text-white bg-zinc-200 text-zinc-900"
              )}
              title={isPlusMenuOpen ? "닫기" : "추가 및 제보"}
            >
              <motion.div
                animate={{ rotate: isPlusMenuOpen ? 45 : 0, scale: isPlusMenuOpen ? 1.08 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="flex items-center justify-center pointer-events-none"
              >
                <Plus className="w-5.5 h-5.5 stroke-2" />
              </motion.div>
            </button>
          </div>
        </div>
      )}

      {/* Contribution Modals */}
      {modalType && (
        <UserContributeModal 
          type={modalType} 
          onClose={() => setModalType(null)} 
          logs={logs}
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
                if (pendingAction) {
                  setModalType(pendingAction);
                  setPendingAction(null);
                }
              }
            } catch(e) {
              console.error('Login error:', e);
            }
          }}
        />
      )}
    </>
  );
}
