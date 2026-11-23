// 일회용: 링크가 다른 게임이던 것 바로잡기 (스팀에서 맞는 앱 이름을 확인한 뒤에만)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { overlayMonthDocs, normalizeHistorical } from '../../src/utils/archiveOverlay';
const DRY = process.env.DRY === '1';
const sa = JSON.parse(process.env.SA!); sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const db = getFirestore(initializeApp({ credential: cert(sa) }));
const hist = normalizeHistorical(JSON.parse(readFileSync('public/data/historical_logs.json', 'utf8')));
const steamName = async (id: string) => { const j: any = await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=koreana&cc=kr`)).json(); return j?.[id]?.success ? j[id].data.name : null; };
type Op = { rid: string; logId: string; from: string; app?: string; expect?: RegExp; link?: string; remove?: boolean };
const OPS: Op[] = [
  { rid: 'g52_2021-01-01_archive_1248_0', logId: '2021-01-01_archive_1248', from: 'JOURNEY (저니)', app: '638230', expect: /journey|저니/i },
  { rid: 'g53_2020-12-17_archive_1260_0', logId: '2020-12-17_archive_1260', from: 'Little Nightmares (리틀 나이트메어)', app: '424840', expect: /^(little nightmares|리틀 나이트메어)$/i },
  { rid: 'g54_2020-12-15_archive_1261_0', logId: '2020-12-15_archive_1261', from: 'Little Nightmares (리틀 나이트메어)', app: '424840', expect: /^(little nightmares|리틀 나이트메어)$/i },
  { rid: 'g56_2020-10-22_archive_1295_0', logId: '2020-10-22_archive_1295', from: 'INSIDE (인사이드)', app: '304430', expect: /^inside$/i },
  { rid: 'g57_2020-10-20_archive_1296_0', logId: '2020-10-20_archive_1296', from: 'INSIDE (인사이드)', app: '304430', expect: /^inside$/i },
  { rid: 'g67_2024-05-27_archive_416_0', logId: '2024-05-27_archive_416', from: 'su', remove: true },
  { rid: 'g72_2023-06-18_archive_631_0', logId: '2023-06-18_archive_631', from: 'Only Up!', link: '' },
  { rid: 'g81_2020-06-26_archive_1375_2', logId: '2020-06-26_archive_1375', from: 'wormax.io (지렁이 게임)', link: 'https://wormax.io/' },
];
const snap = await db.collection('logs_by_month').get();
const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
const merged = overlayMonthDocs(hist, docs.map((d) => d.data));
const where = new Map<string, { month: string; key: string; patch: boolean }>();
docs.forEach((d) => Object.entries(d.data.items || {}).forEach(([k, v]: [string, any]) => { if (k.endsWith('__dc')) return; const id = v?.id || k; if (!where.has(id) || v?._patch) where.set(id, { month: d.id, key: k, patch: !!v?._patch }); }));
const now = new Date().toISOString();
const writes = new Map<string, Map<string, any>>();
const done: string[] = [];
const ws = (x: string) => String(x || '').replace(/\s+/g, ' ').trim();
const state = new Map<string, any[]>(); // logId → 지금까지 고친 games
for (const op of OPS) {
  const log = merged[op.logId]; if (!log) { console.log('없음', op.logId); continue; }
  const games = state.get(op.logId) || (log.games || []).map((g: any) => ({ ...g }));
  const i = games.findIndex((g: any) => ws(g.name) === ws(op.from));
  if (i < 0) { console.log('게임 없음', op.logId, op.from); continue; }
  if (op.remove) games.splice(i, 1);
  else if (op.app) {
    const n = await steamName(op.app); await new Promise((r) => setTimeout(r, 1500));
    if (!n || !op.expect!.test(n)) { console.log('스팀 이름이 예상과 달라 건너뜀', op.app, n); continue; }
    games[i] = { ...games[i], name: n, link: `https://store.steampowered.com/app/${op.app}/` };
  } else games[i] = { ...games[i], link: op.link };
  state.set(op.logId, games); done.push(op.rid);
  const base = hist[op.logId]; const w = where.get(op.logId);
  const game = games.map((g: any) => g.name).join(', ');
  const m = w?.month || base.date.slice(0, 7); const key = w?.key || op.logId;
  const cur = w ? docs.find((d) => d.id === w.month)!.data.items[w.key] : null;
  const val = cur?._patch ? { ...cur, games, game, _updatedAt: now } : { id: op.logId, date: base.date, _patch: true, _updatedAt: now, games, game, ...(cur ? { edited: log.edited || [], vods: log.vods || [], shorts: log.shorts || [] } : {}) };
  if (!writes.has(m)) writes.set(m, new Map()); writes.get(m)!.set(key, val);
  console.log('고침', op.logId, op.from, '→', op.remove ? '(뺌)' : games[i]?.name, games[i]?.link ?? '');
}
if (DRY) { console.log('DRY'); process.exit(0); }
const stamp = now.replace(/[:.]/g, '-');
for (const [m, kv] of writes) {
  const d = docs.find((x) => x.id === m);
  await db.collection('cleanup_backup').doc(`${stamp}_${m}`).set({ month: m, at: now, reason: 'wrong-links', items: JSON.stringify(d?.data?.items || null) });
  const args: any[] = []; for (const [k, v] of kv) args.push(new FieldPath('items', k), v); args.push('updatedAt', now);
  await (db.collection('logs_by_month').doc(m).update as any)(...args);
  await db.collection('changes').add({ path: `logs_by_month/${m}`, op: 'set', at: new Date().toISOString() });
}
const rref = db.collection('admin_data').doc('cleanup_review');
const items = ((await rref.get()).data()?.items || []).map((x: any) => (done.includes(x.id) ? { ...x, done: 'fixed' } : x));
await rref.set({ items, updatedAt: now }, { merge: true });
console.log('완료', done.length);
