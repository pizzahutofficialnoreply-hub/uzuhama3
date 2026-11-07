import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertCircle, Loader2, X } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isAdminUser } from '../utils/adminAuth';
import { auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface AdminVerificationModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AdminVerificationModal({ onClose, onSuccess }: AdminVerificationModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);

  const markAdminVerified = () => {
    const now = Date.now().toString();
    try {
      localStorage.setItem('admin_verified_session', 'true');
      localStorage.setItem('admin_verified_time', now);
      sessionStorage.setItem('admin_verified_session', 'true');
      sessionStorage.setItem('admin_verified_time', now);
    } catch {}

    if (onSuccess) {
      onSuccess();
    } else {
      onClose();
      navigate('/admin');
    }
  };

  const handleGoogleReauth = async () => {
    setAuthError(null);
    setIsVerifyingAuth(true);

    try {
      // If already logged in with admin account, fast-track by verifying token
      if (isAdminUser(auth.currentUser)) {
        await auth.currentUser.getIdToken(true);
        markAdminVerified();
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      
      const loggedUser = result.user;
      if (isAdminUser(loggedUser)) {
        markAdminVerified();
      } else {
        setAuthError('관리자 권한이 없는 계정이에요. (관리자 전용 계정으로 로그인 필요)');
      }
    } catch (err: any) {
      console.error('Google Re-auth failed:', err);
      // 팝업이 막혔어도 이미 관리자 계정으로 로그인돼 있으면 (토큰을 새로 받아 확인)
      if (isAdminUser(auth.currentUser)) {
        try { await auth.currentUser!.getIdToken(true); markAdminVerified(); return; } catch { /* 아래 오류 표시 */ }
      }
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('인증 팝업이 닫혔어요.');
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('브라우저에서 팝업이 차단되었어요. 팝업 차단을 해제하거나 현재 로그인 상태를 확인해주세요.');
      } else {
        setAuthError(err.message || '재인증에 실패했어요. 다시 시도해주세요.');
      }
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
        className="relative w-full max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xl p-6 sm:p-7 overflow-hidden"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              관리자 모드 검증
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              관리자 구글 계정으로 확인한 뒤, 인증 앱 6자리 코드를 넣어요.
            </p>
          </div>
        </div>

        {/* Step 2: Google Re-authentication */}
        <div className="mb-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            <ShieldCheck className="w-4 h-4 text-purple-500" />
            Google 관리자 계정 재인증
          </div>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            관리자 보안 정책에 따라 관리자 페이지 진입 시마다 구글 계정 재인증이 필요해요.
          </p>
        </div>

        {authError && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isVerifyingAuth}
            onClick={handleGoogleReauth}
            className="flex-[2] py-3 px-4 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-600/20"
          >
            {isVerifyingAuth ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>재인증 확인 중...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Google 계정으로 관리자 진입</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
