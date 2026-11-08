import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock, ExternalLink, Gamepad2, Link2Off, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { mutate } from './SearchTuningCard';

/** 관리자 › 자동화: 방송 기록 데이터 검증 (하루 한 번 자동) — 방송 시간·게임 이름·게임 링크 */
const TYPE: Record<string, { label: string; icon: any; color: string }> = {
  time: { label: '방송 시간', icon: Clock, color: 'text-sky-600' },
  game: { label: '게임 이름', icon: Gamepad2, color: 'text-amber-600' },
  link_dead: { label: '없는 링크', icon: Link2Off, color: 'text-red-600' },
  link: { label: '다른 게임 링크?', icon: Link2Off, color: 'text-orange-600' },
};

export function DataCheckCard() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { setD(await mutate('dataCheck', { op: 'get' })); } catch (e: any) { setMsg(String(e?.message || e)); } }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (op: string, id = '') => {
    setBusy(id || op); setMsg('');
    try { const r = await mutate('dataCheck', { op, id }); if (op === 'run') setMsg(`검증 끝: ${Object.entries(r.counts || {}).map(([k, v]) => `${TYPE[k]?.label || k} ${v}`).join(' · ') || '문제 없음'}`); await load(); }
    catch (e: any) { setMsg('오류: ' + String(e?.message || e)); }
    finally { setBusy(''); }
  };
  const issues: any[] = (d?.issues || []).filter((i: any) => filter === 'all' || i.type === filter);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" /> 데이터 검증</h3>
        <button type="button" disabled={!!busy} onClick={() => act('run')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer disabled:opacity-50">{busy === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 지금 검증 (1~4분)</button>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed break-keep">
        하루 한 번 자동: ① 다시보기가 유튜브 생방송 기록이면 실제 시작·끝 시각과 방송 기록 비교 ② 영상 제목·설명란·AI가 영상에서 본 게임과 기록된 게임 이름 비교 (안 맞으면 AI가 판단) ③ 게임 링크를 실제로 열어 없는 페이지·다른 게임 페이지인지 확인.
        자동으로 고치지는 않아요. '적용'을 누르면 고치고, 고치기 전 모습은 수정 기록에 남아요. 치지직은 다시보기를 남기지 않고, 옛 트위치 기록은 공식 API로 볼 수 없어서 비교하지 않아요.
      </p>
      {d?.at && <p className="text-[11px] text-zinc-400">마지막 검증 {new Date(d.at).toLocaleString('ko-KR')} · 기록 {d.stats?.logs ?? '-'}개 · 유튜브 영상 {d.stats?.videos ?? '-'}개 · 시간 비교 {d.stats?.timeChecked ?? '-'} · 게임 비교 {d.stats?.gameChecked ?? '-'} (AI {d.stats?.ai ?? 0}번) · 링크 확인 {d.stats?.linksChecked ?? '-'}</p>}
      {msg && <p className="text-xs font-semibold text-purple-600">{msg}</p>}
      <div className="flex flex-wrap gap-1.5">
        {['all', ...Object.keys(TYPE)].map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${filter === k ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>
            {k === 'all' ? `전체 ${(d?.issues || []).length}` : `${TYPE[k].label} ${d?.counts?.[k] || 0}`}
          </button>
        ))}
      </div>
      {!d ? <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…</div> : issues.length === 0 ? (
        <p className="text-xs text-zinc-500">{d.at ? '문제 없어요.' : '아직 검증한 적 없어요. 오늘 안에 자동으로 해요.'}</p>
      ) : (
        <ul className="space-y-1.5 max-h-[28rem] overflow-y-auto">
          {issues.slice(0, 150).map((i) => {
            const T = TYPE[i.type] || TYPE.game;
            const Icon = T.icon;
            return (
              <li key={i.id} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${T.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-zinc-800 dark:text-zinc-100">{i.date} · {T.label}</p>
                    <p className="text-zinc-600 dark:text-zinc-300 break-all">{i.msg}</p>
                    {i.fix?.length > 0 && <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">제안: {i.fix.map((f: any) => `${f.field === 'time' ? '시작' : f.field === 'endTime' ? '끝' : f.field === 'game' ? '게임' : f.field} ${f.from || '-'} → ${f.to}`).join(' · ')}</p>}
                  </div>
                  {i.video && <a href={`https://www.youtube.com/watch?v=${i.video}`} target="_blank" rel="noreferrer" className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="영상 보기"><ExternalLink className="w-3.5 h-3.5" /></a>}
                </div>
                <div className="flex gap-1.5 mt-2 justify-end">
                  {i.fix?.length > 0 && <button type="button" disabled={!!busy} onClick={() => act('apply', i.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50">{busy === i.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 적용</button>}
                  <button type="button" disabled={!!busy} onClick={() => act('ignore', i.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"><X className="w-3 h-3" /> 무시</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
