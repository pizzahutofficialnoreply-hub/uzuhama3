import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { CheckCircle2, Loader2, Play, XCircle, AlertTriangle, Copy } from 'lucide-react';
import { auth } from '../lib/firebase';
import { isAdminUser } from '../utils/adminAuth';
import { adminMfaValid } from './AdminMfaGate';
import { runSelfTests, type StepResult } from '../selftest/runner';

/**
 * /selftest: 화면·기능 전체 점검
 * 사이트를 안쪽 창에 띄우고 사람이 누르는 순서대로 눌러 봄 (홈 → 달력 칸 → 그날 기록 → 분석 → 검색 → ⋮ → 설정 → 패치노트 → 문서 → 서버·DB)
 * 관리자(2단계 인증 통과)만, 또는 주간 자동 점검(브라우저 자동화)만 열 수 있음
 */
import { SELFTEST_FLAG } from '../selftest/flag';

export function SelfTestPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[]>([]);
  const [done, setDone] = useState(false);
  const [phone, setPhone] = useState(true);
  const auto = /[?&]auto=1/.test(window.location.search);

  useEffect(() => {
    if ((navigator as any).webdriver) { setAllowed(true); return; }
    return onAuthStateChanged(auth, async (u) => setAllowed(isAdminUser(u) && (await adminMfaValid()) > 0));
  }, []);

  const start = async () => {
    if (!frameRef.current || running) return;
    setRunning(true); setDone(false); setResults([]);
    (window as any).__selftest = { done: false, results: [] };
    try { localStorage.setItem(SELFTEST_FLAG, String(Date.now() + 15 * 60 * 1000)); } catch { /* */ } // 점검 중 화면 건너뛰기 (15분)
    const out = await runSelfTests(frameRef.current, (r) => {
      setResults((p) => [...p, r]);
      (window as any).__selftest.results.push(r);
    });
    try { localStorage.removeItem(SELFTEST_FLAG); } catch { /* */ }
    (window as any).__selftest = { done: true, results: out.results, errors: out.errors.slice(0, 20) };
    setRunning(false); setDone(true);
    if (frameRef.current) frameRef.current.src = 'about:blank';
  };
  useEffect(() => { if (allowed && auto) { const t = setTimeout(start, 800); return () => clearTimeout(t); } }, [allowed]); // eslint-disable-line

  if (allowed === null) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  if (!allowed) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-zinc-50 dark:bg-black">
      <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">관리자만 쓸 수 있어요.</p>
      <p className="text-xs text-zinc-500">관리자 화면에서 2단계 인증을 마친 뒤 시스템 › 자동화 › 화면·기능 전체 점검에서 열어 주세요.</p>
      <a href="/admin" className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold">관리자 화면으로</a>
    </div>
  );

  const fail = results.filter((r) => !r.ok);
  const warn = results.filter((r) => r.warn);
  const groups = [...new Set(results.map((r) => r.group))];
  const copy = () => {
    const text = results.map((r) => `${r.ok ? (r.warn ? '⚠️' : '✅') : '❌'} [${r.group}] ${r.name}${r.err ? ` — ${r.err}` : ''} (${r.ms}ms)`).join('\n');
    try { navigator.clipboard.writeText(text); } catch { /* */ }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={start} disabled={running} className="px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60 cursor-pointer">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {running ? '점검 중…' : done ? '다시 점검' : '전체 점검 시작'}
            </button>
            <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} disabled={running} /> 휴대폰 크기</label>
          </div>
          <div className="rounded-[28px] border-4 border-zinc-800 overflow-hidden bg-white shadow-xl" style={{ width: phone ? 390 : 'min(1024px, 92vw)', height: phone ? 760 : 700 }}>
            <iframe ref={frameRef} title="점검할 화면" src="about:blank" className="w-full h-full border-0" />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-lg font-black">화면·기능 전체 점검</h1>
          <p className="text-xs text-zinc-500 leading-relaxed break-keep">사람이 누르는 순서대로 사이트를 눌러 보고(홈 → 탭 이동 → 달력 칸 → 그날 기록 → 링크 → 분석 하위 탭 → 카테고리 게임 → 검색 → ⋮ AI 요약·저장 → 설정 → 시청 기록 → 패치노트 → 버전 주소 → 약관·개인정보 → 없는 주소), 화면마다 가로 넘침·깨진 이미지·화면 오류를 보고, 서버 API와 DB(읽기·보안)도 확인해요. 이 기기의 설정·재생목록·기록은 점검 뒤 그대로 돌려놔요. 저장·삭제 같은 바꾸는 동작은 하지 않아요.</p>
          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="text-emerald-600">통과 {results.filter((r) => r.ok && !r.warn).length}</span>
              <span className="text-amber-600">참고 {warn.length}</span>
              <span className="text-red-600">실패 {fail.length}</span>
              <span className="text-zinc-400">/ {results.length}</span>
              <button type="button" onClick={copy} className="ml-auto text-xs flex items-center gap-1 text-zinc-500 cursor-pointer"><Copy className="w-3.5 h-3.5" /> 결과 복사</button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs font-black text-zinc-500 mb-1.5">{g}</p>
              <ul className="space-y-1">
                {results.filter((r) => r.group === g).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {r.ok ? (r.warn ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />) : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    <span className="flex-1 break-keep">{r.name}{r.err && <span className="block text-[11px] text-zinc-500 break-all">{r.err}</span>}</span>
                    <span className="text-[10px] text-zinc-400 tabular-nums">{r.ms}ms</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {running && <p className="text-xs text-purple-600 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 왼쪽 화면에서 차례로 누르는 중이에요 (1~3분)</p>}
        </div>
      </div>
    </div>
  );
}
