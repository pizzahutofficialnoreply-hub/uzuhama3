import React, { useState } from 'react';
import { 
  CalendarCheck, 
  Check, 
  X, 
  Download, 
  ExternalLink, 
  Calendar as CalendarIcon, 
  Gamepad2, 
  Clock, 
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BroadcastLog } from '../../types';
import { useBodyScrollLock } from '../../utils';
import { exportMultipleToDeviceCalendar, getGoogleCalendarUrl } from '../../utils/calendarExport';

interface SelectiveCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDates: Set<string>;
  logs: Record<string, BroadcastLog>;
  onClearSelection?: () => void;
}

export const SelectiveCalendarModal: React.FC<SelectiveCalendarModalProps> = ({
  isOpen,
  onClose,
  selectedDates,
  logs,
  onClearSelection
}) => {
  useBodyScrollLock(isOpen);
  const [isExported, setIsExported] = useState(false);

  if (!isOpen) return null;

  // 선택된 로그 목록 추출 및 정렬 (최신순)
  const selectedLogs = Object.values(logs || {})
    .filter(log => selectedDates.has(log.date))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const handleExportSelected = async () => {
    if (selectedLogs.length === 0) return;
    const success = await exportMultipleToDeviceCalendar(
      selectedLogs, 
      `선택_${selectedLogs.length}건`
    );
    if (success) {
      setIsExported(true);
      setTimeout(() => setIsExported(false), 3000);
    }
  };

  const getLogTitle = (log: BroadcastLog) => {
    if (log.isAbsence) {
      return log.illnessName ? `휴방 (${log.illnessName})` : '휴방 기록';
    }
    return log.vods?.[0]?.title || log.edited?.[0]?.title || log.games?.map(g => g.name).join(', ') || log.game || `${log.date} 방송`;
  };

  return (
    <AnimatePresence>
      <div 
        id="selective-calendar-modal-backdrop" 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      >
        <motion.div
          id="selective-calendar-modal"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    선택 일정 캘린더 등록
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                    {selectedLogs.length}개 선택됨
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  선택하신 방송 일정만 기기 캘린더에 1회성으로 추가합니다.
                </p>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
            {/* 구독과 선택 등록의 차이 안내 배너 */}
            <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 text-xs text-purple-950 dark:text-purple-200 leading-relaxed space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span>캘린더 구독과 선택 등록의 차이점</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11.5px] text-zinc-600 dark:text-zinc-400">
                <li>
                  <strong className="text-purple-700 dark:text-purple-300 font-bold">선택 등록 (현재 기능):</strong> 지금 체크한 <strong>{selectedLogs.length}개 일정만</strong> 캘린더 앱에 1회성으로 등록합니다.
                </li>
                <li>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-bold">캘린더 구독 (자동 동기화):</strong> 데이터가 갱신되거나 새 방송이 추가될 때마다 사용자의 캘린더 앱에 자동으로 계속 동기화되는 방식입니다. (우측 '캘린더 구독' 버튼)
                </li>
              </ul>
            </div>

            {/* 선택된 방송 일정 목록 미리보기 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400 px-1">
                <span>등록할 방송 목록 ({selectedLogs.length}건)</span>
                {onClearSelection && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearSelection();
                      onClose();
                    }}
                    className="text-zinc-400 hover:text-red-500 text-[11px] font-semibold transition-colors"
                  >
                    선택 초기화
                  </button>
                )}
              </div>

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 bg-zinc-50/60 dark:bg-zinc-800/40 max-h-48 overflow-y-auto space-y-1.5 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {selectedLogs.length > 0 ? (
                  selectedLogs.map((log) => (
                    <div key={log.id || log.date} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-bold text-purple-600 dark:text-purple-400">{log.date}</span>
                          {log.time && (
                            <span className="text-[10px] text-zinc-400">({log.time})</span>
                          )}
                        </div>
                        <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {getLogTitle(log)}
                        </p>
                      </div>
                      {/* 단일 로그 구글 캘린더 바로가기 링크 */}
                      <a
                        href={getGoogleCalendarUrl(log)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-[10px] font-semibold shrink-0 flex items-center gap-1"
                        title="이 방송만 구글 캘린더에 바로 등록"
                      >
                        <span>구글</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-zinc-400">
                    선택된 방송 일정이 없습니다.
                  </div>
                )}
              </div>
            </div>

            {/* 등록 실행 버튼 */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleExportSelected}
                disabled={selectedLogs.length === 0}
                className="w-full py-3.5 px-4 rounded-2xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {isExported ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>선택 일정 파일(.ics) 생성 완료!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>선택한 {selectedLogs.length}개 일정 기기 캘린더에 추가 (.ics)</span>
                  </>
                )}
              </button>

              {isExported && (
                <p className="text-[11px] text-center text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
                  ✓ 다운로드된 .ics 파일을 실행하시면 기기 캘린더(아이폰, 갤럭시, 맥, 윈도우 등)에 선택한 일정만 깔끔하게 등록됩니다.
                </p>
              )}
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
