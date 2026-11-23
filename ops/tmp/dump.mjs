// 일회용: 분석용 DB 내보내기 (읽기만)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync } from 'node:fs';
const sa = JSON.parse(process.env.SA); sa.private_key = sa.private_key.replace(/\\n/g, '\n');
const db = getFirestore(initializeApp({ credential: cert(sa) }));
mkdirSync('out', { recursive: true });
const cols = ['logs_by_month', 'compilations', 'game_check', 'game_link_check', 'youtube_cache'];
let total = 0;
for (const c of cols) {
  const snap = await db.collection(c).get();
  total += snap.size;
  writeFileSync(`out/${c}.json`, JSON.stringify(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  console.log(c, snap.size);
}
const one = async (p) => { const d = await db.doc(p).get(); total++; return d.exists ? d.data() : null; };
const sys = await one('config/system');
writeFileSync('out/system_games.json', JSON.stringify({ gameAliases: sys?.gameAliases, gameLinks: sys?.gameLinks, keys: Object.keys(sys || {}) }));
writeFileSync('out/dataCheck.json', JSON.stringify(await one('admin_data/dataCheck')));
console.log('reads', total);
