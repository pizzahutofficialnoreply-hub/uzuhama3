import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Cloud, History, Loader2, Play, RotateCcw, Smartphone, Square, XCircle } from 'lucide-react';
import { discardInterrupted, selfTestHistory, selfTestProgress, startSelfTestBg, stopSelfTest, useSelfTestBg, type HistoryEntry } from '../../selftest/bgRun';
import { resultText } from '../../selftest/format';

/** 의견 보내기 › 앱 점검 (일반 사용자): 화면 뒤에서 돌고, 창을 닫아도 계속 (헤더 아래 선으로 진행률) */
export function UserSelfCheck({ onResult, onAttach }: { onResult: (text: string) => void; onAttach: () => void }) {
  const s = useSelfTestBg();
  const [deep, setDeep] = useState(false);
  const [where, setWhere] = useState<'cloud' | 'device'>(() => { try { return (localStorage.getItem('uzuhama_selftest_where') as any) || 'cloud'; } catch { return 'cloud'; } });
  const pickWhere = (w: 'cloud' | 'device') => { setWhere(w); try { localStorage.setItem('uzuhama_selftest_where', w); } catch { /* */ } };
  useEffect(() => { if ((s.done || s.interrupted) && s.results.length) onResult(resultText(s.results)); }, [s.done, s.interrupted, s.results]); // eslint-disable-line react-hooks/exhaustive-deps
  const fail = s.results.filter((r) => !r.ok);
  const warn = s.results.filter((r) => r.ok && r.warn);
  const pct = Math.round(selfTestProgress(s) * 100);
  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">내 앱 점검하기</p>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed break-keep">{where === 'cloud'
            ? '점검 서버의 브라우저가 아이폰 크기·터치로 사이트를 열어 화면을 하나씩 눌러 봐요. 이 기기 화면·설정은 건드리지 않고, 앱을 완전히 닫아도 계속 돌아요. 다시 열면 결과가 와 있어요.'
            : '이 기기에서 사이트를 화면 뒤에 띄워 화면을 하나씩 열어 보고 서버 연결까지 확인해요. 이 창을 닫아도 계속 돌고, 앱을 완전히 닫았다가 다시 열면 멈춘 곳부터 이어서 할 수 있어요. 점검이 바꾼 설정은 끝나면 원래대로 돌려놔요.'}</p>
        </div>
        {s.interrupted && !s.running && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">앱이 닫혀서 점검이 중간에 멈췄어요 ({s.results.length}개 확인함)</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => startSelfTestBg(s.deep, true)} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /> 이어서 점검</button>
              <button type="button" onClick={discardInterrupted} className="px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">기록만 남기기</button>
            </div>
          </div>
        )}
        {!s.running && !s.interrupted && (
          <>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              {([['cloud', '클라우드에서', Cloud], ['device', '이 기기에서', Smartphone]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" aria-pressed={where === k} onClick={() => pickWhere(k)} className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${where === k ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}><Icon className="w-3.5 h-3.5" /> {label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> 누를 수 있는 건 전부 눌러 보기 (5~15분, 더 꼼꼼하게)</label>
            <button type="button" onClick={() => startSelfTestBg(deep, false, where === 'cloud')} className="w-full py-3 rounded-2xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"><Play className="w-4 h-4" /> {s.done ? '다시 점검' : '점검 시작'}</button>
          </>
        )}
        {!s.running && /못했어요|멈췄어요/.test(s.stage) && <p className="text-[11.5px] text-red-500 break-keep">{s.stage}</p>}
        {s.running && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
            <p className="text-[11.5px] text-purple-600 dark:text-purple-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> <span className="truncate">{pct}% · {s.stage}</span></p>
            <button type="button" onClick={() => stopSelfTest()} className="mt-1 w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer"><Square className="w-3 h-3 fill-current" /> 점검 중단</button>
          </div>
        )}
      </div>

      {s.results.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-4 space-y-2">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">{s.done ? (fail.length ? `문제 ${fail.length}개를 찾았어요` : '문제없어요') : '지금까지 결과'} <span className="text-xs font-semibold text-zinc-400">· {s.results.length}개 확인{warn.length ? ` · 주의 ${warn.length}` : ''}</span></p>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {[...fail, ...warn, ...s.results.filter((r) => r.ok && !r.warn)].map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {!r.ok ? <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" /> : r.warn ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                <span className="min-w-0 break-keep"><span className="text-zinc-400">[{r.group}]</span> {r.name}{r.err && <span className="block text-[11px] text-zinc-500 break-all">{r.err}</span>}</span>
              </li>
            ))}
          </ul>
          {(s.done || s.interrupted) && <button type="button" onClick={onAttach} className="w-full py-3 rounded-2xl bg-purple-600 text-white text-sm font-bold cursor-pointer">이 결과를 붙여서 의견 보내기</button>}
        </div>
      )}

      <SelfCheckHistory key={s.endedAt} />
    </div>
  );
}

/** 지난 점검 기록 (최근 10번) */
function SelfCheckHistory() {
  const list = selfTestHistory();
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return null;
  const when = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const mins = (e: HistoryEntry) => Math.max(1, Math.round(((e.endedAt || e.startedAt) - e.startedAt) / 60000));
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-4 space-y-2">
      <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5"><History className="w-4 h-4 text-zinc-400" /> 지난 점검</p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {list.map((e) => {
          const fail = e.results.filter((r) => !r.ok).length;
          const warn = e.results.filter((r) => r.ok && r.warn).length;
          return (
            <li key={e.id} className="py-2">
              <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full flex items-center gap-2 text-left text-xs cursor-pointer" aria-expanded={open === e.id}>
                {fail ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : warn ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{when(e.startedAt)}</span>
                <span className="text-zinc-400 truncate">{e.deep ? '전부 눌러 보기' : '기본'} · {e.results.length}개 · {mins(e)}분{fail ? ` · 문제 ${fail}` : ''}{warn ? ` · 주의 ${warn}` : ''}{e.stopped ? ' · 중단' : e.interrupted ? ' · 중간에 멈춤' : ''}{e.cloud ? ' · 클라우드' : ''}</span>
                <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 text-zinc-400 transition-transform ${open === e.id ? 'rotate-180' : ''}`} />
              </button>
              {open === e.id && (
                <ul className="mt-2 space-y-1 max-h-60 overflow-y-auto pl-5">
                  {[...e.results.filter((r) => !r.ok), ...e.results.filter((r) => r.ok && r.warn), ...e.results.filter((r) => r.ok && !r.warn)].map((r, i) => (
                    <li key={i} className="text-[11.5px] break-keep"><span className={!r.ok ? 'text-red-500' : r.warn ? 'text-amber-600' : 'text-emerald-600'}>{!r.ok ? '✕' : r.warn ? '!' : '✓'}</span> <span className="text-zinc-400">[{r.group}]</span> {r.name}{r.err && <span className="block text-[11px] text-zinc-500 break-all">{r.err}</span>}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 헤더 아래 선: 점검 진행률 (점검 중일 때만) */
export function SelfTestHeaderLine() {
  const s = useSelfTestBg();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (s.running) { setShow(true); return; }
    if (s.done) { const t = window.setTimeout(() => setShow(false), 2500); return () => window.clearTimeout(t); }
  }, [s.running, s.done]);
  if (!show) return null;
  const pct = Math.round(selfTestProgress(s) * 100);
  const bad = s.results.some((r) => !r.ok);
  return (
    <div className="absolute left-0 right-0 -bottom-px h-[2.5px] pointer-events-none" role="progressbar" aria-label="앱 점검 진행률" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} title={`앱 점검 ${pct}% · ${s.stage}`}>
      <div className={`h-full transition-all duration-700 ease-out ${s.done ? (bad ? 'bg-red-500' : 'bg-emerald-500') : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
