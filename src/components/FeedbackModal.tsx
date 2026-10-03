import React, { useState, useMemo } from 'react';
import { X, Loader2, ArrowLeft, MessageSquare, Bug, Lightbulb, CheckCircle2, ChevronDown } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { SystemConfig } from '../types';

export function FeedbackModal({ onClose, system }: { onClose: () => void; system?: SystemConfig }) {
  useBodyScrollLock(true);
  const [tab, setTab] = useState<'suggestion' | 'bug'>('suggestion');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [os, setOs] = useState('iOS 및 iPadOS');
  
  const tabOptions = useMemo(() => {
    if (system?.feedbackTabs && Array.isArray(system.feedbackTabs) && system.feedbackTabs.length > 0) {
      return [...system.feedbackTabs, '직접 입력'];
    }
    return ['직접 입력'];
  }, [system?.feedbackTabs]);

  const [problemArea, setProblemArea] = useState(() => tabOptions[0] || '직접 입력');

  React.useEffect(() => {
    if (tabOptions.length > 0 && !tabOptions.includes(problemArea)) {
      setProblemArea(tabOptions[0]);
    }
  }, [tabOptions, problemArea]);
  const [customProblemArea, setCustomProblemArea] = useState('');
  const [consoleLog, setConsoleLog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const { user } = useAuth();

  const handleSafeClose = () => {
    try {
      if (window.history.state?.view === 'feedback_modal') {
        window.history.back();
        return;
      }
    } catch {}
    onClose();
  };

  React.useEffect(() => {
    try {
      if (window.history.state?.view !== 'feedback_modal') {
        window.history.pushState({ view: 'feedback_modal' }, '', window.location.pathname);
      }
    } catch {}

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  const isAppleDevice = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod|Macintosh|Mac OS X/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const area = problemArea === '직접 입력' ? customProblemArea : problemArea;
      const finalContent = tab === 'bug' && consoleLog ? `${content}\n\n[Console Log]\n${consoleLog}` : content;

      await addDoc(collection(db, 'feedbacks'), {
        type: tab,
        title: title.trim(),
        content: finalContent.trim(),
        os: tab === 'bug' ? os : null,
        problemArea: tab === 'bug' ? area : null,
        uid: user?.uid || null,
        email: user?.email || null,
        createdAt: serverTimestamp()
      });

      setIsSubmitted(true);
      setTimeout(() => {
        handleSafeClose();
      }, 1400);
    } catch (e: any) {
      console.error(e);
      alert('전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSafeClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs"
      />

      {/* Main Panel (Settings-like Drawer) */}
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={
          isAppleDevice
            ? { opacity: 0, transition: { duration: 0 } }
            : { opacity: 0, x: '100%', transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] } }
        }
        transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.8 }}
        className="relative z-10 w-full lg:max-w-xl h-full bg-zinc-50 dark:bg-zinc-950 flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Sticky Header: 메인 헤더와 동일한 Safe Area 패딩 및 높이 적용 */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5 min-h-[56px] sm:min-h-[60px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSafeClose}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="뒤로가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                의견 보내기
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-2 -mr-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {isSubmitted ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">소중한 의견이 접수되었습니다!</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
                보내주신 피드백을 신속히 검토하여 더 쾌적한 트래커를 만들겠습니다. 감사합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-5 max-w-xl mx-auto">
              {/* Type Switcher Tab */}
              <div className="grid grid-cols-2 p-1 bg-zinc-200/70 dark:bg-zinc-800/80 rounded-2xl shrink-0">
                <button 
                  type="button"
                  onClick={() => setTab('suggestion')} 
                  className={`flex items-center justify-center gap-2 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                    tab === 'suggestion' 
                      ? 'bg-white dark:bg-zinc-900 shadow-sm text-purple-600 dark:text-purple-400' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Lightbulb className="w-4 h-4" />
                  <span>기능 제안</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setTab('bug')} 
                  className={`flex items-center justify-center gap-2 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                    tab === 'bug' 
                      ? 'bg-white dark:bg-zinc-900 shadow-sm text-red-600 dark:text-red-400' 
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Bug className="w-4 h-4" />
                  <span>오류·버그 제보</span>
                </button>
              </div>

              {/* Form Cards */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-5 sm:p-6 shadow-xs space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    제목 <span className="text-purple-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={tab === 'suggestion' ? '예: 캘린더 요일별 필터 기능 제안' : '예: 모바일에서 통계 툴팁 짤림 현상'}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  />
                </div>

                {tab === 'bug' && (
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">사용 기기 / OS</label>
                        <select 
                          value={os}
                          onChange={e => setOs(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option>iOS 및 iPadOS</option>
                          <option>Android</option>
                          <option>Windows</option>
                          <option>MacOS</option>
                          <option>기타</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">발생 위치 (영역)</label>
                        <select 
                          value={problemArea}
                          onChange={e => setProblemArea(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          {tabOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {problemArea === '직접 입력' && (
                      <input 
                        type="text" 
                        value={customProblemArea}
                        onChange={e => setCustomProblemArea(e.target.value)}
                        placeholder="문제가 발생한 위치를 직접 입력해주세요"
                        className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    )}

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                        <span>오류 로그 / 콘솔 텍스트 (선택)</span>
                        <span className="text-[10px] text-zinc-400 font-normal">PC: F12 → Console 붉은 에러 문구</span>
                      </label>
                      <textarea 
                        placeholder="복사한 에러 로그나 비정상 동작 증상을 적어주시면 빠른 원인 파악이 가능합니다."
                        className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 text-xs min-h-[60px] text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono resize-y"
                        value={consoleLog}
                        onChange={e => setConsoleLog(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    상세 설명 <span className="text-purple-500">*</span>
                  </label>
                  <textarea 
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={
                      tab === 'suggestion' 
                        ? '제안하시고자 하는 내용과 기대되는 효과를 자유롭게 작성해주세요.' 
                        : '어떤 상황에서 오류가 발생했는지 구체적인 상황을 적어주세요.'
                    }
                    className="w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3.5 text-sm min-h-[140px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button 
                  type="button"
                  onClick={handleSubmit} 
                  disabled={isSubmitting || !title.trim() || !content.trim()}
                  className="w-full py-3.5 px-4 text-sm font-bold bg-purple-600 hover:bg-purple-700 active:scale-98 text-white rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>전송하는 중...</span>
                    </>
                  ) : (
                    <span>의견 보내기 완료</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
