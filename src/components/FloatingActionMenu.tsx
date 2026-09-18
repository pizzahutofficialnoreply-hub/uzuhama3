import { useState, useRef, useEffect } from 'react';
import { Plus, Video, PlaySquare, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { UserContributeModal } from './UserContributeModal';
import { LoginOnboardingModal } from './LoginOnboardingModal';
import { SystemConfig, BroadcastLog } from '../types';

export function FloatingActionMenu({ system, logs }: { system?: SystemConfig, logs?: Record<string, BroadcastLog> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalType, setModalType] = useState<'live' | 'video' | 'shorts' | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'live' | 'video' | 'shorts' | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, loginWithGoogle } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let userIsScrolling = false;
    let scrollTimeout: ReturnType<typeof setTimeout>;
    let restoreTimeout: ReturnType<typeof setTimeout>;

    const handleManualScrollStart = () => {
      userIsScrolling = true;
      clearTimeout(scrollTimeout);
      clearTimeout(restoreTimeout);
      scrollTimeout = setTimeout(() => {
        userIsScrolling = false;
      }, 200);
    };

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      clearTimeout(restoreTimeout);

      if (userIsScrolling && currentScrollY > lastScrollY.current && currentScrollY > 150) {
        setIsVisible(false);
        setIsOpen(false);
        // 사용자가 스크롤을 멈추면 몇 초(1.5초) 후 +버튼 자동 복원 표시
        restoreTimeout = setTimeout(() => {
          setIsVisible(true);
        }, 1500);
      } else if (currentScrollY <= lastScrollY.current || currentScrollY <= 150) {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    
    window.addEventListener('wheel', handleManualScrollStart, { passive: true });
    window.addEventListener('touchmove', handleManualScrollStart, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('wheel', handleManualScrollStart);
      window.removeEventListener('touchmove', handleManualScrollStart);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
      clearTimeout(restoreTimeout);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = async (type: 'live' | 'video' | 'shorts') => {
    if (!user) {
      setPendingAction(type);
      setIsOpen(false);
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
    
    setIsOpen(false);
    setModalType(type);
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.9 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { staggerChildren: 0.05, staggerDirection: -1 }
    },
    exit: { 
      opacity: 0, 
      y: 10, 
      scale: 0.9,
      transition: { staggerChildren: 0.05, staggerDirection: 1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 }
  };

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            ref={menuRef} 
            className="fixed bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] sm:bottom-8 right-4 sm:right-8 z-50 flex flex-col items-end gap-3"
          >
            <AnimatePresence>
              {isOpen && (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex flex-col gap-2 items-end"
                >
                  <motion.button variants={itemVariants} onClick={() => handleAction('shorts')} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                    <span className="text-sm font-medium">쇼츠 추가</span>
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                      <Youtube className="w-4 h-4" />
                    </div>
                  </motion.button>
                  <motion.button variants={itemVariants} onClick={() => handleAction('video')} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                    <span className="text-sm font-medium">영상 추가</span>
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Video className="w-4 h-4" />
                    </div>
                  </motion.button>
                  <motion.button variants={itemVariants} onClick={() => handleAction('live')} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                    <span className="text-sm font-medium">생방송 추가</span>
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                      <PlaySquare className="w-4 h-4" />
                    </div>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={() => setIsOpen(!isOpen)}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isOpen ? 'bg-zinc-800/80 backdrop-blur-lg text-white rotate-45 dark:bg-zinc-200/80 dark:text-zinc-900' : 'bg-purple-600/50 saturate-[0.7] backdrop-blur-xl text-white hover:bg-purple-600/70 hover:scale-105'}`}
            >
              <Plus className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="sm:hidden fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

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
            } catch(e) {}
          }}
        />
      )}
    </>
  );
}
