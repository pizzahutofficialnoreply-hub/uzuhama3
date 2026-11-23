// 일회용: 게임 이름을 스팀 한국 페이지 이름으로 + 애매한 것은 연동 탭 '정리 확인'으로
// 1) 바꿀 달 문서를 지금 다시 읽어 그대로 백업(cleanup_backup) 2) 사이트가 저장하는 방식(아카이브는 _patch)으로 고침
// 3) 달 문서 updatedAt + changes 기록 → 기기들이 그 달만 다시 읽음
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { overlayMonthDocs, normalizeHistorical } from '../../src/utils/archiveOverlay';

const DRY = process.env.DRY === '1';
const sa = JSON.parse(process.env.SA!); sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const db = getFirestore(initializeApp({ credential: cert(sa) }));
const plan = JSON.parse(readFileSync('ops/tmp/plan.json', 'utf8'));
const hist = normalizeHistorical(JSON.parse(readFileSync('public/data/historical_logs.json', 'utf8')));
mkdirSync('out', { recursive: true });

const snap = await db.collection('logs_by_month').get();
const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
const merged = overlayMonthDocs(hist, docs.map((d) => d.data));
// 기록 id → 그 기록이 저장된 달 문서·키 (__dc 제외)
const where = new Map<string, { month: string; key: string; patch: boolean }>();
docs.forEach((d) => Object.entries(d.data.items || {}).forEach(([k, v]: [string, any]) => { if (k.endsWith('__dc')) return; const id = v?.id || k; if (!where.has(id) || v?._patch) where.set(id, { month: d.id, key: k, patch: !!v?._patch }); }));

const byLog = new Map<string, any[]>();
plan.auto.forEach((f: any) => { if (!byLog.has(f.logId)) byLog.set(f.logId, []); byLog.get(f.logId)!.push(f); });
const writes = new Map<string, Map<string, any>>(); // month → key → value
const put = (m: string, k: string, v: any) => { if (!writes.has(m)) writes.set(m, new Map()); writes.get(m)!.set(k, v); };
let changed = 0; const miss: string[] = [];
const now = new Date().toISOString();
for (const [id, fs] of byLog) {
  const log = merged[id];
  if (!log) { miss.push(id); continue; }
  const games = (log.games || []).map((g: any) => ({ ...g }));
  const oldNames = games.map((g: any) => g.name);
  for (const f of fs) {
    let i = games[f.i]?.name === f.from.name ? f.i : games.findIndex((g: any) => g.name === f.from.name);
    if (i < 0) { miss.push(`${id}:${f.from.name}`); continue; }
    games[i].name = f.to.name;
  }
  if (JSON.stringify(games.map((g: any) => g.name)) === JSON.stringify(oldNames)) continue;
  const game = log.game === oldNames.join(', ') || log.game === oldNames[0] ? (log.game === oldNames[0] && oldNames.length > 1 ? games[0].name : games.map((g: any) => g.name).join(', ')) : log.game;
  const base = hist[id];
  const w = where.get(id);
  changed++;
  if (!base) { // 2026 이후 등 DB 에만 있는 기록
    if (!w) { miss.push(`${id}:no-doc`); continue; }
    const cur = docs.find((d) => d.id === w.month)!.data.items[w.key];
    put(w.month, w.key, { ...cur, games, ...(game !== undefined ? { game } : {}) });
  } else if (w?.patch) {
    const cur = docs.find((d) => d.id === w.month)!.data.items[w.key];
    put(w.month, w.key, { ...cur, games, ...(game !== undefined ? { game } : {}), _updatedAt: now });
  } else if (w && !w.patch) { // 옛 전체 사본 → 합친 결과 그대로 수정분으로 (결과는 같고 이름만 바뀜)
    put(w.month, w.key, { id, date: base.date, _patch: true, _updatedAt: now, games, ...(game !== undefined ? { game } : {}), edited: log.edited || [], vods: log.vods || [], shorts: log.shorts || [] });
  } else { // 아직 고친 적 없는 아카이브 기록 → 새 수정분
    put(base.date.slice(0, 7), id, { id, date: base.date, _patch: true, _updatedAt: now, games, ...(game !== undefined && game !== base.game ? { game } : {}) });
  }
}
console.log('logs changed', changed, 'months', writes.size, 'miss', miss.length, miss.slice(0, 10));
writeFileSync('out/apply_summary.json', JSON.stringify({ changed, months: [...writes.keys()], miss }, null, 1));
if (DRY) { console.log('DRY RUN'); process.exit(0); }

// 백업 (달 문서 원본 그대로)
const stamp = now.replace(/[:.]/g, '-');
for (const m of writes.keys()) {
  const d = docs.find((x) => x.id === m);
  await db.collection('cleanup_backup').doc(`${stamp}_${m}`).set({ month: m, at: now, reason: 'steam-names', items: JSON.stringify(d?.data?.items || null) });
}
// 쓰기
for (const [m, kv] of writes) {
  const ref = db.collection('logs_by_month').doc(m);
  const exists = docs.some((x) => x.id === m);
  if (!exists) await ref.set({ month: m, updatedAt: now, items: {} });
  const args: any[] = [];
  for (const [k, v] of kv) args.push(new FieldPath('items', k), v);
  args.push('updatedAt', now);
  await (ref.update as any)(...args);
  await db.collection('changes').add({ path: `logs_by_month/${m}`, op: 'set', at: new Date().toISOString() });
}
// 애매한 것 → 연동 탭 '정리 확인'
const rref = db.collection('admin_data').doc('cleanup_review');
const prev = ((await rref.get()).data()?.items || []) as any[];
const ids = new Set(prev.map((x) => x.id));
await rref.set({ items: [...prev, ...plan.review.filter((x: any) => !ids.has(x.id))], updatedAt: now }, { merge: true });
console.log('applied', changed, 'review', plan.review.length);
