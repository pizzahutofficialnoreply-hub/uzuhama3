import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { AdminTab } from './tabs/AdminTab';
import { useFirebaseData } from '../hooks/useFirebaseData';
import { Tv, LogOut, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import { AdminVerificationModal } from './AdminVerificationModal';

export function AdminRoute() {
  const [user, setUser] = useState<User | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(() => {
    const sessionV = sessionStorage.getItem('admin_verified_session') === 'true';
    if (sessionV) return true;
    const localV = localStorage.getItem('admin_verified_session') === 'true';
    const verifiedTime = parseInt(localStorage.getItem('admin_verified_time') || '0', 10);
    // 24시간 세션 유효
    if (localV && Date.now() - verifiedTime < 24 * 60 * 60 * 1000) {
      return true;
    }
    return false;
  });
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { data, addLog, updateLog, deleteLog, deleteAllLogs, updateGuide, updateSystemConfig } = useFirebaseData();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email?.toLowerCase() === 'saramoriyo@gmail.com') {
        setUser(currentUser);
        setIsVerified(true);
        try {
          sessionStorage.setItem('admin_verified_session', 'true');
          localStorage.setItem('admin_verified_session', 'true');
          localStorage.setItem('admin_verified_time', Date.now().toString());
        } catch {}
      } else if (currentUser) {
        setError('접근 권한이 없습니다. (관리자 전용)');
        setUser(null);
        setIsVerified(false);
        sessionStorage.removeItem('admin_verified_session');
        localStorage.removeItem('admin_verified_session');
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    sessionStorage.removeItem('admin_verified_session');
    sessionStorage.removeItem('admin_verified_time');
    localStorage.removeItem('admin_verified_session');
    localStorage.removeItem('admin_verified_time');
    setIsVerified(false);
    await signOut(auth);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black text-zinc-500">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // 관리자 검증이 완료되지 않은 경우 (직접 진입 시에도 리캡챠 및 재인증 요구)
  const hasAdminAccess = (user && user.email?.toLowerCase() === 'saramoriyo@gmail.com') || isVerified;
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center p-6 selection:bg-purple-500/30">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/20 shadow-xs">
            <ShieldCheck className="w-7 h-7 stroke-[2.2]" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">관리자 보안 검증</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 mb-6 leading-relaxed">
            관리자 모드 접근 시 마우스/터치 리캡챠 검증 및 Google 재인증이 필수입니다.
          </p>

          {error && <p className="text-xs text-red-500 mb-4 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{error}</p>}

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setShowVerificationModal(true)}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>관리자 검증 및 재인증 시작</span>
            </button>
            <button 
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              메인으로 돌아가기
            </button>
          </div>
        </div>

        {showVerificationModal && (
          <AdminVerificationModal
            onClose={() => setShowVerificationModal(false)}
            onSuccess={() => {
              setIsVerified(true);
              setShowVerificationModal(false);
            }}
          />
        )}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-1 sm:pt-2.5 sm:pb-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center cursor-pointer" onClick={() => navigate('/')}>
              <Tv className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">관리자 대시보드</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 hidden sm:inline-block">{user?.email || '관리자 (보안 인증)'}</span>
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium transition-colors text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 관리자 로그아웃 경고 모달 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div 
            style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
            className="w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-6 shadow-2xl text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">관리자 모드 로그아웃</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              정말로 관리자 세션에서 로그아웃하시겠습니까?<br />
              저장되지 않은 설정이나 추가/수정 내역이 있다면 확인 후 로그아웃해주세요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-8">
        <AdminTab 
          data={data} 
          onAddLog={addLog} 
          onUpdateLog={updateLog} 
          onDeleteLog={deleteLog} 
          onDeleteAllLogs={deleteAllLogs} 
          onUpdateSystemConfig={updateSystemConfig} 
        />
      </main>
    </div>
  );
}
