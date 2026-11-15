import { useMemo, useState } from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { youtubeIdOf } from '../../../utils/cafeImport';
import { findErrorStops, type ErrorCandidate, type StreamVod } from '../../../utils/streamErrors';
import { loadFreshLogs } from '../../../hooks/useFirebaseData';

/**
 * 관리자 › 기록 추가 › 끊긴 생방 (방송 오류)
 * 30분 이하로 끝나고 곧바로 1시간 넘게 다시 켠 생방을 찾아서 '방송 오류로 꺼짐'으로 처리하거나 풀어 줌
 * - 따로 기록된 짧은 방송 → 그 기록에 errorStopOf(이어서 켠 방송 기록) : 사이트에서 한 방송으로 합쳐 보임
 * - 같은 기록 안의 짧은 다시보기 → errorStop 표시
 * - 생방 길이·시작 시각은 유튜브 정보(video_meta, 저장된 것은 다시 부르지 않음)
 */
const API = (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
const kst = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const yid = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');

export function AdminStreamErrors({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [cands, setCands] = useState<ErrorCandidate[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const logs = data.logs as Record<string, any>;
  const isOn = (c: ErrorCandidate) => (c.sameLog
    ? (logs[c.short.logId]?.vods || []).some((v: any) => yid(v) === c.short.id && v.errorStop)
    : logs[c.short.logId]?.errorStopOf === c.main.logId);
  const flagged = useMemo(() => Object.values(logs).filter((l: any) => l?.errorStopOf || (l?.vods || []).some((v: any) => v?.errorStop)).length, [logs]);

  const scan = async () => {
    setBusy('scan'); setMsg('');
    try {
      const own = new Map<string, string>();
      Object.values(logs).forEach((l: any) => (l?.vods || []).forEach((v: any) => { const id = yid(v); if (id && !own.has(id)) own.set(id, l.id); }));
      const ids = [...own.keys()];
      const vods: StreamVod[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const r = await fetch(`${API}/api/videos/meta?live=1&ids=${ids.slice(i, i + 50).join(',')}`);
        const j = await r.json().catch(() => ({}));
        Object.entries(j?.videos || {}).forEach(([id, m]: [string, any]) => { if (m?.liveAt) vods.push({ id, logId: own.get(id)!, start: Date.parse(m.liveAt), durationSec: Number(m.durationSec || 0) }); });
        setMsg(`생방 정보 읽는 중 ${Math.min(i + 50, ids.length)}/${ids.length}`);
      }
      const c = findErrorStops(vods);
      setCands(c);
      setMsg(`생방 ${vods.length}개 중 끊긴 것 ${c.length}개`);
    } catch (e: any) { setMsg(`못 읽었어요: ${String(e?.message || e).slice(0, 80)}`); }
    setBusy('');
  };

  const toggle = async (c: ErrorCandidate, on: boolean) => {
    if (!onUpdateLog) return;
    setBusy(c.short.id);
    try {
      const fresh = await loadFreshLogs([String(logs[c.short.logId]?.date || '').slice(0, 7)], [c.short.logId]);
      const l: any = fresh[c.short.logId];
      if (!l) throw new Error('기록을 못 찾았어요');
      if (c.sameLog) await onUpdateLog({ ...l, vods: (l.vods || []).map((v: any) => (yid(v) === c.short.id ? (on ? { ...v, errorStop: true } : (({ errorStop, ...rest }) => rest)(v)) : v)) });
      else if (on) await onUpdateLog({ ...l, errorStopOf: c.main.logId });
      else { const { errorStopOf, ...rest } = l; await onUpdateLog({ ...rest, errorStopOf: null } as any); }
      setMsg(on ? '방송 오류로 처리했어요' : '원래대로 돌렸어요');
    } catch (e: any) { setMsg(`못 했어요: ${String(e?.message || e).slice(0, 80)}`); }
    setBusy('');
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs">
      <div className="flex items-center gap-2"><PlugZap className="w-4 h-4 text-amber-500" /><b className="text-sm text-zinc-900 dark:text-white">끊긴 생방 (방송 오류)</b></div>
      <p className="text-zinc-500 break-keep leading-relaxed">30분 안에 끝나고 2시간 안에 다시 켜서 1시간 넘게 한 생방은 방송 오류로 꺼진 것으로 봐요. 따로 기록된 짧은 방송은 사이트에서 이어서 켠 방송에 합쳐서 하나로 보여요. 지금 처리된 기록 {flagged}개.</p>
      <button type="button" disabled={!!busy} onClick={() => void scan()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 cursor-pointer disabled:opacity-50">
        {busy === 'scan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} 끊긴 생방 찾기
      </button>
      {cands && cands.length > 0 && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-800">
          {cands.map((c) => {
            const on = isOn(c);
            return (
              <li key={c.short.id} className="p-2.5 flex items-center justify-between gap-2">
                <span className="break-keep text-zinc-700 dark:text-zinc-200">
                  {kst(c.short.start)} <b>{Math.round(c.short.durationSec / 60)}분</b> → {kst(c.main.start).slice(11)} 다시 켜서 {Math.round(c.main.durationSec / 60)}분
                  <span className="text-zinc-400"> · {c.sameLog ? '같은 기록' : `따로 기록됨 (${logs[c.short.logId]?.date})`}</span>
                </span>
                <button type="button" disabled={!!busy || !onUpdateLog} onClick={() => void toggle(c, !on)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer disabled:opacity-50 ${on ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>
                  {busy === c.short.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : on ? '오류로 처리됨' : '오류로 처리'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="text-zinc-500">{msg}</p>}
    </div>
  );
}
