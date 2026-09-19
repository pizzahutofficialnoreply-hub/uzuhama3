import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, User, Calendar, LogOut, Trash2, Trash, Monitor, RefreshCw, Download, Bell, X, BookOpen, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { SystemConfig } from '../types';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { usePushNotification, PushSettings } from '../hooks/usePushNotification';
import { cn } from '../utils';

interface UserMenuProps {
  user: any;
  onLogin?: () => void;
  onLogout: () => void;
  system?: SystemConfig;
  onOpenNotice: () => void;
  onOpenTutorial?: () => void;
}

export function UserMenu({ user, onLogout, system, onOpenNotice, onOpenTutorial }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isInstallable, showInstallGuide, setShowInstallGuide, promptInstall } = useInstallPrompt();
  const { 
    isSupported, 
    isSubscribed, 
    settings, 
    loading: pushLoading, 
    subscribe, 
    updateSettings 
  } = usePushNotification();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggle = async (key: keyof PushSettings) => {
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

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleClearCache = () => {
    if (window.confirm('캐시 데이터를 삭제하시겠습니까? 로그인 정보 및 설정이 초기화됩니다.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('정말 회원탈퇴를 진행하시겠습니까? 계정과 관련된 정보가 영구히 삭제됩니다.')) {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      onLogout();
      return;
    }

    try {
      await deleteUser(currentUser);
      localStorage.clear();
      sessionStorage.clear();
      onLogout();
      alert('회원탈퇴 처리가 완료되었습니다.');
    } catch (error: any) {
      if (error?.code === 'auth/requires-recent-login') {
        alert('보안을 위해 다시 로그인한 직후에 회원탈퇴를 다시 시도해 주시기 바랍니다.');
      } else {
        alert(`회원탈퇴 처리 중 오류가 발생했습니다: ${error?.message || error}`);
      }
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation cursor-pointer border border-zinc-200/60 dark:border-zinc-700/60"
        title="설정 및 메뉴"
      >
        <MoreVertical className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 배경 딤 / 외부 터치 닫기 백드롭 */}
            <div 
              className="fixed inset-0 z-[90] bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-24px)] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
            {/* 상단 프로필 영역 */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                  user ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                )}>
                  <User className="w-5 h-5" />
                </div>
                <div className="overflow-hidden min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {user ? user.email : '게스트'}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {user ? '로그인됨' : '비로그인 상태'}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* 계정 정보 (로그인 시에만 노출) */}
              {user && (
                <>
                  <div className="px-3 py-2">
                    <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">계정 정보</p>
                    <div className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      <span>가입일: {user?.metadata?.creationTime ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(user.metadata.creationTime)) : '확인 불가'}</span>
                    </div>
                  </div>
                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>
                </>
              )}

              {/* 알림 설정 (비로그인/로그인 누구나 이용 가능) */}
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" />
                  알림 설정
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">방송 알림</span>
                      <span className="text-[11px] text-zinc-400">생방송 시작 시 푸시 알림</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isSubscribed && settings.notifyLive}
                      disabled={pushLoading}
                      onClick={() => handleToggle('notifyLive')}
                      className={cn(
                        "w-9 h-5 flex items-center rounded-full p-0.5 transition-colors focus:outline-none shrink-0 cursor-pointer",
                        isSubscribed && settings.notifyLive ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700",
                        pushLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200",
                          isSubscribed && settings.notifyLive ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">휴방 사유 알림</span>
                      <span className="text-[11px] text-zinc-400">휴방 공지 등록 시 알림</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isSubscribed && settings.notifyAbsence}
                      disabled={pushLoading}
                      onClick={() => handleToggle('notifyAbsence')}
                      className={cn(
                        "w-9 h-5 flex items-center rounded-full p-0.5 transition-colors focus:outline-none shrink-0 cursor-pointer",
                        isSubscribed && settings.notifyAbsence ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700",
                        pushLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200",
                          isSubscribed && settings.notifyAbsence ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">최고 확률 시간 알림</span>
                      <span className="text-[11px] text-zinc-400">당일 최고 방송 확률 시간대 알림</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isSubscribed && (settings.notifyPeakProb ?? true)}
                      disabled={pushLoading}
                      onClick={() => handleToggle('notifyPeakProb')}
                      className={cn(
                        "w-9 h-5 flex items-center rounded-full p-0.5 transition-colors focus:outline-none shrink-0 cursor-pointer",
                        isSubscribed && (settings.notifyPeakProb ?? true) ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700",
                        pushLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200",
                          isSubscribed && (settings.notifyPeakProb ?? true) ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  {(settings.notifyPeakProb ?? true) && (
                    <div className="px-2 pt-1 pb-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">사전 알림 시점</span>
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                          {settings.leadTimeMinutes ?? 30}분 전
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[10, 20, 30, 60].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => updateSettings({ leadTimeMinutes: mins })}
                            className={cn(
                              "py-1 text-xs font-medium rounded border transition-all text-center",
                              (settings.leadTimeMinutes ?? 30) === mins
                                ? "bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold"
                                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            )}
                          >
                            {mins}분
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>

              <div className="px-3 py-2">
                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">앱 설정</p>
                <a 
                  href="https://hushed-sailboat-ece.notion.site/d176b75d9cf94efbb96f5e5168bbe18a?source=copy_link"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    <span>사이트 안내</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                </a>
                <button onClick={handleClearCache} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left">
                  <Trash className="w-4 h-4 text-zinc-400" />
                  <span>캐시 데이터 삭제</span>
                </button>
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>

              <div className="px-3 py-2">
                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">시스템</p>
                <button onClick={onOpenNotice} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left">
                  <Monitor className="w-4 h-4 text-zinc-400" />
                  <span>공지사항 보기</span>
                </button>
                <div className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-bold">버전 정보</span>
                  <span className="ml-auto text-zinc-500">{system?.appVersion || '1.0.0'}</span>
                </div>
                <button onClick={handleRefresh} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left">
                  <RefreshCw className="w-4 h-4 text-zinc-400" />
                  <span>앱 새로고침</span>
                </button>
              </div>

              {user && (
                <>
                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1"></div>
                  <div className="px-3 py-2">
                    <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors text-left">
                      <LogOut className="w-4 h-4" />
                      <span className="font-bold">로그아웃</span>
                    </button>
                    <button onClick={handleDeleteAccount} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-left mt-1">
                      <Trash2 className="w-4 h-4" />
                      <span>회원탈퇴</span>
                    </button>
                  </div>
                </>
              )}

            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* PWA 설치 가이드 모달 */}
      <AnimatePresence>
        {showInstallGuide && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 max-w-sm w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowInstallGuide(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">앱으로 설치하기</h3>
                  <p className="text-xs text-zinc-500">홈 화면에 추가하여 앱처럼 사용하세요</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-400 mb-6 bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div>
                  <p className="font-bold text-zinc-900 dark:text-zinc-200 mb-1">💻 PC (Chrome / Edge / Whale)</p>
                  <p>주소창 오른쪽 끝의 <span className="font-bold text-purple-600">[설치]</span> 아이콘을 누르거나 브라우저 메뉴에서 <span className="font-bold">[앱 설치]</span>를 클릭하세요.</p>
                </div>
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="font-bold text-zinc-900 dark:text-zinc-200 mb-1">📱 모바일 Safari (아이폰)</p>
                  <p>하단 공유 버튼(네모에 위 화살표)을 누른 후 <span className="font-bold text-purple-600">[홈 화면에 추가]</span>를 선택하세요.</p>
                </div>
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="font-bold text-zinc-900 dark:text-zinc-200 mb-1">📱 모바일 Chrome (안드로이드)</p>
                  <p>우측 상단 메뉴(점 3개)를 누르고 <span className="font-bold text-purple-600">[앱 설치]</span> 또는 <span className="font-bold">[홈 화면에 추가]</span>를 누르세요.</p>
                </div>
              </div>

              <button
                onClick={() => setShowInstallGuide(false)}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                확인
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
