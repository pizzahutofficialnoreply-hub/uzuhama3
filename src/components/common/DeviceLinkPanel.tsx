import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { createPairCode, joinWithCode, syncNow, unlinkAll, unlinkThisDevice, useDeviceLink } from '../../utils/deviceSync';
import { confirmSheet } from '../../utils/ui';

/**
 * 설정 › 기기 연결: QR·8자리 코드로 다른 기기와 검색 기록·시청 기록·재생목록 맞추기 (로그인 없음)
 * 아이폰 홈 화면 앱은 사파리와 저장 공간이 따로라, 홈 화면 앱에서는 QR 대신 코드 입력
 */
const ago = (t?: number) => {
  if (!t) return '아직';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`;
};

export function DeviceLinkPanel() {
  const link = useDeviceLink();
  const [pair, setPair] = useState<{ code: string; exp: number; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!pair) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [pair]);
  const left = pair ? Math.max(0, Math.ceil((pair.exp - now) / 1000)) : 0;

  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); } };
  const makeCode = () => run(async () => {
    const p = await createPairCode();
    const url = `${window.location.origin}/?link=${p.code}`;
    setPair({ ...p, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
  });
  const join = () => run(async () => { await joinWithCode(input); setInput(''); });
  const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50';

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed break-keep">
        로그인 없이 내 휴대폰·PC·태블릿끼리 <b>검색 기록 · 시청 기록(이어 보기) · 내 재생목록</b>을 맞춰요. 연결 코드를 넣은 기기끼리만 공유되고, 코드는 10분 동안 한 번만 쓸 수 있어요.
      </p>

      {link ? (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-2">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><Check className="w-4 h-4" /> 이 기기는 연결돼 있어요</p>
          <p className="text-[11px] text-zinc-500">마지막으로 맞춘 때: {ago(link.lastSync)}{link.lastError ? ` · 문제: ${link.lastError}` : ''}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={busy} onClick={() => run(syncNow)} className={`${btn} bg-white dark:bg-zinc-800`}><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> 지금 맞추기</button>
            <button type="button" onClick={async () => { if (await confirmSheet('이 기기만 연결을 끊을까요? 이 기기의 기록은 그대로 남아요.')) { unlinkThisDevice(); setPair(null); } }} className={`${btn} bg-white dark:bg-zinc-800`}><Unlink className="w-3.5 h-3.5" /> 이 기기 연결 끊기</button>
            <button type="button" onClick={async () => { if (await confirmSheet('연결된 모든 기기의 연결을 끊을까요? 각 기기의 기록은 그대로 남고, 서버에 맞춰 둔 내용만 지워져요.')) run(async () => { await unlinkAll(); setPair(null); }); }} className={`${btn} text-red-600 bg-red-500/10`}>모든 기기 연결 끊기</button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-white">{link ? '다른 기기 더 연결하기' : '이 기기에서 연결 만들기'}</p>
          {!pair || left <= 0 ? (
            <button type="button" disabled={busy} onClick={makeCode} className={`${btn} w-full bg-purple-600 text-white`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} QR·연결 코드 만들기</button>
          ) : (
            <div className="text-center space-y-2">
              <img src={pair.qr} alt="기기 연결 QR" className="mx-auto w-44 h-44 rounded-xl bg-white p-1" />
              <p className="font-mono text-xl font-black tracking-[0.2em] text-zinc-900 dark:text-white select-all">{pair.code.slice(0, 4)}-{pair.code.slice(4)}</p>
              <p className="text-[11px] text-zinc-500 tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} 안에 다른 기기에서 써 주세요</p>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(pair.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>{copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} 코드 복사</button>
            </div>
          )}
          <p className="text-[10.5px] text-zinc-400 leading-snug break-keep">다른 기기 카메라로 QR을 찍거나, 그 기기의 설정 › 기기 연결에 코드를 넣어요. 아이폰 홈 화면 앱은 QR로 열면 사파리로 열려서, 앱에서는 코드를 넣어 주세요.</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-white">다른 기기의 코드 넣기</p>
          <div className="flex gap-1.5">
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') join(); }} placeholder="ABCD-1234" maxLength={9} autoCapitalize="characters" autoComplete="off" className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-sm tracking-widest" />
            <button type="button" disabled={busy || input.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={join} className={`${btn} bg-zinc-900 dark:bg-white text-white dark:text-zinc-900`}>연결</button>
          </div>
          <p className="text-[10.5px] text-zinc-400 leading-snug break-keep">연결하면 이 기기의 기록과 합쳐져요 (지워지지 않아요).</p>
        </div>
      </div>
      {err && <p className="text-xs font-bold text-red-500">{err}</p>}
    </div>
  );
}
