import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useBodyScrollLock } from '../utils';

interface LoginOnboardingModalProps {
  onClose: () => void;
  onLogin: () => void;
}

export function LoginOnboardingModal({ onClose, onLogin }: LoginOnboardingModalProps) {
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  useBodyScrollLock(true);

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.05
      }
    },
    exit: { opacity: 0, scale: 0.95 }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        
        <motion.h2 variants={itemVariants} className="text-xl font-bold text-zinc-900 dark:text-white mb-4">로그인 안내</motion.h2>
        
        <motion.div variants={itemVariants} className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-4 mb-6 border border-purple-100 dark:border-purple-900/20">
          <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-2">로그인 시 혜택</h3>
          <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-2">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>방송 기록, 추천 영상, 쇼츠 등 데이터 추가 및 편집 권한 부여</span>
            </li>
          </ul>
        </motion.div>
        
        <motion.div variants={itemVariants} className="space-y-3 mb-6">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 group-hover:border-purple-500 transition-colors">
              <input type="checkbox" className="absolute opacity-0 w-full h-full cursor-pointer" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} />
              {termsAgreed && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 pointer-events-none" />}
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              <a href="/terms" target="_blank" rel="noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>이용약관</a>에 동의합니다. (필수)
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center w-5 h-5 mt-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 group-hover:border-purple-500 transition-colors">
              <input type="checkbox" className="absolute opacity-0 w-full h-full cursor-pointer" checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)} />
              {privacyAgreed && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 pointer-events-none" />}
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>개인정보 처리방침</a>에 동의합니다. (필수)
            </span>
          </label>
        </motion.div>
        
        <motion.button 
          variants={itemVariants}
          onClick={() => {
            if (termsAgreed && privacyAgreed) {
              onLogin();
            }
          }}
          disabled={!termsAgreed || !privacyAgreed}
          className="w-full py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-400"
        >
          구글 계정으로 로그인
        </motion.button>
      </motion.div>
    </div>
  );
}
