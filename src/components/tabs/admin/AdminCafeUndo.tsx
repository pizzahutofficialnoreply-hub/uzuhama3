import { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { History, Loader2, Tag, Undo2 } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { db } from '../../../lib/firebase';
import { normalizeHistorical } from '../../../utils/archiveOverlay';
import { youtubeIdOf } from '../../../utils/cafeImport';
import { confirmSheet } from '../../../utils/ui';
import { mutate } from './system/SearchTuningCard';
import { markChanged } from '../../../utils/changeLog';

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
  /** 되돌릴 것: 리스트별 새로 들어간 링크 id / 빠진 원래 항목 / 여러 생방 연결로 바뀐 원래 영상 */
  addedIds: Record<string, string[]>;
  removedItems: Record<string, any[]>;
  converted: any[];
  /** 새 기록인데 카페 링크 말고 다른 것도 있으면 지우지 않고 카페 링크만 뺌 */
  mixed: boolean;
};

export function AdminCafeUndo({ data, onAddLog, onUpdateLog, onDeleteLog, cafeIds }: {
  data: AppData;
  /** 위 칸에 붙여 넣은 카페 글의 유튜브 영상 id 들: 있으면 이 링크만 대상 (다른 수정은 그대로) */
  cafeIds?: Set<string>;
  onAddLog: (log: BroadcastLog) => Promise<void>;
  onUpdateLog?: (log: BroadcastLog) => Promise<void>;
  onDeleteLog?: (id: string) => Promise<void>;
}) {
  const [from, setFrom] = useState('2026-11-15T00:00');
  const [to, setTo] = useState(toLocalInput(new Date(Date.now() + 5 * 60000)));
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [comps, setComps] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [onlyCafe, setOnlyCafe] = useState(true);
  const [span, setSpan] = useState<{ n: number; first: string; last: string; byDay: [string, number][] } | null>(null);

  const load = async () => {
    setBusy('load'); setMsg('');
    try {
      const a = new Date(`${from}:00+09:00`).toISOString();
      // 끝 시각이 지나 있으면(화면을 오래 열어 둔 경우) 지금까지로
      const b = new Date(Math.max(Date.parse(`${to}:00+09:00`) || 0, Date.now() + 60000)).toISOString();
      const snap = await getDocs(query(collection(db, 'admin_audit'), where('at', '>=', a), where('at', '<=', b), orderBy('at')));
      const entries = snap.docs.map((d) => d.data() as any).filter((x) => ['addLog', 'updateLog', 'deleteLog'].includes(x.action) && x.logId);
      // 이력이 언제 얼마나 쌓였는지 (가져오기를 한 때가 맞는지 보려고)
      const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
      const byDay = new Map<string, number>();
      entries.forEach((x) => { const k = kst(x.at).slice(0, 13) + '시'; byDay.set(k, (byDay.get(k) || 0) + 1); });
      setSpan(entries.length ? { n: entries.length, first: kst(entries[0].at), last: kst(entries[entries.length - 1].at), byDay: [...byDay.entries()] } : { n: 0, first: '', last: '', byDay: [] });
      let archive: Record<string, any> = {};
      try { const r = await fetch('/data/historical_logs.json'); if (r.ok) archive = normalizeHistorical(await r.json()); } catch { /* */ }
      const first = new Map<string, any>();
      const last = new Map<string, any>();
      entries.forEach((x) => { if (!first.has(x.logId)) first.set(x.logId, x); last.set(x.logId, x); });
      const out: Change[] = [];
      const useCafe = onlyCafe && !!cafeIds?.size;
      const isCafe = (x: any) => !useCafe || cafeIds!.has(keyOf(x)) || !!x?.cafe;
      first.forEach((f, logId) => {
        const cur: any = (data.logs as any)[logId] || null;
        const lastAct = last.get(logId)?.action;
        const arch = archive[logId] || null;
        // 그 시간 전 모습: 이력의 before(저장된 사본, 아카이브 기록이면 바뀐 칸만) → 없으면 아카이브 원본
        const base = f.action === 'addLog' && !f.before ? null : { ...(arch || {}), ...(f.before || {}) };
        if (!base && !cur) return; // 넣었다가 이미 지움
        const kind: Change['kind'] = !base ? 'added-log' : !cur && lastAct === 'deleteLog' ? 'deleted-log' : 'updated';
        const addedIds: Record<string, string[]> = {};
        const removedItems: Record<string, any[]> = {};
        let added = 0; let removed = 0;
        LISTS.forEach((k) => {
          const bIds = new Set((base?.[k] || []).map(keyOf));
          const cIds = new Set((cur?.[k] || []).map(keyOf));
          addedIds[k] = (cur?.[k] || []).filter((x: any) => !bIds.has(keyOf(x)) && isCafe(x)).map(keyOf);
          removedItems[k] = (base?.[k] || []).filter((x: any) => !cIds.has(keyOf(x)) && isCafe(x));
          added += addedIds[k].length; removed += removedItems[k].length;
        });
        // 일반 영상이 '여러 생방 연결'로 바뀐 것
        const converted = (base?.edited || []).filter((x: any) => !x?.multiId && isCafe(x) && (cur?.edited || []).some((e: any) => e?.multiId && keyOf(e) === keyOf(x)));
        added += converted.length;
        const allItems = LISTS.flatMap((k) => cur?.[k] || []);
        const mixed = kind === 'added-log' && allItems.some((x: any) => !isCafe(x));
        if (kind === 'deleted-log' && !LISTS.some((k) => (base?.[k] || []).some(isCafe))) return;
        if (kind !== 'deleted-log' && !added && !removed) return;
        out.push({ logId, date: cur?.date || base?.date || f.date || '', kind, before: base, current: cur, added, removed, addedIds, removedItems, converted, mixed });
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
        const addSet = new Set(c.addedIds[k] || []);
        next[k] = (c.current[k] || []).map((x: any) => {
          if (typeof x !== 'object' || !x) return x;
          const wasPlain = k === 'edited' && x.multiId && c.converted.some((y: any) => keyOf(y) === keyOf(x));
          const tag = addSet.has(keyOf(x)) ? 1 : wasPlain ? 'multi' : null;
          if (!tag || x.cafe === tag) return x;
          touched = true;
          return { ...x, cafe: tag };
        });
      });
      if (c.kind === 'added-log' && !c.mixed && !next.cafe) { next.cafe = 1; touched = true; }
      if (touched) { await onUpdateLog(next); n++; setMsg(`표시 다는 중… ${n}개 기록`); }
    }
    setMsg(`표시를 달았어요 (기록 ${n}개). 설정 › 실험실 '과거 영상 생방 연동'을 끄면 2020년 전 것이 안 보여요.`);
    setBusy('');
  };

  const undo = async () => {
    if (!changes) return;
    const nAdd = changes.filter((c) => c.kind === 'added-log').length;
    const nDel = changes.filter((c) => c.kind === 'deleted-log').length;
    if (!await confirmSheet({ title: '카페 가져오기를 전부 되돌릴까요?', message: `기록 ${changes.length}개에서 ${onlyCafe && cafeIds?.size ? '카페 글에 있던 링크만 ' : ''}${from.replace('T', ' ')} 전 모습으로 돌려요. 새로 만든 기록 ${nAdd}개는 지우고, 지웠던 기록 ${nDel}개는 되살리고, 여러 생방 연결 ${comps.length}개도 지워요. 다시보기·편집본·쇼츠만 되돌리고 게임·시간 같은 다른 칸은 그대로예요.`, confirmText: '전부 되돌리기', danger: true })) return;
    setBusy('undo');
    let n = 0;
    const fails: string[] = [];
    for (const c of changes) {
      try {
        if (c.kind === 'added-log' && !c.mixed) { if (onDeleteLog) await onDeleteLog(c.logId); }
        else if (c.kind === 'deleted-log') { await onAddLog(c.before); }
        else if (onUpdateLog && c.current) {
          // 카페로 들어간 링크만 빼고, 카페 때문에 빠졌던 원래 링크는 되돌려 넣음 (다른 수정은 그대로)
          const next: any = { ...c.current };
          LISTS.forEach((k) => {
            const addSet = new Set(c.addedIds[k] || []);
            let list = (c.current[k] || []).filter((x: any) => !addSet.has(keyOf(x)));
            if (k === 'edited' && c.converted.length) list = list.map((x: any) => c.converted.find((y: any) => keyOf(y) === keyOf(x)) || x);
            const have = new Set(list.map(keyOf));
            list = [...list, ...(c.removedItems[k] || []).filter((x: any) => !have.has(keyOf(x)))];
            next[k] = list;
          });
          await onUpdateLog(next);
        }
        n++;
        setMsg(`되돌리는 중… ${n}/${changes.length}`);
      } catch (e: any) { fails.push(`${c.date}: ${String(e?.message || e).slice(0, 60)}`); }
    }
    for (const id of comps) { try { await deleteDoc(doc(db, 'compilations', id)); void markChanged(`compilations/${id}`, 'delete'); } catch (e: any) { fails.push(`${id}: ${String(e?.message || e).slice(0, 60)}`); } }
    setMsg(`되돌렸어요: 기록 ${n}/${changes.length}개, 여러 생방 연결 ${comps.length}개.${fails.length ? ` 실패 ${fails.length}개 — ${fails.slice(0, 3).join(' / ')}` : ''}`);
    setChanges(null);
    setBusy('');
  };

  /** 서버에서 한 번에: 고른 시각 이후에 바뀐 기록을 그 시각 전 모습으로 통째로 (앱을 닫아도 계속됨) */
  const serverRestore = async () => {
    setBusy('server'); setMsg('');
    try {
      const a = new Date(`${from}:00+09:00`).toISOString();
      // 끝 시각이 지나 있으면(화면을 오래 열어 둔 경우) 지금까지로
      const b = new Date(Math.max(Date.parse(`${to}:00+09:00`) || 0, Date.now() + 60000)).toISOString();
      const d = await mutate('restoreBefore', { from: a, to: b, dryRun: true });
      setBusy('');
      if (!d.logs) { setMsg('그 시간 뒤로 바뀐 기록이 없어요.'); return; }
      if (!await confirmSheet({
        title: `${from.replace('T', ' ')} 전으로 통째로 되돌릴까요?`,
        message: `그 뒤로 바뀐 방송 기록 ${d.logs}개를 바뀌기 전 모습으로 되돌려요 (수정 이력 ${d.entries}건 기준). 저장해 둔 이전 모습으로 ${d.restore}개, 원래 기록(아카이브·처음 등록 정보)으로 ${d.remove}개${d.compilations ? `, 여러 생방 연결 ${d.compilations}개 지움` : ''}. 그 시각 전에 관리자가 고친 내용은 그대로 남아요. 서버에서 한 번에 해서 앱을 닫아도 돼요.`,
        confirmText: '통째로 되돌리기', danger: true,
      })) return;
      setBusy('server');
      setMsg('서버에서 되돌리는 중… (1분 안쪽)');
      const r = await mutate('restoreBefore', { from: a, to: b });
      setMsg(`${r.summary || '되돌렸어요'} · 새로고침하면 보여요.`);
      setChanges(null); setSpan(null);
    } catch (e: any) { setMsg(`못 했어요: ${e?.message || e}`); }
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
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={onlyCafe} onChange={(e) => { setOnlyCafe(e.target.checked); setChanges(null); }} />
        <span className="break-keep">카페 글에 있는 링크만 (위 칸에 붙여 넣은 글 기준{cafeIds?.size ? ` · 영상 ${cafeIds.size.toLocaleString()}개` : ' · 지금은 비어 있어서 모든 수정이 대상'})</span>
      </label>
      <button type="button" disabled={!!busy} onClick={() => void serverRestore()} className={`${btn} bg-red-600 text-white w-full justify-center py-3`}>
        {busy === 'server' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} 시작 시각 전으로 통째로 되돌리기 (서버에서 한 번에)
      </button>
      {span && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-2.5 text-zinc-600 dark:text-zinc-300">
          <p>이 시간의 수정 이력 <b>{span.n}건</b>{span.n ? ` · 처음 ${span.first} · 마지막 ${span.last}` : ''}</p>
          {span.byDay.length > 0 && <p className="mt-1 tabular-nums break-keep">{span.byDay.map(([k, n]) => `${k.slice(5)} ${n}건`).join(' · ')}</p>}
        </div>
      )}
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
