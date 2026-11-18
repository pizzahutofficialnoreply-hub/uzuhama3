import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Square, Wand2 } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { GROUPS, applyOne, describe, isDone, logIds, opKey, postTitle, type Op } from '../../../utils/cafeFixOps';
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
export function AdminCafeFix({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [comps, setComps] = useState<Set<string>>(new Set());
  const [compData, setCompData] = useState<Record<string, any>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<Record<string, string[]>>({});
  useEffect(() => { fetch('/data/cafe_report.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((x) => setReport(x && typeof x === 'object' ? (x as Record<string, string[]>) : {})).catch(() => {}); }, []);
  useEffect(() => {
    fetch('/data/cafe_fix.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(async (x) => {
      const list: Op[] = Array.isArray(x) ? x : [];
      // 여러 날 생방 연결의 몰아보기 문서가 있는지 (연결만 있고 문서가 없으면 다시 만들어야 함)
      const have = new Set<string>();
      for (const o of list) if (o.t === 'multi') { try { if ((await getDoc(doc(db, 'compilations', `multi_${o.id}`))).exists()) have.add(`multi_${o.id}`); } catch { have.add(`multi_${o.id}`); } }
      setComps(have);
      // 순서 맞추기는 몰아보기 문서 자체를 봐야 함
      const cd: Record<string, any> = {};
      for (const o of list) if (o.t === 'compOrder') { try { const s = await getDoc(doc(db, 'compilations', `multi_${o.id}`)); if (s.exists()) cd[s.id] = s.data(); } catch {} }
      setCompData(cd);
      setOps(list);
      try {
        const ids = [...new Set(list.flatMap((o) => logIds(o)))];
        const fresh = await loadFreshLogs(ids.map((id) => String((data.logs as any)[id]?.date || '').slice(0, 7)), ids, (d, t) => setLoadMsg(`서버 기록 확인 중 ${d}/${t}`));
        setServer(fresh); setLoadMsg('');
      } catch (e: any) { setLoadMsg(`서버 기록을 못 읽어서 이 기기에 있는 기록으로 보여 줘요 (${String(e?.message || e).slice(0, 60)})`); }
    }).catch(() => setOps([]));
  }, []);
  // 목록의 '됨'은 서버에서 새로 읽은 기록 기준 (화면 기록은 오래됐을 수 있어서) — 관리자 화면을 열 때 달 문서를 한 번 읽음
  const [server, setServer] = useState<Record<string, any> | null>(null);
  const [loadMsg, setLoadMsg] = useState('');
  const logs = (server ? { ...(data.logs as Record<string, any>), ...server } : data.logs) as Record<string, any>;
  const rows = useMemo(() => (ops || []).map((o, i) => ({ o, key: opKey(o, i), g: o.group || '', done: isDone(o, logs, comps, compData), text: describe(o, logs) })), [ops, logs, comps, compData]);
  const todo = rows.filter((r) => !r.done);
  useEffect(() => { setPicked(new Set(todo.filter((r) => GROUPS[r.g]?.on !== false).map((r) => r.key))); }, [ops, server]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ops || !ops.length) return null;
  const groups = Object.keys(GROUPS).map((g) => ({ g, ...GROUPS[g], rows: todo.filter((r) => r.g === g), done: rows.filter((r) => r.g === g && r.done).length })).filter((x) => x.rows.length || x.done);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleGroup = (g: string, on: boolean) => setPicked((p) => { const n = new Set(p); todo.filter((r) => r.g === g).forEach((r) => (on ? n.add(r.key) : n.delete(r.key))); return n; });

  const apply = async () => {
    const sel0 = todo.filter((r) => picked.has(r.key));
    if (!sel0.length || !onUpdateLog) return;
    if (!await confirmSheet(`카페 기준으로 ${sel0.length}개를 고칠까요?\n바뀌는 기록마다 한 번씩 저장해서 몇 분 걸릴 수 있어요. 끝날 때까지 이 화면을 닫지 마세요.`)) return;
    setBusy({ done: 0, total: sel0.length });
    // 화면에 들고 있는 기록은 오래됐을 수 있어서(다른 기기·창에서 고친 것) 서버에서 그 달을 다시 읽어 그 위에 고침
    const ids = [...new Set(sel0.flatMap(({ o }) => logIds(o)))];
    let work: Record<string, any>;
    try {
      work = await loadFreshLogs(ids.map((id) => String(logs[id]?.date || '').slice(0, 7)), ids, (d, t) => setMsg(`서버에서 최신 기록 읽는 중 ${d}/${t}`));
    } catch (e: any) { setBusy(null); setMsg(`최신 기록을 못 읽어서 멈췄어요: ${String(e?.message || e).slice(0, 80)}`); return; }
    // 날짜 옮기기를 먼저 (여러 날 생방 연결에 바뀐 날짜가 들어가게)
    const sel = sel0.filter(({ o }) => !isDone(o, work, comps, compData)).sort((a, b) => Number(b.o.t === 'setDate') - Number(a.o.t === 'setDate'));
    // 고칠 내용을 먼저 전부 메모리에서 바꾸고, 바뀐 기록만 한 번씩 저장
    const dirty = new Set<string>();
    const cur = (id: string) => { const l = work[id]; if (!l) throw new Error(`기록을 못 찾았어요 (${id})`); dirty.add(id); return l; };
    const compDocs: any[] = [];
    const fails: string[] = [];
    let ok = 0;
    for (const { o } of sel) {
      try {
        applyOne(o, work, cur, compDocs, compData);
        ok++;
      } catch (e: any) { fails.push(`${postTitle(o.why)}: ${String(e?.message || e).slice(0, 80)}`); }
    }
    // 저장 (여러 날 생방 연결은 몰아보기 문서 먼저)
    const list = [...dirty];
    setBusy({ done: 0, total: list.length + compDocs.length });
    let n = 0;
    for (const c of compDocs) {
      try { await setDoc(doc(db, 'compilations', c.id), c, { merge: true }); setComps((p) => new Set([...p, c.id])); setCompData((p) => (p[c.id] ? { ...p, [c.id]: { ...p[c.id], ...c } } : p)); } catch (e: any) { fails.push(`연결 문서 ${c.title}: ${String(e?.message || e).slice(0, 60)}`); }
      setBusy({ done: ++n, total: list.length + compDocs.length });
    }
    if (compDocs.length) { try { localStorage.removeItem('uzuhama_fs_compilations_v1_at'); } catch {} }
    let saved = 0;
    for (const id of list) {
      try { await onUpdateLog(work[id]); saved++; } catch (e: any) { fails.push(`${work[id]?.date || id} 저장: ${String(e?.message || e).slice(0, 60)}`); }
      setBusy({ done: ++n, total: list.length + compDocs.length });
    }
    setBusy(null);
    setServer((p) => ({ ...(p || {}), ...work }));
    const skipped = sel0.length - sel.length;
    setMsg(!sel.length && !fails.length
      ? `고를 것들은 서버에 이미 다 반영돼 있어요 (${skipped}개). 화면이 예전 기록을 보여 주는 거라 새로고침하면 '됨'으로 바뀌어요.`
      : `${ok}개 고쳤어요 · 기록 ${saved}개 저장${skipped ? ` (이미 돼 있던 ${skipped}개는 건너뜀)` : ''}${fails.length ? ` · 못 한 것 ${fails.length}개\n${fails.slice(0, 20).join('\n')}` : ''}`);
  };

  const nPicked = [...picked].filter((k) => todo.some((r) => r.key === k)).length;
  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
      <p className="p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 break-keep">
        카페 기준으로 맞추기 — 카페 글 · 유튜브 생방 시작 시각 · 스프레드시트를 맞춰 본 결과 {todo.length ? `(남은 것 ${todo.length}개${todo.some((r) => GROUPS[r.g]?.on === false) ? ` · 그중 직접 골라야 하는 것 ${todo.filter((r) => GROUPS[r.g]?.on === false).length}개` : ''})` : '· 전부 맞춰졌어요 ✓'}
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
              {(open.has(g.g) ? g.rows : g.rows.slice(0, 30)).map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => toggle(r.key)} className="w-full text-left p-3 flex items-start gap-2 text-xs cursor-pointer">
                    {picked.has(r.key) ? <CheckSquare className="w-4 h-4 shrink-0 text-purple-600" /> : <Square className="w-4 h-4 shrink-0 text-zinc-400" />}
                    <span className="text-zinc-700 dark:text-zinc-200 break-keep">{r.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            {g.rows.length > 30 && !open.has(g.g) && (
              <button type="button" onClick={() => setOpen((p) => new Set([...p, g.g]))} className="w-full py-2 text-[11px] font-bold text-purple-600 cursor-pointer">나머지 {g.rows.length - 30}개 더 보기</button>
            )}
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
      {loadMsg && <p className="px-3 pt-2 text-xs text-zinc-500">{loadMsg}</p>}
      {msg && <p className="px-3 pb-3 text-xs whitespace-pre-line text-zinc-600 dark:text-zinc-300">{msg}</p>}
      {Object.keys(report).length > 0 && (
        <details className="px-3 pb-3 text-xs">
          <summary className="cursor-pointer font-bold text-amber-700 dark:text-amber-300 py-1">직접 확인할 것 {Object.values(report).reduce((a, v) => a + v.length, 0)}개 (자동으로 못 고친 것)</summary>
          <div className="space-y-2 mt-1">
            {Object.entries(report).map(([k, v]) => (
              <div key={k}>
                <p className="font-bold text-zinc-600 dark:text-zinc-300">{k} · {v.length}</p>
                <ul className="text-zinc-500 break-keep">{v.slice(0, 60).map((x, i) => <li key={i}>· {x}</li>)}{v.length > 60 && <li>…외 {v.length - 60}개</li>}</ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
