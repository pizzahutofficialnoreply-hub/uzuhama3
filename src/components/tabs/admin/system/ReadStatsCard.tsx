import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { auth } from '../../../../lib/firebase';

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

type Day = { day: string; s?: Record<string, Record<string, number>>; c?: Record<string, number>; sessions?: number; h?: Record<string, Record<string, number>>; ch?: Record<string, number> };
const HOURS = Array.from({ length: 24 }, (_, i) => `h${String(i).padStart(2, '0')}`);

/** DB 읽기 출처: 서버(요청 경로 › 컬렉션)·방문자 기기(컬렉션)별로 오늘·어제 몇 번 읽었는지 (무료 한도 하루 5만) */
export function ReadStatsCard() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [err, setErr] = useState('');
  const [idx, setIdx] = useState(0);
  const [hour, setHour] = useState<string | null>(null);
  const load = async () => {
    setErr('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${API_BASE}/api/health?readstat=1`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || r.status);
      setDays(j.days || []);
    } catch (e: any) { setErr(String(e?.message || e)); }
  };
  useEffect(() => { void load(); }, []);

  const d = days?.[idx];
  const server: { k: string; n: number }[] = [];
  Object.entries(d?.s || {}).forEach(([route, cols]) => Object.entries(cols || {}).forEach(([col, n]) => server.push({ k: `${route} › ${col}`, n: Number(n) || 0 })));
  server.sort((a, b) => b.n - a.n);
  const client = Object.entries(d?.c || {}).map(([k, n]) => ({ k, n: Number(n) || 0 })).sort((a, b) => b.n - a.n);
  const sTotal = server.reduce((a, x) => a + x.n, 0);
  const cTotal = client.reduce((a, x) => a + x.n, 0);
  const total = sTotal + cTotal;
  // 시간대별 (한국 시간): 어느 시간에 갑자기 늘었는지, 그 시간에 무엇이 읽었는지
  const byHour = HOURS.map((h) => {
    const sv = Object.values(d?.h?.[h] || {}).reduce((a, n) => a + (Number(n) || 0), 0);
    const cv = Number(d?.ch?.[h] || 0);
    return { h, sv, cv, t: sv + cv };
  });
  const maxHour = Math.max(1, ...byHour.map((x) => x.t));
  const hasHourly = byHour.some((x) => x.t > 0);
  const hourTop = hour ? Object.entries(d?.h?.[hour] || {}).map(([k, n]) => ({ k, n: Number(n) || 0 })).sort((a, b) => b.n - a.n) : [];
  const Row = ({ k, n, of }: { k: string; n: number; of: number }) => (
    <li className="text-xs">
      <div className="flex justify-between gap-2"><span className="truncate text-zinc-700 dark:text-zinc-200">{k}</span><b className="tabular-nums shrink-0">{n.toLocaleString()}</b></div>
      <div className="mt-0.5 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${of ? Math.min(100, (n / of) * 100) : 0}%` }} /></div>
    </li>
  );

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3" data-testid="read-stats">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-purple-500" />
        <h3 className="font-bold text-sm text-zinc-900 dark:text-white">DB 읽기 출처</h3>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> 새로 보기</button>
      </div>
      <p className="text-[11px] text-zinc-500 break-keep">무료 한도는 하루 5만 번(한국 시간 오후 5시쯤 초기화)이에요. 이 기능을 넣은 뒤부터 세요. 방문자 기기 숫자는 기기가 화면을 떠날 때 모아서 보내서 조금 늦게 반영돼요.</p>
      {err && <p className="text-xs text-red-500">못 불러왔어요: {err}</p>}
      {days && (
        <>
          <div className="flex gap-1.5">
            {days.map((x, i) => (
              <button key={x.day} type="button" onClick={() => { setIdx(i); setHour(null); }} className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${i === idx ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>{i === 0 ? '오늘' : '어제'} ({x.day.slice(5)})</button>
            ))}
          </div>
          <p className="text-sm">합계 <b className="tabular-nums">{total.toLocaleString()}</b>번 <span className="text-xs text-zinc-500">· 서버 {sTotal.toLocaleString()} · 방문자 기기 {cTotal.toLocaleString()}{d?.sessions ? ` (${d.sessions}번 방문)` : ''}</span></p>
          {hasHourly && (
            <div>
              <p className="text-xs font-bold text-zinc-500 mb-1.5">시간대별 (한국 시간 · 막대를 누르면 그 시간에 읽은 곳)</p>
              <div className="flex items-end gap-[2px] h-24" role="list">
                {byHour.map((x, i) => (
                  <button key={x.h} type="button" role="listitem" aria-label={`${i}시 ${x.t}번`} onClick={() => setHour(hour === x.h ? null : x.h)}
                    className={`flex-1 min-w-0 h-full flex flex-col justify-end cursor-pointer rounded-sm ${hour === x.h ? 'bg-purple-500/10' : ''}`}>
                    <div className="w-full bg-amber-400" style={{ height: `${(x.cv / maxHour) * 100}%` }} />
                    <div className="w-full bg-purple-500" style={{ height: `${(x.sv / maxHour) * 100}%` }} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-zinc-400 tabular-nums mt-0.5"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>
              <p className="text-[10px] text-zinc-400 mt-0.5"><span className="inline-block w-2 h-2 bg-purple-500 rounded-sm align-middle" /> 서버 <span className="inline-block w-2 h-2 bg-amber-400 rounded-sm align-middle ml-2" /> 방문자 기기</p>
              {hour && (
                <div className="mt-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-2.5">
                  <p className="text-xs font-bold mb-1.5">{Number(hour.slice(1))}시 · 서버 {byHour.find((x) => x.h === hour)?.sv.toLocaleString()}번 · 기기 {byHour.find((x) => x.h === hour)?.cv.toLocaleString()}번</p>
                  <ul className="space-y-1.5">{hourTop.slice(0, 10).map((x) => <Row key={x.k} k={x.k} n={x.n} of={hourTop[0]?.n || 1} />)}{!hourTop.length && <li className="text-xs text-zinc-400">서버 읽기 없음</li>}</ul>
                </div>
              )}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-zinc-500 mb-1.5">서버 (요청 › 컬렉션)</p>
              <ul className="space-y-1.5">{server.slice(0, 15).map((x) => <Row key={x.k} k={x.k} n={x.n} of={server[0]?.n || 1} />)}{!server.length && <li className="text-xs text-zinc-400">아직 없어요</li>}</ul>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-500 mb-1.5">방문자 기기 (컬렉션)</p>
              <ul className="space-y-1.5">{client.slice(0, 15).map((x) => <Row key={x.k} k={x.k} n={x.n} of={client[0]?.n || 1} />)}{!client.length && <li className="text-xs text-zinc-400">아직 없어요</li>}</ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
