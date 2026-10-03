import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, User, Bell, Palette, Database, Megaphone, 
  BookOpen, FileText, ExternalLink, Mail, AlertCircle, Gavel, 
  ShieldCheck, Trash2, LogOut, ChevronRight, Check, RefreshCw,
  Copy, Smartphone, Sun, Moon, Laptop, Sparkles, Youtube, X, Share2, Type,
  FileCode2, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePushNotification, PushSettings } from '../hooks/usePushNotification';
import { SystemConfig } from '../types';
import { cn } from '../utils';
import { ThemeMode, getThemeMode, applyTheme } from '../utils/theme';
import { useNavigate } from 'react-router-dom';
import { AdminVerificationModal } from './AdminVerificationModal';
import { useTabGlass } from '../hooks/useTabGlass';

interface SettingsViewProps {
  user: any;
  system?: SystemConfig;
  firstYear: string;
  onLogout: () => void;
  onClose?: () => void;
  onOpenFeedback: () => void;
  onOpenNotice: () => void;
  onOpenTutorial?: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onOpenPatchNotes?: () => void;
}

export function SettingsView({
  user,
  system,
  firstYear,
  onLogout,
  onClose,
  onOpenFeedback,
  onOpenNotice,
  onOpenTutorial,
  onOpenTerms,
  onOpenPrivacy,
  onOpenPatchNotes
}: SettingsViewProps) {
  const { 
    isSupported, 
    isSubscribed, 
    loading: pushLoading, 
    settings, 
    permission,
    subscribe, 
    updateSettings,
    triggerLocalNotification
  } = usePushNotification();

  // 하위 설정 모달/아코디언 상태
  const navigate = useNavigate();
  const isAdmin = Boolean(
    user?.email?.toLowerCase() === 'saramoriyo@gmail.com' || 
    (typeof window !== 'undefined' && localStorage.getItem('admin_verified_session') === 'true')
  );
  const [showAdminVerifyModal, setShowAdminVerifyModal] = useState(false);
  const [activeSection, setActiveSection] = useState<'notification' | 'theme' | 'share' | 'channels' | 'disclaimer' | 'fontLicense' | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeMode());
  const tabGlass = useTabGlass();

  // 그래프 및 데이터 공유 설정 상태 (기본값 둘 다 true)
  const [enableWidgetShare, setEnableWidgetShare] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('uzuhama_setting_enable_widget_share');
    return val === null ? true : val === 'true';
  });

  const [shareShowDataLabels, setShareShowDataLabels] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('uzuhama_setting_share_data_labels');
    return val === null ? true : val === 'true';
  });

  const handleToggleWidgetShare = () => {
    const nextVal = !enableWidgetShare;
    setEnableWidgetShare(nextVal);
    localStorage.setItem('uzuhama_setting_enable_widget_share', String(nextVal));
    window.dispatchEvent(new Event('uzuhama_settings_changed'));
  };

  const handleToggleShareDataLabels = () => {
    const nextVal = !shareShowDataLabels;
    setShareShowDataLabels(nextVal);
    localStorage.setItem('uzuhama_setting_share_data_labels', String(nextVal));
    window.dispatchEvent(new Event('uzuhama_settings_changed'));
  };

  // 테마 변경 핸들러 및 외부 변경 동기화
  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  };

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail) {
        setThemeMode(e.detail as ThemeMode);
      }
    };
    window.addEventListener('uzuhama-theme-changed', handleThemeChange);
    return () => window.removeEventListener('uzuhama-theme-changed', handleThemeChange);
  }, []);

  const handleTogglePush = async (key: keyof PushSettings) => {
    if (!isSupported) {
      alert('현재 브라우저는 웹 푸시 알림을 지원하지 않습니다.');
      return;
    }

    if (!isSubscribed) {
      await subscribe({ [key]: true });
    } else {
      const nextVal = !settings[key];
      await updateSettings({ [key]: nextVal });
    }
  };

  // 강력한 캐시 삭제 핸들러 (LocalStorage, SessionStorage, Cache Storage, Service Worker 완전 초기화)
  const handleClearCacheClick = () => {
    setShowClearConfirm(true);
  };

  const executeClearCache = async () => {
    setIsClearing(true);
    try {
      // 1. 테마 설정은 기억 유지
      const currentTheme = localStorage.getItem('uzuhama_theme_mode');

      // 2. LocalStorage & SessionStorage 전체 삭제
      localStorage.clear();
      sessionStorage.clear();

      if (currentTheme) {
        localStorage.setItem('uzuhama_theme_mode', currentTheme);
      }

      // 3. Cache Storage (Service Worker & PWA 캐시 등) 완전 삭제
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((name) => window.caches.delete(name)));
      }

      // 4. 등록된 Service Worker 해제
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
    } catch (err) {
      console.error('Failed to clear full cache:', err);
    } finally {
      // 5. 즉시 새로고침하여 청정 상태로 재시작
      window.location.reload();
    }
  };

  const handleAppRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-2 pb-24 space-y-6 animate-in fade-in duration-200">
      {/* 1. 의견 섹션: 상단 여백 추가 */}
      <section className="space-y-1.5 pt-4 sm:pt-6">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-3 tracking-wider">
          의견
        </h3>
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] overflow-hidden divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
          
          <button 
            type="button"
            onClick={onOpenFeedback}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 active:bg-zinc-200/50 dark:active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">의견 보내기</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
          </button>
        </div>
      </section>

      {/* 1. 관리자 전용 섹션 */}
      {isAdmin && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-purple-600 dark:text-purple-400 px-3 tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            관리자 전용
          </h3>
          <div className="bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20 dark:border-purple-800/40 rounded-[24px] overflow-hidden divide-y divide-purple-500/10 dark:divide-purple-800/20">
            <button 
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('admin_verified_session', 'true');
                  localStorage.setItem('admin_verified_time', Date.now().toString());
                  sessionStorage.setItem('admin_verified_session', 'true');
                  sessionStorage.setItem('admin_verified_time', Date.now().toString());
                } catch {}
                onClose?.();
                navigate('/admin');
              }}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    관리자 대시보드
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-semibold">인앱 이동</span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">시스템 설정 및 방송 데이터 관리 대시보드로 이동합니다.</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-purple-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* PWA / 브라우저 새 창에서 /admin 직접 열기 */}
            <a 
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                try {
                  localStorage.setItem('admin_verified_session', 'true');
                  localStorage.setItem('admin_verified_time', Date.now().toString());
                  sessionStorage.setItem('admin_verified_session', 'true');
                  sessionStorage.setItem('admin_verified_time', Date.now().toString());
                } catch {}

                const isStandalone = typeof window !== 'undefined' && (
                  window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone === true ||
                  document.referrer.includes('android-app://')
                );

                if (isStandalone) {
                  // PWA 환경에서는 새 창이 내부 웹뷰에 의해 막힐 수 있으므로
                  // 1. window.open 시도 후 실패 시 인앱 즉시 이동
                  try {
                    const newWin = window.open('/admin', '_blank');
                    if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                      e.preventDefault();
                      onClose?.();
                      navigate('/admin');
                    }
                  } catch {
                    e.preventDefault();
                    onClose?.();
                    navigate('/admin');
                  }
                }
              }}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors text-purple-700 dark:text-purple-300 group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ExternalLink className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    관리자 모드 (새 페이지로 열기)
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 font-semibold">PWA 지원</span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">새 브라우저 탭 또는 독립 창에서 /admin 관리자 페이지를 엽니다.</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-purple-500 shrink-0" />
            </a>

            {user?.email?.toLowerCase() === 'saramoriyo@gmail.com' && (
              <button 
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-between p-3 sm:p-3.5 px-4 text-left hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>관리자 계정 로그아웃</span>
                </div>
                <span className="text-[10px] text-zinc-400 font-normal">{user.email}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* 3. 환경설정 섹션 */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-3 tracking-wider">
          환경설정
        </h3>
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] overflow-hidden divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
          
          {/* 알림 설정 */}
          <div>
            <button 
              type="button"
              onClick={() => setActiveSection(activeSection === 'notification' ? null : 'notification')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">알림 설정</span>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'notification' && "rotate-90")} />
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'notification' && (
                <motion.div 
                  key="settings-accordion-notification"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1.5 space-y-3 bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">생방송 시작 알림</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">우주하마 생방송 시작 시 푸시 알림 수신</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        disabled={pushLoading}
                        onClick={() => handleTogglePush('notifyLive')}
                        className={cn(
                          "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0",
                          isSubscribed && settings.notifyLive ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", isSubscribed && settings.notifyLive ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">휴방 사유 알림</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">휴방 공지 등록 시 즉시 알림 수신</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        disabled={pushLoading}
                        onClick={() => handleTogglePush('notifyAbsence')}
                        className={cn(
                          "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0",
                          isSubscribed && settings.notifyAbsence ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", isSubscribed && settings.notifyAbsence ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">최고 확률 시간 알림</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">당일 최고 방송 확률 시간대 알림</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        disabled={pushLoading}
                        onClick={() => handleTogglePush('notifyPeakProb')}
                        className={cn(
                          "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0",
                          isSubscribed && (settings.notifyPeakProb ?? true) ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", isSubscribed && (settings.notifyPeakProb ?? true) ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    {(settings.notifyPeakProb ?? true) && (
                      <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">사전 알림 시점</span>
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{settings.leadTimeMinutes ?? 30}분 전</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[10, 20, 30, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => updateSettings({ leadTimeMinutes: mins })}
                              className={cn(
                                "py-1.5 text-xs font-semibold rounded-xl border transition-all text-center cursor-pointer",
                                (settings.leadTimeMinutes ?? 30) === mins
                                  ? "bg-purple-50 dark:bg-purple-950/50 border-purple-500 dark:border-purple-500 text-purple-600 dark:text-purple-300 shadow-sm"
                                  : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              )}
                            >
                              {mins}분
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 관리자 전용: 새 제보 알림 받기 */}
                    {user?.email === 'saramoriyo@gmail.com' && (
                      <div className="flex items-center justify-between py-1.5 border-t border-purple-200/40 dark:border-purple-800/40 pt-2.5">
                        <div className="pr-2">
                          <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            새 제보 알림 받기
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">새로운 시청자 데이터 제보 등록 시 푸시 알림 수신</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          disabled={pushLoading}
                          onClick={() => handleTogglePush('notifyReports')}
                          className={cn(
                            "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0 cursor-pointer",
                            isSubscribed && (settings.notifyReports ?? true) ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                          )}
                        >
                          <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", isSubscribed && (settings.notifyReports ?? true) ? "translate-x-4" : "translate-x-0")} />
                        </button>
                      </div>
                    )}

                    {/* 테스트 알림 발송 및 기기 안내 */}
                    <div className="pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">내 기기 테스트 알림</p>
                          <p className="text-[11px] text-zinc-400">현재 브라우저에 알림이 제대로 뜨는지 즉시 확인</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (permission !== 'granted') {
                              const ok = await subscribe();
                              if (!ok) return;
                            }
                            await triggerLocalNotification(
                              '[우주하마] 테스트 알림',
                              '알림이 정상적으로 수신됩니다. 방송 시작 및 휴방 공지를 실시간으로 받아보실 수 있습니다!'
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 transition-colors shrink-0 cursor-pointer"
                        >
                          테스트 알림 받기
                        </button>
                      </div>

                      <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/50 text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1 leading-relaxed">
                        <p className="font-semibold text-zinc-700 dark:text-zinc-300">💡 알림이 오지 않는 경우 체크리스트:</p>
                        <p>• <strong>아이폰(iOS)</strong>: 사파리 공유 버튼 &gt; <strong>'홈 화면에 추가'</strong> 후 실행해야 웹 푸시가 작동합니다.</p>
                        <p>• <strong>안드로이드/PC</strong>: 브라우저 주소창 좌측 자물쇠(설정) 아이콘에서 <strong>알림 '허용'</strong>인지 확인해주세요.</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 화면 설정 (테마) */}
          <div>
            <button 
              type="button"
              onClick={() => setActiveSection(activeSection === 'theme' ? null : 'theme')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">화면 설정</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2.5 py-1 rounded-full border border-purple-200/60 dark:border-purple-800/60">
                  {themeMode === 'system' ? '시스템 설정' : themeMode === 'dark' ? '다크 모드' : '라이트 모드'}
                </span>
                <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'theme' && "rotate-90")} />
              </div>
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'theme' && (
                <motion.div 
                  key="settings-accordion-theme"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('light')}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer relative",
                          themeMode === 'light'
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 shadow-sm ring-2 ring-purple-600/30"
                            : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                      >
                        <Sun className="w-5 h-5" />
                        <span>라이트</span>
                        {themeMode === 'light' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('dark')}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer relative",
                          themeMode === 'dark'
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 shadow-sm ring-2 ring-purple-600/30"
                            : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                      >
                        <Moon className="w-5 h-5" />
                        <span>다크</span>
                        {themeMode === 'dark' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTheme('system')}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer relative",
                          themeMode === 'system'
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 shadow-sm ring-2 ring-purple-600/30"
                            : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                      >
                        <Laptop className="w-5 h-5" />
                        <span>시스템 설정</span>
                        {themeMode === 'system' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                        )}
                      </button>
                    </div>

                    {/* 하단 탭바 글래스모피즘 (투명도 및 블러) 슬라이더 */}
                    <div className="mt-4 pt-3.5 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            하단 탭바 투명도 및 블러 효과
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-200/60 dark:border-purple-800/60">
                            {tabGlass.sliderValue === 30 ? '기본값' : `${tabGlass.sliderValue}%`}
                          </span>
                          {tabGlass.sliderValue !== 30 && (
                            <button
                              type="button"
                              onClick={tabGlass.resetToDefault}
                              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline cursor-pointer"
                            >
                              기본값 복원
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 안내 문구 */}
                      <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        왼쪽으로 갈수록 블러가 많아지고 더 투명해지며, 오른쪽으로 갈수록 블러가 적어지고 더 불투명해집니다.
                      </p>

                      {/* 슬라이더 트랙 및 좌우 라벨 */}
                      <div className="space-y-1.5 pt-1">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={tabGlass.sliderValue}
                          onChange={(e) => tabGlass.updateGlassValue(parseInt(e.target.value, 10))}
                          className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600 dark:accent-purple-500 focus:outline-none"
                        />
                        <div className="flex items-center justify-between text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                          <span className="flex items-center gap-1">
                            ← 블러 많음 · 더 투명
                          </span>
                          <span className="flex items-center gap-1">
                            블러 적음 · 더 불투명 →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 그래프 및 데이터 공유 설정 */}
          <div>
            <button 
              type="button"
              onClick={() => setActiveSection(activeSection === 'share' ? null : 'share')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Share2 className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">그래프 및 데이터 공유 설정</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2.5 py-1 rounded-full border border-purple-200/60 dark:border-purple-800/60">
                  {enableWidgetShare ? '공유 활성화' : '공유 숨김'}
                </span>
                <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'share' && "rotate-90")} />
              </div>
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'share' && (
                <motion.div 
                  key="settings-accordion-share"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1.5 space-y-3 bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">위젯 공유 버튼 활성화</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">각 분석 카드 및 표의 우측 상단 이미지 공유 버튼 표시 여부</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enableWidgetShare}
                        onClick={handleToggleWidgetShare}
                        className={cn(
                          "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0 cursor-pointer",
                          enableWidgetShare ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", enableWidgetShare ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">공유 시 그래프 데이터 수치(라벨) 표시</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">그래프를 이미지로 공유할 때 막대나 데이터 포인트 위의 수치(라벨)를 포함</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={shareShowDataLabels}
                        onClick={handleToggleShareDataLabels}
                        className={cn(
                          "w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0 cursor-pointer",
                          shareShowDataLabels ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn("bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200", shareShowDataLabels ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 데이터 관리 */}
          <div className="p-3.5 sm:p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">데이터 관리</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">캐시 데이터 정리 및 설정 초기화</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={handleAppRefresh}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors active:scale-95 cursor-pointer"
              >
                새로고침
              </button>
              <button 
                type="button"
                onClick={handleClearCacheClick}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors active:scale-95 cursor-pointer"
              >
                캐시 삭제
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 4. 정보 섹션 (기존 푸터 기능 및 채널 링크 완벽 통합) */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-3 tracking-wider">
          정보
        </h3>
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] overflow-hidden divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
          
          <button 
            type="button"
            onClick={onOpenNotice}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Megaphone className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">공지사항</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>

          {/* 패치노트 & 업데이트 공지 아카이브 바로가기 (세션 유지 인앱 라우팅) */}
          <button 
            type="button"
            onClick={() => {
              if (onOpenPatchNotes) {
                onOpenPatchNotes();
              } else {
                window.location.href = '/patch';
              }
            }}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <FileCode2 className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <div>
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">패치노트 & 업데이트 아카이브</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">버전별 패치노트, 핫픽스, 개발자 노트</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>

          <a 
            href="https://hushed-sailboat-ece.notion.site/d176b75d9cf94efbb96f5e5168bbe18a?source=copy_link"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <div>
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">사이트 안내</span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">우주하마 방송 통계 안내 및 가이드 문서</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-400" />
          </a>

          {/* 우주하마 공식 채널 링크 */}
          <div>
            <button 
              type="button"
              onClick={() => setActiveSection(activeSection === 'channels' ? null : 'channels')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ExternalLink className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">우주하마 공식 채널</span>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'channels' && "rotate-90")} />
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'channels' && (
                <motion.div 
                  key="settings-accordion-channels"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 space-y-2 bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <a 
                      href="https://www.youtube.com/@uzuhama" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span>유튜브 (YouTube)</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                    </a>

                    <a 
                      href="https://chzzk.naver.com/c6e1c8cf1b128bd321cc2684c92b5a00" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>치지직 (CHZZK)</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                    </a>

                    <a 
                      href="https://cafe.naver.com/uzuhama" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span>우주하마 네이버 팬카페</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                    </a>

                    {system?.archiveSourceUrl && (
                      <a 
                        href={system.archiveSourceUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-xs font-semibold text-purple-600 dark:text-purple-400"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          <span>우주하마 생방송 아카이브 시트</span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                      </a>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 데이터 안내 및 주의사항 (경고문) */}
          <div>
            <button 
              type="button"
              onClick={() => setActiveSection(activeSection === 'disclaimer' ? null : 'disclaimer')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">데이터 및 예측 안내</span>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'disclaimer' && "rotate-90")} />
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'disclaimer' && (
                <motion.div 
                  key="settings-accordion-disclaimer"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50 space-y-2">
                    <p>※ 본 데이터는 <b>{firstYear}년 이후</b> 방송 데이터만 포함하며, 실제 방송 일정과 다를 수 있는 통계적 예측치입니다.</p>
                    <p>※ 본 사이트는 사용자 설정(테마, 알림 설정 등) 유지를 위해 브라우저 로컬 저장소를 일부 사용합니다.</p>
                    <p>※ 치지직 및 유튜브 데이터는 공용 API 및 공식 채널 공개 정보를 바탕으로 정기 수집/분석됩니다.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>



          {/* 폰트 출처 및 라이선스 안내 */}
          <div>
            <button
              type="button"
              onClick={() => setActiveSection(activeSection === 'fontLicense' ? null : 'fontLicense')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Type className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">폰트 출처 및 라이선스</span>
              </div>
              <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", activeSection === 'fontLicense' && "rotate-90")} />
            </button>

            <AnimatePresence initial={false}>
              {activeSection === 'fontLicense' && (
                <motion.div 
                  key="settings-accordion-font-license"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/50 dark:bg-black/30 border-t border-zinc-200/50 dark:border-zinc-800/50 space-y-2">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">배달의민족 한나체 Pro & 한나체 Air</p>
                    <p>• <b>서체 제공:</b> (주)우아한형제들 (Woowa Brothers Corp.)</p>
                    <p>• <b>사용 영역:</b> 제목/헤드라인 (한나체 Pro), 본문/줄글 (한나체 Air)</p>
                    <p>• <b>라이선스:</b> SIL Open Font License (OFL-1.1) / 무료 이용</p>
                    <p>• <b>라이선스 전문 요약:</b> 배달의민족 한나체의 지적재산권은 (주)우아한형제들에 있습니다. 개인 및 기업 사용자를 포함한 모든 사용자에게 무료로 제공되며 자유롭게 수정하고 재배포할 수 있습니다. (단, 폰트 파일 자체를 유료로 판매하는 행위는 금지됩니다.)</p>
                    <div className="pt-1">
                      <a 
                        href="https://www.woowahan.com/#/fonts" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold hover:underline"
                      >
                        <span>우아한형제들 글꼴 공식 사이트 방문</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <a 
            href="/licenses"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">오픈소스 라이선스</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-400" />
          </a>

        </div>
      </section>

      {/* 5. 법적 정보 섹션 */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-3 tracking-wider">
          법적 정보
        </h3>
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] overflow-hidden divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
          
          <a 
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Gavel className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">이용약관</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-400" />
          </a>

          <a 
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">개인정보처리방침</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-400" />
          </a>

        </div>
      </section>

      {/* 최하단 버전 정보 및 관리자 검증 진입점 */}
      <div className="pt-4 text-center">
        <button
          type="button"
          onClick={() => {
            if (!isAdmin) {
              setShowAdminVerifyModal(true);
            }
          }}
          className="text-xs font-medium text-zinc-400 dark:text-zinc-500 tracking-wider hover:text-purple-500 transition-colors cursor-pointer inline-flex items-center gap-1"
          title={isAdmin ? `v${system?.appVersion || '1.0.0'} (관리자 활성화됨)` : `v${system?.appVersion || '1.0.0'}`}
        >
          <span>v{system?.appVersion || '1.0.0'}</span>
          {!isAdmin && <Lock className="w-3 h-3 opacity-30 hover:opacity-100" />}
        </button>
      </div>

      {/* 캐시 삭제 확인 모달 (공지사항 형태의 구조로 디자인 일관성 통일) */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
              className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-5 sm:p-7 max-w-lg w-full shadow-2xl relative flex flex-col overflow-hidden"
            >
              {/* 우측 상단 닫기 버튼 */}
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10 cursor-pointer"
                title="닫기"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* 모달 헤더 & 본문 */}
              <div className="flex-1 min-h-0 relative flex flex-col pt-1">
                <div className="flex items-center gap-3 mb-3 pr-8">
                  <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white break-keep">
                      캐시 및 임시 데이터 삭제
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">완전 초기화 후 새로고침</p>
                  </div>
                </div>

                <div className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm whitespace-pre-wrap py-2 select-text">
                  브라우저에 저장된 캐시 데이터(Cache Storage, Session Storage, 서비스 워커 및 PWA 캐시)를 완전히 정리하고 최신 상태로 새로고침합니다.
                  {'\n\n'}
                  ※ 기존에 설정하신 다크/라이트 화면 테마는 보존되며, 방송 통계 및 공지 데이터가 최신 서버 상태로 새로 동기화됩니다. 계속 진행하시겠습니까?
                </div>
              </div>

              {/* 하단 구분선 및 액션 버튼 */}
              <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={executeClearCache}
                  className="px-5 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition-all active:scale-95 flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearing ? '삭제 및 초기화 중...' : '캐시 삭제'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 관리자 검증 모달 */}
      {showAdminVerifyModal && (
        <AdminVerificationModal
          onClose={() => setShowAdminVerifyModal(false)}
          onSuccess={() => {
            setShowAdminVerifyModal(false);
            onClose?.();
            navigate('/admin');
          }}
        />
      )}

    </div>
  );
}
