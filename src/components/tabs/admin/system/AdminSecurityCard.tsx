import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, RotateCcw } from 'lucide-react';
import { mutate } from './SearchTuningCard';
import { adminLogoutAll } from '../../../AdminMfaGate';

/** 관리자 > 자동화: 관리자 보안 (2단계 인증 상태·최근 로그인·다시 설정·모든 기기 로그아웃) */
export function AdminSecurityCard() {
  const [st, setSt] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { setSt(await mutate('mfaStatus')); } catch (e: any) { setMsg(String(e?.message || e)); } }, []);
  useEffect(() => { load(); }, [load]);
  const btn = 'px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer';
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-purple-500" />
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex-1">관리자 보안</h3>
        <button type="button" onClick={load} className="text-zinc-400 cursor-pointer" aria-label="새로 고침"><RotateCcw className="w-3.5 h-3.5" /></button>
      </div>
      <ul className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1 leading-relaxed break-keep">
        <li>① 구글 로그인 — 관리자 계정·이메일 인증·구글 로그인인 경우만</li>
        <li>② 2단계 인증 — 인증 앱 6자리 코드 (같은 코드 재사용 불가, 5번 틀리면 15분→1시간→6시간 잠금, 복구 코드 10개)</li>
        <li>③ 서버 API와 DB 보안 규칙이 둘 다 ②를 확인 — 화면을 건너뛰거나 구글 계정만 뺏겨도 데이터는 못 바꿈</li>
        <li>④ 4시간 지나거나 30분 동안 손대지 않으면 다시 코드, '모든 기기에서 로그아웃'은 다른 곳의 로그인도 즉시 끊음</li>
      </ul>
      {st && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 text-xs space-y-1">
          <p>{st.enabled ? `✅ 2단계 인증 켜짐 (${String(st.enabledAt).slice(0, 10)}부터)` : '❌ 2단계 인증 아직 안 켜짐'}</p>
          {st.enabled && <p>복구 코드 {st.recoveryLeft}개 남음{st.recoveryLeft <= 3 ? ' — 다시 설정해서 새로 받아 두세요' : ''}</p>}
          {st.sessionUntil > Date.now() && <p>이번 로그인은 {new Date(st.sessionUntil).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지</p>}
          {st.locked ? <p className="text-red-500">잠김: {new Date(st.locked).toLocaleTimeString('ko-KR')}까지</p> : null}
        </div>
      )}
      {(st?.recentLogins || []).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">최근 관리자 로그인 (모르는 기록이 있으면 바로 '모든 기기에서 로그아웃' 하고 구글 비밀번호를 바꾸세요)</summary>
          <ul className="mt-1 space-y-0.5">
            {st.recentLogins.map((l: any, i: number) => <li key={i} className="break-all text-zinc-500"><b className="text-zinc-700 dark:text-zinc-200">{new Date(l.at).toLocaleString('ko-KR')}</b> · {l.how} · {l.ip} · {l.ua}</li>)}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={async () => { if (!window.confirm('다른 기기(이 기기 포함)의 관리자 로그인을 모두 끊을까요?')) return; try { await adminLogoutAll(); window.location.href = '/'; } catch (e: any) { setMsg(String(e?.message || e)); } }} className={`${btn} bg-red-600 text-white`}>모든 기기에서 로그아웃</button>
        {st?.enabled && <button type="button" onClick={async () => { if (!window.confirm('인증 앱을 다시 설정할까요? 지금 앱의 코드와 복구 코드는 더 이상 안 돼요.')) return; try { await mutate('mfaReset'); const { auth } = await import('../../../../lib/firebase'); await auth.currentUser?.getIdToken(true); window.location.reload(); } catch (e: any) { setMsg(String(e?.message || e)); } }} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>인증 앱 다시 설정 (새 복구 코드)</button>}
      </div>
      {msg && <p className="text-xs text-red-500">{msg}</p>}
    </div>
  );
}
