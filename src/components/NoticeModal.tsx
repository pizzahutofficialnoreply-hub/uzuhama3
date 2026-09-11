import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Play, Pause } from 'lucide-react';
import { NoticeItem, NoticeLink } from '../types';
import { formatNoticeText } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '../utils';

interface NoticeModalProps {
  notices: NoticeItem[];
  onClose: () => void;
}

export function NoticeModal({ notices, onClose }: NoticeModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hideToday, setHideToday] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [hasScroll, setHasScroll] = useState(false);
  const timerRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useBodyScrollLock(true);

  // 현재 공지 내용에 스크롤이 발생하는지 감지
  useEffect(() => {
    const currentNotice = notices[currentIndex];
    const isTextLong = !!currentNotice && (currentNotice.content.length > 150 || currentNotice.content.split('\n').length > 5);

    const checkScroll = () => {
      if (contentRef.current) {
        const el = contentRef.current;
        const canScroll = el.scrollHeight > el.clientHeight + 4;
        setHasScroll(canScroll || isTextLong);
      } else {
        setHasScroll(isTextLong);
      }
    };

    checkScroll();
    const timer = window.setTimeout(checkScroll, 60);
    window.addEventListener('resize', checkScroll);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', checkScroll);
    };
  }, [currentIndex, notices]);

  useEffect(() => {
    if (!isAutoPlay || notices.length <= 1) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 스크롤이 있는 긴 공지는 넘기는 시간을 10초(10000ms), 일반 공지는 5초(5000ms)로 적용
    const slideDuration = hasScroll ? 10000 : 5000;

    timerRef.current = window.setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % notices.length);
    }, slideDuration);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAutoPlay, notices.length, currentIndex, hasScroll]);

  // 수동으로 넘기면 자동 넘기기 중지
  const handleNext = () => {
    setIsAutoPlay(false);
    setCurrentIndex((prev) => (prev + 1) % notices.length);
  };

  const handlePrev = () => {
    setIsAutoPlay(false);
    setCurrentIndex((prev) => (prev - 1 + notices.length) % notices.length);
  };

  const handleSelectNotice = (idx: number) => {
    setIsAutoPlay(false);
    setCurrentIndex(idx);
  };

  const toggleAutoPlay = () => {
    setIsAutoPlay((prev) => !prev);
  };

  if (notices.length === 0) return null;

  const currentNotice = notices[currentIndex];

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
          title="닫기"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex-1 min-h-0 relative flex flex-col pt-2 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col flex-1 min-h-0 h-full overflow-hidden"
            >
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mb-4 break-keep pr-8 shrink-0">{currentNotice.title}</h2>
              <div 
                ref={contentRef}
                className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-sm sm:text-base whitespace-pre-wrap overflow-y-auto overscroll-contain pr-2 flex-1 min-h-0 select-text touch-pan-y focus:outline-none"
                style={{ WebkitOverflowScrolling: 'touch' }}
                onScroll={() => setIsAutoPlay(false)}
                onTouchMove={() => setIsAutoPlay(false)}
                onWheel={() => setIsAutoPlay(false)}
              >
                {formatNoticeText(currentNotice.content)}
              </div>

              {/* 링크 추가 시 표시되는 링크 텍스트 (다중 링크 지원) */}
              {(() => {
                const noticeLinks: NoticeLink[] = (currentNotice.links && currentNotice.links.length > 0)
                  ? currentNotice.links
                  : (currentNotice.linkUrl ? [{ url: currentNotice.linkUrl, title: currentNotice.linkText || '자세히 보기' }] : []);

                if (noticeLinks.length === 0) return null;

                return (
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2 shrink-0">
                    {noticeLinks.map((link, lIdx) => (
                      <a
                        key={lIdx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline transition-colors text-sm sm:text-base py-1 px-3 rounded-lg bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60"
                      >
                        <span>{link.title || '자세히 보기'}</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
                );
              })()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {notices.length > 1 && (
              <>
                <button 
                  onClick={handlePrev} 
                  title="이전 공지 (수동 이동 시 자동 넘김 중지)" 
                  aria-label="이전 공지"
                  className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* 자동 넘기기 일시정지 / 재생 버튼 */}
                <button
                  type="button"
                  onClick={toggleAutoPlay}
                  title={isAutoPlay ? "자동 넘기기 일시정지" : "자동 넘기기 시작"}
                  aria-label={isAutoPlay ? "자동 넘기기 일시정지" : "자동 넘기기 시작"}
                  className={`p-1.5 rounded-full transition-colors flex items-center justify-center ${
                    isAutoPlay 
                      ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60" 
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {isAutoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* 인디케이터 도트 (수동 클릭 시 해당 공지로 이동 & 자동 넘김 중지) */}
                <div className="flex items-center gap-1.5 px-1">
                  {notices.map((_, idx) => (
                    <button 
                      key={idx} 
                      type="button"
                      onClick={() => handleSelectNotice(idx)}
                      title={`${idx + 1}번째 공지 보기 (자동 넘김 중지)`}
                      aria-label={`${idx + 1}번째 공지`}
                      className={`h-2 rounded-full transition-all ${
                        idx === currentIndex 
                          ? 'w-6 bg-purple-600' 
                          : 'w-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    />
                  ))}
                </div>

                <button 
                  onClick={handleNext} 
                  title="다음 공지 (수동 이동 시 자동 넘김 중지)" 
                  aria-label="다음 공지"
                  className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 ml-1 font-medium select-none">
                  <span>{currentIndex + 1}/{notices.length}</span>
                  {!isAutoPlay && (
                    <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-normal">
                      멈춤
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center justify-between sm:justify-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={hideToday}
                onChange={(e) => setHideToday(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded border-zinc-300 dark:border-zinc-700 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">다시 보지 않기</span>
            </label>
            <button 
              onClick={() => {
                if (hideToday) {
                  localStorage.setItem('notice_seen_v2', new Date().toISOString());
                }
                onClose();
              }}
              className="px-6 py-2.5 text-sm sm:text-base font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-sm whitespace-nowrap"
            >
              확인
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
