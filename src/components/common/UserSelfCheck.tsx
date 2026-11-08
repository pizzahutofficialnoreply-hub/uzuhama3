import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';
import { selfTestProgress, startSelfTestBg, useSelfTestBg } from '../../selftest/bgRun';
import { resultText } from '../../selftest/format';

/** 의견 보내기 › 앱 점검 (일반 사용자): 화면 뒤에서 돌고, 창을 닫아도 계속 (헤더 아래 선으로 진행률) */
export function UserSelfCheck({ onResult, onAttach }: { onResult: (text: string) => void; onAttach: () => void }) {
  const s = useSelfTestBg();
  const [deep, setDeep] = useState(false);
  useEffect(() => { if (s.done && s.results.length) onResult(resultText(s.results)); }, [s.done, s.results]); // eslint-disable-line react-hooks/exhaustive-deps
  const fail = s.results.filter((r) => !r.ok);
  const warn = s.results.filter((r) => r.ok && r.warn);
  const pct = Math.round(selfTestProgress(s) * 100);
  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[24px] p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">내 앱 점검하기</p>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed break-keep">이 기기에서 사이트를 화면 뒤에 띄워 화면을 하나씩 열어 보고 서버 연결까지 확인해요. 이 창을 닫아도 계속 돌고, 맨 위 헤더 아래 선으로 진행률이 보여요. 점검이 바꾼 설정은 끝나면 원래대로 돌려놔요.</p>
        </div>
        {!s.running && (
          <>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> 누를 수 있는 건 전부 눌러 보기 (5~15분, 더 꼼꼼하게)</label>
            <button type="button" onClick={() => startSelfTestBg(deep)} className="w-full py-3 rounded-2xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"><Play className="w-4 h-4" /> {s.done ? '다시 점검' : '점검 시작'}</button>
          </>
        )}
        {s.running && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
            <p className="text-[11.5px] text-purple-600 dark:text-purple-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> <span className="truncate">{pct}% · {s.stage}</span></p>
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
          {s.done && <button type="button" onClick={onAttach} className="w-full py-3 rounded-2xl bg-purple-600 text-white text-sm font-bold cursor-pointer">이 결과를 붙여서 의견 보내기</button>}
        </div>
      )}
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
