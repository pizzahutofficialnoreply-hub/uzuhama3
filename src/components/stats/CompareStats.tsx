import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays, subYears, startOfYear, endOfYear, parseISO, differenceInCalendarDays } from 'date-fns';
import { Sparkles } from 'lucide-react';
import type { BroadcastLog } from '../../types';
import { parseTimeTo24, cn } from '../../utils';

/**
 * 분석 › 비교: 기간 두 개를 골라 같은 그래프에 색을 달리해 겹쳐 보고,
 * 표·카테고리는 기간별로 나란히, 위에는 쉽게 읽히는 비교 문장
 */
type Range = { start: string; end: string };
const COLOR_A = '#f59e0b'; // 기간 1 (주황)
const COLOR_B = '#6366f1'; // 기간 2 (남색)
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 방송일 기준 시작 시각 (새벽 0~5시는 전날 방송의 늦은 시각으로 봄)
const BUCKETS = [12, 14, 16, 18, 20, 22, 24, 26, 28];
const bucketLabel = (h: number) => { const x = h % 24; return `${x < 12 ? '오전' : '오후'} ${x % 12 || 12}시`; };

const fmtDur = (h: number) => {
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
};
const fmtClock = (mins: number) => {
  const m = Math.round(mins) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(mm).padStart(2, '0')}`;
};
const shortRange = (r: Range) => {
  const y = (s: string) => `'${s.slice(2, 4)}.${Number(s.slice(5, 7))}`;
  return r.start.slice(0, 7) === r.end.slice(0, 7) ? y(r.start) : `${y(r.start)}~${y(r.end)}`;
};

function statsOf(logs: BroadcastLog[], r: Range) {
  const list = logs.filter((l) => l.date >= r.start && l.date <= r.end && !l.isAbsence);
  const days = Math.max(1, differenceInCalendarDays(parseISO(r.end), parseISO(r.start)) + 1);
  const dayCount = Array(7).fill(0);
  const startMins: number[] = [];
  const durs: number[] = [];
  const hourBucket = Array(BUCKETS.length).fill(0);
  const cats = new Map<string, number>();
  const games = new Map<string, number>();
  list.forEach((l) => {
    dayCount[parseISO(l.date).getDay()]++;
    if (typeof l.time === 'string' && /^\s*\d{1,2}:\d{2}/.test(l.time)) {
      const { hour, minute } = parseTimeTo24(l.time);
      const h = hour < 6 ? hour + 24 : hour;
      startMins.push(h * 60 + minute);
      const bi = BUCKETS.findIndex((b, i) => h >= b && (i === BUCKETS.length - 1 || h < BUCKETS[i + 1]));
      if (bi >= 0) hourBucket[bi]++; else if (h < BUCKETS[0]) hourBucket[0]++;
    }
    if (l.durationHours && l.durationHours > 0) durs.push(l.durationHours);
    const gl = l.games?.length ? l.games : l.game ? [{ name: l.game, category: l.category }] as any[] : [];
    gl.forEach((g: any) => {
      if (g?.name) games.set(g.name, (games.get(g.name) || 0) + 1);
      String(g?.category || l.category || '').split(/[,/]/).map((c) => c.trim()).filter(Boolean).forEach((c) => cats.set(c, (cats.get(c) || 0) + 1));
    });
  });
  const total = list.length;
  const pct = (n: number, of: number) => (of ? (n / of) * 100 : 0);
  const timed = startMins.length;
  const catTotal = [...cats.values()].reduce((a, b) => a + b, 0);
  const topDay = total ? dayCount.indexOf(Math.max(...dayCount)) : -1;
  return {
    total, days,
    perWeek: (total / days) * 7,
    avgDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0,
    avgStart: timed ? startMins.reduce((a, b) => a + b, 0) / timed : null,
    dayPct: dayCount.map((n) => pct(n, total)),
    topDay,
    hourPct: hourBucket.map((n) => pct(n, timed)),
    timed,
    cats: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n, p: pct(n, catTotal) })),
    games: [...games.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n })),
  };
}
type Stats = ReturnType<typeof statsOf>;

/** 쉽게 읽히는 비교 문장 */
function compareLines(A: Stats, B: Stats, la: string, lb: string): string[] {
  const out: string[] = [];
  if (!A.total || !B.total) return [`${!A.total ? la : lb} 기간에는 방송 기록이 없어요. 기간을 다시 골라 주세요.`];
  // 요일
  if (A.topDay >= 0 && B.topDay >= 0) {
    if (A.topDay === B.topDay) out.push(`두 기간 모두 ${DAYS[A.topDay]}요일에 방송이 가장 많았어요.`);
    else out.push(`${la}에는 ${DAYS[A.topDay]}요일에 방송이 가장 많았는데, ${lb}로 올수록 ${DAYS[B.topDay]}요일에 방송이 많아졌어요.`);
  }
  // 가장 크게 바뀐 요일
  const diffs = A.dayPct.map((p, i) => ({ i, d: B.dayPct[i] - p })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  if (diffs[0] && Math.abs(diffs[0].d) >= 8) {
    const x = diffs[0];
    out.push(`${DAYS[x.i]}요일 방송 비중이 ${Math.round(A.dayPct[x.i])}% → ${Math.round(B.dayPct[x.i])}%로 ${x.d > 0 ? '늘었어요' : '줄었어요'}.`);
  }
  // 빈도
  const fw = B.perWeek - A.perWeek;
  if (Math.abs(fw) >= 0.3) out.push(`일주일에 평균 ${A.perWeek.toFixed(1)}번 → ${B.perWeek.toFixed(1)}번으로 방송이 ${fw > 0 ? '잦아졌어요' : '뜸해졌어요'}.`);
  else out.push(`방송 빈도는 일주일에 ${B.perWeek.toFixed(1)}번 정도로 비슷해요.`);
  // 시작 시각
  if (A.avgStart != null && B.avgStart != null) {
    const d = B.avgStart - A.avgStart;
    if (Math.abs(d) >= 20) {
      const m = Math.round(Math.abs(d));
      const gap = m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
      out.push(`평균 시작 시각은 ${fmtClock(A.avgStart)} → ${fmtClock(B.avgStart)}로 ${gap} ${d > 0 ? '늦어졌어요' : '빨라졌어요'}.`);
    } else out.push(`시작 시각은 두 기간 모두 ${fmtClock(B.avgStart)} 무렵으로 비슷해요.`);
  }
  // 길이
  if (A.avgDur && B.avgDur) {
    const d = B.avgDur - A.avgDur;
    if (Math.abs(d) >= 0.25) out.push(`방송 길이는 평균 ${fmtDur(A.avgDur)} → ${fmtDur(B.avgDur)}로 ${d > 0 ? '길어졌어요' : '짧아졌어요'}.`);
  }
  // 카테고리
  const ca = A.cats[0]?.name, cb = B.cats[0]?.name;
  if (ca && cb) {
    if (ca === cb) out.push(`가장 많이 한 장르는 두 기간 모두 ${ca}예요.`);
    else out.push(`${la}에는 ${ca} 게임을 가장 많이 했는데, ${lb}에는 ${cb}이(가) 가장 많아요.`);
  }
  return out;
}

const today = () => format(new Date(), 'yyyy-MM-dd');
function presets(firstDate: string) {
  const t = new Date();
  const y = t.getFullYear();
  const list: { key: string; label: string; r: Range }[] = [
    { key: '30', label: '최근 30일', r: { start: format(subDays(t, 30), 'yyyy-MM-dd'), end: today() } },
    { key: '90', label: '최근 90일', r: { start: format(subDays(t, 90), 'yyyy-MM-dd'), end: today() } },
    { key: 'p90', label: '그 전 90일', r: { start: format(subDays(t, 180), 'yyyy-MM-dd'), end: format(subDays(t, 91), 'yyyy-MM-dd') } },
    { key: '1y', label: '최근 1년', r: { start: format(subYears(t, 1), 'yyyy-MM-dd'), end: today() } },
  ];
  for (let yy = y; yy >= Number(firstDate.slice(0, 4)); yy--) {
    const d = new Date(yy, 5, 1);
    list.push({ key: `y${yy}`, label: `${yy}년`, r: { start: format(startOfYear(d), 'yyyy-MM-dd'), end: format(endOfYear(d), 'yyyy-MM-dd') } });
  }
  return list;
}

function RangePicker({ label, color, value, onChange, firstDate }: { label: string; color: string; value: Range; onChange: (r: Range) => void; firstDate: string }) {
  const ps = useMemo(() => presets(firstDate), [firstDate]);
  const cur = ps.find((p) => p.r.start === value.start && p.r.end === value.end)?.key || '';
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2.5" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <div className="flex items-center gap-2 pl-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-sm font-black text-zinc-900 dark:text-white">{label}</span>
        <span className="text-xs text-zinc-500 tabular-nums">{value.start} ~ {value.end}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pl-1.5" data-no-swipe>
        {ps.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange(p.r)}
            className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer', cur === p.key ? 'text-white border-transparent' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700')}
            style={cur === p.key ? { background: color } : undefined}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pl-1.5">
        <input type="date" value={value.start} min={firstDate} onChange={(e) => e.target.value && onChange({ ...value, start: e.target.value })}
          className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white" aria-label={`${label} 시작일`} />
        <span className="text-zinc-400 text-xs">~</span>
        <input type="date" value={value.end} min={value.start} onChange={(e) => e.target.value && onChange({ ...value, end: e.target.value })}
          className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-white" aria-label={`${label} 종료일`} />
      </div>
    </div>
  );
}

const card = 'rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6';
const tip = { contentStyle: { borderRadius: 12, border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,.15)', fontSize: 12 } };

export function CompareStats({ logs, firstDate }: { logs: BroadcastLog[]; firstDate: string }) {
  const t = new Date();
  const [a, setA] = useState<Range>({ start: format(subDays(t, 180), 'yyyy-MM-dd'), end: format(subDays(t, 91), 'yyyy-MM-dd') });
  const [b, setB] = useState<Range>({ start: format(subDays(t, 90), 'yyyy-MM-dd'), end: today() });
  const A = useMemo(() => statsOf(logs, a), [logs, a]);
  const B = useMemo(() => statsOf(logs, b), [logs, b]);
  const la = `기간 1(${shortRange(a)})`, lb = `기간 2(${shortRange(b)})`;
  const lines = useMemo(() => compareLines(A, B, la, lb), [A, B, la, lb]);
  const dayData = DAYS.map((d, i) => ({ name: d, A: Math.round(A.dayPct[i] * 10) / 10, B: Math.round(B.dayPct[i] * 10) / 10 }));
  const hourData = BUCKETS.map((h, i) => ({ name: bucketLabel(h), A: Math.round(A.hourPct[i] * 10) / 10, B: Math.round(B.hourPct[i] * 10) / 10 }));
  const rows: [string, string, string][] = [
    ['방송 횟수', `${A.total}번`, `${B.total}번`],
    ['일주일 평균', `${A.perWeek.toFixed(1)}번`, `${B.perWeek.toFixed(1)}번`],
    ['평균 방송 길이', A.avgDur ? fmtDur(A.avgDur) : '-', B.avgDur ? fmtDur(B.avgDur) : '-'],
    ['평균 시작 시각', A.avgStart != null ? fmtClock(A.avgStart) : '-', B.avgStart != null ? fmtClock(B.avgStart) : '-'],
    ['가장 많은 요일', A.topDay >= 0 ? `${DAYS[A.topDay]}요일` : '-', B.topDay >= 0 ? `${DAYS[B.topDay]}요일` : '-'],
    ['가장 많은 장르', A.cats[0]?.name || '-', B.cats[0]?.name || '-'],
  ];

  return (
    <div className="space-y-5 min-w-0" data-testid="stats-compare">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
        <RangePicker label="기간 1" color={COLOR_A} value={a} onChange={setA} firstDate={firstDate} />
        <RangePicker label="기간 2" color={COLOR_B} value={b} onChange={setB} firstDate={firstDate} />
      </div>

      {/* 비교 한눈에 */}
      <div className={cn(card, 'bg-gradient-to-br from-indigo-50/60 to-amber-50/40 dark:from-indigo-950/20 dark:to-amber-950/10')}>
        <h3 className="flex items-center gap-1.5 text-[15px] font-black text-zinc-900 dark:text-white"><Sparkles className="w-4 h-4 text-indigo-500" /> 이렇게 달라졌어요</h3>
        <ul className="mt-3 space-y-2">
          {lines.map((s, i) => <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed break-keep flex gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />{s}</li>)}
        </ul>
      </div>

      {/* 표: 나란히 */}
      <div className={card}>
        <h3 className="text-[15px] font-black text-zinc-900 dark:text-white">숫자로 보기</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="text-left font-semibold py-2">항목</th>
              <th className="text-right font-bold py-2" style={{ color: COLOR_A }}>기간 1</th>
              <th className="text-right font-bold py-2" style={{ color: COLOR_B }}>기간 2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(([k, x, y]) => (
              <tr key={k}><td className="py-2.5 text-zinc-600 dark:text-zinc-400">{k}</td><td className="py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-white">{x}</td><td className="py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-white">{y}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 그래프: 겹쳐서 (기간 길이가 달라도 비교되게 % 로) */}
      <div className={card}>
        <h3 className="text-[15px] font-black text-zinc-900 dark:text-white">요일별 방송 비중</h3>
        <p className="text-xs text-zinc-500 mt-0.5">각 기간 방송 중 그 요일 비율 (%)</p>
        <div className="h-56 mt-3 -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,.18)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={34} unit="%" />
              <Tooltip {...tip} formatter={(v: any, n: any) => [`${v}%`, n === 'A' ? '기간 1' : '기간 2']} />
              <Legend formatter={(v) => (v === 'A' ? '기간 1' : '기간 2')} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="A" fill={COLOR_A} radius={[5, 5, 0, 0]} />
              <Bar dataKey="B" fill={COLOR_B} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-[15px] font-black text-zinc-900 dark:text-white">시작 시간대</h3>
        <p className="text-xs text-zinc-500 mt-0.5">시작 시각이 있는 방송 중 그 시간대 비율 (%) · 기간 1 {A.timed}개 · 기간 2 {B.timed}개</p>
        {A.timed + B.timed === 0 ? <p className="mt-4 text-sm text-zinc-400">두 기간 모두 시작 시각 기록이 없어요.</p> : (
        <div className="h-56 mt-3 -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,.18)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} interval={0} angle={-30} textAnchor="end" height={44} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={34} unit="%" />
              <Tooltip {...tip} formatter={(v: any, n: any) => [`${v}%`, n === 'A' ? '기간 1' : '기간 2']} />
              <Legend formatter={(v) => (v === 'A' ? '기간 1' : '기간 2')} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="A" stroke={COLOR_A} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="B" stroke={COLOR_B} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* 카테고리: 기간별로 따로 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
        {([['기간 1', A, COLOR_A, a], ['기간 2', B, COLOR_B, b]] as const).map(([name, S, color, r]) => (
          <div key={name} className={card}>
            <h3 className="text-[15px] font-black flex items-center gap-1.5" style={{ color }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> {name} 장르 · 게임</h3>
            <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">{r.start} ~ {r.end}</p>
            {S.cats.length === 0 ? <p className="mt-3 text-sm text-zinc-400">기록이 없어요.</p> : (
              <ul className="mt-3 space-y-2">
                {S.cats.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-xs"><span className="font-bold text-zinc-800 dark:text-zinc-100">{c.name}</span><span className="text-zinc-500 tabular-nums">{c.n}번 · {Math.round(c.p)}%</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.p}%`, background: color }} /></div>
                  </li>
                ))}
              </ul>
            )}
            {S.games.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {S.games.map((g) => <span key={g.name} className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{g.name} <b className="text-zinc-900 dark:text-white">{g.n}</b></span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
