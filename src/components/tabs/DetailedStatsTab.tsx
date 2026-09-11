
const TrendTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 text-sm">
        <p className="font-bold text-zinc-900 dark:text-white mb-1">{label} 주간</p>
        <p className="text-purple-600 dark:text-purple-400 font-medium">방송 횟수: {payload[0].value}회</p>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">방송일: {payload[0].payload.datesDesc}</p>
      </div>
    );
  }
  return null;
};

import { useState, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from 'recharts';
import { format, startOfYear, startOfMonth, endOfMonth, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, subDays, formatISO } from 'date-fns';
import { AppData, BroadcastLog } from '../../types';
import { CustomTooltip } from '../CustomTooltip';
import { parseTimeString, parseTimeTo24, cn } from '../../utils';
import { Download, FileText, AlertCircle, X, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { BroadcastHeatmap } from '../stats/BroadcastHeatmap';
import { CategoryStatsTab } from '../stats/CategoryStatsTab';
import { HEATMAP_LEVEL_COLORS, getBroadcastHeatmapLevel } from '../../utils/heatmapUtils';

const PDF_CATEGORY_PALETTE = [
  '#a78bfa', '#93c5fd', '#6ee7b7', '#fcd34d', '#f472b6',
  '#818cf8', '#5eead4', '#fdba74', '#c084fc', '#67e8f9'
];

interface DetailedStatsTabProps {
  data: AppData;
  fetchLogs?: (startDate: string, endDate: string) => Promise<void>;
  isActive?: boolean;
  onNavigateToCalendar?: (dateStr: string) => void;
  onNavigateToRecommend?: (category?: string, searchTerm?: string) => void;
}

export function DetailedStatsTab({ 
  data, 
  fetchLogs, 
  isActive = true,
  onNavigateToCalendar,
  onNavigateToRecommend
}: DetailedStatsTabProps) {
  const printRef = useRef<HTMLDivElement>(null);
  
  // 데이터가 존재하는 가장 최신 연도를 기본 시작일로 지정
  const latestYear = useMemo(() => {
    const dates = Object.values(data.logs || {}).map(l => l.date).filter(Boolean).sort();
    if (dates.length > 0) {
      return dates[dates.length - 1].substring(0, 4);
    }
    return new Date().getFullYear().toString();
  }, [data.logs]);

  const firstYear = useMemo(() => {
    const dates = Object.values(data.logs || {}).map(l => l.date).filter(Boolean).sort();
    return dates.length > 0 ? dates[0].substring(0, 4) : '2016';
  }, [data.logs]);

  const defaultStartDate = `${latestYear}-01-01`;
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeSubTab, setActiveSubTab] = useState<'trend' | 'day' | 'category'>('trend');
  const [downloadConfirm, setDownloadConfirm] = useState<'csv' | 'pdf' | null>(null);
  const [showLegacyTooltip, setShowLegacyTooltip] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    showAbove: boolean;
  } | null>(null);

  // 관리자 설정: 과거(~2025) 카테고리 분석 표시 여부
  const showLegacyCategory = data.system?.showLegacyCategoryAnalysis !== false;

  const updateTooltipPosition = () => {
    if (!helpButtonRef.current) return;
    const rect = helpButtonRef.current.getBoundingClientRect();
    const popupWidth = Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 32 : 320);

    let left = rect.left + rect.width / 2 - popupWidth / 2;
    const minLeft = 16;
    const maxLeft = typeof window !== 'undefined' ? window.innerWidth - popupWidth - 16 : 16;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    const buttonCenter = rect.left + rect.width / 2;
    const arrowLeft = Math.max(16, Math.min(popupWidth - 16, buttonCenter - left));

    const popupHeight = 170;
    const showAbove = typeof window !== 'undefined' && rect.bottom + popupHeight + 16 > window.innerHeight && rect.top > popupHeight + 16;
    const top = showAbove ? (rect.top - 8) : (rect.bottom + 8);

    setTooltipPos({ top, left, arrowLeft, showAbove });
  };

  const handleToggleLegacyTooltip = () => {
    if (!showLegacyTooltip) {
      updateTooltipPosition();
      setShowLegacyTooltip(true);
    } else {
      setShowLegacyTooltip(false);
    }
  };

  useEffect(() => {
    if (!showLegacyTooltip) return;

    const handleScrollOrResize = () => {
      updateTooltipPosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLegacyTooltip(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLegacyTooltip]);

  // 조회 시작일이 2026년보다 전 (~2025)인지 판별
  const isLegacyRange = useMemo(() => {
    return startDate < '2026-01-01';
  }, [startDate]);

  // Removes the auto-fetch useEffect to prevent delay when clicking the tab

  const handleFilter = () => {
    if (fetchLogs) {
      fetchLogs(startDate, endDate);
    }
  };

  const logsArray = useMemo(() => {
    return Object.values(data.logs).filter(log => log.date >= startDate && log.date <= endDate);
  }, [data.logs, startDate, endDate]);

  const executeDownloadCSV = () => {
    const allLogs = Object.values(data.logs);
    if (!allLogs || allLogs.length === 0) return;
    
    const sortedLogs = [...allLogs].sort((a, b) => b.date.localeCompare(a.date));
    
    // Find max array lengths to determine dynamic columns
    const maxGames = Math.max(1, ...sortedLogs.map(l => Math.max(l.games?.length || 0, l.game ? 1 : 0)));
    const maxVods = Math.max(1, ...sortedLogs.map(l => (l.vods || []).length));
    const maxEdited = Math.max(1, ...sortedLogs.map(l => (l.edited || []).length));
    const maxShorts = Math.max(1, ...sortedLogs.map(l => (l.shorts || []).length));
    
    const headers = ['날짜', '시작 시간', '종료 시간', '길이(시간)'];
    
    for (let i = 0; i < maxGames; i++) headers.push(maxGames > 1 ? `진행 게임 ${i+1}` : '진행 게임');
    for (let i = 0; i < maxVods; i++) headers.push(maxVods > 1 ? `생방 다시보기 ${i+1}` : '생방 다시보기');
    for (let i = 0; i < maxEdited; i++) headers.push(maxEdited > 1 ? `편집 영상 ${i+1}` : '편집 영상');
    for (let i = 0; i < maxShorts; i++) headers.push(maxShorts > 1 ? `쇼츠 영상 ${i+1}` : '쇼츠 영상');

    const csvRows = [headers.join(',')];
    
    const formatLink = (item?: {name?: string, url?: string}) => {
      if (!item || (!item.name && !item.url)) return '""';
      const name = item.name || '제목 없음';
      if (item.url) {
        const escapedName = name.replace(/"/g, '""');
        const escapedUrl = item.url.replace(/"/g, '""');
        return `"=HYPERLINK(""${escapedUrl}"", ""${escapedName}"")"`;
      }
      return `"${name.replace(/"/g, '""')}"`;
    };

    sortedLogs.forEach(log => {
      let endTime = log.endTime || '';
      if (!endTime && log.time && log.durationHours) {
        const start = parseTimeTo24(log.time);
        const endMin = start.hour * 60 + start.minute + Math.round(log.durationHours * 60);
        const endH = Math.floor(endMin / 60) % 24;
        const endM = endMin % 60;
        endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      }

      const gamesList = (log.games || []).length > 0 
        ? log.games.map(g => ({name: g.name, url: g.link})) 
        : (log.game ? [{name: log.game, url: ''}] : []);
      
      const vodsList = (log.vods || []).map(v => ({name: v.title, url: v.url}));
      const editedList = (log.edited || []).map(v => ({name: v.title, url: v.url}));
      const shortsList = (log.shorts || []).map(v => ({name: v.title, url: v.url}));

      const row = [
        log.date,
        log.time || '',
        endTime,
        log.durationHours || ''
      ];

      for (let i = 0; i < maxGames; i++) row.push(formatLink(gamesList[i]));
      for (let i = 0; i < maxVods; i++) row.push(formatLink(vodsList[i]));
      for (let i = 0; i < maxEdited; i++) row.push(formatLink(editedList[i]));
      for (let i = 0; i < maxShorts; i++) row.push(formatLink(shortsList[i]));

      csvRows.push(row.join(','));
    });
    
    const csvString = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `uzuhama_broadcast_logs_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executeDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(printRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const pdfWidth = 210; // A4 width in mm
        const pdfHeight = (img.height * pdfWidth) / img.width;
        
        // Create PDF with exact dimensions to prevent clipping
        const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
        pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`uzuhama_stats_report_${format(new Date(), 'yyyyMMdd')}.pdf`);
      };
    } catch (err) {
      console.error('Failed to generate PDF', err);
    }
  };

  const stats = useMemo(() => {
    const dailyMap: Record<string, number> = { '일': 0, '월': 0, '화': 0, '수': 0, '목': 0, '금': 0, '토': 0 };
    const dailyTimeMap: Record<string, Record<string, number>> = { '일': {}, '월': {}, '화': {}, '수': {}, '목': {}, '금': {}, '토': {} };
    const hourMap: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      hourMap[`${i}:00`] = 0;
    }
    for (let i = 0; i < 24; i++) {
      hourMap[`${i}:00`] = 0;
    }
    const exactTimeMap: Record<string, number> = {};
    const durationMap: Record<string, number> = {
      '1시간 대': 0,
      '2시간 대': 0,
      '3시간 대': 0,
      '4시간 이상': 0,
    };
    const trendMap: Record<string, { count: number, dates: Set<string> }> = {};

    let total = logsArray.length;

    logsArray.forEach(log => {
      const dateObj = parseISO(log.date);
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      dailyMap[dayNames[dateObj.getDay()]]++;

      const timeObj = parseTimeTo24(log.time);
      const hourLabel = `${timeObj.hour}:00`;
      hourMap[hourLabel] = (hourMap[hourLabel] || 0) + 1;
      
      const exactLabel = `${timeObj.hour}시 대`;
      exactTimeMap[exactLabel] = (exactTimeMap[exactLabel] || 0) + 1;
      const dayName = dayNames[dateObj.getDay()];
      const approxLabel = `${timeObj.hour}시 대`;
      dailyTimeMap[dayName][approxLabel] = (dailyTimeMap[dayName][approxLabel] || 0) + 1;

      if (log.durationHours < 2) durationMap['1시간 대']++;
      else if (log.durationHours < 3) durationMap['2시간 대']++;
      else if (log.durationHours < 4) durationMap['3시간 대']++;
      else durationMap['4시간 이상']++;

      const weekStart = format(startOfWeek(dateObj), 'yyyy-MM-dd');
      if (!trendMap[weekStart]) trendMap[weekStart] = { count: 0, dates: new Set() };
      trendMap[weekStart].count++;
      trendMap[weekStart].dates.add(format(dateObj, 'M/d'));
    });

    const dailyStatsArray = Object.keys(dailyMap).map(day => ({
      day,
      count: dailyMap[day],
      probability: total > 0 ? (dailyMap[day] / total) * 100 : 0
    }));

    const hourStatsArray = Object.keys(hourMap).map(time => {
      const h = parseInt(time);
      return {
        time,
        label: `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}시대`,
        count: hourMap[time],
        probability: total > 0 ? (hourMap[time] / total) * 100 : 0,
        hour: h
      };
    }).filter(stat => stat.hour >= 12 || stat.count > 0)
      .sort((a, b) => a.hour - b.hour);

    const exactTimeStatsArray = Object.keys(exactTimeMap).map(label => {
      return {
        label,
        count: exactTimeMap[label],
        probability: total > 0 ? (exactTimeMap[label] / total) * 100 : 0
      };
    }).sort((a, b) => b.count - a.count);

    const durationStatsArray = Object.keys(durationMap).map(label => ({
      label,
      count: durationMap[label],
      probability: total > 0 ? (durationMap[label] / total) * 100 : 0
    }));

    const trendStatsArray = Object.keys(trendMap).sort().map(week => {
      const weekStartDate = parseISO(week);
      let weekStartLabel = format(weekStartDate, 'MM/dd');
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartDate);
        d.setDate(d.getDate() + i);
        if (d.getMonth() === 0 && d.getDate() === 1) {
          weekStartLabel = '01/01';
          break;
        }
      }
      return {
        week: weekStartLabel,
        count: trendMap[week].count,
        datesDesc: Array.from(trendMap[week].dates).sort().join(', ')
      };
    });

    const avgDaily = total > 0 ? 100 / 7 : 0;

    return { dailyStatsArray, hourStatsArray, exactTimeStatsArray, durationStatsArray, dailyTimeMap, trendStatsArray, avgDaily, total };
  }, [logsArray]);

  // PDF 리포트용 히트맵 데이터 계산
  const pdfHeatmap = useMemo(() => {
    let s = parseISO(startDate);
    let e = parseISO(endDate);
    const start = isNaN(s.getTime()) ? subDays(new Date(), 180) : s;
    const end = isNaN(e.getTime()) ? new Date() : e;

    const logsByDate = new Map<string, BroadcastLog>();
    logsArray.forEach(log => {
      if (log.date) logsByDate.set(log.date, log);
    });

    const gridStart = startOfWeek(start, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(end, { weekStartsOn: 0 });
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    let totalAnalyzedDays = 0;
    let totalBroadcastDays = 0;
    let totalDurationHours = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    let maxBreakStreak = 0;
    let currentBreakStreak = 0;

    const weeksList: { date: Date; dateStr: string; level: number; isOutside: boolean; durationHours: number }[][] = [];
    let currentWeek: { date: Date; dateStr: string; level: number; isOutside: boolean; durationHours: number }[] = [];

    allDays.forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const isWithin = d >= start && d <= end;
      const log = logsByDate.get(dateStr);
      const isAbsence = Boolean(log?.isAbsence);
      const hasBroadcast = Boolean(log && !isAbsence && (log.time || log.durationHours > 0 || log.vods?.length > 0 || log.game));
      const durationHours = log?.durationHours || 0;

      // 20분 단위 레벨 구분 (0: 휴방, 1~15: 20분 단위 구간, 16: 5시간 이상)
      const level = getBroadcastHeatmapLevel(durationHours, hasBroadcast);

      if (isWithin) {
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

      currentWeek.push({
        date: d,
        dateStr,
        level,
        durationHours,
        isOutside: !isWithin
      });

      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) weeksList.push(currentWeek);

    const monthLabels: { monthName: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    weeksList.forEach((wk, wIndex) => {
      const firstValidDay = wk.find(day => !day.isOutside) || wk[0];
      const m = firstValidDay.date.getMonth();
      if (m !== lastMonth && firstValidDay.date.getDate() <= 14) {
        monthLabels.push({
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
      monthLabels,
      totalAnalyzedDays,
      totalBroadcastDays,
      broadcastRate,
      totalDurationHours,
      avgDuration,
      maxStreak,
      maxBreakStreak
    };
  }, [logsArray, startDate, endDate]);

  // PDF 리포트용 카테고리 데이터 계산
  const pdfCategoryStats = useMemo(() => {
    const catMap = new Map<string, {
      count: number;
      estimatedHours: number;
      gamesMap: Map<string, number>;
    }>();

    const allGamesMap = new Map<string, { name: string; count: number }>();
    let totalPlays = 0;

    logsArray.forEach(log => {
      if (log.isAbsence) return;

      const duration = log.durationHours || 0;
      const gameList = (log.games && log.games.length > 0)
        ? log.games
        : (log.game ? [{ name: log.game, link: '', category: log.category || '종합' }] : []);

      const durationPerGame = gameList.length > 0 ? duration / gameList.length : duration;

      gameList.forEach(g => {
        const gameName = (g.name || '').trim();
        if (!gameName) return;

        const prevGame = allGamesMap.get(gameName);
        if (prevGame) {
          prevGame.count += 1;
        } else {
          allGamesMap.set(gameName, { name: gameName, count: 1 });
        }

        const rawCategory = g.category || log.category || '기타';
        const splitted = rawCategory
          .split(/[,/]/)
          .map(c => c.trim())
          .filter(c => c.length > 0);

        const targetCategories = splitted.length > 0 ? splitted : ['기타'];

        targetCategories.forEach(catName => {
          totalPlays++;

          if (!catMap.has(catName)) {
            catMap.set(catName, {
              count: 0,
              estimatedHours: 0,
              gamesMap: new Map()
            });
          }

          const catEntry = catMap.get(catName)!;
          catEntry.count += 1;
          catEntry.estimatedHours += durationPerGame / targetCategories.length;
          catEntry.gamesMap.set(gameName, (catEntry.gamesMap.get(gameName) || 0) + 1);
        });
      });
    });

    const categories = Array.from(catMap.entries()).map(([name, val], idx) => {
      const sortedGames = Array.from(val.gamesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([gName, count]) => ({ name: gName, count }));

      return {
        name,
        count: val.count,
        share: totalPlays > 0 ? (val.count / totalPlays) * 100 : 0,
        estimatedHours: Math.round(val.estimatedHours * 10) / 10,
        games: sortedGames,
        color: PDF_CATEGORY_PALETTE[idx % PDF_CATEGORY_PALETTE.length]
      };
    }).sort((a, b) => b.count - a.count);

    const topGamesList = Array.from(allGamesMap.values()).sort((a, b) => b.count - a.count);

    const top6 = categories.slice(0, 6);
    const others = categories.slice(6);
    const otherCount = others.reduce((acc, c) => acc + c.count, 0);

    const chartData = [
      ...top6.map(c => ({ name: c.name, value: c.count, share: c.share, color: c.color })),
      ...(otherCount > 0 ? [{
        name: '기타',
        value: otherCount,
        share: totalPlays > 0 ? (otherCount / totalPlays) * 100 : 0,
        color: '#cbd5e1'
      }] : [])
    ];

    return {
      categories,
      chartData,
      totalPlays,
      topCategory: categories[0] || null,
      totalGamesCount: allGamesMap.size,
      topIndividualGame: topGamesList[0] || null
    };
  }, [logsArray]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Filters */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">상세 분석</h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-sm w-full sm:w-auto">
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 w-full min-w-0 sm:w-auto bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-zinc-400 hidden sm:inline">~</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 w-full min-w-0 sm:w-auto bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={handleFilter} className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors mt-2 sm:mt-0">
            조회
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0 sm:pb-0 hide-scrollbar w-full sm:w-auto">
          {isLegacyRange ? (
            <>
              <button
                onClick={() => setActiveSubTab('trend')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap",
                  activeSubTab !== 'category' ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                방송 추이 및 요일별 분석
              </button>
              {showLegacyCategory && (
                <button
                  onClick={() => setActiveSubTab('category')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap",
                    activeSubTab === 'category' ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                  )}
                >
                  카테고리 분석
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveSubTab('trend')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap",
                  activeSubTab === 'trend' ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                방송 추이
              </button>
              <button
                onClick={() => setActiveSubTab('day')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap",
                  activeSubTab === 'day' ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                요일별 분석
              </button>
              <button
                onClick={() => setActiveSubTab('category')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap",
                  activeSubTab === 'category' ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                카테고리 분석
              </button>
            </>
          )}

          {isLegacyRange && (
            <div className="flex items-center gap-1.5 ml-1 sm:ml-2 shrink-0">
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                ~2025 포함 데이터
              </span>
              <button
                ref={helpButtonRef}
                type="button"
                onClick={handleToggleLegacyTooltip}
                className={cn(
                  "p-1 rounded-full transition-colors",
                  showLegacyTooltip 
                    ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60" 
                    : "text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title="과거 데이터 안내 보기"
                aria-label="과거 데이터 안내 보기"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setDownloadConfirm('csv')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-700 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            CSV 내보내기
          </button>
          <button 
            onClick={() => setDownloadConfirm('pdf')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-700 whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            PDF 리포트
          </button>
        </div>
      </div>

      <div className="space-y-6 bg-transparent">
        {/* ~2025 데이터일 때: 방송 추이와 요일별 분석을 합치고 히트맵은 숨김 */}
        {isLegacyRange ? (
          <>
            {activeSubTab !== 'category' && (
              <div className="space-y-6">
                {/* 1. 주간 방송 횟수 추이 */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                  <h4 className="font-bold mb-4">주간 방송 횟수 추이</h4>
                  <div className="h-[300px] w-full">
                    {isActive && (
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <LineChart data={stats.trendStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                          <XAxis dataKey="week" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                          <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '3 3' }} />
                          <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} activeDot={{ r: 6 }} animationDuration={300} animationEasing="ease-out" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 2. 요일별 방송 빈도 그래프 & 요일별 방송 확률 표 (히트맵은 숨김) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">요일별 방송 빈도 그래프</h4>
                    <div className="h-[300px] w-full">
                      {isActive && (
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                          <BarChart data={stats.dailyStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                            <XAxis dataKey="day" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                            <YAxis stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                            <Tooltip cursor={{ fill: '#a1a1aa', opacity: 0.1 }} content={<CustomTooltip formatter={(value: number) => [`${value.toFixed(1)}%`, '비율']} />} />
                            <ReferenceLine y={stats.avgDaily} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: `평균(${stats.avgDaily.toFixed(1)}%)`, fill: '#f43f5e', fontSize: 10 }} />
                            <Bar dataKey="probability" radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out">
                              {stats.dailyStatsArray.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.probability > stats.avgDaily * 1.2 ? '#a855f7' : entry.probability < stats.avgDaily * 0.8 ? '#ef4444' : '#6366f1'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">요일별 방송 확률 표</h4>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 font-semibold border-y border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">요일</th>
                            <th className="px-4 py-3 text-right">방송 횟수</th>
                            <th className="px-4 py-3 text-right">확률</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {stats.dailyStatsArray.map((stat) => (
                            <tr key={stat.day} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{stat.day}요일</td>
                              <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{stat.count}회</td>
                              <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-400">
                                {stat.probability.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'category' && showLegacyCategory && (
              <CategoryStatsTab 
                logs={logsArray} 
                isActive={isActive} 
                onNavigateToCalendar={onNavigateToCalendar}
                onNavigateToRecommend={onNavigateToRecommend}
              />
            )}
          </>
        ) : (
          /* 기존 2026년 이후 데이터: 방송 추이 / 요일별 분석 / 카테고리 분석 개별 탭 */
          <>
            {activeSubTab === 'trend' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                  <h4 className="font-bold mb-4">주간 방송 횟수 추이</h4>
                  <div className="h-[300px] w-full">
                    {isActive && (<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                      <LineChart data={stats.trendStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                        <XAxis dataKey="week" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '3 3' }} />
                        <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} activeDot={{ r: 6 }} animationDuration={300} animationEasing="ease-out" />
                      </LineChart>
                    </ResponsiveContainer>)}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm col-span-1 lg:col-span-2">
                    <h4 className="font-bold mb-4">요일별 자주 오는 시간</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                      {['월', '화', '수', '목', '금', '토', '일'].map(day => {
                        const times = stats.dailyTimeMap[day];
                        const sortedTimes = Object.keys(times).sort((a, b) => times[b] - times[a]);
                        const top1 = sortedTimes[0];
                        return (
                          <div key={day} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-3 flex flex-col items-center">
                            <div className="text-zinc-500 dark:text-zinc-400 font-semibold mb-2">{day}요일</div>
                            <div className="text-sm font-bold text-purple-600 dark:text-purple-400 text-center mb-1">{top1 ? top1 : '기록 없음'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">시작 시간대별 그래프</h4>
                    <div className="h-[250px] w-full mb-4">
                      {isActive && (<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={stats.hourStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                          <XAxis dataKey="label" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                          <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                          <Tooltip cursor={{ fill: '#a1a1aa', opacity: 0.1 }} content={<CustomTooltip formatter={(value: number) => [`${value.toFixed(1)}%`, '비율']} />} />
                          <Bar dataKey="probability" radius={[4, 4, 0, 0]} fill="#3b82f6" animationDuration={300} animationEasing="ease-out" />
                        </BarChart>
                      </ResponsiveContainer>)}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 font-semibold border-y border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">순위</th>
                            <th className="px-4 py-3">시간대</th>
                            <th className="px-4 py-3 text-right">확률</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {stats.exactTimeStatsArray.slice(0, 5).map((stat, i) => (
                            <tr key={stat.label} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-zinc-400 font-medium">{i + 1}</td>
                              <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{stat.label}</td>
                              <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-400">
                                {stat.probability.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">1회당 방송 진행 시간(길이) 비율</h4>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 dark:bg-black/40 text-zinc-500 dark:text-zinc-400 font-semibold border-y border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">방송 진행 시간</th>
                            <th className="px-4 py-3 text-right">횟수</th>
                            <th className="px-4 py-3 text-right">비율</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {stats.durationStatsArray.map((stat) => (
                            <tr key={stat.label} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{stat.label}</td>
                              <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{stat.count}회</td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{stat.probability.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'day' && (
              <div className="space-y-6">
                {/* 방송 히트맵 (잔디) */}
                <BroadcastHeatmap 
                  logs={logsArray} 
                  startDate={startDate} 
                  endDate={endDate} 
                  onSelectDate={onNavigateToCalendar}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">요일별 방송 빈도 그래프</h4>
                    <div className="h-[300px] w-full">
                      {isActive && (<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={stats.dailyStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                          <XAxis dataKey="day" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                          <YAxis stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                          <Tooltip cursor={{ fill: '#a1a1aa', opacity: 0.1 }} content={<CustomTooltip formatter={(value: number) => [`${value.toFixed(1)}%`, '비율']} />} />
                          <ReferenceLine y={stats.avgDaily} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: `평균(${stats.avgDaily.toFixed(1)}%)`, fill: '#f43f5e', fontSize: 10 }} />
                          <Bar dataKey="probability" radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out">
                            {stats.dailyStatsArray.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.probability > stats.avgDaily * 1.2 ? '#a855f7' : entry.probability < stats.avgDaily * 0.8 ? '#ef4444' : '#6366f1'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col">
                    <h4 className="font-bold mb-4">요일별 방송 확률 표</h4>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 font-semibold border-y border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">요일</th>
                            <th className="px-4 py-3 text-right">방송 횟수</th>
                            <th className="px-4 py-3 text-right">확률</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {stats.dailyStatsArray.map((stat) => (
                            <tr key={stat.day} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">{stat.day}요일</td>
                              <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{stat.count}회</td>
                              <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-400">
                                {stat.probability.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'category' && (
              <CategoryStatsTab 
                logs={logsArray} 
                isActive={isActive} 
                onNavigateToCalendar={onNavigateToCalendar}
                onNavigateToRecommend={onNavigateToRecommend}
              />
            )}
          </>
        )}
      </div>

      {/* 푸터 바로 윗부분: 레거시 데이터 안내문구 */}
      <div className="mt-8 p-4 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-2 leading-relaxed">
        <div>
          <strong className="text-zinc-700 dark:text-zinc-300">과거 데이터 안내:</strong> 본 사이트의 데이터 중 {firstYear}~2025년 데이터는 스프레드시트 기록을 변환한 것으로, 파일 변환 시에 누락된 데이터나 잘못된 정보가 포함되어 있을 수 있습니다.
        </div>
      </div>
      
      {/* Hidden container for PDF export (Forced Light Mode & Fixed Layout) */}
      <div className="absolute left-[-9999px] top-0 opacity-0 pointer-events-none">
        <div ref={printRef} className="w-[1000px] p-10 bg-white text-zinc-900 space-y-10" style={{ backgroundColor: '#ffffff', color: '#18181b' }}>
          
          <div className="text-center pb-6 border-b border-zinc-200">
            <h2 className="text-3xl font-black text-zinc-900 mb-2">우주하마 방송 통계 리포트</h2>
            <p className="text-zinc-500 text-sm">분석 기간: {startDate} ~ {endDate}</p>
          </div>

          {/* ~2025 조회 시 (isLegacyRange): 히트맵 및 카테고리 미표시, 방송 추이와 요일별 분석을 합쳐 주간 추이, 요일별 빈도, 요일별 확률 표만 출력 */}
          {isLegacyRange ? (
            <div className="space-y-8">
              {/* 주간 방송 횟수 추이 */}
              <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                <h4 className="font-bold mb-4 text-zinc-900">주간 방송 횟수 추이</h4>
                <div className="w-full flex justify-center">
                  {isActive && (
                    <LineChart width={880} height={250} data={stats.trendStatsArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="week" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} isAnimationActive={false}>
                        <LabelList dataKey="count" position="top" fill="#a855f7" fontSize={12} offset={10} formatter={(val: number) => `${val}회`} />
                      </Line>
                    </LineChart>
                  )}
                </div>
              </div>

              {/* 요일별 방송 빈도 그래프 & 요일별 방송 확률 표 */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                  <h4 className="font-bold mb-4 text-zinc-900">요일별 방송 빈도 그래프</h4>
                  <div className="w-full flex justify-center">
                    {isActive && (
                      <BarChart width={400} height={220} data={stats.dailyStatsArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                        <XAxis dataKey="day" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                        <ReferenceLine y={stats.avgDaily} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: `평균(${stats.avgDaily.toFixed(1)}%)`, fill: '#f43f5e', fontSize: 10 }} />
                        <Bar dataKey="probability" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                          <LabelList dataKey="probability" position="top" fill="#6b7280" fontSize={11} formatter={(val: number) => `${val.toFixed(1)}%`} />
                          {stats.dailyStatsArray.map((entry, index) => (
                            <Cell key={`legacy-pdf-cell-${index}`} fill={entry.probability > stats.avgDaily * 1.2 ? '#a855f7' : entry.probability < stats.avgDaily * 0.8 ? '#ef4444' : '#6366f1'} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                  <h4 className="font-bold mb-4 text-zinc-900">요일별 방송 확률 표</h4>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200">
                      <tr>
                        <th className="px-4 py-2">요일</th>
                        <th className="px-4 py-2 text-right">방송 횟수</th>
                        <th className="px-4 py-2 text-right">확률</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {stats.dailyStatsArray.map((stat) => (
                        <tr key={stat.day}>
                          <td className="px-4 py-2 font-semibold text-zinc-900">{stat.day}요일</td>
                          <td className="px-4 py-2 text-right text-zinc-600">{stat.count}회</td>
                          <td className="px-4 py-2 text-right font-bold text-purple-600">{stat.probability.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 카테고리 분석 섹션 (과거 데이터에도 카테고리가 100% 존재하므로 포함) */}
              {showLegacyCategory && (
                <div className="space-y-6 pt-2">
                  <h3 className="text-2xl font-bold text-zinc-900 border-l-4 border-indigo-500 pl-3">카테고리 분석</h3>

                {/* 카테고리 요약 지표 */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-zinc-500 mb-1">1위 최다 플레이 카테고리</div>
                    <div className="text-xl font-bold text-zinc-900 truncate">
                      {pdfCategoryStats.topCategory ? pdfCategoryStats.topCategory.name : '없음'}
                    </div>
                    <div className="text-xs font-bold text-purple-600 mt-1">
                      {pdfCategoryStats.topCategory ? `${pdfCategoryStats.topCategory.count}회 (${pdfCategoryStats.topCategory.share.toFixed(1)}%)` : '-'}
                    </div>
                  </div>
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-zinc-500 mb-1">분류된 게임 카테고리 수</div>
                    <div className="text-xl font-bold text-zinc-900">{pdfCategoryStats.categories.length}개</div>
                    <div className="text-xs text-zinc-400 mt-1">다양한 게임 장르 진행</div>
                  </div>
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-zinc-500 mb-1">플레이한 고유 게임 수</div>
                    <div className="text-xl font-bold text-zinc-900">{pdfCategoryStats.totalGamesCount}개</div>
                    <div className="text-xs text-zinc-400 mt-1">중복 없는 고유 타이틀</div>
                  </div>
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <div className="text-xs font-medium text-zinc-500 mb-1">가장 자주 등장한 게임</div>
                    <div className="text-xl font-bold text-zinc-900 truncate">
                      {pdfCategoryStats.topIndividualGame?.name || '없음'}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {pdfCategoryStats.topIndividualGame ? `${pdfCategoryStats.topIndividualGame.count}회 방송 진행` : '-'}
                    </div>
                  </div>
                </div>

                {/* 원그래프 & 주요 비중 리스트 */}
                <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                  <h4 className="font-bold mb-4 text-zinc-900">카테고리별 비중 원그래프</h4>
                  <div className="grid grid-cols-12 gap-6 items-center">
                    <div className="col-span-6 flex justify-center">
                      {isActive && (
                        <PieChart width={380} height={230}>
                          <Pie
                            data={pdfCategoryStats.chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={95}
                            paddingAngle={2}
                            dataKey="value"
                            isAnimationActive={false}
                            stroke="none"
                          >
                            {pdfCategoryStats.chartData.map((entry, index) => (
                              <Cell key={`legacy-pdf-pie-cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      )}
                    </div>

                    <div className="col-span-6 grid grid-cols-2 gap-2">
                      {pdfCategoryStats.chartData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between p-2 rounded-lg border border-zinc-200 bg-zinc-50 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0 pr-1">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="font-medium text-zinc-800 truncate">{item.name}</span>
                          </div>
                          <span className="font-bold text-zinc-900 shrink-0">{item.share.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 가장 많이 플레이한 게임 카테고리 순위표 */}
                <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                  <h4 className="font-bold mb-4 text-zinc-900">가장 많이 플레이한 게임 카테고리 순위표</h4>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200 text-xs">
                      <tr>
                        <th className="px-4 py-2.5 w-14 text-center">순위</th>
                        <th className="px-4 py-2.5">카테고리</th>
                        <th className="px-4 py-2.5">플레이 횟수 (비중)</th>
                        <th className="px-4 py-2.5 text-right">누적 방송 횟수</th>
                        <th className="px-4 py-2.5">가장 자주 등장한 게임</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pdfCategoryStats.categories.slice(0, 10).map((cat, index) => {
                        const rank = index + 1;
                        return (
                          <tr key={cat.name}>
                            <td className="px-4 py-2.5 text-center">
                              {rank === 1 ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/15 text-amber-700 font-bold text-xs border border-amber-500/30">1</span>
                              ) : rank === 2 ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-zinc-300 text-zinc-700 font-bold text-xs border border-zinc-400">2</span>
                              ) : rank === 3 ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-700/15 text-amber-800 font-bold text-xs border border-amber-700/30">3</span>
                              ) : (
                                <span className="text-zinc-500 font-medium text-xs">{rank}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-zinc-900">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                {cat.name}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-bold text-zinc-900">{cat.count}회</span>{' '}
                              <span className="text-zinc-500 text-xs">({cat.share.toFixed(1)}%)</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-zinc-800">
                              {cat.count}회
                            </td>
                            <td className="px-4 py-2.5 text-xs text-zinc-600">
                              {cat.games.slice(0, 3).map(g => `${g.name}(${g.count})`).join(', ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-500 leading-relaxed">
                * {firstYear}~2025년 데이터는 스프레드시트 기록을 변환한 것으로, 방송 시작·종료 시간 정보는 미포함이나 방송 일자, 요일 빈도{showLegacyCategory ? ' 및 게임 카테고리 분석은 ' : '는 '}정상적으로 제공됩니다.
              </div>
            </div>
          ) : (
            <>
              {/* 1. 방송 활동 히트맵 섹션 (PDF 포함) */}
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-zinc-900 border-l-4 border-purple-500 pl-3">방송 활동 히트맵</h3>
            
            {/* 4대 요약 카드 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">방송 일수 (방송률)</div>
                <div className="text-xl font-bold text-zinc-900">{pdfHeatmap.totalBroadcastDays}일 <span className="text-xs font-bold text-purple-600">({pdfHeatmap.broadcastRate.toFixed(1)}%)</span></div>
                <div className="text-xs text-zinc-400 mt-1">총 {pdfHeatmap.totalAnalyzedDays}일 중</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">총 방송 시간</div>
                <div className="text-xl font-bold text-zinc-900">{pdfHeatmap.totalDurationHours.toFixed(1)}시간</div>
                <div className="text-xs text-zinc-400 mt-1">회당 평균 {pdfHeatmap.avgDuration.toFixed(1)}시간</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">최장 연속 방송</div>
                <div className="text-xl font-bold text-zinc-900">{pdfHeatmap.maxStreak}일 연속</div>
                <div className="text-xs text-zinc-400 mt-1">쉬지 않고 방송한 기록</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">최장 연속 휴방</div>
                <div className="text-xl font-bold text-zinc-900">{pdfHeatmap.maxBreakStreak}일 연속</div>
                <div className="text-xs text-zinc-400 mt-1">최장 재정비 기간</div>
              </div>
            </div>

            {/* 히트맵 라이트 모드 캔버스 그리드 (PDF 문서 룩앤필) */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-5 text-zinc-900 shadow-xs">
              <div className="flex items-start">
                {/* 좌측 요일 라벨 - 셀과 1:1 완벽 정렬 */}
                <div className="flex flex-col gap-[3px] pr-2.5 select-none w-6 shrink-0">
                  {[
                    { label: '일', color: 'text-red-500 font-bold' },
                    { label: '월', color: 'text-zinc-400 font-medium' },
                    { label: '화', color: 'text-zinc-400 font-medium' },
                    { label: '수', color: 'text-zinc-400 font-medium' },
                    { label: '목', color: 'text-zinc-400 font-medium' },
                    { label: '금', color: 'text-zinc-400 font-medium' },
                    { label: '토', color: 'text-blue-500 font-bold' },
                  ].map((day, idx) => (
                    <div
                      key={idx}
                      style={{ height: '18px' }}
                      className={cn(
                        "flex items-center justify-center text-[11px] leading-none",
                        day.color
                      )}
                    >
                      {day.label}
                    </div>
                  ))}
                </div>

                {/* 주 컬럼들 */}
                <div className="flex gap-[3px] flex-1 justify-between">
                  {pdfHeatmap.weeks.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-[3px] flex-1 max-w-[20px]">
                      {week.map((cell) => {
                        const styleDef = HEATMAP_LEVEL_COLORS[cell.level] || HEATMAP_LEVEL_COLORS[0];
                        const bg = cell.isOutside ? 'transparent' : styleDef.lightBg;
                        const border = cell.isOutside ? 'transparent' : styleDef.lightBorder;
                        return (
                          <div
                            key={cell.dateStr}
                            style={{ backgroundColor: bg, borderColor: border, height: '18px' }}
                            className="w-full rounded-[2.5px] border"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 하단 월 라벨 */}
              <div className="flex pl-8 mt-2.5 text-[11px] font-medium text-zinc-500 select-none h-4">
                {pdfHeatmap.weeks.map((_, idx) => {
                  const matched = pdfHeatmap.monthLabels.find(l => l.weekIndex === idx);
                  return (
                    <div key={idx} className="flex-1 text-center max-w-[20px] mr-[3px]">
                      {matched ? (
                        <span className="whitespace-nowrap font-semibold text-zinc-500 text-[10px]">
                          {matched.monthName}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* 하단 범례: 20분 단위 (최대 5시간) */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 mt-3 text-xs text-zinc-600">
                <span className="text-zinc-500 text-xs">20분 단위 방송 시간 색상 구분 (최대 5시간)</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-zinc-500">휴방</span>
                  <span
                    className="w-3.5 h-3.5 rounded-[2px] border"
                    style={{ backgroundColor: HEATMAP_LEVEL_COLORS[0].lightBg, borderColor: HEATMAP_LEVEL_COLORS[0].lightBorder }}
                    title="휴방"
                  />
                  <span className="text-zinc-400 text-[11px] mx-1">|</span>
                  <span className="text-zinc-400 text-[11px]">20분 단위</span>
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((lvl) => {
                    const info = HEATMAP_LEVEL_COLORS[lvl];
                    return (
                      <span
                        key={lvl}
                        className="w-2.5 h-3.5 rounded-[1.5px] border"
                        style={{ backgroundColor: info.lightBg, borderColor: info.lightBorder }}
                        title={`${info.label} (${(lvl * 20 / 60).toFixed(1)}h)`}
                      />
                    );
                  })}
                  <span className="text-purple-700 font-bold ml-1">5시간+</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Trend & Time section */}
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-zinc-900 border-l-4 border-purple-500 pl-3">방송 추이 및 시간대 분석</h3>
            
            <div className="bg-white border border-zinc-200 rounded-3xl p-6">
              <h4 className="font-bold mb-4 text-zinc-900">주간 방송 횟수 추이</h4>
              <div className="w-full flex justify-center">
                {isActive && (
                  <LineChart width={880} height={250} data={stats.trendStatsArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="week" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                    <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} isAnimationActive={false}>
                      <LabelList dataKey="count" position="top" fill="#a855f7" fontSize={12} offset={10} formatter={(val: number) => `${val}회`} />
                    </Line>
                  </LineChart>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                <h4 className="font-bold mb-4 text-zinc-900">시작 시간대별 확률</h4>
                <div className="w-full flex justify-center mb-4">
                  {isActive && (
                    <BarChart width={400} height={200} data={stats.hourStatsArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="label" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                      <Bar dataKey="probability" radius={[4, 4, 0, 0]} fill="#3b82f6" isAnimationActive={false}>
                        <LabelList dataKey="probability" position="top" fill="#6b7280" fontSize={11} formatter={(val: number) => `${val.toFixed(1)}%`} />
                      </Bar>
                    </BarChart>
                  )}
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200">
                    <tr>
                      <th className="px-4 py-2">순위</th>
                      <th className="px-4 py-2">시간대</th>
                      <th className="px-4 py-2 text-right">확률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {stats.exactTimeStatsArray.slice(0, 5).map((stat, i) => (
                      <tr key={stat.label}>
                        <td className="px-4 py-2 text-zinc-500">{i + 1}</td>
                        <td className="px-4 py-2 font-semibold text-zinc-900">{stat.label}</td>
                        <td className="px-4 py-2 text-right font-bold text-purple-600">{stat.probability.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                <h4 className="font-bold mb-4 text-zinc-900">1회당 방송 진행 시간</h4>
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200">
                    <tr>
                      <th className="px-4 py-2">방송 시간</th>
                      <th className="px-4 py-2 text-right">횟수</th>
                      <th className="px-4 py-2 text-right">비율</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {stats.durationStatsArray.map((stat) => (
                      <tr key={stat.label}>
                        <td className="px-4 py-2 font-semibold text-zinc-900">{stat.label}</td>
                        <td className="px-4 py-2 text-right text-zinc-600">{stat.count}회</td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-600">{stat.probability.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Day Section */}
          <div className="space-y-6 pt-6">
            <h3 className="text-2xl font-bold text-zinc-900 border-l-4 border-blue-500 pl-3">요일별 상세 분석</h3>
            
            <div className="bg-white border border-zinc-200 rounded-3xl p-6">
              <h4 className="font-bold mb-4 text-zinc-900">요일별 자주 오는 시간</h4>
              <div className="flex justify-between gap-2">
                {['월', '화', '수', '목', '금', '토', '일'].map(day => {
                  const times = stats.dailyTimeMap[day];
                  const sortedTimes = Object.keys(times).sort((a, b) => times[b] - times[a]);
                  const top1 = sortedTimes[0];
                  return (
                    <div key={day} className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl p-3 flex flex-col items-center">
                      <div className="text-zinc-500 font-semibold mb-2">{day}요일</div>
                      <div className="text-sm font-bold text-purple-600 text-center mb-1">{top1 ? top1 : '기록 없음'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                <h4 className="font-bold mb-4 text-zinc-900">요일별 방송 확률 차트</h4>
                <div className="w-full flex justify-center">
                  {isActive && (
                    <BarChart width={400} height={200} data={stats.dailyStatsArray} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                      <XAxis dataKey="day" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                      <ReferenceLine y={stats.avgDaily} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: `평균(${stats.avgDaily.toFixed(1)}%)`, fill: '#f43f5e', fontSize: 10 }} />
                      <Bar dataKey="probability" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="probability" position="top" fill="#6b7280" fontSize={11} formatter={(val: number) => `${val.toFixed(1)}%`} />
                        {stats.dailyStatsArray.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.probability > stats.avgDaily * 1.2 ? '#a855f7' : entry.probability < stats.avgDaily * 0.8 ? '#ef4444' : '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-3xl p-6">
                <h4 className="font-bold mb-4 text-zinc-900">요일별 방송 확률 표</h4>
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200">
                    <tr>
                      <th className="px-4 py-2">요일</th>
                      <th className="px-4 py-2 text-right">방송 횟수</th>
                      <th className="px-4 py-2 text-right">확률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {stats.dailyStatsArray.map((stat) => (
                      <tr key={stat.day}>
                        <td className="px-4 py-2 font-semibold text-zinc-900">{stat.day}요일</td>
                        <td className="px-4 py-2 text-right text-zinc-600">{stat.count}회</td>
                        <td className="px-4 py-2 text-right font-bold text-purple-600">{stat.probability.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4. 카테고리 분석 섹션 (PDF 포함) */}
          <div className="space-y-6 pt-6">
            <h3 className="text-2xl font-bold text-zinc-900 border-l-4 border-indigo-500 pl-3">카테고리 분석</h3>

            {/* 카테고리 요약 지표 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">1위 최다 플레이 카테고리</div>
                <div className="text-xl font-bold text-zinc-900 truncate">
                  {pdfCategoryStats.topCategory ? pdfCategoryStats.topCategory.name : '없음'}
                </div>
                <div className="text-xs font-bold text-purple-600 mt-1">
                  {pdfCategoryStats.topCategory ? `${pdfCategoryStats.topCategory.count}회 (${pdfCategoryStats.topCategory.share.toFixed(1)}%)` : '-'}
                </div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">분류된 게임 카테고리 수</div>
                <div className="text-xl font-bold text-zinc-900">{pdfCategoryStats.categories.length}개</div>
                <div className="text-xs text-zinc-400 mt-1">다양한 게임 장르 진행</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">플레이한 고유 게임 수</div>
                <div className="text-xl font-bold text-zinc-900">{pdfCategoryStats.totalGamesCount}개</div>
                <div className="text-xs text-zinc-400 mt-1">중복 없는 고유 타이틀</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">가장 자주 등장한 게임</div>
                <div className="text-xl font-bold text-zinc-900 truncate">
                  {pdfCategoryStats.topIndividualGame?.name || '없음'}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {pdfCategoryStats.topIndividualGame ? `${pdfCategoryStats.topIndividualGame.count}회 방송 진행` : '-'}
                </div>
              </div>
            </div>

            {/* 원그래프 & 주요 비중 리스트 */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-6">
              <h4 className="font-bold mb-4 text-zinc-900">카테고리별 비중 원그래프</h4>
              <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-6 flex justify-center">
                  {isActive && (
                    <PieChart width={380} height={230}>
                      <Pie
                        data={pdfCategoryStats.chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                        dataKey="value"
                        isAnimationActive={false}
                        stroke="none"
                      >
                        {pdfCategoryStats.chartData.map((entry, index) => (
                          <Cell key={`pdf-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  )}
                </div>

                <div className="col-span-6 grid grid-cols-2 gap-2">
                  {pdfCategoryStats.chartData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-2 rounded-lg border border-zinc-200 bg-zinc-50 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-medium text-zinc-800 truncate">{item.name}</span>
                      </div>
                      <span className="font-bold text-zinc-900 shrink-0">{item.share.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 가장 많이 플레이한 게임 카테고리 순위표 */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-6">
              <h4 className="font-bold mb-4 text-zinc-900">가장 많이 플레이한 게임 카테고리 순위표</h4>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-500 font-semibold border-y border-zinc-200 text-xs">
                  <tr>
                    <th className="px-4 py-2.5 w-14 text-center">순위</th>
                    <th className="px-4 py-2.5">카테고리</th>
                    <th className="px-4 py-2.5">플레이 횟수 (비중)</th>
                    <th className="px-4 py-2.5 text-right">누적 방송 시간</th>
                    <th className="px-4 py-2.5">가장 자주 등장한 게임</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pdfCategoryStats.categories.slice(0, 10).map((cat, index) => {
                    const rank = index + 1;
                    return (
                      <tr key={cat.name}>
                        <td className="px-4 py-2.5 text-center">
                          {rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/15 text-amber-700 font-bold text-xs border border-amber-500/30">1</span>
                          ) : rank === 2 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-zinc-300 text-zinc-700 font-bold text-xs border border-zinc-400">2</span>
                          ) : rank === 3 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-700/15 text-amber-800 font-bold text-xs border border-amber-700/30">3</span>
                          ) : (
                            <span className="text-zinc-500 font-medium text-xs">{rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-zinc-900">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-zinc-900">{cat.count}회</span>{' '}
                          <span className="text-zinc-500 text-xs">({cat.share.toFixed(1)}%)</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-zinc-800">
                          {cat.estimatedHours}시간
                        </td>
                        <td className="px-4 py-2.5 text-xs text-zinc-600">
                          {cat.games.slice(0, 3).map(g => `${g.name}(${g.count})`).join(', ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

          <div className="pt-8 text-center text-sm font-medium text-zinc-400 mt-12">
            © {new Date().getFullYear()} 우주하마 방송 예측. All rights reserved. <br/> 본 자료는 비상업적 목적으로만 사용 가능합니다.
          </div>
        </div>
      </div>

      {/* 과거(~2025) 데이터 안내 팝오버 팝업 (누른 위치 기준 플로팅) */}
      <AnimatePresence>
        {showLegacyTooltip && tooltipPos && (
          <div className="fixed inset-0 z-50 pointer-events-auto">
            {/* 투명 백드롭 오버레이 (클릭 시 닫힘) */}
            <div 
              className="fixed inset-0 bg-black/15 dark:bg-black/40 backdrop-blur-[0.5px]"
              onClick={() => setShowLegacyTooltip(false)}
            />

            {/* 팝업 카드 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: tooltipPos.showAbove ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: tooltipPos.showAbove ? 6 : -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                top: tooltipPos.top,
                left: tooltipPos.left,
                width: Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 32 : 320),
                transform: tooltipPos.showAbove ? 'translateY(-100%)' : undefined,
              }}
              className="fixed z-50 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200/90 dark:border-zinc-800 p-4 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed"
            >
              {/* 말풍선 핀 (누른 버튼을 가리킴) */}
              <div 
                className={cn(
                  "absolute w-3 h-3 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 transform rotate-45",
                  tooltipPos.showAbove 
                    ? "-bottom-1.5 border-t-0 border-l-0" 
                    : "-top-1.5 border-b-0 border-r-0"
                )}
                style={{ left: tooltipPos.arrowLeft - 6 }}
              />

              <div className="relative z-10">
                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
                    <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                    <span>과거(~2025) 데이터 안내</span>
                  </div>
                  <button 
                    onClick={() => setShowLegacyTooltip(false)} 
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="닫기"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-zinc-600 dark:text-zinc-300 mb-3">
                  {firstYear}~2025년 데이터는 방송 시작·종료 시간 및 쇼츠 정보는 미포함되어 있으나, <strong>방송 일자·요일{showLegacyCategory ? ' 및 게임 카테고리 분석은 ' : '은 '}정상적으로 제공</strong>됩니다.
                </p>
                <button
                  type="button"
                  onClick={() => setShowLegacyTooltip(false)}
                  className="w-full py-1.5 px-3 rounded-lg bg-zinc-100 hover:bg-purple-50 hover:text-purple-600 dark:bg-zinc-800 dark:hover:bg-purple-950/40 dark:hover:text-purple-400 text-zinc-700 dark:text-zinc-300 font-semibold text-xs transition-colors text-center border border-zinc-200 dark:border-zinc-700 hover:border-purple-200 dark:hover:border-purple-800"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Download Confirm Modal */}
      {downloadConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800 relative">
            <button 
              onClick={() => setDownloadConfirm(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">이용 동의</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                본 데이터 및 리포트의 <strong className="text-red-500 font-bold">상업적 이용을 엄격히 금지</strong>합니다.<br />
                이에 동의하고 다운로드하시겠습니까?
              </p>
            </div>
            <div className="flex border-t border-zinc-200 dark:border-zinc-800">
              <button 
                onClick={() => setDownloadConfirm(null)}
                className="flex-1 p-4 font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  if (downloadConfirm === 'csv') executeDownloadCSV();
                  else if (downloadConfirm === 'pdf') executeDownloadPDF();
                  setDownloadConfirm(null);
                }}
                className="flex-1 p-4 font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors border-l border-zinc-200 dark:border-zinc-800"
              >
                동의 및 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

