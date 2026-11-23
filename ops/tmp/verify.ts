import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { overlayMonthDocs, normalizeHistorical } from '../../src/utils/archiveOverlay';
const sa = JSON.parse(process.env.SA!); sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const db = getFirestore(initializeApp({ credential: cert(sa) }));
const hist = normalizeHistorical(JSON.parse(readFileSync('public/data/historical_logs.json', 'utf8')));
const snap = await db.collection('logs_by_month').get();
const merged = overlayMonthDocs(hist, snap.docs.map((d) => d.data()));
const plan = JSON.parse(readFileSync('ops/tmp/plan.json', 'utf8'));
let ok = 0, bad = 0; const badL: string[] = [];
for (const f of plan.auto) { const l = merged[f.logId]; const has = (l?.games || []).some((g: any) => g.name === f.to.name); if (has) ok++; else { bad++; badL.push(`${f.logId}:${f.to.name}`); } }
const all = Object.values(merged) as any[];
const dupGame = all.filter((l) => { const n = (l.games || []).map((g: any) => g.name); return new Set(n).size !== n.length; }).map((l) => l.id);
console.log('logs', all.length, 'renamed ok', ok, 'bad', bad, badL.slice(0, 5));
console.log('still 배틀그라운드', all.filter((l) => (l.games || []).some((g: any) => /^배틀그라운드/.test(g.name))).length, 'dup names in a log', dupGame.length, dupGame.slice(0, 5));
console.log('vods total', all.reduce((a, l) => a + (l.vods || []).length, 0), 'edited total', all.reduce((a, l) => a + (l.edited || []).length, 0));
