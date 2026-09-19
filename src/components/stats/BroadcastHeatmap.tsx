import React, { useState, useMemo, useRef } from 'react';
import { BroadcastLog } from '../../types';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, differenceInCalendarDays, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '../../utils';
import { HEATMAP_LEVEL_COLORS, getBroadcastHeatmapLevel } from '../../utils/heatmapUtils';
import { WidgetShareButton } from '../common/WidgetShareButton';
import { ZoomIn, ZoomOut } from 'lucide-react';

const HEATMAP_CELL_CLASSES: Record<number, string> = {
  0: "bg-zinc-200/70 dark:bg-zinc-800/50 border-zinc-300/80 dark:border-zinc-700/60 hover:border-zinc-400 dark:hover:border-zinc-500",
  1: "bg-[#f5f3ff] dark:bg-[#1e1635] border-[#ede9fe] dark:border-[#2d1f4d] hover:border-purple-300",
  2: "bg-[#ede9fe] dark:bg-[#2a1a4a] border-[#ddd6fe] dark:border-[#3b2566] hover:border-purple-400",
  3: "bg-[#e0e7ff] dark:bg-[#281c5a] border-[#c7d2fe] dark:border-[#39287a] hover:border-indigo-300",
  4: "bg-[#ddd6fe] dark:bg-[#341f6e] border-[#c4b5fd] dark:border-[#482a94] hover:border-purple-400",
  5: "bg-[#c7d2fe] dark:bg-[#3f2284] border-[#a5b4fc] dark:border-[#562fb0] hover:border-indigo-400",
  6: "bg-[#c4b5fd] dark:bg-[#4c269c] border-[#a78bfa] dark:border-[#6533cd] hover:border-purple-500",
  7: "bg-[#a78bfa] dark:bg-[#592cb8] border-[#8b5cf6] dark:border-[#7339eb] hover:border-purple-600",
  8: "bg-[#93c5fd] dark:bg-[#6432cd] border-[#60a5fa] dark:border-[#8045fb] hover:border-blue-400",
  9: "bg-[#8b5cf6] dark:bg-[#7038e2] border-[#7c3aed] dark:border-[#8c4ffb] hover:border-purple-600",
  10: "bg-[#a855f7] dark:bg-[#7e40f0] border-[#9333ea] dark:border-[#995dfd] hover:border-purple-600",
  11: "bg-[#c084fc] dark:bg-[#8d4bf8] border-[#a855f7] dark:border-[#aa73fe] hover:border-purple-500",
  12: "bg-[#7c3aed] dark:bg-[#9b5bfb] border-[#6d28d9] dark:border-[#b988fe] hover:border-purple-700",
  13: "bg-[#9333ea] dark:bg-[#a96bfd] border-[#7e22ce] dark:border-[#c79efe] hover:border-purple-700",
  14: "bg-[#6d28d9] dark:bg-[#b982fe] border-[#5b21b6] dark:border-[#d6b3fe] hover:border-purple-800",
  15: "bg-[#581c87] dark:bg-[#ca9dfd] border-[#3b0764] dark:border-[#e5cffe] hover:border-purple-900",
  16: "bg-[#3b0764] dark:bg-[#e0c0fe] border-[#2e1065] dark:border-white ring-1 ring-purple-600/40 dark:ring-white/80 shadow-xs",
};

interface BroadcastHeatmapProps {
  logs: BroadcastLog[];
  startDate?: string;
  endDate?: string;
  className?: string;
  onSelectDate?: (dateStr: string) => void;
}

export interface DayCellData {
  date: Date;
  dateStr: string;
  dayOfWeek: number; // 0 (Sun) to 6 (Sat)
  log?: BroadcastLog;
  hasBroadcast: boolean;
  isAbsence: boolean;
  durationHours: number;
  level: number; // 0 to 16
  title: string;
  game: string;
  timeRange: string;
}

export function BroadcastHeatmap({ logs, startDate, endDate, className, onSelectDate }: BroadcastHeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<DayCellData | null>(null);
  const [hoveredCell, setHoveredCell] = useState<DayCellData | null>(null);
  const [selectedLegendLevel, setSelectedLegendLevel] = useState<number | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  // 모바일 터치 오작동(스크롤 제스처와 탭 구분) 방지를 위한 터치 추적 ref
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const getLegendLevelText = (level: number): string => {
    if (level === 0) return '0시간 00분';
    if (level === 16) return '5시간 00분 이상';
    const minsTotal = level * 20;
    const h = Math.floor(minsTotal / 60);
    const m = minsTotal % 60;
    return `${h}시간 ${m.toString().padStart(2, '0')}분`;
  };

  const [viewScope, setViewScope] = useState<'range' | 'year' | 'recent'>('range');

  // 빠른 날짜 맵 생성 (dateStr -> log)
  const logsByDate = useMemo(() => {
    const map = new Map<string, BroadcastLog>();
    logs.forEach(log => {
      if (log.date) {
        map.set(log.date, log);
      }
    });
    return map;
  }, [logs]);

  // 그리드에 사용할 날짜 구간 계산
  const { start, end } = useMemo(() => {
    const now = new Date();
    if (viewScope === 'year') {
      const curYear = now.getFullYear();
      return {
        start: new Date(curYear, 0, 1),
        end: new Date(curYear, 11, 31)
      };
    }

    if (viewScope === 'recent') {
      return {
        start: subDays(now, 364),
        end: now
      };
    }

    // viewScope === 'range'
    let s = startDate ? parseISO(startDate) : subDays(now, 180);
    let e = endDate ? parseISO(endDate) : now;

    if (isNaN(s.getTime())) s = subDays(now, 180);
    if (isNaN(e.getTime())) e = now;

    if (differenceInCalendarDays(e, s) > 500) {
      s = subDays(e, 365);
    }

    return { start: s, end: e };
  }, [viewScope, startDate, endDate]);

  // 주 단위 데이터 및 지표 계산 (20분 단위 레벨 세분화)
  const { weeks, monthLabels, stats } = useMemo(() => {
    const gridStart = startOfWeek(start, { weekStartsOn: 0 }); // 일요일 시작
    const gridEnd = endOfWeek(end, { weekStartsOn: 0 }); // 토요일 종료

    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
    
    let totalAnalyzedDays = 0;
    let totalBroadcastDays = 0;
    let totalDurationHours = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    let maxBreakStreak = 0;
    let currentBreakStreak = 0;

    const weeksList: DayCellData[][] = [];
    let currentWeek: DayCellData[] = [];

    allDays.forEach((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayOfWeek = d.getDay();
      const isWithinTarget = d >= start && d <= end;

      const log = logsByDate.get(dateStr);
      const isAbsence = Boolean(log?.isAbsence);
      const hasBroadcast = Boolean(log && !isAbsence && (log.time || log.durationHours > 0 || log.vods?.length > 0 || log.game));
      const durationHours = log?.durationHours || 0;

      // 20분 단위 레벨 구분 (0: 휴방, 1~15: 20분 단위 구간, 16: 5시간 이상)
      const level = getBroadcastHeatmapLevel(durationHours, hasBroadcast);

      if (isWithinTarget) {
        totalAnalyzedDays++;
        if (hasBroadcast) {
          totalBroadcastDays++;
          totalDurationHours += durationHours;
          currentStreak++;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
          currentBreakStreak = 0;
        } else {
          currentBreakStreak++;
          if (currentBreakStreak > maxBreakStreak) maxBreakStreak = currentBreakStreak;
          currentStreak = 0;
        }
      }

      const cellData: DayCellData = {
        date: d,
        dateStr,
        dayOfWeek,
        log,
        hasBroadcast,
        isAbsence,
        durationHours,
        level,
        title: log?.vods?.[0]?.title || log?.game || (hasBroadcast ? '생방송' : '방송 없음'),
        game: log?.games?.map(g => g.name).filter(Boolean).join(', ') || log?.game || '',
        timeRange: log?.time ? `${log.time} ~ ${log.endTime || '종료'}` : ''
      };

      currentWeek.push(cellData);
      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      weeksList.push(currentWeek);
    }

    // 하단 월 라벨 위치 계산
    const labels: { monthName: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    weeksList.forEach((wk, wIndex) => {
      const firstValidDay = wk.find(day => day.date >= start && day.date <= end) || wk[0];
      const m = firstValidDay.date.getMonth();
      if (m !== lastMonth && firstValidDay.date.getDate() <= 14) {
        labels.push({
          monthName: format(firstValidDay.date, 'M월'),
          weekIndex: wIndex
        });
        lastMonth = m;
      }
    });

    const broadcastRate = totalAnalyzedDays > 0 ? (totalBroadcastDays / totalAnalyzedDays) * 100 : 0;
    const avgDuration = totalBroadcastDays > 0 ? totalDurationHours / totalBroadcastDays : 0;

    return {
      weeks: weeksList,
      monthLabels: labels,
      stats: {
        totalAnalyzedDays,
        totalBroadcastDays,
        broadcastRate,
        totalDurationHours,
        avgDuration,
        maxStreak,
        maxBreakStreak
      }
    };
  }, [start, end, logsByDate]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* 4대 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            방송 일수 (방송률)
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-zinc-900 dark:text-white">
              {stats.totalBroadcastDays}일
            </span>
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              ({stats.broadcastRate.toFixed(1)}%)
            </span>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            총 {stats.totalAnalyzedDays}일 분석 기준
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            총 방송 시간
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-zinc-900 dark:text-white">
              {stats.totalDurationHours.toFixed(1)}시간
            </span>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            회당 평균 {stats.avgDuration.toFixed(1)}시간
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            최장 연속 방송
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-zinc-900 dark:text-white">
              {stats.maxStreak}일 연속
            </span>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            쉬지 않고 방송한 최대 기록
          </span>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[20px] p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
            최장 연속 휴방
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-zinc-900 dark:text-white">
              {stats.maxBreakStreak}일 연속
            </span>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            가장 길었던 재정비 기간
          </span>
        </div>
      </div>

      {/* 방송 활동 히트맵 보드 (라이트/다크 테마 정상 적용, 가로 스크롤 최소화) */}
      <div id="broadcast-heatmap-board" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm flex flex-col space-y-5 text-zinc-900 dark:text-zinc-100 relative">
        {/* 상단 헤더 & 기간 토글 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start justify-between sm:justify-start gap-3">
            <div>
              <h4 className="font-bold text-zinc-900 dark:text-white text-base sm:text-lg">
                방송 활동 히트맵
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                날짜별 방송 진행 여부와 방송 시간을 20분 단위로 파악할 수 있는 히트맵입니다.
              </p>
            </div>
            <div className="sm:hidden">
              <WidgetShareButton targetId="broadcast-heatmap-board" title="방송 활동 히트맵" />
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium">
              <button
                onClick={() => setViewScope('range')}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs",
                  viewScope === 'range'
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                선택 기간
              </button>
              <button
                onClick={() => setViewScope('year')}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs",
                  viewScope === 'year'
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                올해 전체
              </button>
              <button
                onClick={() => setViewScope('recent')}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs",
                  viewScope === 'recent'
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                최근 1년
              </button>
            </div>

            {/* 히트맵 확대/축소 토글 버튼: 탭 정확도 극대화 */}
            <button
              type="button"
              onClick={() => setIsZoomed(prev => !prev)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                isZoomed
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-xs"
                  : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
              )}
              title={isZoomed ? "전체 크기로 축소" : "칸을 크게 확대하여 원하는 날짜를 정밀하게 선택합니다."}
            >
              {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span>{isZoomed ? "축소" : "확대"}</span>
            </button>
            <div className="hidden sm:block">
              <WidgetShareButton targetId="broadcast-heatmap-board" title="방송 활동 히트맵" />
            </div>
          </div>
        </div>

        {/* 상단 날짜 및 방송 정보 표시 영역 (마우스 호버 또는 클릭 선택 시 상세 표시, 높이 고정으로 레이아웃 시프트 방지) */}
        {(() => {
          const activeDisplay = hoveredCell || selectedCell;
          return (
            <div 
              onClick={() => {
                setSelectedCell(null);
                setSelectedLegendLevel(null);
              }}
              className="min-h-[52px] bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer select-none"
              title="클릭 시 선택 해제"
            >
              {activeDisplay ? (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white text-xs sm:text-sm">
                      {format(activeDisplay.date, 'yyyy.MM.dd (eee)', { locale: ko })}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold",
                      activeDisplay.hasBroadcast
                        ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    )}>
                      {activeDisplay.hasBroadcast ? '방송 진행' : '휴방'}
                    </span>
                  </div>
                  {activeDisplay.hasBroadcast && (
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-zinc-600 dark:text-zinc-300 text-xs">
                      {activeDisplay.durationHours > 0 && (
                        <span>시간: <strong className="text-zinc-900 dark:text-white">{activeDisplay.durationHours}시간</strong></span>
                      )}
                      {activeDisplay.timeRange && (
                        <span className="hidden sm:inline">구간: <strong className="text-zinc-900 dark:text-white">{activeDisplay.timeRange}</strong></span>
                      )}
                      {activeDisplay.game && (
                        <span className="truncate max-w-[180px] sm:max-w-[260px]">게임: <strong className="text-purple-600 dark:text-purple-400">{activeDisplay.game}</strong></span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-zinc-400 dark:text-zinc-500 text-[11px] sm:text-xs">
                  날짜 칸을 1번 누르면 정보가 표시되고, 한 번 더 누르면 달력 기록으로 이동합니다.
                </div>
              )}

              {activeDisplay && activeDisplay.dateStr && onSelectDate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDate(activeDisplay.dateStr);
                  }}
                  className="ml-auto px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  달력에서 보기 →
                </button>
              )}
            </div>
          );
        })()}

        {/* 메인 히트맵 캔버스 영역 (배경 클릭 시만 선택 취소, 가로 스크롤 및 확대 뷰 지원) */}
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedCell(null);
              setSelectedLegendLevel(null);
            }
          }}
          className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-2 sm:p-4 overflow-x-auto custom-scrollbar cursor-default select-none"
        >
          <div className={cn("flex flex-col", isZoomed ? "min-w-max pb-2" : "w-full min-w-[620px] sm:min-w-0")}>
            
            {/* 그리드 바디: 요일 레이블 + 주(컬럼)들 */}
            <div className="flex items-start w-full">
              {/* 좌측 요일 라벨 (일~토) - 셀 높이와 1:1 정렬 */}
              <div className={cn(
                "flex flex-col gap-[2px] sm:gap-[3px] pr-1 sm:pr-2 select-none shrink-0",
                isZoomed ? "w-5 sm:w-7" : "w-3.5 sm:w-6"
              )}>
                {[
                  { label: '일', color: 'text-red-500/90 dark:text-red-400/90 font-medium' },
                  { label: '월', color: 'text-zinc-400 dark:text-zinc-500' },
                  { label: '화', color: 'text-zinc-400 dark:text-zinc-500' },
                  { label: '수', color: 'text-zinc-400 dark:text-zinc-500' },
                  { label: '목', color: 'text-zinc-400 dark:text-zinc-500' },
                  { label: '금', color: 'text-zinc-400 dark:text-zinc-500' },
                  { label: '토', color: 'text-blue-500/90 dark:text-blue-400/90 font-medium' },
                ].map((day, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-center leading-none",
                      isZoomed ? "h-6 sm:h-7 text-xs font-semibold" : "h-3.5 sm:h-[18px] text-[9px] sm:text-[11px]",
                      day.color
                    )}
                  >
                    {day.label}
                  </div>
                ))}
              </div>

              {/* 주 컬럼 목록 */}
              <div className={cn(
                "flex gap-[2px] sm:gap-[3px]",
                isZoomed ? "justify-start" : "flex-1 justify-between w-full min-w-0"
              )}>
                {weeks.map((week, weekIdx) => (
                  <div
                    key={weekIdx}
                    className={cn(
                      "flex flex-col gap-[2px] sm:gap-[3px]",
                      isZoomed ? "w-6 sm:w-7 shrink-0" : "flex-1 min-w-[13px] max-w-[36px]"
                    )}
                  >
                    {week.map((cell) => {
                      const isOutside = cell.date < start || cell.date > end;

                      // 20분 단위 (최대 5시간, 16단계) 채도 및 톤 다변화 스타일 매핑
                      let cellStyle = "bg-zinc-100 dark:bg-zinc-800/40 border-zinc-200/70 dark:border-zinc-700/50";
                      if (!isOutside) {
                        cellStyle = HEATMAP_CELL_CLASSES[cell.level] || HEATMAP_CELL_CLASSES[0];
                      } else {
                        cellStyle = "bg-transparent border-transparent opacity-0 pointer-events-none";
                      }

                      const isSelected = selectedCell?.dateStr === cell.dateStr;
                      const isLegendMatch = selectedLegendLevel !== null && !isOutside && cell.level === selectedLegendLevel;
                      const isLegendDimmed = selectedLegendLevel !== null && !isOutside && cell.level !== selectedLegendLevel;

                      const handleSelect = () => {
                        if (isOutside) return;
                        if (selectedCell?.dateStr === cell.dateStr) {
                          // 이미 선택된 셀을 한 번 더 누르면 달력으로 이동
                          if (cell.dateStr && onSelectDate) {
                            onSelectDate(cell.dateStr);
                          }
                        } else {
                          // 첫 번째 누를 때는 셀 선택 및 세부 정보 표시
                          setSelectedCell(cell);
                        }
                      };

                      return (
                        <button
                          key={cell.dateStr}
                          type="button"
                          disabled={isOutside}
                          aria-label={`${cell.dateStr} ${cell.hasBroadcast ? '방송 진행' : '휴방'}`}
                          onMouseEnter={() => {
                            if (!isOutside) setHoveredCell(cell);
                          }}
                          onMouseLeave={() => {
                            setHoveredCell(null);
                          }}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            touchStartPosRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
                          }}
                          onTouchEnd={(e) => {
                            if (!touchStartPosRef.current) return;
                            const touch = e.changedTouches[0];
                            const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
                            const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
                            const dt = Date.now() - touchStartPosRef.current.time;
                            touchStartPosRef.current = null;
                            // 스크롤 제스처가 아닌 순수 탭(12px 이하 이동, 400ms 미만)일 때만 반응
                            if (dx < 12 && dy < 12 && dt < 400) {
                              e.preventDefault();
                              handleSelect();
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect();
                          }}
                          className={cn(
                            "rounded-[2px] sm:rounded-[3px] border transition-all touch-manipulation select-none relative focus:outline-none",
                            isZoomed 
                              ? "h-6 w-6 sm:h-7 sm:w-7 min-w-[24px] sm:min-w-[28px]" 
                              : "h-3.5 sm:h-[18px] w-full min-w-[13px] sm:min-w-[16px]",
                            cellStyle,
                            isSelected && "ring-2 ring-purple-600 dark:ring-purple-400 z-20 scale-110 shadow-sm",
                            isLegendMatch && "ring-2 ring-purple-600 dark:ring-purple-300 ring-offset-1 ring-offset-zinc-50 dark:ring-offset-zinc-950 z-20 scale-105 shadow-md",
                            isLegendDimmed && "opacity-25 dark:opacity-20",
                            !isOutside ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* 하단 월 라벨 (1월~12월 등) */}
            <div className={cn(
              "flex mt-1.5 sm:mt-2 text-[8px] sm:text-[11px] font-medium text-zinc-400 dark:text-zinc-500 select-none h-3 sm:h-4",
              isZoomed ? "pl-5 sm:pl-7" : "pl-3.5 sm:pl-6 w-full justify-between"
            )}>
              {weeks.map((_, idx) => {
                const matchedLabel = monthLabels.find(l => l.weekIndex === idx);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "text-center",
                      isZoomed ? "w-6 sm:w-7 shrink-0" : "flex-1 min-w-[13px] max-w-[36px]"
                    )}
                  >
                    {matchedLabel ? (
                      <span className="whitespace-nowrap font-semibold text-zinc-500 dark:text-zinc-400">
                        {matchedLabel.monthName}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* 하단 범례: 20분 단위 (최대 5시간) 채도 스케일 안내 & 클릭 시 윤곽선 강조 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {selectedLegendLevel !== null ? (
              <span className="text-purple-600 dark:text-purple-400 font-semibold">
                {getLegendLevelText(selectedLegendLevel)} 색상 칸 표시 중 (다시 클릭 시 해제)
              </span>
            ) : (
              '색상 칸을 클릭하면 해당 히트맵 위치에 윤곽선이 강조 표시됩니다.'
            )}
          </span>

          <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] flex-wrap">
            <span className="text-zinc-500 dark:text-zinc-400 mr-0.5">휴방</span>
            <button
              type="button"
              onClick={() => setSelectedLegendLevel(prev => prev === 0 ? null : 0)}
              className={cn(
                "w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[2px] border cursor-pointer transition-all duration-150",
                HEATMAP_CELL_CLASSES[0],
                selectedLegendLevel === 0 ? "ring-2 ring-purple-600 dark:ring-white scale-125 z-10 shadow-sm" : "hover:scale-110"
              )}
              title="휴방 (0시간) - 클릭 시 히트맵 윤곽선 강조"
            />
            <span className="text-zinc-400 dark:text-zinc-600 text-[10px] mx-0.5">|</span>
            <span className="text-zinc-400 text-[10px]">20분 단위</span>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((lvl) => {
              const info = HEATMAP_LEVEL_COLORS[lvl];
              const isSelected = selectedLegendLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLegendLevel(prev => prev === lvl ? null : lvl)}
                  className={cn(
                    "w-2.5 h-3 sm:w-3 sm:h-3.5 rounded-[1.5px] border cursor-pointer transition-all duration-150",
                    HEATMAP_CELL_CLASSES[lvl],
                    isSelected ? "ring-2 ring-purple-600 dark:ring-white scale-125 z-10 shadow-sm" : "hover:scale-110"
                  )}
                  title={`${info?.label || `${lvl}단계`} (${(lvl * 20 / 60).toFixed(1)}h) - 클릭 시 히트맵 윤곽선 강조`}
                />
              );
            })}
            <span className="text-purple-600 dark:text-purple-300 font-bold ml-0.5">5시간+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
