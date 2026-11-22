import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, RotateCcw } from 'lucide-react';
import { mutate } from './SearchTuningCard';
import { adminLogoutAll, trustedId, TRUST_KEY } from '../../../AdminMfaGate';
import { Smartphone, X } from 'lucide-react';
import { confirmSheet } from '../../../../utils/ui';

/** 관리자 > 자동화: 관리자 보안 (2단계 인증 상태·최근 로그인·다시 설정·모든 기기 로그아웃) */
export function AdminSecurityCard() {
  const [st, setSt] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const load = useCallback(async () => { try { setSt(await mutate('mfaStatus')); } catch (e: any) { setMsg(String(e?.message || e)); } }, []);
  const [devices, setDevices] = useState<any[] | null>(null);
  const loadDevices = useCallback(async () => { try { setDevices((await mutate('mfaDevices')).devices || []); } catch (e: any) { setMsg(String(e?.message || e)); } }, []);
  useEffect(() => { load(); loadDevices(); }, [load, loadDevices]);
  const revoke = async (id: string, label: string) => {
    if (!await confirmSheet(id === 'all' ? '기억된 기기를 모두 지울까요? 다음부터 모든 기기에서 다시 코드를 넣어야 해요.' : `'${label}'을(를) 지울까요? 그 기기는 다음부터 다시 코드를 넣어야 해요.`)) return;
    try {
      const r = await mutate('mfaDeviceRevoke', { id });
      setDevices(r.devices || []);
      if (id === 'all' || id === trustedId()) { try { localStorage.removeItem(TRUST_KEY); } catch { /* */ } }
    } catch (e: any) { setMsg(String(e?.message || e)); }
  };
  const ago = (ms: number) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        <li>④ 4시간 지나거나 30분 동안 손대지 않으면 다시 코드 (기억된 기기는 저절로 다시 통과), '모든 기기에서 로그아웃'은 다른 곳의 로그인과 기억된 기기도 모두 끊음</li>
      </ul>
      {st && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 text-xs space-y-1">
          <p>{st.enabled ? `✅ 2단계 인증 켜짐 (${String(st.enabledAt).slice(0, 10)}부터)` : '❌ 2단계 인증 아직 안 켜짐'}</p>
          {st.enabled && <p>복구 코드 {st.recoveryLeft}개 남음{st.recoveryLeft <= 3 ? ' — 다시 설정해서 새로 받아 두세요' : ''}</p>}
          {st.sessionUntil > Date.now() && <p>이번 로그인은 {new Date(st.sessionUntil).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지</p>}
          {st.locked ? <p className="text-red-500">잠김: {new Date(st.locked).toLocaleTimeString('ko-KR')}까지</p> : null}
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200 flex-1">기억된 기기 (코드 없이 들어가는 기기 · 30일)</p>
          {(devices || []).length > 1 && <button type="button" onClick={() => revoke('all', '')} className="text-[11px] font-bold text-red-500 cursor-pointer">모두 지우기</button>}
        </div>
        <p className="text-[10.5px] text-zinc-500 break-keep">기기는 브라우저마다 따로예요. 같은 아이폰이라도 사파리와 홈 화면 앱은 각각 한 번씩 코드를 넣어야 해요.</p>
        {devices === null ? <p className="text-[11px] text-zinc-400">불러오는 중…</p> : devices.length === 0 ? <p className="text-[11px] text-zinc-400">없어요. 코드를 넣을 때 '이 기기 기억하기'를 켜 두면 여기 생겨요.</p> : (
          <ul className="space-y-1.5">
            {devices.map((d) => {
              const me = d.id === trustedId();
              return (
                <li key={d.id} className="flex items-center gap-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
                  <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">{d.name}{me && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-600/10 text-purple-600 dark:text-purple-300">이 기기</span>}</p>
                    <p className="text-[10.5px] text-zinc-500">마지막 사용 {ago(d.lastUsedAt)} · {ago(d.expiresAt)}까지</p>
                  </div>
                  <button type="button" onClick={() => revoke(d.id, d.name)} aria-label={`${d.name} 지우기`} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 cursor-pointer"><X className="w-4 h-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {(st?.recentLogins || []).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-bold text-zinc-600 dark:text-zinc-300">최근 관리자 로그인 (모르는 기록이 있으면 바로 '모든 기기에서 로그아웃' 하고 구글 비밀번호를 바꾸세요)</summary>
          <ul className="mt-1 space-y-0.5">
            {st.recentLogins.map((l: any, i: number) => <li key={i} className="break-all text-zinc-500"><b className="text-zinc-700 dark:text-zinc-200">{new Date(l.at).toLocaleString('ko-KR')}</b> · {l.how} · {l.ip} · {l.ua}</li>)}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={async () => { if (!await confirmSheet('다른 기기(이 기기 포함)의 관리자 로그인을 모두 끊을까요?')) return; try { await adminLogoutAll(); window.location.href = '/'; } catch (e: any) { setMsg(String(e?.message || e)); } }} className={`${btn} bg-red-600 text-white`}>모든 기기에서 로그아웃</button>
        {st?.enabled && <button type="button" onClick={async () => { if (!await confirmSheet('복구 코드를 새로 받을까요? 인증 앱은 그대로 쓰고, 예전 복구 코드는 모두 못 쓰게 돼요.')) return; try { const r = await mutate('mfaNewRecovery'); setCodes(r.recoveryCodes || []); load(); } catch (e: any) { setMsg(String(e?.message || e)); } }} className={`${btn} bg-purple-600 text-white`}>복구 코드 새로 받기</button>}
        {st?.enabled && <button type="button" onClick={async () => { if (!await confirmSheet('인증 앱을 다시 설정할까요? 지금 앱의 코드와 복구 코드는 더 이상 안 돼요.')) return; try { await mutate('mfaReset'); const { auth } = await import('../../../../lib/firebase'); await auth.currentUser?.getIdToken(true); window.location.reload(); } catch (e: any) { setMsg(String(e?.message || e)); } }} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>인증 앱 다시 설정 (새 복구 코드)</button>}
      </div>
      {codes.length > 0 && (
        <div className="rounded-xl border border-emerald-300/60 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 break-keep">새 복구 코드예요. 지금 한 번만 보여요. 휴대폰을 잃어버렸을 때 6자리 코드 대신 쓰고, 코드마다 한 번씩만 쓸 수 있어요.</p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm font-bold text-zinc-800 dark:text-zinc-100">
            {codes.map((c) => <span key={c} className="py-1.5 text-center rounded-lg bg-white dark:bg-zinc-800 select-all">{c}</span>)}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { try { navigator.clipboard.writeText(codes.join('\n')); setMsg(''); } catch {} }} className={`${btn} bg-white dark:bg-zinc-800`}>복사하기</button>
            <button type="button" onClick={() => setCodes([])} className={`${btn} bg-zinc-900 text-white dark:bg-white dark:text-zinc-900`}>보관했어요</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-red-500">{msg}</p>}
    </div>
  );
}
