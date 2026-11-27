/**
 * 분석 탭 첫 화면 '요약': 고른 기간을 토스 홈 카드처럼 큰 숫자 줄로
 * 줄을 누르면 그 내용을 자세히 보는 하위 탭으로 (추이 · 요일·시간 · 카테고리)
 */
import { useMemo } from 'react';
import { parseISO, getDay, format } from 'date-fns';
import { CalendarDays, Clock, Timer, Sunrise, CalendarRange, Gamepad2 } from 'lucide-react';
import type { BroadcastLog } from '../../types';
import { Section, Row, Tint, hoursText } from '../home/TossHome';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function StatsSummary({ logs, start, end, onGo }: {
  logs: BroadcastLog[];
  start: string;
  end: string;
  onGo: (sub: 'trend' | 'day' | 'category') => void;
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

  if (!s.n) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[26px] px-6 py-10 text-center">
        <p className="text-[17px] font-bold font-hanna font-pro text-zinc-900 dark:text-white">이 기간에는 방송이 없어요</p>
        <p className="mt-1 text-[13px] text-zinc-500">{range}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 stagger">
      <div className="px-2 pt-1">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{range}</p>
        <p className="mt-0.5 text-[24px] sm:text-[26px] leading-tight font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em] break-keep">
          {s.n}번{s.avg > 0 ? `, 평균 ${hoursText(s.avg)}씩` : ''} 방송했어요
        </p>
      </div>

      <Section title="방송" onMore={() => onGo('trend')}>
        <Row onClick={() => onGo('trend')} icon={<Tint tone="emerald"><CalendarDays /></Tint>} caption="방송한 날" value={`${s.n}번`} />
        {s.hours > 0 && <Row onClick={() => onGo('trend')} icon={<Tint tone="amber"><Clock /></Tint>} caption="모두 합친 시간" value={hoursText(s.hours)} />}
        {s.avg > 0 && <Row onClick={() => onGo('trend')} icon={<Tint tone="purple"><Timer /></Tint>} caption="한 번에 평균" value={hoursText(s.avg)} />}
      </Section>

      <Section title="언제 했나" onMore={() => onGo('day')}>
        {s.topDay >= 0 && <Row onClick={() => onGo('day')} icon={<Tint tone="rose"><CalendarRange /></Tint>} caption="제일 많이 한 요일" value={`${DAYS[s.topDay]}요일 · ${s.topDayN}번`} />}
        {s.avgStart !== null && <Row onClick={() => onGo('day')} icon={<Tint tone="amber"><Sunrise /></Tint>} caption="보통 시작한 시간" value={clock(s.avgStart)} />}
      </Section>

      {s.games.length > 0 && (
        <Section title="많이 한 게임" onMore={() => onGo('category')}>
          {s.games.slice(0, 3).map(([name, c], i) => (
            <Row key={name} onClick={() => onGo('category')} icon={<Tint tone={i === 0 ? 'purple' : 'zinc'}><Gamepad2 /></Tint>} caption={`${i + 1}위 · ${c}번`} value={name} />
          ))}
        </Section>
      )}
    </div>
  );
}
