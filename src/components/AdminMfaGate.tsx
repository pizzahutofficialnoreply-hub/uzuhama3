import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { KeyRound, Loader2, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { auth } from '../lib/firebase';

/**
 * 관리자 2단계 인증 (구글 로그인 다음)
 * - 처음: 인증 앱에 등록(QR) → 6자리 코드로 확인 → 복구 코드 10개 보관
 * - 그다음부터: 관리자 화면을 열 때마다 6자리 코드 (또는 복구 코드)
 * - 통과하면 4시간 유지, 30분 동안 아무것도 안 하면 다시 잠금
 * 실제로 막는 건 서버(api/_adminAuth.ts)와 Firestore 보안 규칙 — 이 화면을 건너뛰어도 데이터는 못 바꿈
 */
const IDLE_MS = 30 * 60 * 1000;
const mutateUrl = () => (/vercel\.app$|^localhost$|^127\./.test(window.location.hostname) ? '/api/admin/mutate' : 'https://uzuhama.vercel.app/api/admin/mutate');

async function call(action: string, extra: Record<string, any> = {}) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(mutateUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

export async function adminMfaValid(): Promise<number> {
  try {
    const t = await auth.currentUser?.getIdTokenResult();
    const until = Number((t?.claims as any)?.adm2fa || 0);
    return until > Date.now() ? until : 0;
  } catch { return 0; }
}

export const ADMIN_MFA_LOCK_EVENT = 'uzuhama_admin_mfa_lock';
export const adminLogoutAll = () => call('mfaLogoutAll');

export function AdminMfaGate({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'setup' | 'verify' | 'codes' | 'ok'>('checking');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [useRecovery, setUseRecovery] = useState(false);
  const lastActive = useRef(Date.now());

  const check = useCallback(async () => {
    setErr('');
    if (await adminMfaValid()) { setPhase('ok'); return; }
    try {
      const st = await call('mfaStatus');
      if (st.enabled) setPhase('verify');
      else {
        const s = await call('mfaBeginSetup');
        setSecret(s.secret); setUri(s.uri);
        setQr(await QRCode.toDataURL(s.uri, { margin: 1, width: 220 }));
        setPhase('setup');
      }
    } catch (e: any) { setErr(String(e?.message || e)); setPhase('verify'); }
  }, []);
  useEffect(() => { check(); }, [check]);

  // 4시간이 지나거나, 30분 동안 아무것도 안 하면 다시 잠금
  useEffect(() => {
    if (phase !== 'ok') return;
    const bump = () => { lastActive.current = Date.now(); };
    ['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const lockNow = () => setPhase('verify');
    window.addEventListener(ADMIN_MFA_LOCK_EVENT, lockNow);
    const t = window.setInterval(async () => {
      if (Date.now() - lastActive.current > IDLE_MS || !(await adminMfaValid())) setPhase('verify');
    }, 30000);
    return () => { ['pointerdown', 'keydown', 'scroll'].forEach((ev) => window.removeEventListener(ev, bump)); window.removeEventListener(ADMIN_MFA_LOCK_EVENT, lockNow); window.clearInterval(t); };
  }, [phase]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (phase === 'setup') {
        const r = await call('mfaConfirmSetup', { code });
        await auth.currentUser?.getIdToken(true);
        setCodes(r.recoveryCodes || []);
        setPhase('codes');
      } else {
        const r = await call('mfaVerify', { code });
        await auth.currentUser?.getIdToken(true); // 새 표시(adm2fa)가 붙은 토큰으로 → DB 쓰기도 열림
        lastActive.current = Date.now();
        if (typeof r.recoveryLeft === 'number' && r.recoveryLeft <= 3) window.alert(`복구 코드가 ${r.recoveryLeft}개 남았어요. 관리자 보안 카드에서 인증 앱을 다시 설정해 새 복구 코드를 받아 두세요.`);
        setPhase('ok');
      }
      setCode('');
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  if (phase === 'ok') return <>{children}</>;

  const box = 'w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-7 shadow-2xl text-center space-y-4';
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center p-6">
      {phase === 'checking' && <Loader2 className="w-7 h-7 animate-spin text-purple-500" />}

      {phase === 'codes' && (
        <div className={box}>
          <KeyRound className="w-10 h-10 mx-auto text-emerald-500" />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">복구 코드를 보관하세요</h2>
          <p className="text-xs text-zinc-500 leading-relaxed break-keep">휴대폰을 잃어버렸을 때 6자리 코드 대신 쓰는 코드예요. <b>지금 한 번만 보여요.</b> 각각 한 번씩만 쓸 수 있어요. 비밀번호 관리자나 종이에 적어 두세요.</p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-sm font-bold text-zinc-800 dark:text-zinc-100">
            {codes.map((c) => <span key={c} className="py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 select-all">{c}</span>)}
          </div>
          <button type="button" onClick={() => { try { navigator.clipboard.writeText(codes.join('\n')); } catch {} }} className="w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">복사하기</button>
          <button type="button" onClick={() => setPhase('ok')} className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold cursor-pointer">보관했어요, 들어가기</button>
        </div>
      )}

      {(phase === 'setup' || phase === 'verify') && (
        <div className={box}>
          <div className="w-14 h-14 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
            {phase === 'setup' ? <Smartphone className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{phase === 'setup' ? '2단계 인증 설정' : '2단계 인증'}</h2>
          {phase === 'setup' ? (
            <>
              <p className="text-xs text-zinc-500 leading-relaxed break-keep">아이폰 '암호' 앱·구글 OTP(Google Authenticator)·Microsoft Authenticator 같은 인증 앱으로 아래 QR을 찍거나, 휴대폰이면 '앱에 바로 추가'를 누르세요. 그다음 앱에 뜨는 6자리 숫자를 넣어요.</p>
              {qr && <img src={qr} alt="인증 앱 등록 QR" className="mx-auto w-48 h-48 rounded-xl bg-white p-1" />}
              <a href={uri} className="block text-xs font-bold text-purple-600 underline">휴대폰 인증 앱에 바로 추가</a>
              <details className="text-[11px] text-zinc-500"><summary className="cursor-pointer">직접 입력할 설정 키 (이건 코드가 아니에요)</summary><p className="mt-1 font-mono break-all select-all">{secret.replace(/(.{4})/g, '$1 ').trim()}</p><p className="mt-1">앱에 이 키를 넣으면, 앱에 30초마다 바뀌는 <b>6자리 숫자</b>가 생겨요. 그 숫자를 아래에 넣어요.</p></details>
            </>
          ) : (
            <p className="text-xs text-zinc-500 leading-relaxed break-keep">{useRecovery ? '복구 코드(XXXXX-XXXXX)를 넣어요. 한 번 쓰면 다시 못 써요.' : '인증 앱에 뜨는 6자리 숫자를 넣어요.'}</p>
          )}
          <input
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submit(); }}
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            placeholder={useRecovery ? 'XXXXX-XXXXX' : '000000'}
            className="w-full text-center text-2xl font-mono tracking-[0.3em] py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {err && <p className="text-xs text-red-500 bg-red-500/10 p-2 rounded-xl break-keep">{err}</p>}
          <button type="button" disabled={busy || (!useRecovery && code.length !== 6)} onClick={submit} className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} 확인
          </button>
          {phase === 'verify' && (
            <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setErr(''); }} className="text-[11px] text-zinc-500 underline cursor-pointer">
              {useRecovery ? '6자리 코드로 하기' : '휴대폰이 없어요 (복구 코드)'}
            </button>
          )}
          <button type="button" onClick={onCancel} className="w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"><LogOut className="w-3.5 h-3.5" /> 나가기</button>
        </div>
      )}
    </div>
  );
}
