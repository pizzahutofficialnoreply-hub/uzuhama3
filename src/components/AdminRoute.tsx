import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { AdminTab } from './tabs/AdminTab';
import { useFirebaseData } from '../hooks/useFirebaseData';
import { Tv, LogOut, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import { AdminVerificationModal } from './AdminVerificationModal';
import { isAdminUser, adminSessionValid, clearAdminSession } from '../utils/adminAuth';
import { AdminMfaGate, adminLogoutAll } from './AdminMfaGate';

/** /admin 에서 '홈 화면에 추가'하면 관리자 앱이 따로 생기게 (열면 바로 /admin) */
function useAdminManifest() {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const title = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const prev = { href: link?.getAttribute('href') || '/manifest.json', title: title?.content || '', doc: document.title };
    link?.setAttribute('href', '/manifest-admin.json');
    if (title) title.content = '우주하마 관리자';
    document.title = '우주하마 관리자';
    return () => {
      link?.setAttribute('href', prev.href);
      if (title) title.content = prev.title;
      document.title = prev.doc;
    };
  }, []);
}

export function AdminRoute() {
  useAdminManifest();
  const [user, setUser] = useState<User | null>(null);
  // 최근 12시간 안에 구글 계정으로 다시 확인했는지 (기기 표시만으로는 관리자가 아님: 아래에서 실제 로그인 계정도 함께 확인)
  const [isVerified, setIsVerified] = useState<boolean>(adminSessionValid);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { data, addLog, updateLog, deleteLog, deleteAllLogs, updateGuide, updateSystemConfig } = useFirebaseData();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isAdminUser(currentUser)) {
        setUser(currentUser);
        setIsVerified(adminSessionValid());
      } else if (currentUser) {
        setError('접근 권한이 없어요. (관리자 전용)');
        setUser(null);
        setIsVerified(false);
        clearAdminSession();
      } else {
        setUser(null);
        setIsVerified(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    clearAdminSession();
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
  // 실제 관리자 계정으로 로그인 + 최근 12시간 안에 다시 확인한 경우만
  const hasAdminAccess = isAdminUser(user) && isVerified;
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center p-6 selection:bg-purple-500/30">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/20 shadow-xs">
            <ShieldCheck className="w-7 h-7 stroke-[2.2]" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">관리자 보안 검증</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 mb-6 leading-relaxed">
            관리자 모드 접근 시 마우스/터치 리캡챠 검증 및 Google 재인증이 필수예요.
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
    <AdminMfaGate onCancel={handleLogout}>
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-purple-500/30">
      <header className="sticky top-0 z-50 bg-zinc-50/80 dark:bg-black/75 backdrop-blur-xl border-b border-black/[0.05] dark:border-white/[0.06] pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5 min-w-0 cursor-pointer" title="사이트로 돌아가기">
            <span className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-sm shadow-purple-600/30 shrink-0">
              <Tv className="w-4.5 h-4.5 text-white" />
            </span>
            <span className="text-left min-w-0">
              <span className="block text-[15px] font-black tracking-tight text-zinc-900 dark:text-white leading-tight">우주하마 관리자</span>
              <span className="block text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400 leading-tight">● 보안 인증됨</span>
            </span>
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/10 text-[13px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
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
              정말로 관리자 세션에서 로그아웃할까요?<br />
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
            <button
              type="button"
              onClick={async () => { try { await adminLogoutAll(); } catch {} await handleLogout(); }}
              className="mt-2 w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-red-600 dark:text-red-400 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              모든 기기에서 로그아웃 (다른 곳에 켜진 관리자도 끊기)
            </button>
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
    </AdminMfaGate>
  );
}
