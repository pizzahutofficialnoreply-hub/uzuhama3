import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { youtubeIdOf } from '../../../utils/cafeImport';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { confirmSheet } from '../../../utils/ui';

/**
 * 관리자 > 기록 추가 > 카페 기준으로 맞추기
 * 이츠하마타임 '영상/쇼츠 생방링크' 글(2024.07~)과 사이트 기록을 맞춰 보고 다른 것만 모아 둔 목록(/data/cafe_fix.json)을 반영
 * - 이미 맞춰진 것은 '됨'으로 보이고 건너뜀 (여러 번 눌러도 같음)
 * - 반영은 보통 기록 수정과 같아서 '가져온 것 관리'에서 시각으로 되돌릴 수 있음
 */
type Op =
  | { t: 'setVod'; log: string; date: string; from: string; to: string; why: string }
  | { t: 'shorts'; id: string; title: string; add: string[]; remove: string[]; why: string }
  | { t: 'removeEdited'; log: string; id: string; why: string }
  | { t: 'multi'; id: string; title: string; logs: string[]; placeholderTitle: string; why: string };

const yid = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
// 몰아보기·여러 날 생방으로 연결된 칸은 직접 만든 것이라 '빼기'에서 건드리지 않음
const isLinked = (x: any) => Boolean(x?.isCompilation || x?.compilationId || x?.multiId);
const opKey = (o: Op, i: number) => `${o.t}:${i}`;
const postTitle = (why: string) => (why.match(/\[(.+)\]/)?.[1] || why).slice(0, 40);

function isDone(o: Op, logs: Record<string, any>): boolean {
  const L = (id: string) => logs[id] || {};
  if (o.t === 'setVod') return (L(o.log).vods || []).some((v: any) => yid(v) === o.to) && !(L(o.log).vods || []).some((v: any) => yid(v) === o.from);
  if (o.t === 'shorts') return o.add.every((id) => (L(id).shorts || []).some((x: any) => yid(x) === o.id)) && o.remove.every((id) => !(L(id).shorts || []).some((x: any) => yid(x) === o.id));
  if (o.t === 'removeEdited') return !(L(o.log).edited || []).some((x: any) => yid(x) === o.id && !isLinked(x));
  return o.logs.every((id) => (L(id).edited || []).some((e: any) => yid(e) === o.id && e.multiId));
}

function describe(o: Op, logs: Record<string, any>): string {
  const d = (id: string) => logs[id]?.date || id;
  if (o.t === 'setVod') return `${o.date} 기록의 생방 링크가 다른 날 것 → 카페에 적힌 생방으로 바꾸기 (「${postTitle(o.why)}」)`;
  if (o.t === 'shorts') {
    const parts = [o.remove.length ? `${o.remove.map(d).join(', ')}에서 빼고` : '', `${o.add.map(d).join(', ')}에 넣기`].filter(Boolean).join(' ');
    return `쇼츠 「${o.title.replace(/\s*#shorts/i, '')}」 ${parts}`;
  }
  if (o.t === 'removeEdited') return `${d(o.log)} 기록에 따로 한 번 더 들어간 「${postTitle(o.why)}」 빼기 (몰아보기 연결은 그대로)`;
  return `「${o.title}」 영상 넣고 생방 ${o.logs.map(d).join(', ')}에 '여러 날 생방'으로 연결`;
}

export function AdminCafeFix({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetch('/data/cafe_fix.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((x) => setOps(Array.isArray(x) ? x : [])).catch(() => setOps([]));
  }, []);
  const logs = data.logs as Record<string, any>;
  const rows = useMemo(() => (ops || []).map((o, i) => ({ o, key: opKey(o, i), done: isDone(o, logs), text: describe(o, logs) })), [ops, logs]);
  const todo = rows.filter((r) => !r.done);
  useEffect(() => { setPicked(new Set(todo.map((r) => r.key))); }, [ops]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ops || !ops.length) return null;

  const apply = async () => {
    const sel = todo.filter((r) => picked.has(r.key));
    if (!sel.length || !onUpdateLog) return;
    if (!await confirmSheet(`카페 기준으로 ${sel.length}개를 고칠까요?\n끝날 때까지 이 화면을 닫지 마세요.`)) return;
    setBusy({ done: 0, total: sel.length });
    const work: Record<string, any> = { ...logs };
    const cur = (id: string) => { const l = work[id]; if (!l) throw new Error(`기록을 못 찾았어요 (${id})`); return l; };
    const save = async (l: any) => { await onUpdateLog(l); work[l.id] = l; };
    const fails: string[] = [];
    let ok = 0;
    for (const { o } of sel) {
      try {
        if (o.t === 'setVod') {
          const l = cur(o.log);
          await save({ ...l, vods: (l.vods || []).map((v: any) => (yid(v) === o.from ? { ...v, url: `https://youtu.be/${o.to}` } : v)) });
        } else if (o.t === 'shorts') {
          for (const id of o.remove) { const l = cur(id); await save({ ...l, shorts: (l.shorts || []).filter((x: any) => yid(x) !== o.id) }); }
          for (const id of o.add) {
            const l = cur(id);
            if ((l.shorts || []).some((x: any) => yid(x) === o.id)) continue;
            const prev = Object.values(logs).flatMap((x: any) => x.shorts || []).find((x: any) => yid(x) === o.id);
            await save({ ...l, shorts: [...(l.shorts || []), { ...(prev || {}), title: prev?.title || o.title, url: prev?.url || `https://youtu.be/${o.id}`, cafe: 1 }] });
          }
        } else if (o.t === 'removeEdited') {
          const l = cur(o.log); await save({ ...l, edited: (l.edited || []).filter((x: any) => yid(x) !== o.id || isLinked(x)) });
        } else {
          const ls = o.logs.map(cur);
          const compId = `multi_${o.id}`;
          const url = `https://youtu.be/${o.id}`;
          const dates = ls.map((l: any) => l.date).sort();
          const createdAt = new Date().toISOString();
          await setDoc(doc(db, 'compilations', compId), {
            id: compId, kind: 'multi', title: o.title, url, createdAt, gameSortOrder: 'custom', source: 'cafe',
            broadcasts: ls.map((l: any) => ({ logId: l.id, date: l.date, games: [] })),
          }, { merge: true });
          for (const l0 of ls) {
            const l = cur(l0.id);
            // 제목만 있고 주소가 빈 칸(예: '공룡 이름 맞추기')이 있으면 그 칸을 채움
            const prev = (l.edited || []).find((e: any) => yid(e) === o.id && !e.isCompilation) || (l.edited || []).find((e: any) => !e?.url && e?.title === o.placeholderTitle);
            const link = { ...(prev || {}), title: prev?.title || o.title, url, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt, cafe: 1 };
            await save({ ...l, edited: [link, ...(l.edited || []).filter((e: any) => e !== prev && yid(e) !== o.id)] });
          }
        }
        ok++;
      } catch (e: any) { fails.push(`${postTitle(o.why)}: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok + fails.length, total: sel.length });
    }
    setBusy(null);
    setMsg(`${ok}개 고쳤어요${fails.length ? ` · 못 한 것 ${fails.length}개\n${fails.join('\n')}` : ''}`);
  };

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
      <p className="p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 break-keep">
        카페 기준으로 맞추기 — 이츠하마타임 '생방링크' 글과 다른 곳 {rows.length}개 {todo.length ? `(남은 것 ${todo.length}개)` : '· 전부 맞춰졌어요 ✓'}
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-80 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" disabled={r.done} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
              className="w-full text-left p-3 flex items-start gap-2 text-xs cursor-pointer disabled:cursor-default">
              {r.done ? <span className="shrink-0 text-emerald-600 font-bold">됨</span> : picked.has(r.key) ? <CheckSquare className="w-4 h-4 shrink-0 text-purple-600" /> : <Square className="w-4 h-4 shrink-0 text-zinc-400" />}
              <span className={r.done ? 'text-zinc-400 break-keep' : 'text-zinc-700 dark:text-zinc-200 break-keep'}>{r.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {todo.length > 0 && (
        <div className="p-3">
          <button type="button" onClick={apply} disabled={!picked.size || !!busy || !onUpdateLog} className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 고치는 중 {busy.done}/{busy.total}</> : <><Wand2 className="w-4 h-4" /> 선택한 {[...picked].filter((k) => todo.some((r) => r.key === k)).length}개 카페 기준으로 고치기</>}
          </button>
        </div>
      )}
      {msg && <p className="px-3 pb-3 text-xs whitespace-pre-line text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
