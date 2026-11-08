import { useMemo, useEffect, useState } from 'react';
import { PatternAnalysis } from '../PatternAnalysis';
import { WidgetShareButton } from '../common/WidgetShareButton';
import { IllnessInfoModal } from '../IllnessInfoModal';
import { AppData } from '../../types';
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, isSameDay, addDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';
import { CustomTooltip, DottedBarCursor } from '../CustomTooltip';
import { SmartTrendLabel } from '../stats/SmartTrendLabel';
import { parseTimeString, parseTimeTo24, formatWeekTick } from '../../utils';
import { computeRecentPatternStats } from '../../utils/probability';

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

  const startDate = `${latestYear}-01-01`;
  const endDate = format(new Date(), 'yyyy-MM-dd');

  const logsArray = useMemo(() => {
    return Object.values(data.logs || {}).filter(log => log.date >= startDate && log.date <= endDate);
  }, [data.logs, startDate, endDate]);

  const stats = useMemo(() => {
    const dailyMap: Record<string, number> = { '일': 0, '월': 0, '화': 0, '수': 0, '목': 0, '금': 0, '토': 0 };
    const timeMap: Record<string, number> = {};
    const trendMap: Record<string, { count: number; dates: Set<string> }> = {};
    const dailyTimeMap: Record<string, Record<string, number>> = { '일': {}, '월': {}, '화': {}, '수': {}, '목': {}, '금': {}, '토': {} };

    // 분석 탭(DetailedStatsTab)과 100% 동일하게 조회 기간 내 모든 주차(0회 방송 주차 포함) 사전 생성
    let rangeStartWeek: Date | null = null;
    let rangeEndWeek: Date | null = null;
    if (startDate && endDate) {
      const pStart = parseISO(startDate);
      const pEnd = parseISO(endDate);
      if (!isNaN(pStart.getTime()) && !isNaN(pEnd.getTime())) {
        rangeStartWeek = startOfWeek(pStart);
        rangeEndWeek = startOfWeek(pEnd);
      }
    }
    if (!rangeStartWeek || !rangeEndWeek) {
      if (logsArray.length > 0) {
        const sortedD = logsArray.map(l => l.date).filter(Boolean).sort();
        rangeStartWeek = startOfWeek(parseISO(sortedD[0]));
        rangeEndWeek = startOfWeek(parseISO(sortedD[sortedD.length - 1]));
      }
    }

    if (rangeStartWeek && rangeEndWeek && rangeStartWeek <= rangeEndWeek) {
      let curW = new Date(rangeStartWeek);
      while (curW <= rangeEndWeek) {
        const wKey = format(curW, 'yyyy-MM-dd');
        trendMap[wKey] = { count: 0, dates: new Set() };
        curW = addDays(curW, 7);
      }
    }

    logsArray.forEach(log => {
      const dateObj = parseISO(log.date);
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      dailyMap[dayNames[dateObj.getDay()]]++;

      // 시작 시각이 없는 기록(2025년 이전 아카이브)은 시간대 집계에서 제외 (없으면 '오전 12:00'으로 잘못 잡힘)
      if (typeof log.time === 'string' && /^\s*\d{1,2}:\d{2}/.test(log.time)) {
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
      }

      // 분석 탭(DetailedStatsTab)과 100% 동일한 주간 기준일자 및 집계 로직 적용
      const weekStart = format(startOfWeek(dateObj), 'yyyy-MM-dd');
      if (!trendMap[weekStart]) trendMap[weekStart] = { count: 0, dates: new Set() };
      trendMap[weekStart].count++;
      trendMap[weekStart].dates.add(log.date);
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

    // 분석 탭(DetailedStatsTab)과 100% 동일한 데이터 구조 및 포맷 산출
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
        // 축·툴팁은 연도까지 포함한 고유 키로 (기간이 1년을 넘으면 MM/dd 가 겹쳐 툴팁이 엉뚱한 주를 가리키던 문제)
        weekKey: week,
        weekFull: format(weekStartDate, 'yyyy.MM.dd'),
        count: trendMap[week].count,
        datesDesc: trendMap[week].dates.size > 0 ? Array.from(trendMap[week].dates).sort().map((d) => format(parseISO(d), 'M/d')).join(', ') : '방송 없음 (0회)'
      };
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

  const [selectedIllness, setSelectedIllness] = useState<{
    name: string;
    summary?: string;
    source?: string;
    sourceUrl?: string;
  } | null>(null);

  const rawAbsenceReason = data.system?.absenceReason || '';
  const isDirectInput = rawAbsenceReason === '직접 입력' || rawAbsenceReason === '기타 (직접 입력)';
  const isIllness = rawAbsenceReason === '병명';

  const displayAbsenceReason = isDirectInput
    ? (data.system?.customAbsenceReason || '직접 입력한 사유')
    : isIllness
    ? (data.system?.illnessName || '병명')
    : rawAbsenceReason;

  const illnessNameForGuide = isIllness ? (data.system?.illnessName || '병명') : undefined;

  // 예측 가이드: 메인 확률 카드와 같은 최근 60일 기준
  const recentPattern = useMemo(
    () => computeRecentPatternStats(Object.values(data.logs || {})),
    [data.logs]
  );

  // Dynamically generate guides based on actual data
  const dynamicGuides = [
    ...(data.system?.absenceReason ? [{
      id: 'guide-0',
      title: '⚠️ 장기 휴방 사유 안내',
      content: `현재 우주하마님은 **${displayAbsenceReason}** 사유로 휴방 중이에요.${data.system.absenceDuration ? ` (예상 기간: **${data.system.absenceDuration}**)` : ''} 이로 인해 평소 패턴과 다르게 당분간 휴방이 지속될 가능성이 높으니 참고해 주세요.`,
      illnessName: illnessNameForGuide,
      illnessSummary: isIllness ? data.system?.illnessSummary : undefined,
      illnessSource: isIllness ? data.system?.illnessSource : undefined,
      illnessSourceUrl: isIllness ? data.system?.illnessSourceUrl : undefined,
    }] : []),
    ...(() => {
      const r = recentPattern;
      const period = r.isFallback
        ? `최근 60일 동안 방송이 없어 마지막 방송 전 60일(**${r.windowStart.slice(5).replace('-', '/')}~${r.windowEnd.slice(5).replace('-', '/')}**)`
        : '최근 60일';
      const periodShort = r.isFallback ? '같은 기간' : '최근 60일';
      if (r.streamCount === 0) {
        return [{ id: 'guide-1', title: '최근 60일 방송 패턴', content: `최근 60일(**${r.windowStart.slice(5).replace('-', '/')}~${r.windowEnd.slice(5).replace('-', '/')}**) 동안 방송 기록이 없어요.${r.prevWeeklyAvg ? ` 그 전 60일에는 주 평균 **${r.prevWeeklyAvg}회** 방송했어요.` : ''}` }];
      }
      const dowRate = (d: string) => r.byDow.find((w) => w.day === d);
      const top = r.topDays.map((d) => `**${d}요일**(${dowRate(d)?.count}/${dowRate(d)?.occurrences}회)`).join(', ');
      const bottom = r.bottomDay ? dowRate(r.bottomDay) : undefined;
      const trend = r.prevWeeklyAvg === null
        ? ''
        : r.weeklyAvg > r.prevWeeklyAvg + 0.3
          ? ` 그 전 60일(주 **${r.prevWeeklyAvg}회**)보다 늘었어요.`
          : r.weeklyAvg < r.prevWeeklyAvg - 0.3
            ? ` 그 전 60일(주 **${r.prevWeeklyAvg}회**)보다 줄었어요.`
            : ` 그 전 60일(주 **${r.prevWeeklyAvg}회**)과 비슷해요.`;
      const nd = r.nextDayRate;
      const lines = [
        nd.afterOne !== null ? `- **하루 쉬고 방송한 다음 날:** 이어서 방송할 확률 **${nd.afterOne}%** (${nd.samples.one}회 기준)` : '',
        nd.afterTwo !== null ? `- **이틀 이상 연속 방송한 다음 날:** 또 방송할 확률 **${nd.afterTwo}%** (${nd.samples.two}회 기준)` : '',
        nd.afterLong !== null ? `- **3시간 이상 방송한 다음 날:** 방송할 확률 **${nd.afterLong}%** (${nd.samples.long}회 기준)` : '',
      ].filter(Boolean);
      return [
        {
          id: 'guide-1',
          title: '최근 60일 방송 요일과 시간',
          content: `${period} 기준 방송이 가장 잦은 요일은 ${top}이에요.${r.typicalStart ? ` 방송은 보통 **${r.typicalStart}** 즈음 시작했어요.` : ''}${bottom ? ` 가장 드문 요일은 **${bottom.day}요일**(${bottom.count}/${bottom.occurrences}회)이에요.` : ''}`
        },
        {
          id: 'guide-2',
          title: '최근 60일 방송 빈도',
          content: `${periodShort} 동안 **${r.streamCount}회**, 주 평균 **${r.weeklyAvg}회** 방송했어요.${trend}`
        },
        ...(lines.length
          ? [{
              id: 'guide-3',
              title: '방송 다음 날 패턴',
              content: `${periodShort} 기록에서 방송한 다음 날의 실제 방송 비율이에요.\n\n${lines.join('\n')}`
            }]
          : [])
      ];
    })()
  ];

  return (
    <div className="space-y-6">
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
                <XAxis dataKey="weekKey" tickFormatter={(k: string) => formatWeekTick(k, stats.trendStatsArray.length)} minTickGap={12} stroke="#a1a1aa" fontSize={14} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload || !payload.length) return null;
                    const dataItem = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-lg text-xs space-y-1">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{dataItem?.weekFull || label} 주간</p>
                        <p className="text-purple-600 dark:text-purple-400 font-extrabold">{payload[0].value}회 방송</p>
                        {dataItem?.datesDesc && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{dataItem.datesDesc}</p>
                        )}
                      </div>
                    );
                  }}
                  cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '3 3' }} 
                />
                <Line type="monotone" dataKey="count" stroke="#7791c1" strokeWidth={stats.trendStatsArray.length > 26 ? 2.75 : 3.5} dot={stats.trendStatsArray.length > 26 ? false : { r: 4, fill: '#7791c1' }} animationDuration={300} animationEasing="ease-out">
                  <LabelList 
                    dataKey="count" 
                    content={(props: any) => (
                      <SmartTrendLabel 
                        {...props} 
                        totalPoints={stats.trendStatsArray.length} values={stats.trendStatsArray.map((d: any) => d.count)} 
                        strokeColor="#7791c1" 
                        textColor="#5d76a6"
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
                <RechartsTooltip 
                  cursor={<DottedBarCursor />} 
                  position={{ y: 0 }}
                  wrapperStyle={{ zIndex: 1000, pointerEvents: 'none' }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={<CustomTooltip formatter={(value: number) => [`${value}회`, '방송 횟수']} />} 
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#7791c1" animationDuration={300} animationEasing="ease-out">
                  <LabelList dataKey="count" position="top" fill="#5d76a6" fontSize={11} offset={4} fontWeight="bold" className="chart-capture-only-label" formatter={(val: number) => `${val}회`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>)}
          </div>
        </div>
      </div>

      <PatternAnalysis guides={dynamicGuides} onIllnessClick={setSelectedIllness} />

      {selectedIllness && (
        <IllnessInfoModal
          illnessName={selectedIllness.name}
          summary={selectedIllness.summary}
          source={selectedIllness.source}
          sourceUrl={selectedIllness.sourceUrl}
          onClose={() => setSelectedIllness(null)}
        />
      )}
    </div>
  );
}

// Helper to get past months safely
function subMonths(date: Date, amount: number) {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() - amount);
  return newDate;
}
