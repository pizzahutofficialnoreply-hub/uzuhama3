import React, { useState } from 'react';
import { Eye, Rocket, Save, X } from 'lucide-react';
import type { SystemConfig } from '../../../../types';
import { DEFAULT_GATE, ServiceGateScreen, type GateMode } from '../../../ServiceGate';
import { confirmSheet, toast } from '../../../../utils/ui';

/**
 * 관리자 › 처음 시작 화면 › 서비스 단계
 * 보통 / 런칭 준비(오픈 시각까지 카운트다운, 아래는 사이트 소개 미리 보기) / 잠시 중지 / 종료(편지)
 * 저장하면 방문자 화면 전체가 바로 그 화면으로 바뀜 (관리자 페이지는 그대로)
 */
const input = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white';
const MODES: [NonNullable<SystemConfig['serviceMode']>, string, string][] = [
  ['normal', '보통', '사이트가 평소처럼 열려 있어요'],
  ['prelaunch', '런칭 준비', '오픈 시각까지 카운트다운 · 아래로 넘기면 사이트 소개'],
  ['paused', '잠시 중지', '잠시 멈췄다는 안내 · 아래로 넘기면 안내 글'],
  ['ended', '서비스 종료', '고마웠다는 인사 · 아래로 넘기면 편지'],
];
// datetime-local ↔ 한국 시간 ISO
const toLocal = (iso?: string) => { const t = Date.parse(String(iso || '')); if (!Number.isFinite(t)) return ''; return new Date(t + 9 * 3600000).toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? `${v}:00+09:00` : '');

export function ServiceModeCard({ system, onUpdateSystemConfig }: { system: Partial<SystemConfig>; onUpdateSystemConfig?: (cfg: Partial<SystemConfig>) => Promise<void> | void }) {
  const [mode, setMode] = useState<NonNullable<SystemConfig['serviceMode']>>(system.serviceMode || 'normal');
  const [launchAt, setLaunchAt] = useState(toLocal(system.launchAt));
  const [title, setTitle] = useState(system.serviceTitle || '');
  const [message, setMessage] = useState(system.serviceMessage || '');
  const [letter, setLetter] = useState(system.serviceLetter || '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const gm = mode === 'normal' ? null : (mode as GateMode);
  const def = gm ? DEFAULT_GATE[gm] : null;
  const draft: Partial<SystemConfig> = { serviceMode: mode, launchAt: fromLocal(launchAt), serviceTitle: title.trim(), serviceMessage: message.trim(), serviceLetter: letter.trim() };

  const save = async () => {
    if (mode === 'prelaunch' && !launchAt) { toast('오픈 시각을 정해 주세요', 'error'); return; }
    if (mode !== (system.serviceMode || 'normal') && mode !== 'normal' && !(await confirmSheet(`방문자 화면 전체가 '${MODES.find((m) => m[0] === mode)?.[1]}' 화면으로 바뀌어요. 저장할까요?`))) return;
    setBusy(true);
    try { await onUpdateSystemConfig?.(draft); toast('서비스 단계를 저장했어요', 'success'); } catch (e: any) { toast(`저장 못 했어요: ${e?.message || e}`, 'error'); }
    setBusy(false);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Rocket className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 서비스 단계</h3>
        <p className="text-[11px] text-zinc-500 mt-0.5 break-keep">런칭 전·잠시 중지·종료 때 방문자 화면 전체를 앱 아이콘이 있는 안내 화면으로 바꿔요 (점검 화면과 같은 모양). 관리자 페이지는 그대로 쓸 수 있어요.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(([k, l, d]) => (
          <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
            className={`text-left p-3 rounded-xl border cursor-pointer ${mode === k ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40' : 'border-zinc-200 dark:border-zinc-700'}`}>
            <p className="text-xs font-black text-zinc-900 dark:text-white">{l}</p>
            <p className="text-[10.5px] text-zinc-500 break-keep mt-0.5">{d}</p>
          </button>
        ))}
      </div>
      {gm && (
        <div className="space-y-2">
          {gm === 'prelaunch' && (
            <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-300">오픈 시각 (한국 시간 · 이 시각이 지나면 저절로 열려요)
              <input type="datetime-local" value={launchAt} onChange={(e) => setLaunchAt(e.target.value)} className={`${input} mt-1`} />
            </label>
          )}
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-300">큰 제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={def!.title} className={`${input} mt-1`} />
          </label>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-300">한 줄 안내
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={def!.message} className={`${input} mt-1`} />
          </label>
          <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-300">{gm === 'prelaunch' ? '아래 장: 사이트 소개 (마크다운)' : gm === 'ended' ? '아래 장: 편지 (마크다운)' : '아래 장: 안내 글 (마크다운)'}
            <textarea value={letter} onChange={(e) => setLetter(e.target.value)} placeholder={def!.letter} rows={7} className={`${input} mt-1 font-mono`} />
          </label>
          <p className="text-[10.5px] text-zinc-400">비워 두면 회색 글씨(기본 글)로 나가요.</p>
        </div>
      )}
      <div className="flex gap-2">
        {gm && <button type="button" onClick={() => setPreview(true)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer"><Eye className="w-4 h-4" /> 미리 보기</button>}
        <button type="button" disabled={busy} onClick={save} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"><Save className="w-4 h-4" /> 저장</button>
      </div>
      {preview && gm && (
        <div className="fixed inset-0 z-[500] bg-zinc-50 dark:bg-black">
          <ServiceGateScreen mode={gm} system={draft} />
          <button type="button" onClick={() => setPreview(false)} className="fixed top-[calc(env(safe-area-inset-top,0px)+12px)] right-3 z-[501] p-2.5 rounded-full bg-black/60 text-white cursor-pointer" aria-label="미리 보기 닫기"><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
}
