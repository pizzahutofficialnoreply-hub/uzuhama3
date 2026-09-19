import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useBodyScrollLock } from '../utils';

interface ReAgreementModalProps {
  onAgree: () => void;
  onLogout: () => void;
}

export function ReAgreementModal({ onAgree, onLogout }: ReAgreementModalProps) {
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onLogout} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" title="로그아웃">
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">약관 업데이트 안내</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          서비스 이용약관 및 개인정보처리방침이 업데이트되었습니다.<br/>
          계속 이용하시려면 새로운 약관에 동의해 주세요.
        </p>
        
        <div className="space-y-3 mb-6">
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
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onLogout}
            className="flex-1 py-3 rounded-xl font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            취소 (로그아웃)
          </button>
          <button 
            onClick={() => {
              if (termsAgreed && privacyAgreed) {
                onAgree();
              }
            }}
            disabled={!termsAgreed || !privacyAgreed}
            className="flex-1 py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-400"
          >
            동의 후 계속
          </button>
        </div>
      </motion.div>
    </div>
  );
}
