import React, { useState } from 'react';
import { Calendar, Check, Copy, ExternalLink, Smartphone, Globe, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarSubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalendarSubscribeModal: React.FC<CalendarSubscribeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // 현재 호스트 기준 구독 피드 주소 산출
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://uzuhama.vercel.app';
  const webcalBase = origin.replace(/^https?:\/\//i, '');
  const httpsFeedUrl = `${origin}/api/calendar.ics`;
  const webcalFeedUrl = `webcal://${webcalBase}/api/calendar.ics`;

  // 구글 캘린더 등록 링크 (https:// 스킴을 넘겨야 구글 서버가 정상 처리)
  const googleCalendarSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsFeedUrl)}`;

  // 애플 캘린더 자동 등록 핸들러 (PWA 및 모바일 브라우저 100% 호환)
  const handleAppleSubscribe = () => {
    try {
      // 1. webcal 스킴 직접 호출 (기기 기본 캘린더 앱 바로 열림)
      window.location.href = webcalFeedUrl;
    } catch {
      window.open(webcalFeedUrl, '_blank');
    }
  };

  // 구글 캘린더 자동 등록 핸들러
  const handleGoogleSubscribe = () => {
    // 새 창/새 탭에서 구글 캘린더 등록 페이지 열기
    window.open(googleCalendarSubscribeUrl, '_blank', 'noopener,noreferrer');
  };

  // 주소 복사
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(httpsFeedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = httpsFeedUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="calendar-subscribe-modal-backdrop" 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      >
        <motion.div
          id="calendar-subscribe-modal"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 relative bg-zinc-50/50 dark:bg-zinc-900">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-200/60 dark:border-purple-800/60">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                  방송 캘린더 자동 구독
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  한 번 등록하면 새 방송 일정이 캘린더 앱에 자동으로 동기화됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
            
            {/* 구독 방식 버튼 목록 */}
            <div className="space-y-2.5">
              {/* 1. Apple 캘린더 / iPhone / Mac 등록 버튼 */}
              <button
                type="button"
                id="btn-subscribe-apple-calendar"
                onClick={handleAppleSubscribe}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 transition-all shadow-xs cursor-pointer text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      Apple 캘린더 등록 (iPhone / iPad / Mac)
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      클릭 시 기기 캘린더 앱이 열리며 즉시 구독됩니다
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 shrink-0 transition-colors ml-2" />
              </button>

              {/* 2. Google 캘린더 등록 버튼 */}
              <button
                type="button"
                id="btn-subscribe-google-calendar"
                onClick={handleGoogleSubscribe}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 transition-all shadow-xs cursor-pointer text-left group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      Google 캘린더에 추가 (Android / 웹)
                    </span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      클릭 시 구글 캘린더 추가 페이지로 바로 이동합니다
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 transition-colors ml-2" />
              </button>

              {/* 3. 캘린더 구독 주소 직접 복사 */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-900 dark:text-white text-xs sm:text-sm">
                    구독 주소 복사 (네이버 / Outlook / 타사 캘린더)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={httpsFeedUrl}
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 font-mono focus:outline-none select-all truncate"
                  />
                  <button
                    id="btn-copy-calendar-feed-url"
                    type="button"
                    onClick={handleCopyUrl}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>복사 완료</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>주소 복사</span>
                      </>
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ 캘린더 구독 주소가 복사되었습니다. 캘린더 앱의 [URL로 추가] 메뉴에 붙여넣어 주세요.
                  </p>
                )}
              </div>

              {/* 4. 파일로 바로 열기/다운로드 (대체 옵션) */}
              <a
                href={httpsFeedUrl}
                download="uzuhama_calendar.ics"
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-dashed border-zinc-300 dark:border-zinc-700 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Download className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    캘린더 파일(.ics) 직접 다운로드하여 열기
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">파일 저장</span>
              </a>
            </div>

            {/* 심플한 안내 문구 */}
            <div className="p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed space-y-1">
              <p>• 구독 등록 후 새 방송이 올라오면 캘린더 앱에 자동으로 최신 일정이 업데이트됩니다.</p>
              <p>• 구독을 원치 않으시면 언제든지 캘린더 앱 내 구독 목록에서 삭제하실 수 있습니다.</p>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end bg-zinc-50/50 dark:bg-zinc-900">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
