import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  subDays,
  subYears,
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays,
  isSunday,
  isSaturday,
  parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, PlaySquare, Smartphone, Video, Calendar as CalendarIcon, ChevronDown, X, CalendarPlus, Check, CalendarDays, Sparkles, Search, Play, Bell, CheckSquare, Square, CalendarCheck } from 'lucide-react';
import { AppData, BroadcastLog } from '../../types';
import { cn, formatDuration, formatTo12Hour, parseTimeTo24, fuzzyKoreanMatch, fuzzyDateMatch } from '../../utils';
import { extractYoutubeId, extractChzzkId, isVideoUrl, matchMediaUrl, matchLogMedia } from '../../utils/urlUtils';
import { isKoreanHoliday } from '../../utils/koreanHolidays';
import { exportToDeviceCalendar, exportMultipleToDeviceCalendar, getGoogleCalendarUrl } from '../../utils/calendarExport';
import { triggerHaptic } from '../../utils/haptics';
import { CalendarSubscribeModal } from '../CalendarSubscribeModal';
import { motion, AnimatePresence } from 'motion/react';

const ShortsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.23 6.74l1.2.49L6 14.93a3.75 3.75 0 003.5 6.63l8.5-4.5a3.74 3.74 0 00-.23-6.74zM10 14.65v-5.3L15 12l-5 2.65z" />
  </svg>
);

const VideoIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/>
  </svg>
);

interface VideoLinkCardProps {
  url?: string;
  title?: string;
  category?: string;
  categories?: string[];
  icon?: React.ElementType;
  borderClass?: string;
  bgClass?: string;
  textClass?: string;
  showThumbnail?: boolean;
  isShorts?: boolean;
  isShortsPair?: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
  vodUrl?: string;
  editedUrl?: string;
  shortsList?: { title?: string; url: string }[];
  type?: 'edited' | 'vod' | 'shorts';
}

const VideoLinkCard = ({ 
  url, 
  title, 
  category, 
  categories, 
  borderClass = "border-zinc-200 dark:border-zinc-800", 
  bgClass = "bg-white dark:bg-zinc-900", 
  textClass = "text-zinc-900 dark:text-white",
  showThumbnail = true,
  isShorts = false,
  isShortsPair = false,
  isPlaying = false,
  onPlay,
  onStop,
  vodUrl,
  editedUrl,
  shortsList,
  type
}: VideoLinkCardProps) => {
  const [showShortsMenu, setShowShortsMenu] = useState(false);
  const ytId = extractYoutubeId(url || editedUrl || vodUrl);
  const catList: string[] = (() => {
    if (Array.isArray(categories) && categories.length > 0) return categories;
    if (category) return category.split(',').map((c: string) => c.trim()).filter(Boolean);
    return [];
  })();

  const handleCardClick = (e: React.MouseEvent) => {
    if (ytId && onPlay && !isPlaying) {
      e.preventDefault();
      onPlay();
    }
  };

  const primaryVideoUrl = editedUrl || (type === 'vod' ? vodUrl : url);
  const secondaryVodUrl = (primaryVideoUrl !== vodUrl && vodUrl) ? vodUrl : undefined;

  return (
    <div className={cn(
      "flex flex-col overflow-hidden rounded-[22px] border transition-all duration-200 group bg-white dark:bg-zinc-900 shadow-xs hover:shadow-md",
      borderClass,
      bgClass,
      isShortsPair && "h-full"
    )}>
      {/* 1. 영상 재생 영역 (인라인 브라우저 재생 중일 때) */}
      {isPlaying && ytId ? (
        <div className={cn("relative w-full bg-black overflow-hidden", isShorts ? "aspect-[9/16]" : "aspect-video")}>
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0`}
            title={title || '영상 재생'}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStop?.();
            }}
            className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded-lg bg-black/85 hover:bg-black text-white text-xs font-semibold flex items-center gap-1 shadow-md transition-colors cursor-pointer"
            title="플레이어 닫기"
          >
            <X className="w-3.5 h-3.5" />
            <span>닫기</span>
          </button>
        </div>
      ) : showThumbnail && ytId ? (
        /* 2. 썸네일 영역 + 브라우저 바로 재생 지원 (생방송도 16:9 썸네일 지원) */
        <div 
          onClick={handleCardClick}
          className={cn(
            "relative w-full overflow-hidden bg-zinc-950 border-b border-black/10 dark:border-white/10 cursor-pointer select-none group/thumb",
            isShortsPair ? "aspect-[9/16]" : "aspect-video"
          )}
          title="클릭하여 브라우저에서 바로 재생"
        >
          <img 
            src={isShortsPair ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} 
            alt={title || ''} 
            className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500" 
          />
          <div className="absolute inset-0 bg-black/25 group-hover/thumb:bg-black/15 transition-colors flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-red-600/90 group-hover/thumb:bg-red-600 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
          </div>
        </div>
      ) : null}

      {/* 3. 콘텐츠 정보 및 하단 액션 영역 */}
      <div className={cn("flex flex-col p-3.5 gap-2.5 flex-1 justify-between", textClass)}>
        <div>
          <div className="font-bold text-zinc-900 dark:text-white leading-snug line-clamp-2 text-sm sm:text-base mb-1.5" title={title}>
            {title}
          </div>

          {catList.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {catList.map((cat, idx) => (
                <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 4. 검색탭 카드 레이아웃 형태 버튼들 (외부 재생 아이콘 제외, 기존 아이콘 적용) */}
        <div className="mt-auto pt-2.5 flex flex-col gap-2 relative border-t border-black/5 dark:border-white/5">
          {/* 상단 메인 버튼: 영상 보기 / 생방송 보기 */}
          {editedUrl || (!editedUrl && !vodUrl && url && !isShorts) ? (
            <a 
              href={editedUrl || url} 
              target="_blank"
              rel="noreferrer"
              className="w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs hover:scale-[1.01]"
            >
              <VideoIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <span>영상 보기</span>
            </a>
          ) : vodUrl || (!editedUrl && !vodUrl && url && !isShorts) ? (
            <a 
              href={vodUrl || url} 
              target="_blank"
              rel="noreferrer"
              className="w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 border border-purple-200/80 dark:border-purple-800/60 shadow-2xs hover:scale-[1.01]"
            >
              <PlaySquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>생방송 보기</span>
            </a>
          ) : isShorts && url ? (
            <a 
              href={url} 
              target="_blank"
              rel="noreferrer"
              className="w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-red-50 hover:bg-red-100 dark:bg-red-900/10 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-800/60 shadow-2xs hover:scale-[1.01]"
            >
              <ShortsIcon className="w-4 h-4 text-red-500" />
              <span>쇼츠 보기</span>
            </a>
          ) : null}

          {/* 하단 2열 버튼: 생방송 보기 및 쇼츠 보기 */}
          {(Boolean(secondaryVodUrl) || Boolean(shortsList && shortsList.length > 0)) && (
            <div className="flex items-center gap-2">
              {secondaryVodUrl && (
                <a 
                  href={secondaryVodUrl} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400"
                >
                  <PlaySquare className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>생방송 보기</span>
                </a>
              )}

              {shortsList && shortsList.length === 1 && (
                <a 
                  href={shortsList[0].url} 
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-red-50 hover:bg-red-100 dark:bg-red-900/10 text-red-600 dark:text-red-400"
                >
                  <ShortsIcon className="w-3.5 h-3.5 text-red-500" />
                  <span>쇼츠 보기</span>
                </a>
              )}

              {shortsList && shortsList.length > 1 && (
                <div className="flex-1 relative">
                  <button 
                    type="button"
                    onClick={() => setShowShortsMenu(prev => !prev)} 
                    className="w-full flex justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors bg-red-50 hover:bg-red-100 dark:bg-red-900/10 text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <ShortsIcon className="w-3.5 h-3.5 text-red-500" />
                    <span>쇼츠 ({shortsList.length})</span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                  {showShortsMenu && (
                    <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-30 flex flex-col">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-700">
                        쇼츠 선택
                      </div>
                      {shortsList.map((s, idx) => (
                        <a 
                          key={idx} 
                          href={s.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-0 truncate"
                        >
                          {s.title || `쇼츠 ${idx + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface CalendarTabProps {
  data: AppData;
  fetchLogs?: (startDate?: string, endDate?: string) => Promise<void>;
  selectedDateStr?: string | null;
  onClearSelectedDate?: () => void;
  isActive?: boolean;
}

export function CalendarTab({ data, selectedDateStr, onClearSelectedDate, isActive = true }: CalendarTabProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [playingModalVideo, setPlayingModalVideo] = useState<{ url: string; title: string } | null>(null);

  // 외부(몰아보기, 히트맵 등)에서 링크를 통해 이동해온 임시 날짜 선택인지 여부
  const isNavigatedFromExternalRef = useRef<boolean>(false);
  // 외부 이동 전 사용자가 보고 있던 상태(현재 월, 선택 날짜, 테이블 시작/종료일, 커스텀 필터 여부) 백업
  const savedStateBeforeExternalNavRef = useRef<{
    currentDate: Date;
    selectedDate: Date | null;
    inputStartDate: string;
    inputEndDate: string;
    appliedStartDate: string;
    appliedEndDate: string;
    hasCustomFilter: boolean;
  } | null>(null);

  // Date Range for Table
  const [inputStartDate, setInputStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [inputEndDate, setInputEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [appliedStartDate, setAppliedStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [appliedEndDate, setAppliedEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc'|'asc'>('desc');
  const [hasCustomFilter, setHasCustomFilter] = useState(false);
  const [exportedLogId, setExportedLogId] = useState<string | null>(null);
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [batchExportSuccess, setBatchExportSuccess] = useState(false);

  // 캘린더 선택 등록 모드 상태
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  // 캘린더 구독 실시간 반영 상태
  const [isSubscribed, setIsSubscribed] = useState(() => {
    try {
      return localStorage.getItem('uzuhama_calendar_subscribed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleSubChanged = () => {
      try {
        setIsSubscribed(localStorage.getItem('uzuhama_calendar_subscribed') === 'true');
      } catch {}
    };
    window.addEventListener('storage', handleSubChanged);
    window.addEventListener('calendar_subscription_changed', handleSubChanged);
    return () => {
      window.removeEventListener('storage', handleSubChanged);
      window.removeEventListener('calendar_subscription_changed', handleSubChanged);
    };
  }, []);

  // 탭 재진입 감지: 다른 탭으로 이동했다가 다시 방송 기록(기록) 탭으로 돌아왔을 때
  // 외부 자동 이동 전 사용자가 보고 있던 상태로 원상 복구
  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    if (!prevIsActiveRef.current && isActive) {
      if (isNavigatedFromExternalRef.current) {
        if (savedStateBeforeExternalNavRef.current) {
          const saved = savedStateBeforeExternalNavRef.current;
          setCurrentDate(saved.currentDate);
          setSelectedDate(saved.selectedDate);
          setInputStartDate(saved.inputStartDate);
          setInputEndDate(saved.inputEndDate);
          setAppliedStartDate(saved.appliedStartDate);
          setAppliedEndDate(saved.appliedEndDate);
          setHasCustomFilter(saved.hasCustomFilter);
          savedStateBeforeExternalNavRef.current = null;
        } else {
          setSelectedDate(null);
          const mStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
          const mEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
          setInputStartDate(mStart);
          setInputEndDate(mEnd);
          setAppliedStartDate(mStart);
          setAppliedEndDate(mEnd);
          setHasCustomFilter(false);
        }
        isNavigatedFromExternalRef.current = false;
      }
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, currentDate]);

  useEffect(() => {
    if (selectedDateStr) {
      // 자동 이동 전의 상태를 아직 백업하지 않았다면 백업 저장
      if (!isNavigatedFromExternalRef.current) {
        savedStateBeforeExternalNavRef.current = {
          currentDate,
          selectedDate,
          inputStartDate,
          inputEndDate,
          appliedStartDate,
          appliedEndDate,
          hasCustomFilter
        };
      }

      isNavigatedFromExternalRef.current = true;
      const parsed = parseISO(selectedDateStr);
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
        setSelectedDate(parsed);
        
        // 방송 기록 표: 해당 날짜만 즉시 단독 조회 (강조 표시가 아닌 해당 날짜만 조회)
        setInputStartDate(selectedDateStr);
        setInputEndDate(selectedDateStr);
        setAppliedStartDate(selectedDateStr);
        setAppliedEndDate(selectedDateStr);
        setHasCustomFilter(true);

        // 해당 날짜의 테이블 또는 달력으로 부드럽게 스크롤
        setTimeout(() => {
          const targetRow = document.getElementById(`table-row-${selectedDateStr}`);
          if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
      // 소비 후 즉시 부모 state를 비워 prop이 영구 잔존하지 않도록 처리
      onClearSelectedDate?.();
    }
  }, [selectedDateStr, onClearSelectedDate, currentDate, selectedDate, inputStartDate, inputEndDate, appliedStartDate, appliedEndDate, hasCustomFilter]);

  const handleExportLogToCalendar = async (log: BroadcastLog) => {
    const success = await exportToDeviceCalendar(log);
    if (success) {
      setExportedLogId(log.id || log.date);
      setTimeout(() => setExportedLogId(null), 3000);
    }
  };

  const handleExportBatchToCalendar = async () => {
    if (!tableLogs || tableLogs.length === 0) {
      alert('선택한 기간에 등록할 방송 일정이 없습니다.');
      return;
    }

    setIsExportingBatch(true);
    const rangeLabel = appliedStartDate === appliedEndDate 
      ? appliedStartDate 
      : `${appliedStartDate}~${appliedEndDate}`;
    
    const success = await exportMultipleToDeviceCalendar(tableLogs, rangeLabel);
    setIsExportingBatch(false);

    if (success) {
      setBatchExportSuccess(true);
      setTimeout(() => setBatchExportSuccess(false), 3000);
    }
  };

  const handleToggleSelectDate = (dateStr: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const visibleDates = tableLogs.map(l => l.date).filter(Boolean);
    const isAll = visibleDates.length > 0 && visibleDates.every(d => selectedDates.has(d));
    if (isAll) {
      setSelectedDates(new Set());
    } else {
      setSelectedDates(new Set(visibleDates));
    }
  };

  const handleExportSelectedToCalendar = async () => {
    if (selectedDates.size === 0) {
      alert('등록할 방송 일정을 하나 이상 선택해주세요.');
      return;
    }
    const targetLogs = logsArray.filter(l => selectedDates.has(l.date));
    if (targetLogs.length === 0) return;

    setIsExportingBatch(true);
    const success = await exportMultipleToDeviceCalendar(targetLogs, `선택 일정 ${targetLogs.length}건`);
    setIsExportingBatch(false);
    if (success) {
      setBatchExportSuccess(true);
      setTimeout(() => setBatchExportSuccess(false), 3000);
      setIsSelectMode(false);
      setSelectedDates(new Set());
    }
  };

  useEffect(() => {
    if (!hasCustomFilter) {
      setInputStartDate(format(startOfMonth(currentDate), 'yyyy-MM-dd'));
      setInputEndDate(format(endOfMonth(currentDate), 'yyyy-MM-dd'));
      setAppliedStartDate(format(startOfMonth(currentDate), 'yyyy-MM-dd'));
      setAppliedEndDate(format(endOfMonth(currentDate), 'yyyy-MM-dd'));
    }
  }, [currentDate, hasCustomFilter]);

  const handleStartDateChange = (val: string) => {
    setInputStartDate(val);
    setAppliedStartDate(val);
    setHasCustomFilter(true);
  };

  const handleEndDateChange = (val: string) => {
    setInputEndDate(val);
    setAppliedEndDate(val);
    setHasCustomFilter(true);
  };

  const handleTableFilter = () => {
    setAppliedStartDate(inputStartDate);
    setAppliedEndDate(inputEndDate);
    setHasCustomFilter(true);
  };

  const { minDate, maxDate, minMonthStr, maxMonthStr, minDateStr, maxDateStr } = useMemo(() => {
    const dates = Object.values(data.logs || {}).map(l => l.date).filter(Boolean).sort();
    const minD = dates.length > 0 ? parseISO(dates[0]) : new Date(2016, 0, 1);
    
    // maxDate: DB에 저장된 가장 최신 날짜 또는 현재 시점 중 최신
    const latestDbDate = dates.length > 0 ? parseISO(dates[dates.length - 1]) : new Date();
    const today = new Date();
    const maxD = latestDbDate > today ? latestDbDate : today;

    return {
      minDate: minD,
      maxDate: maxD,
      minMonthStr: format(minD, 'yyyy-MM'),
      maxMonthStr: format(maxD, 'yyyy-MM'),
      minDateStr: format(minD, 'yyyy-MM-dd'),
      maxDateStr: format(maxD, 'yyyy-MM-dd')
    };
  }, [data.logs]);

  const previousRangeBeforePresetRef = useRef<{ start: string; end: string } | null>(null);

  const handleApplyPreset = (preset: '7d' | '30d' | '90d' | '1y' | '5y' | 'all') => {
    // 이미 선택된 프리셋을 한 번 더 클릭하면 프리셋 누르기 전 상태로 취소 복귀
    if (activePreset === preset) {
      if (previousRangeBeforePresetRef.current) {
        const prev = previousRangeBeforePresetRef.current;
        setInputStartDate(prev.start);
        setInputEndDate(prev.end);
        setAppliedStartDate(prev.start);
        setAppliedEndDate(prev.end);
        previousRangeBeforePresetRef.current = null;
      }
      return;
    }

    // 프리셋 적용 전의 기존 기간 저장
    if (!activePreset) {
      previousRangeBeforePresetRef.current = { start: appliedStartDate, end: appliedEndDate };
    }

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    let newStart = '';
    let newEnd = todayStr;

    if (preset === '7d') {
      newStart = format(subDays(today, 7), 'yyyy-MM-dd');
    } else if (preset === '30d') {
      newStart = format(subDays(today, 30), 'yyyy-MM-dd');
    } else if (preset === '90d') {
      newStart = format(subDays(today, 90), 'yyyy-MM-dd');
    } else if (preset === '1y') {
      newStart = format(subYears(today, 1), 'yyyy-MM-dd');
    } else if (preset === '5y') {
      newStart = format(subYears(today, 5), 'yyyy-MM-dd');
    } else if (preset === 'all') {
      newStart = minDateStr;
      newEnd = maxDateStr > todayStr ? maxDateStr : todayStr;
    }

    setInputStartDate(newStart);
    setInputEndDate(newEnd);
    setAppliedStartDate(newStart);
    setAppliedEndDate(newEnd);
    setHasCustomFilter(true);
  };

  const activePreset = useMemo<'7d' | '30d' | '90d' | '1y' | '5y' | 'all' | null>(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const d7Start = format(subDays(today, 7), 'yyyy-MM-dd');
    const d30Start = format(subDays(today, 30), 'yyyy-MM-dd');
    const d90Start = format(subDays(today, 90), 'yyyy-MM-dd');
    const y1Start = format(subYears(today, 1), 'yyyy-MM-dd');
    const y5Start = format(subYears(today, 5), 'yyyy-MM-dd');
    const allEnd = maxDateStr > todayStr ? maxDateStr : todayStr;

    if (appliedStartDate === d7Start && appliedEndDate === todayStr) return '7d';
    if (appliedStartDate === d30Start && appliedEndDate === todayStr) return '30d';
    if (appliedStartDate === d90Start && appliedEndDate === todayStr) return '90d';
    if (appliedStartDate === y1Start && appliedEndDate === todayStr) return '1y';
    if (appliedStartDate === y5Start && appliedEndDate === todayStr) return '5y';
    if (appliedStartDate === minDateStr && (appliedEndDate === todayStr || appliedEndDate === allEnd)) return 'all';
    return null;
  }, [appliedStartDate, appliedEndDate, minDateStr, maxDateStr]);

  const nextMonth = () => {
    const next = addMonths(currentDate, 1);
    if (format(next, 'yyyy-MM') > maxMonthStr) return;
    setCurrentDate(next);
    setSelectedDate(null);
  };

  const prevMonth = () => {
    const prev = subMonths(currentDate, 1);
    if (format(prev, 'yyyy-MM') < minMonthStr) return;
    setCurrentDate(prev);
    setSelectedDate(null);
  };

  // 모바일 좌우 스와이프 제스처 핸들러
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleCalendarTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleCalendarTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (e.changedTouches.length === 1) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartXRef.current;
      const dy = touchEndY - touchStartYRef.current;

      // 수평 스와이프 판정 (수평 이동 거리가 45px 이상이고 수직 이동보다 1.4배 이상 클 때)
      if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) {
          // 오른쪽에서 왼쪽으로 스와이프 -> 다음 달
          nextMonth();
        } else {
          // 왼쪽에서 오른쪽으로 스와이프 -> 이전 달
          prevMonth();
        }
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const logsArray = Object.values(data.logs);

  const getLogForDate = (date: Date) => {
    const formattedStr = format(date, 'yyyy-MM-dd');
    return logsArray.find(log => log.date === formattedStr);
  };

  const formatTimeRange = (time: string, endTime?: string, durationHours?: number) => {
    if (!time) return '';
    const startStr = formatTo12Hour(time);
    let endStr = '';

    if (endTime) {
      endStr = formatTo12Hour(endTime);
    } else if (durationHours) {
      const { hour, minute } = parseTimeTo24(time);
      const totalMins = (hour * 60) + minute + Math.round(durationHours * 60);
      const endH = Math.floor(totalMins / 60) % 24;
      const endM = totalMins % 60;
      
      const period = (endH >= 0 && endH < 12) ? '오전' : '오후';
      const h12 = endH % 12 || 12;
      endStr = `${period} ${h12}:${endM.toString().padStart(2, '0')}`;
    }

    return `${startStr}${endStr ? ` ~ ${endStr}` : ''}`;
  };

  const handleClearDateFilter = () => {
    isNavigatedFromExternalRef.current = false;
    setPlayingVideoUrl(null);
    onClearSelectedDate?.();

    if (savedStateBeforeExternalNavRef.current) {
      const saved = savedStateBeforeExternalNavRef.current;
      setCurrentDate(saved.currentDate);
      setSelectedDate(saved.selectedDate);
      setInputStartDate(saved.inputStartDate);
      setInputEndDate(saved.inputEndDate);
      setAppliedStartDate(saved.appliedStartDate);
      setAppliedEndDate(saved.appliedEndDate);
      setHasCustomFilter(saved.hasCustomFilter);
      savedStateBeforeExternalNavRef.current = null;
    } else {
      setSelectedDate(null);
      const mStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      setInputStartDate(mStart);
      setInputEndDate(mEnd);
      setAppliedStartDate(mStart);
      setAppliedEndDate(mEnd);
      setHasCustomFilter(false);
    }
  };

  const handleDayClick = (date: Date) => {
    isNavigatedFromExternalRef.current = false;
    const formatted = format(date, 'yyyy-MM-dd');

    if (isSelectMode) {
      const log = getLogForDate(date);
      if (log) {
        handleToggleSelectDate(formatted);
      }
      return;
    }

    if (selectedDate && isSameDay(date, selectedDate)) {
      handleClearDateFilter();
    } else {
      setSelectedDate(date);
      setInputStartDate(formatted);
      setInputEndDate(formatted);
      setAppliedStartDate(formatted);
      setAppliedEndDate(formatted);
      setHasCustomFilter(true);
      setTimeout(() => {
        const panel = document.getElementById('calendar-detail-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    }
  };

  const selectedLog = selectedDate ? getLogForDate(selectedDate) : null;

  const rows = [];
  let days = [];
  let day = startDate;

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const cloneDay = day;
      const log = getLogForDate(cloneDay);
      const formattedDate = format(cloneDay, 'd');

      days.push(
        !isSameMonth(cloneDay, monthStart) ? (
          <div key={cloneDay.toString()} className="h-20 sm:h-28 border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 pointer-events-none" />
        ) : (
          <div
            key={cloneDay.toString()}
            onClick={() => handleDayClick(cloneDay)}
            className="h-24 sm:h-32 p-1 border-r border-b border-zinc-100 dark:border-zinc-800/60 relative cursor-pointer bg-white dark:bg-zinc-900 transition-colors"
            title={log ? `${formatTimeRange(log.time, log.endTime, log.durationHours)} - ${log.game}` : '방송 기록 없음'}
          >
            <div className={cn(
              "w-full h-full rounded-2xl p-1 sm:p-2 transition-all duration-200 flex flex-col relative",
              selectedDate && isSameDay(cloneDay, selectedDate) ? "bg-purple-100/80 dark:bg-purple-900/40 shadow-inner ring-1 ring-purple-400 dark:ring-purple-500" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
            )}>
              {(() => {
                const cloneDateStr = format(cloneDay, 'yyyy-MM-dd');
                const isHoliday = isKoreanHoliday(cloneDateStr);
                const isSun = isSunday(cloneDay);
                const isSat = isSaturday(cloneDay);
                const isToday = isSameDay(cloneDay, new Date());
                const isSelected = selectedDates.has(cloneDateStr);

                return (
                  <div className="flex items-center justify-between mb-0.5 sm:mb-1 overflow-hidden">
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "text-[11px] sm:text-sm font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full shrink-0",
                        isToday ? "bg-purple-600 text-white" : "",
                        !isToday && (isSun || isHoliday) ? "text-red-500 font-bold" : "",
                        !isToday && !isHoliday && isSat ? "text-blue-500" : ""
                      )}>
                        {formattedDate}
                      </span>
                    </div>

                    {isSelectMode && log && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectDate(cloneDateStr);
                        }}
                        className="p-0.5 cursor-pointer z-10"
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-md flex items-center justify-center border transition-all",
                          isSelected
                            ? "bg-purple-600 border-purple-600 text-white shadow-xs"
                            : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 hover:border-purple-400"
                        )}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {log && (
                <div className="h-full w-full overflow-y-auto overflow-x-hidden flex flex-col justify-start custom-scrollbar">
                  
                  <div className="hidden sm:block text-[11px] sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 px-1 py-1 leading-tight break-words w-full">
                    {log.games && log.games.length > 0 ? (
                      <ul className="pl-1">
                        {log.games.map((g, idx) => (
                          <li key={idx} className="break-words mb-0.5 whitespace-pre-wrap">
                            <span className="text-purple-500 font-bold">•</span> {g.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="break-words">{log.game}</span>
                    )}
                  </div>
                  <div className="flex sm:hidden justify-center items-center h-full w-full">
                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-sm"></div>
                  </div>

                </div>
              )}
            </div>
          </div>
        )
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7" key={day.toString()}>
        {days}
      </div>
    );
    days = [];
  }

  // Filter logs for table based on selected range, selected date, and search term
  const tableLogs = useMemo(() => {
    const rawTerm = searchTerm.trim();
    if (rawTerm !== '') {
      const ytId = extractYoutubeId(rawTerm);
      const chzzkId = extractChzzkId(rawTerm);
      const isUrl = isVideoUrl(rawTerm) || !!ytId || !!chzzkId;

      return logsArray.filter(log => {
        // 1. 영상, 쇼츠, 생방 링크 대조 (유튜브 Video ID 11자리 파싱 및 LIKE 매칭 완벽 지원)
        if (isUrl) {
          if (matchLogMedia(log, rawTerm)) return true;
          return false;
        }

        // 2. 일반 텍스트, 날짜, 미디어 링크 및 초성 매칭
        if (matchLogMedia(log, rawTerm)) return true;
        if (fuzzyDateMatch(rawTerm, log.date)) return true;
        if (log.game && fuzzyKoreanMatch(rawTerm, log.game)) return true;
        if (log.category && fuzzyKoreanMatch(rawTerm, log.category)) return true;
        if (log.games?.some(g => fuzzyKoreanMatch(rawTerm, g.name) || fuzzyKoreanMatch(rawTerm, g.category))) return true;
        if (log.vods?.some(v => (v.title && fuzzyKoreanMatch(rawTerm, v.title)) || matchMediaUrl(typeof v === 'string' ? v : v?.url, rawTerm))) return true;
        if (log.shorts?.some(s => (s.title && fuzzyKoreanMatch(rawTerm, s.title)) || matchMediaUrl(typeof s === 'string' ? s : s?.url, rawTerm))) return true;
        if (log.edited?.some(e => (e.title && fuzzyKoreanMatch(rawTerm, e.title)) || matchMediaUrl(typeof e === 'string' ? e : e?.url, rawTerm))) return true;
        return false;
      });
    }

    // 날짜를 직접 클릭하여 선택한 경우, 해당 날짜의 방송 기록만 조회
    if (selectedDate) {
      const targetDateStr = format(selectedDate, 'yyyy-MM-dd');
      return logsArray.filter(log => log.date === targetDateStr);
    }

    return logsArray.filter(log => {
      return log.date >= appliedStartDate && log.date <= appliedEndDate;
    });
  }, [logsArray, appliedStartDate, appliedEndDate, searchTerm, selectedDate]);

  // 검색 결과가 1건으로 좁혀졌을 때 자동으로 해당 날짜 선택 및 달력 이동
  useEffect(() => {
    if (searchTerm.trim() && tableLogs.length === 1) {
      const singleLog = tableLogs[0];
      if (singleLog?.date) {
        const parsed = parseISO(singleLog.date);
        if (!isNaN(parsed.getTime())) {
          setSelectedDate(parsed);
          setCurrentDate(parsed);
        }
      }
    }
  }, [searchTerm, tableLogs]);

  return (
    <div className="space-y-6">
      
      {/* Calendar & Detail Overlay Wrapper (달력이 줄어들거나 밀리지 않도록 relative 래퍼 적용) */}
      <div className="relative w-full">
        {/* Calendar Column */}
        <div 
          id="calendar-main-card" 
          onTouchStart={handleCalendarTouchStart}
          onTouchEnd={handleCalendarTouchEnd}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden shadow-sm touch-pan-y transition-colors duration-200"
        >
          <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white shrink-0">방송 기록 달력</h3>
              
              {/* 달력 첫 번째 칸: 날짜 설정 인풋 및 오늘 이동 바로가기 */}
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold shrink-0">날짜 설정</span>
                <input
                  type="date"
                  min={minDateStr}
                  max={maxDateStr}
                  value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(currentDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const parsed = parseISO(val);
                    if (!isNaN(parsed.getTime())) {
                      setCurrentDate(parsed);
                      handleDayClick(parsed);
                    }
                  }}
                  className="bg-transparent text-zinc-900 dark:text-white font-medium text-xs focus:outline-none cursor-pointer"
                  title="특정 날짜를 직접 설정하여 달력 이동 및 상세 기록 조회"
                  aria-label="달력 날짜 직접 설정"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setCurrentDate(today);
                    handleDayClick(today);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 font-bold transition-colors cursor-pointer text-[11px]"
                  title="오늘 날짜로 달력 이동 및 상세 기록 조회"
                >
                  오늘
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={prevMonth} 
                disabled={format(currentDate, 'yyyy-MM') <= minMonthStr} 
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="이전 달"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {/* 브라우저 / 모바일 OS 네이티브 month 선택기 */}
              <label 
                className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-200 text-base sm:text-lg font-bold transition-colors cursor-pointer shadow-xs"
                title="클릭하여 년도 및 월 선택"
              >
                <CalendarIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>{format(currentDate, 'yyyy년 M월', { locale: ko })}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 ml-0.5 shrink-0" />
                
                <input
                  type="month"
                  min={minMonthStr}
                  max={maxMonthStr}
                  value={format(currentDate, 'yyyy-MM')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const [y, m] = val.split('-').map(Number);
                    if (y && m) {
                      const newDate = new Date(y, m - 1, 1);
                      setCurrentDate(newDate);
                      setSelectedDate(null);
                      const mStart = format(startOfMonth(newDate), 'yyyy-MM-dd');
                      const mEnd = format(endOfMonth(newDate), 'yyyy-MM-dd');
                      setInputStartDate(mStart);
                      setInputEndDate(mEnd);
                      setAppliedStartDate(mStart);
                      setAppliedEndDate(mEnd);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  aria-label="년도 및 월 선택"
                />
              </label>

              <button 
                onClick={nextMonth} 
                disabled={format(currentDate, 'yyyy-MM') >= maxMonthStr} 
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer" 
                title="다음 달"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div key={d} className={cn(
                "py-3 text-center text-sm font-semibold border-r border-zinc-200 dark:border-zinc-800 last:border-r-0",
                d === '일' ? "text-red-500" : d === '토' ? "text-blue-500" : "text-zinc-500 dark:text-zinc-400"
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* 달력 선택 등록 모드 실행 중일 때 달력 상단 전체 선택 바 */}
          {isSelectMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-purple-50/80 dark:bg-purple-950/40 border-b border-purple-200/80 dark:border-purple-800/60 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    const monthDates = logsArray
                      .filter(l => l.date && isSameMonth(parseISO(l.date), currentDate))
                      .map(l => l.date);
                    const allSelected = monthDates.length > 0 && monthDates.every(d => selectedDates.has(d));
                    setSelectedDates(prev => {
                      const next = new Set(prev);
                      if (allSelected) {
                        monthDates.forEach(d => next.delete(d));
                      } else {
                        monthDates.forEach(d => next.add(d));
                      }
                      return next;
                    });
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-zinc-700 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>이번 달 전체 선택</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setSelectedDates(new Set());
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs cursor-pointer"
                >
                  선택 해제
                </button>
                <span className="text-zinc-600 dark:text-zinc-300 font-semibold text-xs ml-1">
                  {selectedDates.size}개 날짜 선택됨
                </span>
              </div>
              {selectedDates.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    setIsSubscribeModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
                  title="체크 버튼 누르면 기존 등록 기기 모달로 이동"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>기기 등록 모달로 이동</span>
                </button>
              )}
            </div>
          )}

          <div className="border-l border-t border-zinc-200 dark:border-zinc-800 flex flex-col">
            {rows}
          </div>
        </div>

        {/* Selected Log Panel (달력을 밀지 않고 우측 약 1/3을 부드럽게 가리며 오버레이) */}
        <AnimatePresence>
          {selectedDate && (
            <motion.div 
              key="calendar-detail-panel"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2, ease: 'easeIn' } }}
              transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.6 }}
              id="calendar-detail-panel" 
              className={cn(
                "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 shadow-2xl flex flex-col z-30",
                "lg:absolute lg:top-0 lg:right-0 lg:bottom-0 lg:w-[36%] lg:min-w-[360px] lg:max-w-[460px] lg:rounded-r-[24px] lg:rounded-l-2xl lg:border-y-0 lg:border-r-0 lg:border-l lg:overflow-y-auto lg:custom-scrollbar",
                "mt-4 lg:mt-0 w-full rounded-[24px]"
              )}
            >
              <div className="w-full relative">
                <button 
                  onClick={handleClearDateFilter}
                  className="absolute -top-1 -right-1 sm:top-0 sm:right-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-2 cursor-pointer z-10"
                  title="닫기"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                {selectedLog ? (
                  <div className="flex flex-col gap-4 sm:gap-6 mt-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                          {format(selectedDate, 'M월 d일')} <span className="text-base sm:text-lg font-medium text-zinc-500 dark:text-zinc-400">{format(selectedDate, 'EEEE', { locale: ko })}</span>
                        </h3>
                      </div>
                      {(Boolean(selectedLog.time) || (selectedLog.durationHours && selectedLog.durationHours > 0)) && (
                        <div className="text-purple-600 dark:text-purple-400 font-medium flex items-center gap-2 text-sm sm:text-base">
                          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                          {formatTimeRange(selectedLog.time, selectedLog.endTime, selectedLog.durationHours)}
                          {selectedLog.durationHours && selectedLog.durationHours > 0 ? ` (${formatDuration(selectedLog.durationHours)})` : ''}
                        </div>
                      )}

                      {/* 기기 캘린더 및 구글 캘린더 추가 버튼 (PWA 지원) */}
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => handleExportLogToCalendar(selectedLog)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200/80 dark:border-purple-800/80 text-xs sm:text-sm transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                          title="기기 캘린더 앱(iOS/Android/PC)에 일정 등록 (.ics)"
                        >
                          {exportedLogId === (selectedLog.id || selectedLog.date) ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-emerald-700 dark:text-emerald-300">캘린더 파일 생성됨</span>
                            </>
                          ) : (
                            <>
                              <CalendarPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <span>기기 캘린더에 추가</span>
                            </>
                          )}
                        </button>
                        <a
                          href={getGoogleCalendarUrl(selectedLog)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs sm:text-sm transition-all border border-zinc-200 dark:border-zinc-700 shrink-0"
                          title="구글 캘린더(웹/앱)에 일정 추가"
                        >
                          <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
                          <span>구글 캘린더</span>
                        </a>
                      </div>
                    </div>

                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex flex-col gap-2 sm:gap-3">
                        <h4 className="text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">진행한 게임</h4>
                        {selectedLog.games && selectedLog.games.length > 0 ? (
                          selectedLog.games.map((g, idx) => (
                            <div key={idx} className="bg-zinc-50 dark:bg-zinc-800/50 p-3 sm:p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-start gap-1">
                              <span className="hidden sm:inline-block px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">
                                {g.category || selectedLog.category || '종합'}
                              </span>
                              <div className="w-full mt-1 text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-tight">
                                {g.link ? (
                                  <a href={g.link} target="_blank" rel="noopener noreferrer" className="hover:text-purple-600 dark:hover:text-purple-400 transition-colors underline decoration-purple-500/30 underline-offset-4">
                                    {g.name}
                                  </a>
                                ) : (
                                  g.name
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="bg-zinc-50 dark:bg-zinc-800/50 p-3 sm:p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-start gap-1">
                            <span className="hidden sm:inline-block px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">
                              {selectedLog.category}
                            </span>
                            <div className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-tight">{selectedLog.game}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const validVods = selectedLog.vods?.filter(v => !v.isCompilation && !v.compilationId && !v.title?.includes('몰아보기')) || [];
                      const validEdited = selectedLog.edited?.filter(v => !v.isCompilation && !v.compilationId && !v.title?.includes('몰아보기')) || [];
                      const validShorts = selectedLog.shorts?.filter(v => !v.isCompilation && !v.compilationId && !v.title?.includes('몰아보기')) || [];
                      const hasAnyVideos = validVods.length > 0 || validEdited.length > 0 || validShorts.length > 0;

                      if (!hasAnyVideos) return null;

                      const renderVideoCard = (
                        video: { url?: string; title?: string; category?: string; categories?: string[] },
                        type: 'vod' | 'edited' | 'shorts',
                        isVertical = false
                      ) => {
                        const ytId = extractYoutubeId(video.url);
                        const isPlaying = Boolean(video.url && playingVideoUrl === video.url);
                        const title = video.title || (type === 'vod' ? '생방송 다시보기' : type === 'edited' ? '유튜브 편집본' : '유튜브 쇼츠');
                        const cats = Array.isArray(video.categories) && video.categories.length > 0
                          ? video.categories
                          : (video.category ? video.category.split(',').map(c => c.trim()).filter(Boolean) : []);

                        return (
                          <div className={cn(
                            "flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900 shadow-2xs hover:shadow-md transition-all duration-200 border-zinc-200 dark:border-zinc-800",
                            isVertical && "h-full justify-between"
                          )}>
                            {/* 썸네일 또는 인라인 브라우저 재생 ("팝업이 아니라 그 상태로 재생") */}
                            {isPlaying && ytId ? (
                              <div className={cn("relative w-full bg-black overflow-hidden", isVertical ? "aspect-[9/16]" : "aspect-video")}>
                                <iframe
                                  src={`https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0`}
                                  title={title}
                                  className="w-full h-full border-0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPlayingVideoUrl(null);
                                  }}
                                  className="absolute top-2 left-2 z-30 px-2.5 py-1 rounded-lg bg-black/85 hover:bg-black text-white text-xs font-semibold flex items-center gap-1 shadow-md transition-colors cursor-pointer"
                                  title="플레이어 닫기"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>닫기</span>
                                </button>
                              </div>
                            ) : ytId ? (
                              <div
                                onClick={() => setPlayingVideoUrl(video.url || null)}
                                className={cn(
                                  "relative w-full overflow-hidden bg-zinc-950 border-b border-black/10 dark:border-white/10 cursor-pointer select-none group/thumb",
                                  isVertical ? "aspect-[9/16]" : "aspect-video"
                                )}
                                title="클릭하여 바로 재생"
                              >
                                <img
                                  src={isVertical ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                                  alt={title}
                                  className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/25 group-hover/thumb:bg-black/15 transition-colors flex items-center justify-center">
                                  <div className={cn(
                                    "rounded-full bg-red-600/90 group-hover/thumb:bg-red-600 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform",
                                    isVertical ? "w-9 h-9" : "w-11 h-11"
                                  )}>
                                    <Play className={cn("fill-current ml-0.5", isVertical ? "w-4 h-4" : "w-5 h-5")} />
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {/* 콘텐츠 정보 */}
                            <div className={cn("p-3.5 flex flex-col gap-2 flex-1 justify-between", isVertical && "p-2.5 gap-1.5")}>
                              <div>
                                <div className={cn(
                                  "font-bold text-zinc-900 dark:text-white leading-snug line-clamp-2 mb-1",
                                  isVertical ? "text-xs" : "text-sm sm:text-base"
                                )} title={title}>
                                  {title}
                                </div>
                                {cats.length > 0 && !isVertical && (
                                  <div className="flex flex-wrap gap-1">
                                    {cats.map((c, idx) => (
                                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 각각 개체당 하나씩만 위치하는 단일 액션 버튼 */}
                              <div className="mt-auto pt-2 border-t border-black/5 dark:border-white/5">
                                {type === 'vod' ? (
                                  <a
                                    href={video.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 shadow-2xs hover:scale-[1.01]"
                                  >
                                    <PlaySquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span>생방송 보기</span>
                                  </a>
                                ) : type === 'edited' ? (
                                  <a
                                    href={video.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs hover:scale-[1.01]"
                                  >
                                    <VideoIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                    <span>영상 보기</span>
                                  </a>
                                ) : (
                                  <a
                                    href={video.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full flex justify-center items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-800/60 shadow-2xs hover:scale-[1.01]"
                                  >
                                    <ShortsIcon className="w-3.5 h-3.5 text-red-500" />
                                    <span>쇼츠 보기</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="space-y-5 pt-3 sm:pt-4 border-t border-zinc-200 dark:border-zinc-800">
                          {/* 1. 생방송 다시보기 섹션 */}
                          {validVods.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                                <PlaySquare className="w-4 h-4 shrink-0" />
                                <span>생방송 다시보기</span>
                                <span className="text-[11px] font-normal text-zinc-400">({validVods.length})</span>
                              </h4>
                              <div className="flex flex-col gap-3">
                                {validVods.map((v, i) => (
                                  <React.Fragment key={`vod-${i}`}>
                                    {renderVideoCard(v, 'vod', false)}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. 유튜브 편집본 영상 섹션 */}
                          {validEdited.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                <VideoIcon className="w-4 h-4 shrink-0 text-red-500" />
                                <span>유튜브 편집본 (영상)</span>
                                <span className="text-[11px] font-normal text-zinc-400">({validEdited.length})</span>
                              </h4>
                              <div className="flex flex-col gap-3">
                                {validEdited.map((v, i) => (
                                  <React.Fragment key={`edited-${i}`}>
                                    {renderVideoCard(v, 'edited', false)}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. 쇼츠 영상 섹션 (2개 이상이면 세로로 2개 || 모양으로 배치) */}
                          {validShorts.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-xs sm:text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <ShortsIcon className="w-4 h-4 text-red-500 shrink-0" />
                                <span>쇼츠 영상</span>
                                <span className="text-[11px] font-normal text-zinc-400">({validShorts.length})</span>
                              </h4>
                              {validShorts.length >= 2 ? (
                                <div className="grid grid-cols-2 gap-2.5">
                                  {validShorts.map((v, i) => (
                                    <React.Fragment key={`shorts-${i}`}>
                                      {renderVideoCard(v, 'shorts', true)}
                                    </React.Fragment>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  {validShorts.map((v, i) => (
                                    <React.Fragment key={`shorts-${i}`}>
                                      {renderVideoCard(v, 'shorts', false)}
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-8 sm:py-12 mt-2 sm:mt-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl font-bold">{format(selectedDate, 'd')}</span>
                </div>
                <p className="text-zinc-500 font-medium text-center text-sm sm:text-base">{format(selectedDate, 'M월 d일')} 방송 기록이 없습니다.</p>
              </div>
            )}
          </div>
        </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* 전체 방송 기록 표 */}
      <div id="calendar-table-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden shadow-sm mt-8">
        <div className="p-5 sm:p-6 lg:p-7 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">전체 방송 기록</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                {tableLogs.length}건
              </span>
            </div>
            {isSelectMode && (
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                선택 모드: {selectedDates.size}개 방송일 선택됨
              </span>
            )}
          </div>
          
          {/* [1:1 길이 캘린더 선택 등록 버튼 및 구독 버튼] - 검색창 바로 위에 각각 1:1 너비 배치 */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
            {/* 1. 캘린더 선택 등록 버튼 */}
            <button 
              type="button"
              onClick={() => {
                triggerHaptic(12);
                setIsSelectMode(prev => !prev);
              }}
              className={cn(
                "w-full py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs border active:scale-[0.99]",
                isSelectMode
                  ? "bg-purple-600 text-white border-purple-600 shadow-purple-500/20"
                  : "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/80"
              )}
              title="달력 및 목록에서 원하는 방송 일정을 체크하여 기기 캘린더에 일괄 등록"
            >
              <CalendarCheck className="w-4 h-4 shrink-0" />
              <span>{isSelectMode ? `선택 등록 종료 (${selectedDates.size})` : '캘린더 선택 등록'}</span>
            </button>

            {/* 2. 구독 버튼 */}
            <button 
              type="button"
              id="btn-calendar-subscribe-table"
              onClick={() => {
                triggerHaptic(12);
                setIsSubscribeModalOpen(true);
              }}
              className="w-full py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs border bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 active:scale-[0.99]"
              title="스마트폰 캘린더에 방송 일정 자동 동기화"
            >
              <Bell className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>캘린더 구독</span>
            </button>
          </div>

          {/* 선택 모드 활성화 시 전체 선택/해제 및 기기 등록 체크 버튼 툴바 */}
          {isSelectMode && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 rounded-2xl animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    handleToggleSelectAll();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
                  <span>전체 선택</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(10);
                    setSelectedDates(new Set());
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  선택 해제
                </button>
                <span className="text-xs font-bold text-purple-700 dark:text-purple-300 ml-1">
                  {selectedDates.size}개 방송일 선택됨
                </span>
              </div>

              {/* 전체 선택 후 체크 버튼 누르면 기존 등록 기기 모달로 이동 */}
              <button
                type="button"
                onClick={() => {
                  if (selectedDates.size === 0) {
                    alert('등록할 방송 일정을 먼저 선택해주세요.');
                    return;
                  }
                  triggerHaptic(15);
                  setIsSubscribeModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                title="기기 등록 모달 열기"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>기기 등록 모달로 이동 ({selectedDates.size})</span>
              </button>
            </div>
          )}

          {/* [상세 분석 조회 스타일 필터: 며칠 전 등 선택하는 것 옆에 최신순 등 선택하는 것] */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* 며칠 전 등 선택 (기간 프리셋) */}
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar shrink-0">
              {[
                { key: '7d' as const, label: '7일 전' },
                { key: '30d' as const, label: '30일 전' },
                { key: '90d' as const, label: '90일 전' },
                { key: '1y' as const, label: '1년 전' },
                { key: 'all' as const, label: '전체' },
              ].map((p) => {
                const isSelected = activePreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      handleApplyPreset(p.key);
                    }}
                    className={cn(
                      "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                      isSelected
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                        : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 justify-between sm:justify-end">
              {/* 날짜 직접 입력 */}
              <div className="hidden sm:flex items-center gap-1 text-xs">
                <input 
                  type="date" 
                  min={minDateStr}
                  max={maxDateStr}
                  value={inputStartDate} 
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-zinc-900 dark:text-white text-xs focus:outline-none"
                  title="시작 날짜 설정"
                />
                <span className="text-zinc-400 font-medium">~</span>
                <input 
                  type="date" 
                  min={minDateStr}
                  max={maxDateStr}
                  value={inputEndDate} 
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-zinc-900 dark:text-white text-xs focus:outline-none"
                  title="종료 날짜 설정"
                />
              </div>

              {/* 며칠 전 등 선택하는 것 옆에 위치한 최신순/오래된순 정렬 옵션 */}
              <select
                value={sortOrder}
                onChange={(e) => {
                  triggerHaptic(10);
                  setSortOrder(e.target.value as 'desc' | 'asc');
                }}
                className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="desc">최신순</option>
                <option value="asc">오래된순</option>
              </select>
            </div>
          </div>

          {/* [상세 분석 조회 버튼 자리를 검색창으로 바꾼 대형 실시간 검색창] */}
          <div className="relative w-full">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="방송 제목, 게임명, 카테고리, 날짜, URL 검색…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-2xl pl-10 sm:pl-12 pr-10 py-3 sm:py-3.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm sm:text-base shadow-2xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  setSearchTerm('');
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title="검색어 지우기"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>
        
        {(selectedDate || selectedDateStr) && (
          <div className="flex items-center justify-between px-5 lg:px-7 py-3 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                선택된 날짜({selectedDate ? format(selectedDate, 'yyyy-MM-dd') : selectedDateStr})의 방송 기록만 조회 중입니다.
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearDateFilter}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-600 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              전체 방송 기록 보기
            </button>
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[500px] sm:min-w-[760px] text-left text-xs sm:text-sm table-fixed lg:table-auto">
            <thead className="bg-zinc-50 dark:bg-black/40 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">
              <tr>
                {isSelectMode && (
                  <th className="w-[45px] sm:w-[50px] px-2.5 sm:px-4 py-3.5 sm:py-4 lg:py-5 text-center">
                    <div 
                      onClick={() => {
                        triggerHaptic(10);
                        handleToggleSelectAll();
                      }} 
                      className="p-1 cursor-pointer inline-flex items-center justify-center"
                      title="전체 선택 / 해제"
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-md flex items-center justify-center border transition-all",
                        tableLogs.length > 0 && tableLogs.every(l => selectedDates.has(l.date))
                          ? "bg-purple-600 border-purple-600 text-white shadow-xs"
                          : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600"
                      )}>
                        {tableLogs.length > 0 && tableLogs.every(l => selectedDates.has(l.date)) && (
                          <Check className="w-3 h-3 stroke-[3]" />
                        )}
                      </div>
                    </div>
                  </th>
                )}
                <th className="w-[120px] sm:w-[170px] lg:w-[200px] px-3 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5">방송 날짜 / 시간</th>
                <th className="w-[150px] sm:w-[230px] lg:w-[270px] px-3 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5"><span className="hidden sm:inline">카테고리 / </span>게임 이름</th>
                <th className="w-[65px] sm:min-w-[190px] lg:min-w-[270px] px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5">다시보기</th>
                <th className="w-[65px] sm:min-w-[160px] lg:min-w-[220px] px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5">편집본</th>
                <th className="w-[60px] sm:w-[140px] lg:w-[160px] px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5">쇼츠</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tableLogs.sort((a, b) => {
                const diff = a.date.localeCompare(b.date);
                return sortOrder === 'desc' ? -diff : diff;
              }).map((log) => {
                return (
                  <tr 
                    key={log.id} 
                    id={`table-row-${log.date}`}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {isSelectMode && (
                      <td className="w-[45px] sm:w-[50px] px-2.5 sm:px-4 py-3.5 sm:py-4 lg:py-5 align-top text-center">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic(10);
                            handleToggleSelectDate(log.date);
                          }}
                          className="p-1 cursor-pointer inline-flex items-center justify-center mt-0.5"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-md flex items-center justify-center border transition-all",
                            selectedDates.has(log.date)
                              ? "bg-purple-600 border-purple-600 text-white shadow-xs"
                              : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 hover:border-purple-400"
                          )}>
                            {selectedDates.has(log.date) && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-3 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top whitespace-nowrap">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-200">
                        {log.date}
                      </div>
                    {(Boolean(log.time) || (log.durationHours && log.durationHours > 0)) ? (
                      <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-1.5 leading-relaxed">
                        {formatTimeRange(log.time, log.endTime, log.durationHours)}
                        {log.durationHours && log.durationHours > 0 ? ` (${formatDuration(log.durationHours)})` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top">
                    {log.games && log.games.length > 0 ? (
                      <div className="flex flex-col gap-2.5">
                        {log.games.map((g, idx) => (
                          <div key={idx} className="flex flex-col gap-1">
                            <span className="hidden sm:inline-block self-start px-2 py-0.5 rounded text-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              {g.category || log.category || '종합'}
                            </span>
                            {g.link ? (
                              <a href={g.link} target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-zinc-100 hover:text-purple-600 dark:hover:text-purple-400 font-semibold hover:underline flex items-center gap-1">
                                {g.name}
                              </a>
                            ) : (
                              <span className="text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1">{g.name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="hidden sm:flex items-center gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {log.category}
                          </span>
                        </div>
                        <div className="text-zinc-900 dark:text-zinc-100 font-semibold">{log.game}</div>
                      </>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top">
                    <div className="flex flex-col gap-2">
                      {log.vods?.length > 0 ? log.vods.map((v, i) => {
                        const ytId = extractYoutubeId(v.url);
                        const cats = Array.isArray(v.categories) && v.categories.length > 0
                          ? v.categories
                          : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="inline-flex items-center gap-1.5 p-1 -m-1 sm:p-0 sm:m-0 text-zinc-700 dark:text-zinc-300">
                              {ytId ? (
                                <button
                                  type="button"
                                  onClick={() => setPlayingModalVideo({ url: v.url, title: v.title || '생방송 다시보기' })}
                                  className="inline-flex items-center gap-1.5 text-left hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer group/btn"
                                  title="브라우저에서 바로 재생"
                                >
                                  <PlaySquare className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400 group-hover/btn:scale-110 transition-transform" />
                                  <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed group-hover/btn:underline">{v.title}</span>
                                </button>
                              ) : (
                                <a 
                                  href={v.url || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  title={v.title || '생방송 다시보기'}
                                  className="inline-flex items-center gap-1.5 text-left hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                                >
                                  <PlaySquare className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                                  <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                                </a>
                              )}
                            </div>
                            {cats.length > 0 && (
                              <div className="hidden sm:flex flex-wrap gap-1 pl-5">
                                {cats.map((c, cIdx) => (
                                  <span key={cIdx} className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-medium">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }) : <span className="text-zinc-300 dark:text-zinc-700">-</span>}
                    </div>
                  </td>
                  <td className="px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top">
                    <div className="flex flex-col gap-2">
                      {(() => {
                        const individualVideos = log.edited?.filter(v => !v.isCompilation && !v.compilationId && !v.title?.includes('몰아보기')) || [];
                        return individualVideos.length > 0 ? individualVideos.map((v, i) => {
                          const ytId = extractYoutubeId(v.url);
                          const cats = Array.isArray(v.categories) && v.categories.length > 0
                            ? v.categories
                            : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                          return (
                            <div key={i} className="flex flex-col gap-1">
                              <div className="inline-flex items-center gap-1.5 p-1 -m-1 sm:p-0 sm:m-0">
                                {ytId ? (
                                  <button
                                    type="button"
                                    onClick={() => setPlayingModalVideo({ url: v.url, title: v.title || '유튜브 편집본' })}
                                    className="inline-flex items-center gap-1.5 text-left text-red-600 dark:text-red-400 font-semibold hover:underline cursor-pointer group/btn"
                                    title="브라우저에서 바로 재생"
                                  >
                                    <VideoIcon className="w-4 h-4 shrink-0 text-red-500 group-hover/btn:scale-110 transition-transform" />
                                    <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                                  </button>
                                ) : (
                                  <a 
                                    href={v.url || '#'} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    title={v.title || '유튜브 편집본'}
                                    className={`inline-flex items-center gap-1.5 ${
                                      v.url ? 'text-red-600 dark:text-red-400 font-semibold hover:underline' : 'text-zinc-400 dark:text-zinc-600 cursor-default'
                                    }`}
                                  >
                                    <VideoIcon className={`w-4 h-4 shrink-0 ${v.url ? 'text-red-500' : 'text-zinc-400'}`} />
                                    <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                                  </a>
                                )}
                              </div>
                              {cats.length > 0 && (
                                <div className="hidden sm:flex flex-wrap gap-1 pl-5">
                                  {cats.map((c, cIdx) => (
                                    <span key={cIdx} className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }) : <span className="text-zinc-300 dark:text-zinc-700">-</span>;
                      })()}
                    </div>
                  </td>
                  <td className="px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top">
                    <div className="flex flex-col gap-2">
                      {log.shorts?.length > 0 ? log.shorts.map((v, i) => {
                        const ytId = extractYoutubeId(v.url);
                        const cats = Array.isArray(v.categories) && v.categories.length > 0
                          ? v.categories
                          : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="inline-flex items-center gap-1.5 p-1 -m-1 sm:p-0 sm:m-0 text-zinc-700 dark:text-zinc-300">
                              {ytId ? (
                                <button
                                  type="button"
                                  onClick={() => setPlayingModalVideo({ url: v.url, title: v.title || '유튜브 쇼츠' })}
                                  className="inline-flex items-center gap-1.5 text-left hover:text-red-500 transition-colors cursor-pointer group/btn"
                                  title="브라우저에서 바로 재생"
                                >
                                  <ShortsIcon className="w-4 h-4 shrink-0 text-red-500 group-hover/btn:scale-110 transition-transform" />
                                  <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed group-hover/btn:underline">{v.title}</span>
                                </button>
                              ) : (
                                <a 
                                  href={v.url || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  title={v.title || '유튜브 쇼츠'}
                                  className="inline-flex items-center gap-1.5 text-left hover:text-red-500 transition-colors"
                                >
                                  <ShortsIcon className="w-4 h-4 shrink-0 text-red-500" />
                                  <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                                </a>
                              )}
                            </div>
                            {cats.length > 0 && (
                              <div className="hidden sm:flex flex-wrap gap-1 pl-5">
                                {cats.map((c, cIdx) => (
                                  <span key={cIdx} className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-medium">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }) : <span className="text-zinc-300 dark:text-zinc-700">-</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {tableLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-zinc-500">
                    <p className="text-sm font-medium">해당 조건에 일치하는 방송 기록이 없습니다.</p>
                    {(selectedDate || selectedDateStr) && (
                      <button
                        type="button"
                        onClick={handleClearDateFilter}
                        className="mt-3 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                      >
                        전체 방송 기록 보기
                      </button>
                    )}
                  </td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 캘린더 자동 구독 모달 (PWA & webcal & Google Calendar 연동) */}
      <CalendarSubscribeModal
        isOpen={isSubscribeModalOpen}
        onClose={() => setIsSubscribeModalOpen(false)}
      />

      {/* 방송 기록 브라우저 재생 모달 */}
      <AnimatePresence>
        {playingModalVideo && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-zinc-800 text-white">
                <span className="text-sm font-bold truncate pr-4">{playingModalVideo.title}</span>
                <button
                  type="button"
                  onClick={() => setPlayingModalVideo(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative w-full aspect-video bg-black">
                {(() => {
                  const ytId = extractYoutubeId(playingModalVideo.url);
                  return ytId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0`}
                      title={playingModalVideo.title}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                      재생 가능한 영상 링크가 아닙니다.
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
