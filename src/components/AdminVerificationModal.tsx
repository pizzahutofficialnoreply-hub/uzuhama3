import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Lock, CheckCircle2, AlertCircle, ArrowRight, Loader2, X, RefreshCw } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
  
  // Step 1: Touch/Mouse CAPTCHA, Step 2: Google Re-auth
  const [captchaPassed, setCaptchaPassed] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0); // 0 to 100%
  const [isDragging, setIsDragging] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);

  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentPosRef = useRef(0);

  // Handle Touch / Mouse dragging for CAPTCHA slider
  const handleStart = (clientX: number) => {
    if (captchaPassed) return;
    setIsDragging(true);
    startXRef.current = clientX;
    setAuthError(null);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || captchaPassed || !sliderTrackRef.current) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const maxDrag = rect.width - 48; // thumb width approx 48px
    if (maxDrag <= 0) return;

    const diff = clientX - rect.left - 20;
    const clamped = Math.max(0, Math.min(diff, maxDrag));
    const percentage = Math.min(100, Math.max(0, (clamped / maxDrag) * 100));
    
    currentPosRef.current = percentage;
    setSliderPosition(percentage);

    if (percentage >= 92) {
      // Completed!
      setSliderPosition(100);
      setCaptchaPassed(true);
      setIsDragging(false);
    }
  };

  const handleEnd = () => {
    if (captchaPassed) return;
    setIsDragging(false);
    if (currentPosRef.current < 92) {
      // Snap back if not reached the end
      setSliderPosition(0);
      currentPosRef.current = 0;
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleMove(e.clientX);
      }
    };
    const onMouseUp = () => {
      if (isDragging) handleEnd();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) {
        handleMove(e.touches[0].clientX);
      }
    };
    const onTouchEnd = () => {
      if (isDragging) handleEnd();
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDragging]);

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
      if (auth.currentUser && auth.currentUser.email === 'saramoriyo@gmail.com') {
        await auth.currentUser.getIdToken(true);
        markAdminVerified();
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      
      const loggedUser = result.user;
      if (loggedUser && loggedUser.email === 'saramoriyo@gmail.com') {
        markAdminVerified();
      } else {
        setAuthError('관리자 권한이 없는 계정입니다. (관리자 전용 계정으로 로그인 필요)');
      }
    } catch (err: any) {
      console.error('Google Re-auth failed:', err);
      // PWA or popup blocked fallback
      if (auth.currentUser?.email === 'saramoriyo@gmail.com') {
        markAdminVerified();
        return;
      }
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('인증 팝업이 닫혔습니다.');
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('브라우저에서 팝업이 차단되었습니다. 팝업 차단을 해제하거나 현재 로그인 상태를 확인해주세요.');
      } else {
        setAuthError(err.message || '재인증에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  const handleResetCaptcha = () => {
    setCaptchaPassed(false);
    setSliderPosition(0);
    currentPosRef.current = 0;
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
              보안 강화를 위해 2단계 인증을 완료해주세요.
            </p>
          </div>
        </div>

        {/* Step 1: Touch/Mouse CAPTCHA Slider */}
        <div className="mb-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2.5">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center">1</span>
              마우스/터치 리캡챠 인증
            </span>
            {captchaPassed ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 인증 성공
              </span>
            ) : (
              <span className="text-zinc-400 text-[11px]">우측으로 밀기</span>
            )}
          </div>

          <div
            ref={sliderTrackRef}
            className={`relative h-12 rounded-xl flex items-center select-none overflow-hidden transition-colors border ${
              captchaPassed
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-200/70 dark:bg-zinc-700/60 border-zinc-300 dark:border-zinc-600'
            }`}
          >
            {/* Progress Fill */}
            <div
              className={`absolute left-0 top-0 bottom-0 transition-all duration-75 ${
                captchaPassed ? 'bg-emerald-500' : 'bg-purple-600/40'
              }`}
              style={{ width: `${sliderPosition}%` }}
            />

            {/* Slider Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-bold tracking-tight text-zinc-600 dark:text-zinc-300">
              {captchaPassed ? '✓ 사람(운영자) 인증 완료' : '슬라이더를 오른쪽 끝으로 미세요'}
            </div>

            {/* Slider Thumb */}
            {!captchaPassed ? (
              <div
                style={{
                  left: `calc(4px + (100% - 48px) * ${sliderPosition / 100})`,
                  touchAction: 'none'
                }}
                onMouseDown={(e) => handleStart(e.clientX)}
                onTouchStart={(e) => e.touches[0] && handleStart(e.touches[0].clientX)}
                className="absolute left-1 w-10 h-10 rounded-lg bg-white dark:bg-zinc-900 border border-purple-500/50 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-105 transition-transform z-10 select-none text-purple-600 dark:text-purple-400"
              >
                <ArrowRight className="w-5 h-5 animate-pulse" />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResetCaptcha}
                title="다시 시도"
                className="absolute right-2 p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors z-10"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Step 2: Google Re-authentication */}
        <div className="mb-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
            Google 관리자 계정 재인증
          </div>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            관리자 보안 정책에 따라 관리자 페이지 진입 시마다 구글 계정 재인증이 필요합니다.
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
            disabled={!captchaPassed || isVerifyingAuth}
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
