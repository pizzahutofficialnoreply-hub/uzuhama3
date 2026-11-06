import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ChevronDown, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { mutate } from './SearchTuningCard';

/**
 * 관리자 > 자동화: 주간 점검 보고서
 * 정기 점검 시간에 GitHub '주간 점검' 이 돌린 결과 + 사이트가 직접 모은 피드백 총정리·방문자 오류·DB·AI 분석
 */
const Row = ({ ok, name, detail }: { ok: boolean | null; name: string; detail?: string }) => (
  <li className="flex items-start gap-2 text-xs">
    <span className="shrink-0">{ok === null ? '➖' : ok ? '✅' : '❌'}</span>
    <span className="font-bold text-zinc-800 dark:text-zinc-100 shrink-0">{name}</span>
    {detail && <span className="text-zinc-500 dark:text-zinc-400 break-all">{detail}</span>}
  </li>
);

function Report({ r }: { r: any }) {
  const st = r.results?.static || {};
  const lu = r.results?.live?.summary || {};
  const ap = r.results?.api?.summary || {};
  const e2e = r.results?.e2e;
  const fb = r.server?.feedback || {};
  const ai = fb.ai;
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        <Row ok={st.tsc ?? null} name="타입 검사" />
        <Row ok={st.vitest ? !st.vitest.failed : null} name="로직 테스트" detail={st.vitest ? `${st.vitest.total - st.vitest.failed}/${st.vitest.total}${st.vitest.failedNames?.length ? ` · ${st.vitest.failedNames.slice(0, 3).join(', ')}` : ''}` : ''} />
        <Row ok={st.build ?? null} name="빌드" detail={st.bundleKB ? `${st.bundleKB}KB` : ''} />
        <Row ok={st.audit ? !(st.audit.high || st.audit.critical) : null} name="보안 취약점" detail={st.audit ? `높음 ${st.audit.high || 0} · 심각 ${st.audit.critical || 0} · 보통 ${st.audit.moderate || 0}` : ''} />
        <Row ok={e2e ? !e2e.failed : null} name="e2e" detail={e2e ? `${e2e.total - e2e.failed}/${e2e.total}${e2e.failed ? ` · ${(e2e.results || []).filter((x: any) => !x.ok).map((x: any) => x.name).join(', ')}` : ''}` : ''} />
        <Row ok={lu.pages ? !lu.pageErrors && !lu.loadFail : null} name="실제 사이트 화면" detail={`${lu.pages || 0}화면 · 안 열림 ${lu.loadFail || 0} · 페이지 오류 ${lu.pageErrors || 0}`} />
        <Row ok={lu.pages ? !lu.consoleErrors : null} name="개발자 콘솔" detail={`오류 ${lu.consoleErrors || 0} · 실패한 요청 ${lu.failedRequests || 0}`} />
        <Row ok={lu.pages ? !lu.overflowPages && !lu.brokenImages : null} name="UI/UX" detail={`가로 넘침 ${lu.overflowPages || 0} · 깨진 이미지 ${lu.brokenImages || 0} · 작은 버튼 ${lu.smallTargetsMax || 0} · 첫 화면 ${lu.slowestMs || 0}ms`} />
        <Row ok={ap.total ? !ap.failed : null} name="API·Vercel·DB·보안" detail={`${(ap.total || 0) - (ap.failed || 0)}/${ap.total || 0}`} />
        <Row ok={(r.server?.clientErrors?.total || 0) <= 20} name="방문자 화면 오류(7일)" detail={`${r.server?.clientErrors?.total || 0}건`} />
      </ul>

      {(r.results?.api?.checks || []).some((c: any) => !c.ok) && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-2.5 text-[11px] space-y-0.5">
          {(r.results.api.checks || []).filter((c: any) => !c.ok).map((c: any, i: number) => <p key={i}>❌ [{c.group}] {c.name} <span className="text-zinc-500">{c.detail}</span></p>)}
        </div>
      )}
      {(r.results?.live?.problems || []).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">화면 문제 {r.results.live.problems.length}곳</summary>
          <ul className="mt-1 space-y-1">
            {r.results.live.problems.map((p: any, i: number) => (
              <li key={i} className="text-zinc-600 dark:text-zinc-300 break-all">
                <b>{p.host?.replace('https://', '')} {p.view}/{p.scheme} {p.page}</b> {[p.err, ...(p.pageerror || []), ...(p.console || []), p.overflow > 2 ? `가로 넘침 ${p.overflow}px` : '', ...(p.broken || [])].filter(Boolean).join(' / ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(r.server?.clientErrors?.top || []).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">방문자 화면 오류 많은 순</summary>
          <ul className="mt-1 space-y-0.5">{r.server.clientErrors.top.map(([m, n]: any, i: number) => <li key={i} className="break-all"><b>{n}회</b> {m}</li>)}</ul>
        </details>
      )}

      <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 p-3 space-y-1.5">
        <p className="text-xs font-black text-purple-700 dark:text-purple-300">피드백 총정리 (지난 7일 {fb.total || 0}건 · 처리 안 됨 {fb.pending || 0}){ai?.model ? <span className="font-medium text-purple-400"> · AI</span> : null}</p>
        {fb.byType && <p className="text-[11px] text-zinc-500">{Object.entries(fb.byType).map(([k, v]) => `${k} ${v}`).join(' · ')} · 검색 만족 👍{fb.searchGood || 0} 👎{fb.searchBad || 0}</p>}
        {ai?.summary && <p className="text-xs text-zinc-700 dark:text-zinc-200 break-keep">{ai.summary}</p>}
        {(ai?.urgent || []).length > 0 && <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5">{ai.urgent.map((u: string, i: number) => <li key={i}>⚠️ {u}</li>)}</ul>}
        {(ai?.themes || []).length > 0 && (
          <ul className="space-y-1">
            {ai.themes.map((t: any, i: number) => (
              <li key={i} className="text-[11px] text-zinc-600 dark:text-zinc-300"><b>{t.title}</b>{t.count ? ` (${t.count})` : ''} — {t.detail} <span className="text-purple-600 dark:text-purple-400">→ {t.action}</span></li>
            ))}
          </ul>
        )}
        {(fb.list || []).length > 0 && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-zinc-500">원문 {fb.list.length}건</summary>
            <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">{fb.list.map((x: any) => <li key={x.id} className="break-all"><b>[{x.type}] {x.title}</b> <span className="text-zinc-500">{x.content}</span></li>)}</ul>
          </details>
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        DB: {Object.entries(r.server?.db || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}
        {r.server?.aiVideo ? ` · AI 분석 ${r.server.aiVideo.done}/${r.server.aiVideo.total}` : ''}
        {r.server?.deadVideos ? ` · 끊긴 영상 ${r.server.deadVideos.count}` : ''}
        {r.server?.adminAudit ? ` · 관리자 작업 ${r.server.adminAudit.total}` : ''}
        {r.results?.api?.stats ? ` · 방송 기록 ${r.results.api.stats.logs}개 (마지막 ${r.results.api.stats.lastLogDate})` : ''}
      </p>
      {r.runUrl && <a href={r.runUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-purple-600 font-bold">GitHub 실행 결과·화면 사진 <ExternalLink className="w-3 h-3" /></a>}
    </div>
  );
}

/** Firestore 보안 규칙: 지금 적용된 것 = 저장소 firestore.rules 인지 */
function RulesRow() {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { setSt(await mutate('rulesStatus')); } catch (e: any) { setSt({ error: String(e?.message || e) }); } }, []);
  useEffect(() => { load(); }, [load]);
  if (!st) return null;
  return (
    <div className={`rounded-xl p-3 text-xs space-y-1.5 ${st.same ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
      <p className="font-bold">{st.error ? `보안 규칙 확인 실패: ${st.error}` : st.same ? '✅ DB 보안 규칙: 최신이에요' : '❌ DB 보안 규칙: 지금 적용된 규칙이 예전 것이라 방문자가 푸시 알림 구독 목록을 읽고 지울 수 있어요'}</p>
      {st.deployedAt && <p className="text-[11px] text-zinc-500">지금 적용된 규칙: {String(st.deployedAt).slice(0, 19).replace('T', ' ')}</p>}
      {!st.same && !st.error && (
        <button type="button" disabled={busy} onClick={async () => { if (!window.confirm('저장소의 최신 보안 규칙(firestore.rules)을 바로 적용할까요?')) return; setBusy(true); try { const r = await mutate('deployRules'); setMsg(r.summary || '적용했어요'); await load(); } catch (e: any) { setMsg('오류: ' + (e?.message || e)); } finally { setBusy(false); } }}
          className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold cursor-pointer disabled:opacity-60">{busy ? '적용 중…' : '최신 보안 규칙 적용'}</button>
      )}
      {msg && <p className="font-bold">{msg}</p>}
      {st.deployedPreview && !st.same && <details><summary className="cursor-pointer text-[11px] text-zinc-500">지금 적용된 규칙 보기</summary><pre className="mt-1 text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto">{st.deployedPreview}</pre></details>}
    </div>
  );
}

export function WeeklyReportCard() {
  const [reports, setReports] = useState<any[] | null>(null);
  const [open, setOpen] = useState(0);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try { const r = await mutate('weeklyReports'); setReports(r.reports || []); } catch (e: any) { setErr(String(e?.message || e)); setReports([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <CalendarCheck className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex-1">주간 점검 보고서</h3>
        <button type="button" onClick={load} className="text-zinc-400 cursor-pointer" aria-label="새로 고침"><RotateCcw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed break-keep">
        시스템 › 점검 탭에서 정한 요일·시간(점검 중)마다 자동으로 타입 검사·로직 테스트·빌드·보안 취약점·e2e·실제 사이트 화면(휴대폰·PC, 밝게·어둡게)·개발자 콘솔·UI/UX·API·DB·보안을 돌리고, 지난 7일 피드백을 AI로 총정리해요. 고칠 게 있으면 GitHub 이슈 '주간 점검'에도 남겨서 정기 버그 수정 때 고쳐요.
      </p>
      <RulesRow />
      {reports === null && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
      {err && <p className="text-xs text-red-500">{err}</p>}
      {reports && reports.length === 0 && !err && <p className="text-xs text-zinc-500">아직 보고서가 없어요. 다음 정기 점검 때 처음 만들어져요.</p>}
      <ul className="space-y-2">
        {(reports || []).map((r, i) => (
          <li key={r.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800">
            <button type="button" onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer">
              <span>{r.ok ? '✅' : '⚠️'}</span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">{new Date(r.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-[11px] text-zinc-500 flex-1 truncate">{r.ok ? '문제 없음' : r.fails.join(' · ')}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <div className="px-3 pb-3"><Report r={r} /></div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
