import { useMemo, useEffect, useState } from 'react';
import { PatternAnalysis } from '../PatternAnalysis';
import { WidgetShareButton } from '../common/WidgetShareButton';
import { AppData } from '../../types';
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, isSameDay, addDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';
import { CustomTooltip } from '../CustomTooltip';
import { SmartTrendLabel } from '../stats/SmartTrendLabel';
import { parseTimeString, parseTimeTo24 } from '../../utils';

interface SummaryTabProps {
  data: AppData;
  fetchLogs?: (startDate: string, endDate: string) => Promise<void>;
  isActive?: boolean;
}

export function SummaryTab({ data, isActive = true }: SummaryTabProps) {
  // 가장 최근 연도의 데이터만 표시
  const latestYear = useMemo(() => {
    const dates = Object.values(data.logs || {}).map(l => l.date).filter(Boolean).sort();
    if (dates.length > 0) {
      return dates[dates.length - 1].substring(0, 4);
    }
    return new Date().getFullYear().toString();
  }, [data.logs]);

  const logsArray = useMemo(() => {
    return Object.values(data.logs || {}).filter(log => log.date && log.date.startsWith(latestYear));
  }, [data.logs, latestYear]);

  const stats = useMemo(() => {
    const dailyMap: Record<string, number> = { '일': 0, '월': 0, '화': 0, '수': 0, '목': 0, '금': 0, '토': 0 };
    const timeMap: Record<string, number> = {};
    const trendMap: Record<string, number> = {};
    const dailyTimeMap: Record<string, Record<string, number>> = { '일': {}, '월': {}, '화': {}, '수': {}, '목': {}, '금': {}, '토': {} };

    logsArray.forEach(log => {
      const dateObj = parseISO(log.date);
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      dailyMap[dayNames[dateObj.getDay()]]++;

      const timeObj = parseTimeTo24(log.time);
      const format12 = (h: number, m: number) => {
        let roundedM = Math.round(m / 10) * 10;
        let finalH = h;
        if (roundedM === 60) {
           roundedM = 0;
           finalH += 1;
        }
        const period = finalH >= 12 && finalH < 24 ? '오후' : '오전';
        const hour12 = finalH % 12 || 12;
        return `${period} ${Math.floor(hour12)}:${roundedM.toString().padStart(2, '0')}`;
      };
      const timeLabel = format12(timeObj.hour, timeObj.minute);
      timeMap[timeLabel] = (timeMap[timeLabel] || 0) + 1;
      const dayName = dayNames[dateObj.getDay()];
      dailyTimeMap[dayName][timeLabel] = (dailyTimeMap[dayName][timeLabel] || 0) + 1;

      const soW = startOfWeek(dateObj);
      let weekStartStr = format(soW, 'MM/dd');
      let weekStartLabel = format(soW, 'MM/dd');
      for(let i=0; i<7; i++) {
         const d = addDays(soW, i);
         if (d.getMonth() === 0 && d.getDate() === 1) {
            weekStartLabel = '01/01';
            weekStartStr = format(d, 'yyyy-MM-dd'); // For sorting purposes, we use the date that falls on 1/1
            break;
         }
      }
      
      const sortKey = `${format(soW, 'yyyy-MM-dd')}_${weekStartLabel}`;
      trendMap[sortKey] = (trendMap[sortKey] || 0) + 1;
    });

    const topDay = Object.keys(dailyMap).reduce((a, b) => dailyMap[a] > dailyMap[b] ? a : b, '목');
    const bottomDay = Object.keys(dailyMap).reduce((a, b) => dailyMap[a] < dailyMap[b] ? a : b, '금');
    const topTime = Object.keys(timeMap).reduce((a, b) => timeMap[a] > timeMap[b] ? a : b, '오후 8시');
    
    const sortedDaysByStream = Object.keys(dailyMap).sort((a, b) => dailyMap[b] - dailyMap[a]);
    const top1Day = sortedDaysByStream[0] || '목';
    const top2Day = sortedDaysByStream[1] || '금';

    const dailyTopTimes: Record<string, string> = {};
    Object.keys(dailyTimeMap).forEach(day => {
      const times = dailyTimeMap[day];
      const top = Object.keys(times).reduce((a, b) => times[a] > times[b] ? a : b, '기록 없음');
      dailyTopTimes[day] = top;
    });


    const trendStatsArray = Object.keys(trendMap).sort().map(sortKey => {
      const week = sortKey.split('_')[1];
      return { week: `${week.startsWith('0') ? week.substring(1) : week} 주간`, count: trendMap[sortKey] };
    });

    const dailyStatsArray = Object.keys(dailyMap).map(day => ({
      day, count: dailyMap[day]
    }));
    
    // Calculate dynamic probabilities
    let streamAfterStream = 0;
    let restAfterStream = 0;
    let streamAfterTwoStreams = 0;
    let restAfterTwoStreams = 0;
    let streamAfterLongStream = 0;
    let restAfterLongStream = 0;

    const dateSet = new Set(logsArray.map(l => l.date));
    const sortedDates = Array.from(dateSet).sort();
    
    let totalWeeks = 1;
    if (sortedDates.length > 0) {
      const firstDate = parseISO(sortedDates[0]);
      const lastDate = parseISO(sortedDates[sortedDates.length - 1]);
      totalWeeks = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 7)));
    }

    const dayRestProb = Object.keys(dailyMap).reduce((acc, day) => {
      const restedWeeks = totalWeeks - dailyMap[day];
      acc[day] = Math.max(0, Math.min(100, Math.round((restedWeeks / totalWeeks) * 100)));
      return acc;
    }, {} as Record<string, number>);
    
    logsArray.forEach(log => {
      const current = parseISO(log.date);
      const nextDay = format(addDays(current, 1), 'yyyy-MM-dd');
      const prevDay = format(addDays(current, -1), 'yyyy-MM-dd');
      
      const streamedNextDay = dateSet.has(nextDay);
      
      // 1. One day stream
      if (streamedNextDay) streamAfterStream++;
      else restAfterStream++;
      
      // 2. Two consecutive days
      if (dateSet.has(prevDay)) {
        if (streamedNextDay) streamAfterTwoStreams++;
        else restAfterTwoStreams++;
      }
      
      // 3. Long stream (> 3 hours)
      if (log.durationHours && log.durationHours > 3) {
        if (streamedNextDay) streamAfterLongStream++;
        else restAfterLongStream++;
      }
    });

    const probRestAfter1 = streamAfterStream + restAfterStream > 0 ? (restAfterStream / (streamAfterStream + restAfterStream) * 100).toFixed(0) : 50;
    const probRestAfter2 = streamAfterTwoStreams + restAfterTwoStreams > 0 ? (restAfterTwoStreams / (streamAfterTwoStreams + restAfterTwoStreams) * 100).toFixed(0) : 100;
    const probRestAfterLong = streamAfterLongStream + restAfterLongStream > 0 ? (restAfterLongStream / (streamAfterLongStream + restAfterLongStream) * 100).toFixed(0) : 80;

    // Recent 30 days calculation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentLogs = logsArray.filter(l => parseISO(l.date) >= thirtyDaysAgo);
    const recentWeeklyAvg = (recentLogs.length / 4.3).toFixed(1);
    const allTimeWeeklyAvg = trendStatsArray.length > 0 ? (trendStatsArray.reduce((acc, curr) => acc + curr.count, 0) / trendStatsArray.length).toFixed(1) : '0.0';

    const weekendCount = dailyMap['토'] + dailyMap['일'];
    const totalCount = logsArray.length;
    const weekendProb = totalCount > 0 ? (weekendCount / totalCount * 100).toFixed(0) : '0';

    return { 
      topDay, 
      bottomDay, 
      topTime,
      top1Day,
      top2Day,
      dailyTopTimes,
      trendStatsArray, 
      dailyStatsArray,
      probRestAfter1,
      probRestAfter2,
      probRestAfterLong,
      dayRestProb,
      recentWeeklyAvg,
      allTimeWeeklyAvg,
      weekendProb
    };
  }, [logsArray]);

  // Dynamically generate guides based on actual data
  const dynamicGuides = [
    ...(data.system?.absenceReason ? [{
      id: 'guide-0',
      title: '⚠️ 장기 휴방 사유 안내',
      content: `현재 우주하마님은 **${data.system.absenceReason}** 사유로 휴방 중입니다.${data.system.absenceDuration ? ` (예상 기간: **${data.system.absenceDuration}**)` : ''} 이로 인해 평소 패턴과 다르게 당분간 휴방이 지속될 가능성이 높으니 참고하시기 바랍니다.`
    }] : []),
    {
      id: 'guide-1',
      title: '가장 확실한 방송 요일과 휴방 요일',
      content: `전체 데이터 기준 가장 유력한 방송 요일은 **${stats.top1Day}요일**, **${stats.top2Day}요일**입니다. 주로 **${stats.dailyTopTimes[stats.top1Day]}** 즈음에 방송이 켜집니다. 반면 **${stats.bottomDay}요일**은 무려 **${stats.dayRestProb[stats.bottomDay]}%** 의 확률로 가장 쉴 가능성이 높은 휴방일입니다.`
    },
    {
      id: 'guide-2',
      title: '최근 방송 빈도 트렌드 변화',
      content: `전체 기간 동안 주 평균 **${stats.allTimeWeeklyAvg}회** 방송했지만, 최근 한 달간은 주 평균 **${stats.recentWeeklyAvg}회** 방송하며 패턴의 변화를 보이고 있습니다. (전체 방송 중 주말 방송 비율은 **${stats.weekendProb}%** 입니다.)`
    },
    {
      id: 'guide-3',
      title: '연속 방송에 따른 내일의 휴방 확률',
      content: `분석된 데이터에 기반한 실시간 휴방 확률입니다. 연속 방송이나 장시간 방송 후엔 휴방 확률이 민감하게 변동합니다.\n\n- **오늘 단일 방송을 했다면:** 내일 휴방할 확률은 **${stats.probRestAfter1}%** 입니다.\n- **이틀 연속 방송을 했다면:** 내일 연달아 휴방할 확률이 **${stats.probRestAfter2}%** 로 급증합니다.\n- **오늘 3시간 이상 길게 방송했다면:** 체력 소모로 인해 다음 날 휴방 확률은 **${stats.probRestAfterLong}%** 가 됩니다.`
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div id="summary-weekly-trend-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm relative">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-zinc-900 dark:text-white">최근 주간 방송 횟수</h4>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40">{latestYear}년</span>
              <WidgetShareButton targetId="summary-weekly-trend-card" title="최근 주간 방송 횟수" />
            </div>
          </div>
          <div className="h-[200px] w-full">
            {isActive && (<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <LineChart data={stats.trendStatsArray} margin={{ top: 25, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="week" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip content={<CustomTooltip formatter={(value: number) => [`${value}회`, '방송 횟수']} />} cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, fill: '#a855f7' }} animationDuration={300} animationEasing="ease-out">
                  <LabelList 
                    dataKey="count" 
                    content={(props: any) => (
                      <SmartTrendLabel 
                        {...props} 
                        totalPoints={stats.trendStatsArray.length} 
                        strokeColor="#a855f7" 
                        textColor="#7e22ce"
                        className="chart-capture-only-label"
                      />
                    )} 
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>)}
          </div>
        </div>

        <div id="summary-daily-density-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm relative">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-zinc-900 dark:text-white">최근 요일별 집중도</h4>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">{latestYear}년</span>
              <WidgetShareButton targetId="summary-daily-density-card" title="최근 요일별 집중도" />
            </div>
          </div>
          <div className="h-[200px] w-full">
            {isActive && (<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={stats.dailyStatsArray} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="day" stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={false} content={<CustomTooltip formatter={(value: number) => [`${value}회`, '방송 횟수']} />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#3b82f6" animationDuration={300} animationEasing="ease-out">
                  <LabelList dataKey="count" position="top" fill="#2563eb" fontSize={11} offset={4} fontWeight="bold" className="chart-capture-only-label" formatter={(val: number) => `${val}회`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>)}
          </div>
        </div>
      </div>

      <PatternAnalysis guides={dynamicGuides} />
    </div>
  );
}

// Helper to get past months safely
function subMonths(date: Date, amount: number) {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() - amount);
  return newDate;
}
