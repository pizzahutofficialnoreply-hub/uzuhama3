import { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { History, Loader2, Tag, Undo2 } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { db } from '../../../lib/firebase';
import { normalizeHistorical } from '../../../utils/archiveOverlay';
import { youtubeIdOf } from '../../../utils/cafeImport';
import { confirmSheet } from '../../../utils/ui';

/**
 * 카페 가져오기로 넣은 것 관리 (관리자 › 등록 › 카페 정리 글 가져오기 아래)
 * - 수정 이력(admin_audit)에서 고른 시간 동안 바뀐 방송 기록을 모아, 그 시간 전 모습과 지금을 비교
 * - 표시 달기: 그 사이 새로 들어간 링크에 cafe 표시 → 설정 › 실험실 '과거 영상 생방 연동'으로 2020년 전 것을 끄고 켬
 * - 전체 되돌리기: 기록마다 다시보기·편집본·쇼츠를 그 시간 전 모습으로, 새로 만든 기록은 지우고, 지운 기록은 되살리고,
 *   그때 만든 '여러 생방 연결(웃음참기 방식)' 묶음도 지움
 */
type Item = any;
const LISTS = ['vods', 'edited', 'shorts'] as const;
const keyOf = (x: Item) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '') || (typeof x === 'string' ? x : x?.url || '');
const toLocalInput = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16);

type Change = {
  logId: string;
  date: string;
  kind: 'added-log' | 'updated' | 'deleted-log';
  before: any | null; // 그 시간 전 모습 (다시보기·편집본·쇼츠 기준)
  current: any | null;
  added: number;
  removed: number;
};

export function AdminCafeUndo({ data, onAddLog, onUpdateLog, onDeleteLog }: {
  data: AppData;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog?: (log: BroadcastLog) => Promise<void>;
  onDeleteLog?: (id: string) => Promise<void>;
}) {
  const [from, setFrom] = useState('2026-11-14T23:00');
  const [to, setTo] = useState(toLocalInput(new Date(Date.now() + 5 * 60000)));
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [comps, setComps] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setBusy('load'); setMsg('');
    try {
      const a = new Date(`${from}:00+09:00`).toISOString();
      const b = new Date(`${to}:00+09:00`).toISOString();
      const snap = await getDocs(query(collection(db, 'admin_audit'), where('at', '>=', a), where('at', '<=', b), orderBy('at')));
      const entries = snap.docs.map((d) => d.data() as any).filter((x) => ['addLog', 'updateLog', 'deleteLog'].includes(x.action) && x.logId);
      let archive: Record<string, any> = {};
      try { const r = await fetch('/data/historical_logs.json'); if (r.ok) archive = normalizeHistorical(await r.json()); } catch { /* */ }
      const first = new Map<string, any>();
      const last = new Map<string, any>();
      entries.forEach((x) => { if (!first.has(x.logId)) first.set(x.logId, x); last.set(x.logId, x); });
      const out: Change[] = [];
      first.forEach((f, logId) => {
        const cur: any = (data.logs as any)[logId] || null;
        const lastAct = last.get(logId)?.action;
        const arch = archive[logId] || null;
        // 그 시간 전 모습: 이력의 before(저장된 사본, 아카이브 기록이면 바뀐 칸만) → 없으면 아카이브 원본
        const base = f.action === 'addLog' && !f.before ? null : { ...(arch || {}), ...(f.before || {}) };
        if (!base && !cur) return; // 넣었다가 이미 지움
        const kind: Change['kind'] = !base ? 'added-log' : !cur && lastAct === 'deleteLog' ? 'deleted-log' : 'updated';
        let added = 0; let removed = 0;
        LISTS.forEach((k) => {
          const bIds = new Set((base?.[k] || []).map(keyOf));
          const cIds = new Set((cur?.[k] || []).map(keyOf));
          cIds.forEach((id) => { if (!bIds.has(id)) added++; });
          bIds.forEach((id) => { if (!cIds.has(id)) removed++; });
        });
        // 일반 영상이 '여러 생방 연결'로 바뀐 것도 바뀐 것
        (cur?.edited || []).forEach((e: any) => { if (e?.multiId && (base?.edited || []).some((x: any) => keyOf(x) === keyOf(e) && !x?.multiId)) added++; });
        if (kind === 'updated' && !added && !removed) return;
        out.push({ logId, date: cur?.date || base?.date || f.date || '', kind, before: base, current: cur, added, removed });
      });
      out.sort((x, y) => x.date.localeCompare(y.date));
      setChanges(out);
      // 그 시간에 만든 여러 생방 연결 묶음
      const cs = await getDocs(collection(db, 'compilations'));
      setComps(cs.docs.filter((d) => { const c: any = d.data(); return c?.kind === 'multi' && String(c.createdAt || '') >= a && String(c.createdAt || '') <= b; }).map((d) => d.id));
    } catch (e: any) { setMsg(`못 불러왔어요: ${e?.message || e}`); }
    setBusy('');
  };

  const total = (changes || []).reduce((s, c) => s + c.added, 0);

  /** 새로 들어간 링크에 cafe 표시 (실험실 '과거 영상 생방 연동' 끄기·켜기용) */
  const mark = async () => {
    if (!changes || !onUpdateLog) return;
    if (!await confirmSheet(`이 시간에 새로 들어간 링크 ${total}개에 '카페 정리에서 가져옴' 표시를 달까요? 링크는 그대로 두고 표시만 달아요.`)) return;
    setBusy('mark');
    let n = 0;
    for (const c of changes) {
      if (!c.current) continue;
      const next: any = { ...c.current };
      let touched = false;
      LISTS.forEach((k) => {
        const bIds = new Set((c.before?.[k] || []).map(keyOf));
        next[k] = (c.current[k] || []).map((x: any) => {
          if (typeof x !== 'object' || !x) return x;
          const wasPlain = k === 'edited' && x.multiId && (c.before?.edited || []).some((y: any) => keyOf(y) === keyOf(x) && !y?.multiId);
          const isNew = !bIds.has(keyOf(x));
          const tag = isNew ? 1 : wasPlain ? 'multi' : null;
          if (!tag || x.cafe === tag) return x;
          touched = true;
          return { ...x, cafe: tag };
        });
      });
      if (c.kind === 'added-log' && !next.cafe) { next.cafe = 1; touched = true; }
      if (touched) { await onUpdateLog(next); n++; setMsg(`표시 다는 중… ${n}개 기록`); }
    }
    setMsg(`표시를 달았어요 (기록 ${n}개). 설정 › 실험실 '과거 영상 생방 연동'을 끄면 2020년 전 것이 안 보여요.`);
    setBusy('');
  };

  const undo = async () => {
    if (!changes) return;
    const nAdd = changes.filter((c) => c.kind === 'added-log').length;
    const nDel = changes.filter((c) => c.kind === 'deleted-log').length;
    if (!await confirmSheet({ title: '카페 가져오기를 전부 되돌릴까요?', message: `기록 ${changes.length}개를 ${from.replace('T', ' ')} 전 모습으로 돌려요. 새로 만든 기록 ${nAdd}개는 지우고, 지웠던 기록 ${nDel}개는 되살리고, 여러 생방 연결 ${comps.length}개도 지워요. 다시보기·편집본·쇼츠만 되돌리고 게임·시간 같은 다른 칸은 그대로예요.`, confirmText: '전부 되돌리기', danger: true })) return;
    setBusy('undo');
    let n = 0;
    const fails: string[] = [];
    for (const c of changes) {
      try {
        if (c.kind === 'added-log') { if (onDeleteLog) await onDeleteLog(c.logId); }
        else if (c.kind === 'deleted-log') { await onAddLog(c.before); }
        else if (onUpdateLog && c.current) {
          const next: any = { ...c.current };
          LISTS.forEach((k) => { next[k] = c.before?.[k] || []; });
          await onUpdateLog(next);
        }
        n++;
        setMsg(`되돌리는 중… ${n}/${changes.length}`);
      } catch (e: any) { fails.push(`${c.date}: ${String(e?.message || e).slice(0, 60)}`); }
    }
    for (const id of comps) { try { await deleteDoc(doc(db, 'compilations', id)); } catch (e: any) { fails.push(`${id}: ${String(e?.message || e).slice(0, 60)}`); } }
    setMsg(`되돌렸어요: 기록 ${n}/${changes.length}개, 여러 생방 연결 ${comps.length}개.${fails.length ? ` 실패 ${fails.length}개 — ${fails.slice(0, 3).join(' / ')}` : ''}`);
    setChanges(null);
    setBusy('');
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50';
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs" data-testid="cafe-undo">
      <div className="flex items-center gap-2"><History className="w-4 h-4 text-purple-500" /><b className="text-sm text-zinc-900 dark:text-white">가져온 것 관리 (표시 달기 · 전체 되돌리기)</b></div>
      <p className="text-zinc-500 break-keep leading-relaxed">고른 시간 동안 수정 이력에 남은 방송 기록 변경을 모아서, 그 시간 전 모습과 비교해요. 카페 가져오기를 한 시간으로 맞춰 주세요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
        <span>~</span>
        <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" />
        <button type="button" disabled={!!busy} onClick={() => void load()} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>{busy === 'load' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} 바뀐 것 불러오기</button>
      </div>
      {changes && (
        <>
          <p className="font-bold">기록 {changes.length}개 · 새로 들어간 링크 {total}개 · 새로 만든 기록 {changes.filter((c) => c.kind === 'added-log').length}개 · 지운 기록 {changes.filter((c) => c.kind === 'deleted-log').length}개 · 여러 생방 연결 {comps.length}개</p>
          <details className="text-zinc-500"><summary className="cursor-pointer">기록별로 보기</summary>
            <ul className="mt-1 max-h-56 overflow-y-auto space-y-0.5 tabular-nums">{changes.map((c) => <li key={c.logId}>{c.date} · {c.kind === 'added-log' ? '새 기록' : c.kind === 'deleted-log' ? '지운 기록' : '수정'} · +{c.added}{c.removed ? ` −${c.removed}` : ''}</li>)}</ul>
          </details>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !changes.length} onClick={() => void mark()} className={`${btn} bg-purple-600 text-white`}>{busy === 'mark' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />} 가져온 링크에 표시 달기</button>
            <button type="button" disabled={!!busy || (!changes.length && !comps.length)} onClick={() => void undo()} className={`${btn} bg-red-600 text-white`}>{busy === 'undo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} 전체 되돌리기</button>
          </div>
        </>
      )}
      {msg && <p className="text-purple-700 dark:text-purple-300 font-bold break-keep">{msg}</p>}
    </div>
  );
}
