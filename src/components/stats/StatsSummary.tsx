/**
 * 분석 탭 각 하위 탭(추이 · 요일·시간 · 카테고리) 맨 위 요약
 */
import { useMemo } from 'react';
import { parseISO, getDay, format } from 'date-fns';
import { CalendarDays, Clock, Timer, Sunrise, CalendarRange, Gamepad2 } from 'lucide-react';
import type { BroadcastLog } from '../../types';
import { Row, Tint, hoursText } from '../home/TossHome';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 분석 탭 각 하위 탭 맨 위: 그 탭 내용을 한 문장 + 큰 숫자 줄로 (토스식) */
export function StatsSummary({ logs, start, end, part, withDay }: {
  /** 예전 기록(~2025): 추이 탭이 요일까지 합쳐 보여 줘서 요일 줄도 */
  withDay?: boolean;
  logs: BroadcastLog[];
  start: string;
  end: string;
  part: 'trend' | 'day' | 'category';
}) {
  const s = useMemo(() => {
    const on = logs.filter((l) => l?.date && !l.isAbsence);
    const hours = on.reduce((a, l) => a + (l.durationHours || 0), 0);
    const withH = on.filter((l) => l.durationHours > 0);
    const avg = withH.length ? hours / withH.length : 0;
    // 시작 시간 평균 (새벽 6시 전은 전날 밤으로 보고 +24시간)
    const starts = on.map((l) => l.time).filter((t): t is string => /^\d{1,2}:\d{2}$/.test(t || '')).map((t) => { const [h, m] = t.split(':').map(Number); const v = h * 60 + m; return v < 360 ? v + 1440 : v; });
    const avgStart = starts.length ? Math.round(starts.reduce((a, b) => a + b, 0) / starts.length) % 1440 : null;
    const dayCnt = Array(7).fill(0); on.forEach((l) => { dayCnt[getDay(parseISO(l.date))]++; });
    const topDay = on.length ? dayCnt.indexOf(Math.max(...dayCnt)) : -1;
    const g: Record<string, number> = {};
    on.forEach((l) => (l.games?.length ? l.games.map((x) => x.name) : [l.game]).forEach((n) => { if (n) g[n] = (g[n] || 0) + 1; }));
    const games = Object.entries(g).sort((a, b) => b[1] - a[1]);
    return { n: on.length, hours, avg, avgStart, topDay, topDayN: topDay >= 0 ? dayCnt[topDay] : 0, games };
  }, [logs]);

  const clock = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${mm ? ` ${mm}분` : ''}`; };
  const range = `${format(parseISO(start), 'yyyy.M.d')} ~ ${format(parseISO(end), 'yyyy.M.d')}`;
  if (!s.n) return null;

  const head =
    part === 'trend' ? `${s.n}번${s.avg > 0 ? `, 평균 ${hoursText(s.avg)}씩` : ''} 방송했어요`
    : part === 'day' ? (s.topDay >= 0 ? `${DAYS[s.topDay]}요일에 제일 많이 했어요` : '')
    : s.games[0] ? `${s.games[0][0]}을(를) 제일 많이 했어요` : '';

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[26px] px-3 pt-5 pb-2.5">
      <div className="px-3 pb-2">
        <p className="text-[length:calc(13px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 tabular-nums">{range}</p>
        <p className="mt-0.5 text-[length:calc(22px*var(--fs,1))] sm:text-[length:calc(24px*var(--fs,1))] leading-tight font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em] break-keep">{head}</p>
      </div>
      {part === 'trend' && <>
        <Row icon={<Tint tone="emerald"><CalendarDays /></Tint>} caption="방송한 날" value={`${s.n}번`} />
        {s.hours > 0 && <Row icon={<Tint tone="amber"><Clock /></Tint>} caption="모두 합친 시간" value={hoursText(s.hours)} />}
        {s.avg > 0 && <Row icon={<Tint tone="purple"><Timer /></Tint>} caption="한 번에 평균" value={hoursText(s.avg)} />}
      </>}
      {(part === 'day' || (withDay && part === 'trend')) && <>
        {s.topDay >= 0 && <Row icon={<Tint tone="rose"><CalendarRange /></Tint>} caption="제일 많이 한 요일" value={`${DAYS[s.topDay]}요일 · ${s.topDayN}번`} />}
        {s.avgStart !== null && <Row icon={<Tint tone="amber"><Sunrise /></Tint>} caption="보통 시작한 시간" value={clock(s.avgStart)} />}
      </>}
      {part === 'category' && s.games.slice(0, 3).map(([name, c], i) => (
        <Row key={name} icon={<Tint tone={i === 0 ? 'purple' : 'zinc'}><Gamepad2 /></Tint>} caption={`${i + 1}위 · ${c}번`} value={name} />
      ))}
    </div>
  );
}
