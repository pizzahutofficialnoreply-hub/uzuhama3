import { noteReads } from '../../../utils/readStats';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { db } from '../../../lib/firebase';
import type { BroadcastLog, SystemConfig } from '../../../types';
import { confirmSheet } from '../../../utils/ui';

/**
 * 관리자 > 이력: 누가 언제 방송 기록·시스템 설정을 바꿨는지, 그리고 되돌리기
 * (서버가 저장할 때마다 바뀌기 전 모습을 admin_audit 에 남김)
 */
const LABEL: Record<string, string> = { addLog: '기록 추가', updateLog: '기록 수정', deleteLog: '기록 삭제', updateSystemConfig: '설정 변경', note: '알림', site: '사이트 수정', restoreBefore: '시점 복원', data_fix: '데이터 고침', uploadImage: '그림 올림', backupImport: '백업 복원', ytSync: '편집본 자동 연결' };

/** 사이트 코드가 바뀐 기록 (공개 저장소의 커밋, 임시 확인용은 뺌) */
async function loadSiteChanges(): Promise<any[]> {
  try {
    const r = await fetch('https://api.github.com/repos/pizzahutofficialnoreply-hub/uzuhama3/commits?per_page=100');
    if (!r.ok) return [];
    const list = await r.json();
    return (Array.isArray(list) ? list : []).map((c: any) => {
      const msg = String(c?.commit?.message || '');
      const first = msg.split('\n')[0];
      const body = msg.split('\n').slice(1).filter((l) => l.trim() && !/^(Co-Authored-By|Claude-Session):/.test(l)).join('\n').trim();
      return { id: `c-${c.sha}`, action: 'site', at: c?.commit?.author?.date || '', text: first, detail: body, by: 'Claude' };
    }).filter((x: any) => x.text && !/^tmp|임시/.test(x.text));
  } catch { return []; }
}
const FIELD: Record<string, string> = { date: '날짜', time: '시작', endTime: '끝', game: '게임', games: '게임', category: '장르', vods: '다시보기', edited: '편집본', shorts: '쇼츠', durationHours: '길이', memo: '메모', isAbsence: '휴방' };

function changed(a: any, b: any): string[] {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => !k.startsWith('_') && k !== 'updatedAt' && JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null));
}

export function AdminAuditTab({ onAddLog, onUpdateLog, onDeleteLog, onUpdateSystemConfig }: {
  onAddLog: (l: BroadcastLog) => Promise<void>;
  onUpdateLog: (l: BroadcastLog) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  onUpdateSystemConfig?: (s: Partial<SystemConfig>) => Promise<void>;
}) {
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'log' | 'note' | 'site'>('all');
  const load = () => Promise.all([
    getDocs(query(collection(db, 'admin_audit'), orderBy('at', 'desc'), limit(200)))
      .then((s) => { noteReads('admin_audit(관리자)', Math.max(1, s.size)); return s.docs.map((d) => ({ id: d.id, ...d.data() })); })
      .catch(() => [] as any[]),
    loadSiteChanges(),
  ]).then(([a, c]) => setItems([...a, ...c].sort((x: any, y: any) => String(y.at || '').localeCompare(String(x.at || '')))));
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => (items || [])
    .filter((x) => kind === 'all' || (kind === 'note' ? x.action === 'note' : kind === 'site' ? x.action === 'site' : !['note', 'site'].includes(x.action)))
    .filter((x) => !q.trim() || `${x.date || ''} ${x.logId || ''} ${LABEL[x.action] || ''} ${x.text || ''} ${x.detail || ''}`.includes(q.trim())), [items, q, kind]);

  const undo = async (x: any) => {
    const what = `${x.at?.slice(0, 16).replace('T', ' ')} ${LABEL[x.action] || x.action}${x.date ? ` (${x.date})` : ''}`;
    if (!await confirmSheet(`${what} 을(를) 되돌릴까요?`)) return;
    setBusy(x.id);
    try {
      if (x.action === 'updateSystemConfig') await onUpdateSystemConfig?.(x.before || {});
      else if (x.action === 'deleteLog' && x.before) await onAddLog(x.before);
      else if (x.before) await onUpdateLog(x.before);
      else if (x.logId) await onDeleteLog(x.logId); // 새로 추가했던 것
      await load();
    } catch (e: any) { alert('되돌리지 못했어요: ' + (e?.message || e)); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-purple-600" /> 수정 이력</h3>
        <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500">방송 기록을 추가·수정·삭제하거나 시스템 설정을 바꿀 때마다 바뀌기 전 모습이 남아요. '되돌리기'를 누르면 그때로 돌아가요 (되돌린 것도 이력에 남아요). 관리자 화면에 뜬 알림과 사이트 코드가 바뀐 내용(사이트 수정)도 함께 보여요.</p>
        <div className="flex flex-wrap gap-1.5">
          {([['all', '전체'], ['log', '기록·설정'], ['note', '알림'], ['site', '사이트 수정']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`px-2.5 py-1 rounded-full text-[length:calc(11px*var(--fs,1))] font-bold cursor-pointer ${kind === k ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>{l}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="날짜(2025-10-07)·종류·내용으로 찾기" className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
      </div>
      {items === null ? <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…</p> : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">이력이 없어요. 이 기능을 넣은 뒤부터 쌓여요.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x) => {
            const keys = x.action === 'updateSystemConfig' ? Object.keys(x.after || {}) : changed(x.before, x.after);
            return (
              <li key={x.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 text-xs flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-900 dark:text-white">
                    <span className={`mr-1.5 px-1.5 py-0.5 rounded text-[length:calc(10px*var(--fs,1))] ${x.action === 'deleteLog' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : x.action === 'addLog' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'}`}>{LABEL[x.action] || x.action}</span>
                    {x.text ? <span className="font-semibold break-keep">{x.text}</span> : <>{x.date || ''} {x.after?.game || x.before?.game || ''}</>}
                  </p>
                  {x.detail && <details className="mt-1 text-zinc-600 dark:text-zinc-300"><summary className="cursor-pointer text-[length:calc(11px*var(--fs,1))]">자세히</summary><p className="mt-1 whitespace-pre-line break-keep">{x.detail}</p></details>}
                  <p className="mt-0.5 text-zinc-500">{x.at ? new Date(x.at).toLocaleString('ko-KR') : ''} · {x.by || '관리자'}</p>
                  {keys.length > 0 && <p className="mt-1 text-zinc-600 dark:text-zinc-300">바뀐 칸: {keys.slice(0, 8).map((k) => FIELD[k] || k).join(', ')}{keys.length > 8 ? ` 외 ${keys.length - 8}개` : ''}</p>}
                </div>
                {(x.before || x.action === 'addLog') && (
                  <button type="button" disabled={!!busy} onClick={() => undo(x)} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
                    {busy === x.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} 되돌리기
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
