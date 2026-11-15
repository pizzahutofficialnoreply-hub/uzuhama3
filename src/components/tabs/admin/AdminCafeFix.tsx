import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { youtubeIdOf } from '../../../utils/cafeImport';
import { db } from '../../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { confirmSheet } from '../../../utils/ui';
import { loadFreshLogs } from '../../../hooks/useFirebaseData';

/**
 * 관리자 > 기록 추가 > 카페 기준으로 맞추기
 * 카페 글(예전 생방 정리 글·이츠하마타임 '영상/쇼츠 생방링크' 글) · 유튜브 생방 시작 시각 · 스프레드시트(아카이브)를
 * 맞춰 보고 다른 것만 모아 둔 목록(/data/cafe_fix.json)을 반영
 * - 이미 맞춰진 것은 '됨'으로 세고 건너뜀 (여러 번 눌러도 같음)
 * - 묶음(group)마다 기본 선택이 다름: 스프레드시트와 다른 것·날짜 옮기기는 직접 골라야 함
 * - 반영은 보통 기록 수정과 같아서 '가져온 것 관리'에서 시각으로 되돌릴 수 있음
 */
type Base = { why: string; group?: string };
type Op = Base & (
  | { t: 'setVod'; log: string; date: string; from: string; to: string }
  | { t: 'shorts'; id: string; title: string; add: string[]; remove: string[] }
  | { t: 'removeEdited'; log: string; id: string }
  | { t: 'multi'; id: string; title: string; logs: string[]; placeholderTitle: string }
  | { t: 'add'; kind: 'edited' | 'shorts'; id: string; title: string; to: string }
  | { t: 'move'; kind: 'edited' | 'shorts'; id: string; title: string; from: string[]; to: string }
  | { t: 'setDate'; log: string; from: string; to: string }
);

const GROUPS: Record<string, { name: string; on: boolean; note?: string }> = {
  '': { name: '이츠하마타임 글 기준', on: true },
  add: { name: '빠진 영상·여러 날 생방 넣기', on: true },
  move: { name: '카페 링크·유튜브 생방 시각이 같은데 다른 날에 있는 것 옮기기', on: true },
  sheet: { name: '스프레드시트와 카페가 다른 것 (직접 골라 주세요)', on: false, note: '카페 링크·유튜브 시각은 카페 쪽, 스프레드시트는 지금 자리' },
  date: { name: '자정 넘어 시작한 방송을 시작한 날로 옮기기', on: false, note: '예: 화요일 밤 방송이 수요일 01:30에 시작했으면 수요일로' },
  guess: { name: '카페에 생방 날짜가 없는 영상: 업로드 직전 방송으로 추정 (직접 골라 주세요)', on: false, note: '업로드 3일 안쪽 방송 중 게임이 맞는 가장 가까운 방송 · 확실하지 않음' },
};

const yid = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
// 몰아보기·여러 날 생방으로 연결된 칸은 직접 만든 것이라 '빼기'에서 건드리지 않음
const isLinked = (x: any) => Boolean(x?.isCompilation || x?.compilationId || x?.multiId);
const opKey = (o: Op, i: number) => `${o.t}:${i}`;
const postTitle = (why: string) => (why.match(/\[(.+)\]/)?.[1] || why).slice(0, 40);
const short = (t: string) => (t || '').replace(/\s*#shorts/i, '').slice(0, 40);
const has = (l: any, k: string, id: string) => (l?.[k] || []).some((x: any) => yid(x) === id);
const logIds = (o: Op): string[] => {
  if (o.t === 'shorts') return [...o.add, ...o.remove];
  if (o.t === 'multi') return o.logs;
  if (o.t === 'add') return [o.to];
  if (o.t === 'move') return [...o.from, o.to];
  return [o.log];
};

function isDone(o: Op, logs: Record<string, any>, comps?: Set<string>): boolean {
  const L = (id: string) => logs[id] || {};
  if (o.t === 'setVod') return has(L(o.log), 'vods', o.to) && !has(L(o.log), 'vods', o.from);
  if (o.t === 'shorts') return o.add.every((id) => has(L(id), 'shorts', o.id)) && o.remove.every((id) => !has(L(id), 'shorts', o.id));
  if (o.t === 'removeEdited') return !(L(o.log).edited || []).some((x: any) => yid(x) === o.id && !isLinked(x));
  if (o.t === 'add') return has(L(o.to), o.kind, o.id);
  if (o.t === 'move') return has(L(o.to), o.kind, o.id) && o.from.every((id) => !(L(id)[o.kind] || []).some((x: any) => yid(x) === o.id && !isLinked(x)));
  if (o.t === 'setDate') return L(o.log).date === o.to;
  // 여러 날 생방: 각 기록의 연결 + 몰아보기 문서(compilations)까지 있어야 끝 (빈 제목 칸이 남아 있어도 아직)
  return (!comps || comps.has(`multi_${o.id}`)) && o.logs.every((id) => (L(id).edited || []).some((e: any) => yid(e) === o.id && e.multiId) && !(L(id).edited || []).some((e: any) => !e?.url && e?.title === o.placeholderTitle));
}

function describe(o: Op, logs: Record<string, any>): string {
  const d = (id: string) => logs[id]?.date || id;
  if (o.t === 'setVod') return `${o.date} 기록의 생방 링크가 다른 날 것 → 카페에 적힌 생방으로 바꾸기 (「${postTitle(o.why)}」)`;
  if (o.t === 'shorts') {
    const parts = [o.remove.length ? `${o.remove.map(d).join(', ')}에서 빼고` : '', `${o.add.map(d).join(', ')}에 넣기`].filter(Boolean).join(' ');
    return `쇼츠 「${short(o.title)}」 ${parts}`;
  }
  if (o.t === 'removeEdited') return `${d(o.log)} 기록에 따로 한 번 더 들어간 「${postTitle(o.why)}」 빼기 (몰아보기 연결은 그대로)`;
  if (o.t === 'add') return `${o.kind === 'shorts' ? '쇼츠' : '영상'} 「${short(o.title)}」 ${d(o.to)} 생방에 넣기 — ${o.why}`;
  if (o.t === 'move') return `${o.kind === 'shorts' ? '쇼츠' : '영상'} 「${short(o.title)}」 ${o.from.map(d).join(', ')} → ${d(o.to)} — ${o.why}`;
  if (o.t === 'setDate') return `${o.from} 기록 → ${o.to} (${o.why})`;
  return `「${o.title}」 영상 넣고 생방 ${o.logs.map(d).join(', ')}에 '여러 날 생방'으로 연결`;
}

export function AdminCafeFix({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [comps, setComps] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetch('/data/cafe_fix.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(async (x) => {
      const list: Op[] = Array.isArray(x) ? x : [];
      // 여러 날 생방 연결의 몰아보기 문서가 있는지 (연결만 있고 문서가 없으면 다시 만들어야 함)
      const have = new Set<string>();
      for (const o of list) if (o.t === 'multi') { try { if ((await getDoc(doc(db, 'compilations', `multi_${o.id}`))).exists()) have.add(`multi_${o.id}`); } catch { have.add(`multi_${o.id}`); } }
      setComps(have);
      setOps(list);
    }).catch(() => setOps([]));
  }, []);
  const logs = data.logs as Record<string, any>;
  const rows = useMemo(() => (ops || []).map((o, i) => ({ o, key: opKey(o, i), g: o.group || '', done: isDone(o, logs, comps), text: describe(o, logs) })), [ops, logs, comps]);
  const todo = rows.filter((r) => !r.done);
  useEffect(() => { setPicked(new Set(todo.filter((r) => GROUPS[r.g]?.on !== false).map((r) => r.key))); }, [ops]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ops || !ops.length) return null;
  const groups = Object.keys(GROUPS).map((g) => ({ g, ...GROUPS[g], rows: todo.filter((r) => r.g === g), done: rows.filter((r) => r.g === g && r.done).length })).filter((x) => x.rows.length || x.done);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleGroup = (g: string, on: boolean) => setPicked((p) => { const n = new Set(p); todo.filter((r) => r.g === g).forEach((r) => (on ? n.add(r.key) : n.delete(r.key))); return n; });

  const apply = async () => {
    const sel0 = todo.filter((r) => picked.has(r.key));
    if (!sel0.length || !onUpdateLog) return;
    if (!await confirmSheet(`카페 기준으로 ${sel0.length}개를 고칠까요?\n끝날 때까지 이 화면을 닫지 마세요.`)) return;
    setBusy({ done: 0, total: sel0.length });
    // 화면에 들고 있는 기록은 오래됐을 수 있어서(다른 기기·창에서 고친 것) 서버에서 그 달을 다시 읽어 그 위에 고침
    const ids = [...new Set(sel0.flatMap(({ o }) => logIds(o)))];
    let work: Record<string, any>;
    try {
      work = await loadFreshLogs(ids.map((id) => String(logs[id]?.date || '').slice(0, 7)), ids);
    } catch (e: any) { setBusy(null); setMsg(`최신 기록을 못 읽어서 멈췄어요: ${String(e?.message || e).slice(0, 80)}`); return; }
    // 날짜 옮기기를 먼저 (여러 날 생방 연결에 바뀐 날짜가 들어가게)
    const sel = sel0.filter(({ o }) => !isDone(o, work, comps)).sort((a, b) => Number(b.o.t === 'setDate') - Number(a.o.t === 'setDate'));
    const cur = (id: string) => { const l = work[id]; if (!l) throw new Error(`기록을 못 찾았어요 (${id})`); return l; };
    const save = async (l: any) => { await onUpdateLog(l); work[l.id] = l; };
    const itemOf = (id: string, kind: string) => Object.values(work).flatMap((x: any) => x[kind] || []).find((x: any) => yid(x) === id && !isLinked(x));
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
            if (has(l, 'shorts', o.id)) continue;
            const prev = itemOf(o.id, 'shorts');
            await save({ ...l, shorts: [...(l.shorts || []), { ...(prev || {}), title: prev?.title || o.title, url: prev?.url || `https://youtu.be/${o.id}`, cafe: 1 }] });
          }
        } else if (o.t === 'removeEdited') {
          const l = cur(o.log); await save({ ...l, edited: (l.edited || []).filter((x: any) => yid(x) !== o.id || isLinked(x)) });
        } else if (o.t === 'add') {
          const l = cur(o.to);
          if (!has(l, o.kind, o.id)) await save({ ...l, [o.kind]: [...(l[o.kind] || []), { title: o.title, url: `https://youtu.be/${o.id}`, cafe: 1 }] });
        } else if (o.t === 'move') {
          // 원래 항목(제목·카테고리 등)을 그대로 옮김
          const prev = itemOf(o.id, o.kind);
          for (const id of o.from) { const l = cur(id); if (id !== o.to) await save({ ...l, [o.kind]: (l[o.kind] || []).filter((x: any) => yid(x) !== o.id || isLinked(x)) }); }
          const l = cur(o.to);
          if (!has(l, o.kind, o.id)) await save({ ...l, [o.kind]: [...(l[o.kind] || []), { ...(prev || {}), title: prev?.title || o.title, url: prev?.url || `https://youtu.be/${o.id}` }] });
        } else if (o.t === 'setDate') {
          const l = cur(o.log);
          if (l.date !== o.from) throw new Error(`지금 날짜가 ${l.date}라서 건너뜀`);
          await save({ ...l, date: o.to });
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
          setComps((p) => new Set([...p, compId]));
          for (const l0 of ls) {
            const l = cur(l0.id);
            // 이미 있는 같은 영상(다른 날에 일반 영상으로 있던 것 포함)·제목만 있고 주소가 빈 칸을 이 연결로 바꿈
            const prev = (l.edited || []).find((e: any) => yid(e) === o.id && !e.isCompilation) || (l.edited || []).find((e: any) => !e?.url && e?.title === o.placeholderTitle) || itemOf(o.id, 'edited');
            const link = { ...(prev || {}), title: prev?.title || o.title, url, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt, cafe: prev && !prev.cafe ? 'multi' : 1 };
            await save({ ...l, edited: [link, ...(l.edited || []).filter((e: any) => e !== prev && yid(e) !== o.id && !(!e?.url && e?.title === o.placeholderTitle))] });
          }
        }
        ok++;
      } catch (e: any) { fails.push(`${postTitle(o.why)}: ${String(e?.message || e).slice(0, 80)}`); }
      setBusy({ done: ok + fails.length, total: sel.length });
    }
    setBusy(null);
    setMsg(`${ok}개 고쳤어요${sel0.length > sel.length ? ` (이미 돼 있던 ${sel0.length - sel.length}개는 건너뜀)` : ''}${fails.length ? ` · 못 한 것 ${fails.length}개\n${fails.join('\n')}` : ''}`);
  };

  const nPicked = [...picked].filter((k) => todo.some((r) => r.key === k)).length;
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
      <p className="p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 break-keep">
        카페 기준으로 맞추기 — 카페 글 · 유튜브 생방 시작 시각 · 스프레드시트를 맞춰 본 결과 {todo.length ? `(남은 것 ${todo.length}개)` : '· 전부 맞춰졌어요 ✓'}
      </p>
      <div className="max-h-[28rem] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
        {groups.map((g) => (
          <div key={g.g}>
            <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 break-keep">
                {g.name} <span className="font-normal text-zinc-400">· 남은 것 {g.rows.length}{g.done ? ` · 됨 ${g.done}` : ''}</span>
                {g.note && <div className="font-normal text-zinc-400">{g.note}</div>}
              </div>
              {g.rows.length > 0 && (
                <button type="button" onClick={() => toggleGroup(g.g, !g.rows.every((r) => picked.has(r.key)))} className="shrink-0 text-[11px] font-bold text-purple-600 cursor-pointer">
                  {g.rows.every((r) => picked.has(r.key)) ? '전부 해제' : '전부 고르기'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {g.rows.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => toggle(r.key)} className="w-full text-left p-3 flex items-start gap-2 text-xs cursor-pointer">
                    {picked.has(r.key) ? <CheckSquare className="w-4 h-4 shrink-0 text-purple-600" /> : <Square className="w-4 h-4 shrink-0 text-zinc-400" />}
                    <span className="text-zinc-700 dark:text-zinc-200 break-keep">{r.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {todo.length > 0 && (
        <div className="p-3">
          <button type="button" onClick={apply} disabled={!nPicked || !!busy || !onUpdateLog} className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> 고치는 중 {busy.done}/{busy.total}</> : <><Wand2 className="w-4 h-4" /> 선택한 {nPicked}개 카페 기준으로 고치기</>}
          </button>
        </div>
      )}
      {msg && <p className="px-3 pb-3 text-xs whitespace-pre-line text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
