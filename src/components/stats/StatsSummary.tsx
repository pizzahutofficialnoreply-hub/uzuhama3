/**
 * 분석 탭 각 하위 탭(추이 · 요일·시간 · 카테고리) 맨 위 요약
 */
import { josa } from '../../utils/josa';
import { useMemo } from 'react';
import { parseISO, getDay, format } from 'date-fns';
import { CalendarDays, Clock, Timer, Sunrise, Sun, Sunset, Moon, CalendarRange, Gamepad2, ChevronRight, Flame, Coffee, Shapes, Layers } from 'lucide-react';
import type { BroadcastLog } from '../../types';
import { Row, Tint, hoursText } from '../home/TossHome';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 분석 탭 각 하위 탭 맨 위: 그 탭 내용을 한 문장 + 큰 숫자 줄로 (토스식) */
/** 보통 시작한 시간: '밤 9시대'처럼 대략 + 시간대별 아이콘 */
function startLabel(min: number) {
  const h = Math.floor(min / 60) % 24;
  const when = h < 5 ? '새벽' : h < 9 ? '아침' : h < 12 ? '오전' : h < 18 ? '오후' : h < 21 ? '저녁' : '밤';
  const h12 = h % 12 || 12;
  const icon = h >= 5 && h < 9 ? <Sunrise /> : h >= 9 && h < 17 ? <Sun /> : h >= 17 && h < 20 ? <Sunset /> : <Moon />;
  const tone: 'amber' | 'purple' | 'rose' = h >= 5 && h < 17 ? 'amber' : h >= 17 && h < 20 ? 'rose' : 'purple';
  return { text: `${when} ${h12}시대`, icon, tone };
}

export function StatsSummary({ logs, start, end, part, withDay, onSearch, onCategory }: {
  /** 1위 카테고리를 누르면 검색 탭에서 그 카테고리 */
  onCategory?: (cat: string) => void;
  /** 순위 게임을 누르면 검색 탭에서 그 게임 */
  onSearch?: (q: string) => void;
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
    // 카테고리 (아래 카테고리 표와 같은 셈: 게임마다 쉼표·빗금으로 나눈 장르 하나하나를 1회)
    const cat: Record<string, number> = {};
    let catTotal = 0;
    on.forEach((l) => {
      const list = l.games?.length ? l.games : l.game ? [{ name: l.game, category: l.category || '종합' } as any] : [];
      list.forEach((x: any) => {
        if (!String(x?.name || '').trim()) return;
        const cs = String(x.category || l.category || '기타').split(/[,/]/).map((c) => c.trim()).filter(Boolean);
        (cs.length ? cs : ['기타']).forEach((c) => { cat[c] = (cat[c] || 0) + 1; catTotal++; });
      });
    });
    const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]);
    // 연속 방송·연속 쉰 날 (기간 첫날 ~ 오늘/마지막 날, 하루 단위)
    const onDays = new Set(on.map((l) => l.date));
    const today = format(new Date(), 'yyyy-MM-dd');
    const last = end < today ? end : today;
    let run = 0, rest = 0, maxRun = 0, maxRest = 0, days = 0;
    for (let d = parseISO(start); format(d, 'yyyy-MM-dd') <= last && days < 20000; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      days++;
      if (onDays.has(format(d, 'yyyy-MM-dd'))) { run++; rest = 0; maxRun = Math.max(maxRun, run); }
      else { rest++; run = 0; maxRest = Math.max(maxRest, rest); }
    }
    return { n: on.length, hours, avg, avgStart, topDay, topDayN: topDay >= 0 ? dayCnt[topDay] : 0, games, cats, catTotal, days, maxRun, maxRest };
  }, [logs, start, end]);

  const range = `${format(parseISO(start), 'yyyy.M.d')} ~ ${format(parseISO(end), 'yyyy.M.d')}`;
  if (!s.n) return null;

  const head =
    part === 'trend' ? `${s.n}번${s.avg > 0 ? `, 평균 ${hoursText(s.avg)}씩` : ''} 방송했어요`
    : part === 'day' ? (s.topDay >= 0 ? `${DAYS[s.topDay]}요일에 제일 많이 했어요` : '')
    : s.games[0] ? (s.games[0][1] >= 2 ? `${josa(s.games[0][0], '을/를')} 제일 많이 했어요` : `${s.games.length}개 게임을 한 번씩 했어요`) : '';

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[26px] px-3 pt-5 pb-2.5">
      <div className="px-3 pb-2">
        <p className="text-[length:calc(13px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 tabular-nums">{range}</p>
        <p className="mt-0.5 text-[length:calc(22px*var(--fs,1))] sm:text-[length:calc(24px*var(--fs,1))] leading-tight font-bold font-hanna font-pro text-zinc-900 dark:text-white tracking-[-0.01em] break-keep">{head}</p>
      </div>
      {part === 'trend' && <>
        <Row icon={<Tint tone="emerald"><CalendarDays /></Tint>} caption={s.days ? `방송한 날 · ${s.days}일 중` : '방송한 날'} value={s.days ? `${s.n}번 (${Math.round((s.n / s.days) * 1000) / 10}%)` : `${s.n}번`} />
        {s.hours > 0 && <Row icon={<Tint tone="amber"><Clock /></Tint>} caption="모두 합친 시간" value={hoursText(s.hours)} />}
        {s.avg > 0 && <Row icon={<Tint tone="purple"><Timer /></Tint>} caption="한 번에 평균" value={hoursText(s.avg)} />}
      </>}
      {(part === 'day' || (withDay && part === 'trend')) && <>
        {s.topDay >= 0 && <Row icon={<Tint tone="rose"><CalendarRange /></Tint>} caption="제일 많이 한 요일" value={`${DAYS[s.topDay]}요일 · ${s.topDayN}번`} />}
        {s.avgStart !== null && (() => { const l = startLabel(s.avgStart); return <Row icon={<Tint tone={l.tone}>{l.icon}</Tint>} caption="보통 시작한 시간" value={l.text} />; })()}
      </>}
      {part === 'day' && <>
        {s.maxRun > 0 && <Row icon={<Tint tone="amber"><Flame /></Tint>} caption="쉬지 않고 제일 오래" value={`${s.maxRun}일 연속 방송`} />}
        {s.maxRest > 0 && <Row icon={<Tint tone="zinc"><Coffee /></Tint>} caption="제일 오래 쉰 기간" value={`${s.maxRest}일`} />}
      </>}
      {/* 순위는 2번 이상 한 게임만 (1번씩 한 게임이 3위로 보이면 헷갈려서) · 나머지는 한 줄로 묶음 */}
      {part === 'category' && (() => {
        const ranked = s.games.filter(([, c]) => c >= 2).slice(0, 3);
        const once = s.games.filter(([, c]) => c < 2).length;
        return <>
          {ranked.map(([name, c], i) => (
            <Row key={name} onClick={onSearch ? () => onSearch(name) : undefined} icon={<Tint tone={i === 0 ? 'purple' : 'zinc'}><Gamepad2 /></Tint>} caption={`${i + 1}위 · ${c}번`} value={name}
              right={onSearch ? <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0" /> : undefined} />
          ))}
          {once > 0 && ranked.length < 3 && (
            <Row icon={<Tint tone="zinc"><Gamepad2 /></Tint>} caption="한 번씩 한 게임" value={`${once}개`} />
          )}
          {s.cats[0] && (
            <Row onClick={onCategory ? () => onCategory(s.cats[0][0]) : undefined} icon={<Tint tone="emerald"><Shapes /></Tint>} caption={`제일 많이 한 장르 · ${s.cats[0][1]}번 (${Math.round((s.cats[0][1] / Math.max(1, s.catTotal)) * 1000) / 10}%)`} value={s.cats[0][0]}
              right={onCategory ? <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0" /> : undefined} />
          )}
          <Row icon={<Tint tone="zinc"><Layers /></Tint>} caption="모두 합쳐" value={`게임 ${s.games.length}개 · 장르 ${s.cats.length}개`} />
        </>;
      })()}
    </div>
  );
}
