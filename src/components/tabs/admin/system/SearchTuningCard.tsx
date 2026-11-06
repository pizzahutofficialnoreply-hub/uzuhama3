import React, { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { Flag, Loader2, RotateCcw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { auth, db } from '../../../../lib/firebase';
import { loadSearchTuning } from '../../../../hooks/useSearchTuning';
import { SearchAddForm } from '../../../SearchAddForm';
import { fmtTime } from '../../../../utils/aiSearch';

/**
 * 관리자 > 자동화: 검색 조정
 * - 방문자 신고(⋮ > 신고)·검색 만족도를 하루 한 번(오전 5시 이후 첫 점검 때) 모아 검색에 반영
 * - 규칙: 같은 검색어에 '안 맞아요' → 그 검색어에서 빼기 / 같은 느낌에서 2번 이상 → 그 느낌에서 빼기
 * - AI(하루 1번): 불만족 검색·의견으로 같은 뜻 말·느낌 단어·뺄 장르 보강
 * - 유튜브 저장용 OAuth 클라이언트 ID 도 여기서
 */
const mutateUrl = () => (/vercel\.app$|^localhost$|^127\./.test(window.location.hostname) ? '/api/admin/mutate' : 'https://uzuhama.vercel.app/api/admin/mutate');
export async function mutate(action: string, extra: Record<string, any> = {}) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(mutateUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

export function SearchTuningCard() {
  const [t, setT] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [clientId, setClientId] = useState('');

  const load = useCallback(async () => {
    const [tune, sys, fb] = await Promise.all([
      getDoc(doc(db, 'config', 'searchTuning')).then((s) => s.data()).catch(() => null),
      getDoc(doc(db, 'config', 'system')).then((s) => s.data()).catch(() => null),
      getDocs(query(collection(db, 'feedbacks'), where('type', 'in', ['search_report', 'search_rating', 'search_add']), limit(200))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    ]);
    setT(tune);
    setClientId(String((sys as any)?.youtubeOAuthClientId || ''));
    setItems((fb as any[]).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setMsg('');
    try { const r = await fn(); setMsg(r?.summary || '완료했어요.'); await load(); loadSearchTuning(true); }
    catch (e: any) { setMsg('오류: ' + (e?.message || e)); }
    finally { setBusy(null); }
  };

  const count = (o: Record<string, any[]> | undefined) => Object.values(o || {}).reduce((a, v) => a + (v?.length || 0), 0);
  const reports = items.filter((x) => x.type === 'search_report');
  const ratings = items.filter((x) => x.type === 'search_rating');
  const adds = items.filter((x) => x.type === 'search_add' && x.status !== 'applied' && x.status !== 'rejected');
  const pins: [string, any[]][] = Object.entries(t?.pins || {});
  const btn = 'px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">검색 조정 (신고·만족도 → 하루 한 번)</h3>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        방문자가 카드의 ⋮ › 신고, 검색 아래 '만족하시나요?'로 남긴 걸 매일 오전 5시 이후 첫 점검 때 모아 반영해요. 같은 검색어에 '안 맞아요'가 오면 그 검색어에서 빼고, 같은 느낌(수면방송 등)에서 2번 넘게 신고되면 그 느낌 전체에서 빼요.
        불만족 검색과 의견은 AI가 하루 한 번 읽고 같은 뜻 말·느낌 단어·뺄 장르를 보강해요. 검색할 때는 AI를 부르지 않아요.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[['뺀 영상(검색어)', count(t?.demote)], ['뺀 영상(느낌)', count(t?.conceptDemote)], ['같은 뜻 말', Object.keys(t?.synonyms || {}).length], ['보강한 느낌', Object.keys(t?.conceptAdd || {}).length]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 py-2">
            <p className="text-lg font-black text-zinc-900 dark:text-white tabular-nums">{v as number}</p>
            <p className="text-[10px] text-zinc-500">{k}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => run('tune', () => mutate('tuneSearch'))} className={`${btn} bg-purple-600 text-white`}>{busy === 'tune' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 지금 조정</button>
        <button type="button" disabled={!!busy} onClick={() => window.confirm('검색 조정을 모두 지울까요? (신고 기록은 남아요)') && run('reset', () => mutate('resetSearchTuning'))} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}><RotateCcw className="w-3.5 h-3.5" /> 조정 초기화</button>
      </div>
      {msg && <p className="text-xs font-bold text-purple-700 dark:text-purple-300">{msg}</p>}

      {(t?.log || []).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">조정 기록</summary>
          <ul className="mt-1.5 space-y-1">{t.log.slice(0, 10).map((l: any, i: number) => <li key={i} className="text-zinc-500"><b className="text-zinc-700 dark:text-zinc-200">{l.day}</b> {l.summary}</li>)}</ul>
        </details>
      )}
      {Object.keys(t?.synonyms || {}).length + Object.keys(t?.conceptAdd || {}).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">AI가 보강한 사전</summary>
          <ul className="mt-1.5 space-y-0.5 text-zinc-500">
            {Object.entries(t?.synonyms || {}).map(([k, v]: any) => <li key={k}><b>{k}</b> → {v.join(', ')}</li>)}
            {Object.entries(t?.conceptAdd || {}).map(([k, v]: any) => <li key={k}>느낌 <b>{k}</b>: {v.expand?.length ? `+ ${v.expand.join(', ')}` : ''} {v.avoid?.length ? ` / 뺄 장르 ${v.avoid.join(', ')}` : ''}</li>)}
          </ul>
        </details>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">최근 신고 {reports.length} · 만족도 {ratings.length} (👍 {ratings.filter((r) => r.good).length} / 👎 {ratings.filter((r) => r.good === false).length})</summary>
        <ul className="mt-1.5 space-y-1 max-h-72 overflow-y-auto">
          {items.filter((x) => x.type !== 'search_add').slice(0, 60).map((x) => (
            <li key={x.id} className="flex items-start gap-1.5 text-zinc-600 dark:text-zinc-300">
              {x.type === 'search_report' ? <Flag className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> : x.good ? <ThumbsUp className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> : <ThumbsDown className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
              <span className="min-w-0">
                {x.query && <b>'{x.query}' </b>}
                {x.type === 'search_report' ? `${x.title?.replace('[검색 신고] ', '')} — ${String(x.content || '').split('\n')[0]}` : (x.understood || '')}
                {x.note && <span className="text-zinc-400"> · {x.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {/* 검색 결과 추가하기 */}
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">검색 결과 추가하기 · 제보 {adds.length} · 추가됨 {pins.reduce((a, [, v]) => a + v.length, 0)}</p>
        {adds.length > 0 && (
          <ul className="space-y-1.5">
            {adds.slice(0, 20).map((x) => (
              <li key={x.id} className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-2">
                <img src={`https://i.ytimg.com/vi/${x.videoId}/default.jpg`} alt="" className="w-16 rounded" />
                <div className="min-w-0 flex-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  <p><b>'{x.query}'</b> → <a className="underline" href={`https://youtu.be/${x.videoId}${x.t ? `?t=${x.t}` : ''}`} target="_blank" rel="noreferrer">{x.videoId}{x.t ? ` (${fmtTime(x.t)})` : ''}</a></p>
                  {x.note && <p className="text-zinc-500">{x.note}</p>}
                  {x.sourceUrl && <a className="text-purple-600 underline break-all" href={x.sourceUrl} target="_blank" rel="noreferrer">{x.sourceUrl}</a>}
                </div>
                <div className="flex flex-col gap-1">
                  <button type="button" disabled={!!busy} onClick={() => run(`add-${x.id}`, () => mutate('pinSearch', { query: x.query, videoId: x.videoId, t: x.t, note: x.note, sourceUrl: x.sourceUrl, feedbackId: x.id }))} className={`${btn} bg-purple-600 text-white`}>추가</button>
                  <button type="button" disabled={!!busy} onClick={() => run(`rej-${x.id}`, async () => { await setDoc(doc(db, 'feedbacks', x.id), { status: 'rejected' }, { merge: true }); return { summary: '넘겼어요' }; })} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>넘기기</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">직접 추가하기 (카페 실제 사례 등)</summary>
          <div className="mt-2">
            <SearchAddForm mode="admin" submitAdmin={async (p) => { const r = await mutate('pinSearch', p); await load(); loadSearchTuning(true); return r?.summary || '추가했어요'; }} />
          </div>
        </details>
        {pins.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">추가된 검색 결과</summary>
            <ul className="mt-1.5 space-y-1 max-h-72 overflow-y-auto">
              {pins.flatMap(([key, list]) => list.map((p: any) => (
                <li key={`${key}-${p.id}-${p.t || 0}`} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <span className="min-w-0 flex-1 truncate"><b>'{p.query || key}'</b> → {p.title || p.id}{p.t ? ` (${fmtTime(p.t)})` : ''}</span>
                  <button type="button" disabled={!!busy} onClick={() => run(`un-${key}-${p.id}`, () => mutate('unpinSearch', { key, videoId: p.id, t: p.t ?? null }))} className="text-red-500 font-bold cursor-pointer">빼기</button>
                </li>
              )))}
            </ul>
          </details>
        )}
      </div>

      <AiVideoPanel />

      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">유튜브 재생목록 저장 (OAuth 클라이언트 ID)</p>
        <p className="text-[11px] text-zinc-500 leading-relaxed">넣어 두면 저장 창에 '내 유튜브 재생목록에 바로 저장'이 생겨요. 구글 클라우드 콘솔 › API 및 서비스 › 사용자 인증 정보 › OAuth 클라이언트 ID(웹 애플리케이션)에서 만들고, 승인된 자바스크립트 원본에 사이트 주소를 넣으세요. 비워 두면 지금처럼 유튜브로 열어 줘요.</p>
        <div className="flex gap-1.5">
          <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono" />
          <button type="button" disabled={!!busy} onClick={() => run('cid', async () => { await setDoc(doc(db, 'config', 'system'), { youtubeOAuthClientId: clientId }, { merge: true }); return { summary: '저장했어요.' }; })} className={`${btn} bg-zinc-900 dark:bg-white text-white dark:text-zinc-900`}>저장</button>
        </div>
      </div>
    </div>
  );
}

/** AI 영상 상세 분석 진행 상황 */
function AiVideoPanel() {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try { const r = await mutate('aiVideo', { op: 'status' }); setSt(r); } catch (e: any) { setMsg('오류: ' + (e?.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (op: string) => {
    setBusy(op); setMsg('');
    try { const r = await mutate('aiVideo', { op }); setMsg(r?.summary || '완료'); await load(); }
    catch (e: any) { setMsg('오류: ' + (e?.message || e)); }
    finally { setBusy(''); }
  };
  const btn = 'px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60';
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const usedMin = st?.day === today ? Math.round((st?.usedSec || 0) / 60) : 0;
  return (
    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">AI 영상 상세 분석 (AI 검색)</p>
      <p className="text-[11px] text-zinc-500 leading-relaxed break-keep">
        최신 영상부터 일반 영상·생방송 다시보기·쇼츠를 AI가 직접 보고 장면마다 정리해요. 긴 영상은 15분씩 나눠 보고, 다 보면 나온 게임을 구글 검색(공식 소개·다른 유튜버 플레이 반응)으로 알아봐요.
        무료 한도(유튜브 영상 하루 약 8시간) 안에서 하루 {Math.round((st?.dailySec || 25200) / 3600)}시간까지만 보고 쉬어요. 검색할 때는 AI를 부르지 않아요.
      </p>
      {st && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[['분석 끝', `${st.done ?? 0} / ${st.total ?? 0}`], ['보는 중', st.partial ?? 0], ['오늘 본 시간', `${usedMin}분`], ['오늘 요청', st.day === today ? st.calls || 0 : 0]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 py-2">
              <p className="text-base font-black text-zinc-900 dark:text-white tabular-nums">{v as any}</p>
              <p className="text-[10px] text-zinc-500">{k}</p>
            </div>
          ))}
        </div>
      )}
      {st && (
        <p className="text-[11px] text-zinc-500 break-all">
          모델 {st.model || st.models?.[0] || '-'}{st.paused ? ' · 멈춤' : ''}{st.coolUntil && st.coolUntil > Date.now() ? ` · 한도로 ${new Date(st.coolUntil).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지 쉼` : ''}{st.lastRunAt ? ` · 마지막 ${new Date(st.lastRunAt).toLocaleString('ko-KR')}` : ''}
          {st.lastError ? <span className="block text-red-500">최근 오류: {st.lastError}</span> : null}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={() => act('run')} className={`${btn} bg-purple-600 text-white`}>{busy === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 지금 한 구간 분석</button>
        <button type="button" disabled={!!busy} onClick={() => act(st?.paused ? 'resume' : 'pause')} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>{st?.paused ? '다시 시작' : '멈추기'}</button>
        <button type="button" disabled={!!busy} onClick={() => act('refreshQueue')} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}><RotateCcw className="w-3.5 h-3.5" /> 영상 목록 새로 받기</button>
      </div>
      {msg && <p className="text-xs font-bold text-purple-700 dark:text-purple-300 break-all">{msg}</p>}
    </div>
  );
}
