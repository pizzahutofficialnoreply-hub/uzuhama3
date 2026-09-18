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
import { ChevronLeft, ChevronRight, PlaySquare, Smartphone, Video, Calendar as CalendarIcon, ChevronDown, X, CalendarPlus, ExternalLink, Check, CalendarDays, Sparkles, Search } from 'lucide-react';
import { AppData, BroadcastLog } from '../../types';
import { cn, formatDuration, formatTo12Hour, parseTimeTo24, fuzzyKoreanMatch, fuzzyDateMatch } from '../../utils';
import { extractYoutubeId, extractChzzkId, isVideoUrl, matchMediaUrl } from '../../utils/urlUtils';
import { getKoreanHoliday, isKoreanHoliday } from '../../utils/koreanHolidays';
import { exportToDeviceCalendar, exportMultipleToDeviceCalendar, getGoogleCalendarUrl } from '../../utils/calendarExport';
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



interface CalendarTabProps {
  data: AppData;
  fetchLogs?: (startDate: string, endDate: string) => Promise<void>;
  selectedDateStr?: string | null;
  onClearSelectedDate?: () => void;
}


const getYoutubeId = (url: string) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/);
  return match ? match[1] : null;
};

const VideoLinkCard = ({ url, title, category, categories, icon: Icon, borderClass, bgClass, textClass }: any) => {
  const ytId = getYoutubeId(url);
  const catList: string[] = (() => {
    if (Array.isArray(categories) && categories.length > 0) return categories;
    if (category) return category.split(',').map((c: string) => c.trim()).filter(Boolean);
    return [];
  })();

  return (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`flex flex-col overflow-hidden rounded-xl border ${borderClass} ${bgClass} hover:shadow-md transition-all group`}>
      {ytId && (
        <div className="w-full aspect-video relative overflow-hidden bg-zinc-900 border-b border-black/10 dark:border-white/10">
          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      <div className={`flex flex-col p-3 gap-1.5 ${textClass}`}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 shrink-0" />
          <span className="font-bold text-sm truncate">{title}</span>
        </div>
        {catList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {catList.map((cat, idx) => (
              <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-medium">
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
};

export function CalendarTab({ data, selectedDateStr, onClearSelectedDate, isActive = true }: CalendarTabProps & { isActive?: boolean }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);

  // 외부(히트맵 등)에서 링크를 통해 이동해온 임시 날짜 선택인지 여부
  const isNavigatedFromExternalRef = useRef<boolean>(false);

  // 탭 재진입 감지: 다른 탭으로 이동했다가 다시 방송 기록(달력) 탭으로 돌아왔을 때
  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    if (!prevIsActiveRef.current && isActive) {
      if (isNavigatedFromExternalRef.current) {
        setSelectedDate(null);
        isNavigatedFromExternalRef.current = false;
        onClearSelectedDate?.();
      }
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, onClearSelectedDate]);

  useEffect(() => {
    if (selectedDateStr) {
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
    }
  }, [selectedDateStr]);
  
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

  const handleApplyPreset = (preset: '30d' | '1y' | '5y' | 'all') => {
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

    if (preset === '30d') {
      newStart = format(subDays(today, 30), 'yyyy-MM-dd');
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

  const activePreset = useMemo<'30d' | '1y' | '5y' | 'all' | null>(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const d30Start = format(subDays(today, 30), 'yyyy-MM-dd');
    const y1Start = format(subYears(today, 1), 'yyyy-MM-dd');
    const y5Start = format(subYears(today, 5), 'yyyy-MM-dd');
    const allEnd = maxDateStr > todayStr ? maxDateStr : todayStr;

    if (appliedStartDate === d30Start && appliedEndDate === todayStr) return '30d';
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
    setSelectedDate(null);
    onClearSelectedDate?.();
    const mStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');
    setInputStartDate(mStart);
    setInputEndDate(mEnd);
    setAppliedStartDate(mStart);
    setAppliedEndDate(mEnd);
    setHasCustomFilter(false);
  };

  const handleDayClick = (date: Date) => {
    isNavigatedFromExternalRef.current = false;
    if (selectedDate && isSameDay(date, selectedDate)) {
      handleClearDateFilter();
    } else {
      setSelectedDate(date);
      const formatted = format(date, 'yyyy-MM-dd');
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
                const holidayName = getKoreanHoliday(cloneDateStr);
                const isHoliday = Boolean(holidayName);
                const isSun = isSunday(cloneDay);
                const isSat = isSaturday(cloneDay);
                const isToday = isSameDay(cloneDay, new Date());

                return (
                  <div className="flex items-center gap-1 mb-0.5 sm:mb-1 overflow-hidden">
                    <span className={cn(
                      "text-[11px] sm:text-sm font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full shrink-0",
                      isToday ? "bg-purple-600 text-white" : "",
                      !isToday && (isSun || isHoliday) ? "text-red-500 font-bold" : "",
                      !isToday && !isHoliday && isSat ? "text-blue-500" : ""
                    )}>
                      {formattedDate}
                    </span>
                    {holidayName && (
                      <span className="hidden sm:inline-block text-[10px] text-red-500 font-semibold truncate leading-none" title={holidayName}>
                        {holidayName}
                      </span>
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
        // 1. 영상, 쇼츠, 생방 링크 대조
        // Firestore나 JSON을 새로 호출하지 않고, 기존에 로드된 logsArray(메모리 데이터)와만 대조합니다.
        if (isUrl) {
          if (ytId) {
            if (log.vods?.some(v => (typeof v === 'string' ? v : v?.url)?.includes(ytId))) return true;
            if (log.shorts?.some(s => (typeof s === 'string' ? s : s?.url)?.includes(ytId))) return true;
            if (log.edited?.some(e => (typeof e === 'string' ? e : e?.url)?.includes(ytId))) return true;
            if (log.games?.some(g => (g?.vodUrl && g.vodUrl.includes(ytId)) || (g?.link && g.link.includes(ytId)))) return true;
            if (log.youtubeUrl && log.youtubeUrl.includes(ytId)) return true;
          }
          if (chzzkId) {
            if (log.vods?.some(v => (typeof v === 'string' ? v : v?.url)?.includes(chzzkId))) return true;
            if (log.shorts?.some(s => (typeof s === 'string' ? s : s?.url)?.includes(chzzkId))) return true;
            if (log.edited?.some(e => (typeof e === 'string' ? e : e?.url)?.includes(chzzkId))) return true;
            if (log.games?.some(g => (g?.vodUrl && g.vodUrl.includes(chzzkId)) || (g?.link && g.link.includes(chzzkId)))) return true;
            if (log.chzzkUrl && log.chzzkUrl.includes(chzzkId)) return true;
          }
          // matchMediaUrl을 통한 정밀 URL / ID 대조 (vods, shorts, edited, games, youtubeUrl, chzzkUrl, liveUrl, vodUrl)
          if (log.vods?.some(v => matchMediaUrl(typeof v === 'string' ? v : v?.url, rawTerm))) return true;
          if (log.shorts?.some(s => matchMediaUrl(typeof s === 'string' ? s : s?.url, rawTerm))) return true;
          if (log.edited?.some(e => matchMediaUrl(typeof e === 'string' ? e : e?.url, rawTerm))) return true;
          if (log.games?.some(g => matchMediaUrl(g?.vodUrl, rawTerm) || matchMediaUrl(g?.link, rawTerm))) return true;
          if (matchMediaUrl(log.youtubeUrl, rawTerm) || matchMediaUrl(log.chzzkUrl, rawTerm) || matchMediaUrl((log as any).liveUrl, rawTerm) || matchMediaUrl((log as any).vodUrl, rawTerm)) return true;
          return false;
        }

        // 2. 일반 텍스트 및 초성 매칭
        if (fuzzyDateMatch(rawTerm, log.date)) return true;
        if (log.game && fuzzyKoreanMatch(rawTerm, log.game)) return true;
        if (log.category && fuzzyKoreanMatch(rawTerm, log.category)) return true;
        if (log.games?.some(g => fuzzyKoreanMatch(rawTerm, g.name) || fuzzyKoreanMatch(rawTerm, g.category))) return true;
        if (log.vods?.some(v => (v.title && fuzzyKoreanMatch(rawTerm, v.title)) || (v.url && v.url.includes(rawTerm)))) return true;
        if (log.shorts?.some(s => (s.title && fuzzyKoreanMatch(rawTerm, s.title)) || (s.url && s.url.includes(rawTerm)))) return true;
        if (log.edited?.some(e => (e.title && fuzzyKoreanMatch(rawTerm, e.title)) || (e.url && e.url.includes(rawTerm)))) return true;
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Calendar & Detail Overlay Wrapper (달력이 줄어들거나 밀리지 않도록 relative 래퍼 적용) */}
      <div className="relative w-full">
        {/* Calendar Column */}
        <div 
          id="calendar-main-card" 
          onTouchStart={handleCalendarTouchStart}
          onTouchEnd={handleCalendarTouchEnd}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm touch-pan-y transition-colors duration-200"
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
                "lg:absolute lg:top-0 lg:right-0 lg:bottom-0 lg:w-[36%] lg:min-w-[360px] lg:max-w-[460px] lg:rounded-r-3xl lg:rounded-l-2xl lg:border-y-0 lg:border-r-0 lg:border-l lg:overflow-y-auto lg:custom-scrollbar",
                "mt-4 lg:mt-0 w-full rounded-3xl"
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
                        {(() => {
                          const hName = getKoreanHoliday(format(selectedDate, 'yyyy-MM-dd'));
                          return hName ? (
                            <span className="text-xs px-2 py-0.5 font-bold rounded-full bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800/80">
                              {hName}
                            </span>
                          ) : null;
                        })()}
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
                          <ExternalLink className="w-3.5 h-3.5" />
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

                    {(selectedLog.vods?.length > 0 || selectedLog.edited?.length > 0 || selectedLog.shorts?.length > 0) && (
                      <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-zinc-200 dark:border-zinc-800">
                        <h4 className="text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">업로드된 영상</h4>
                        
                        {selectedLog.vods?.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {selectedLog.vods.map((v, i) => (
                              <VideoLinkCard key={i} url={v.url} title={v.title} category={v.category} categories={v.categories} icon={PlaySquare} borderClass="border-purple-100 dark:border-purple-800/30" bgClass="bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20" textClass="text-purple-700 dark:text-purple-300" />
                            ))}
                          </div>
                        )}

                        {selectedLog.edited?.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {selectedLog.edited.map((v, i) => (
                              <VideoLinkCard key={i} url={v.url} title={v.title} category={v.category} categories={v.categories} icon={VideoIcon} borderClass="border-blue-100 dark:border-blue-800/30" bgClass="bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20" textClass="text-blue-700 dark:text-blue-300" />
                            ))}
                          </div>
                        )}

                        {selectedLog.shorts?.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {selectedLog.shorts.map((v, i) => (
                              <VideoLinkCard key={i} url={v.url} title={v.title} category={v.category} categories={v.categories} icon={ShortsIcon} borderClass="border-red-100 dark:border-red-800/30" bgClass="bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20" textClass="text-red-700 dark:text-red-300" />
                            ))}
                          </div>
                        )}
                  </div>
                )}
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
      <div id="calendar-table-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm mt-8">
        <div className="p-5 sm:p-6 lg:p-7 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white shrink-0">전체 방송 기록</h3>
            
            {/* 나머지 칸띄움 자동: 날짜 범위, 프리셋, 정렬, 캘린더 추가, 자동 구독 */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto justify-between lg:justify-end">
              {/* 첫 번째 칸: 날짜 설정 (시작일 ~ 종료일) */}
              <div className="flex items-center gap-1.5 text-sm">
                <input 
                  type="date" 
                  min={minDateStr}
                  max={maxDateStr}
                  value={inputStartDate} 
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs sm:text-sm"
                  title="시작 날짜 설정"
                  aria-label="조회 시작 날짜"
                />
                <span className="text-zinc-400 font-medium">~</span>
                <input 
                  type="date" 
                  min={minDateStr}
                  max={maxDateStr}
                  value={inputEndDate} 
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs sm:text-sm"
                  title="종료 날짜 설정"
                  aria-label="조회 종료 날짜"
                />
              </div>

              {/* 기간 프리셋 버튼 그룹 */}
              <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar shrink-0">
                {[
                  { key: '30d' as const, label: '최근 30일' },
                  { key: '1y' as const, label: '최근 1년' },
                  { key: '5y' as const, label: '최근 5년' },
                  { key: 'all' as const, label: '전체' },
                ].map((p) => {
                  const isSelected = activePreset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleApplyPreset(p.key)}
                      className={cn(
                        "px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                        isSelected
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* 정렬 옵션 */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                <option value="desc">최신순</option>
                <option value="asc">오래된순</option>
              </select>

              {/* 달력 일괄 추가 */}
              <button 
                type="button"
                onClick={handleExportBatchToCalendar}
                disabled={isExportingBatch || tableLogs.length === 0}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 border",
                  batchExportSuccess 
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm"
                    : "bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/80 shadow-sm hover:shadow active:scale-[0.98]"
                )}
                title="선택한 기간의 전체 방송 일정을 기기 캘린더(.ics)에 추가"
              >
                {batchExportSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>캘린더 등록 완료 ({tableLogs.length}건)</span>
                  </>
                ) : isExportingBatch ? (
                  <span>생성 중...</span>
                ) : (
                  <>
                    <CalendarDays className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>달력에 추가 ({tableLogs.length}건)</span>
                  </>
                )}
              </button>

              {/* 캘린더 자동 구독 */}
              <button 
                type="button"
                id="btn-calendar-subscribe-table"
                onClick={() => setIsSubscribeModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center cursor-pointer shrink-0 border border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 active:scale-[0.98]"
                title="스마트폰 캘린더에 방송 일정 자동 동기화"
              >
                <span>캘린더 자동 구독</span>
              </button>
            </div>
          </div>

          {/* 대형 실시간 검색창: 전체 너비로 확장 및 크기 확대 */}
          <div className="relative w-full">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="게임명, 날짜, 링크 검색…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-2xl pl-10 sm:pl-12 pr-10 py-3 sm:py-3.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm sm:text-base shadow-2xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
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
                        const cats = Array.isArray(v.categories) && v.categories.length > 0
                          ? v.categories
                          : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <a 
                              href={v.url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              title={v.title || '생방송 다시보기'}
                              aria-label={v.title || '생방송 다시보기'}
                              className="inline-flex items-center sm:items-start gap-1.5 p-1 -m-1 sm:p-0 sm:m-0 text-zinc-700 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                            >
                              <PlaySquare className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400 sm:mt-0.5" />
                              <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                            </a>
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
                      {log.edited?.length > 0 ? log.edited.map((v, i) => {
                        const cats = Array.isArray(v.categories) && v.categories.length > 0
                          ? v.categories
                          : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <a 
                              href={v.url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              title={v.title || '유튜브 편집본'}
                              aria-label={v.title || '유튜브 편집본'}
                              className={`inline-flex items-center sm:items-start gap-1.5 p-1 -m-1 sm:p-0 sm:m-0 transition-colors ${
                                v.url ? 'text-red-600 dark:text-red-400 font-semibold hover:underline' : 'text-zinc-400 dark:text-zinc-600 cursor-default'
                              }`}
                            >
                              <VideoIcon className={`w-4 h-4 shrink-0 sm:mt-0.5 ${v.url ? 'text-red-500' : 'text-zinc-400'}`} />
                              <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                            </a>
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
                      }) : <span className="text-zinc-300 dark:text-zinc-700">-</span>}
                    </div>
                  </td>
                  <td className="px-2.5 sm:px-6 lg:px-7 py-3.5 sm:py-4 lg:py-5 align-top">
                    <div className="flex flex-col gap-2">
                      {log.shorts?.length > 0 ? log.shorts.map((v, i) => {
                        const cats = Array.isArray(v.categories) && v.categories.length > 0
                          ? v.categories
                          : (v.category ? v.category.split(',').map(c => c.trim()).filter(Boolean) : []);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <a 
                              href={v.url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              title={v.title || '유튜브 쇼츠'}
                              aria-label={v.title || '유튜브 쇼츠'}
                              className="inline-flex items-center sm:items-start gap-1.5 p-1 -m-1 sm:p-0 sm:m-0 text-zinc-700 dark:text-zinc-300 hover:text-red-500 transition-colors"
                            >
                              <ShortsIcon className="w-4 h-4 shrink-0 sm:mt-0.5" />
                              <span className="hidden sm:inline text-sm break-keep break-words leading-relaxed">{v.title}</span>
                            </a>
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
    </div>
  );
}
