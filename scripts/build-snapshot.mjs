/**
 * 빌드할 때 한 번: 방송 기록 달 문서(logs_by_month) + 몰아보기(compilations)를 public/data/snapshot_logs.json 으로
 * → 방문자 기기는 이 정적 파일(CDN)로 전체를 받고, 그 뒤에 바뀐 달만 DB 에서 읽음
 *   (예전: 서버 /api/health?snapshot=logs 가 배포마다·지역마다 다시 만들며 DB 를 수백 번씩 읽었음)
 * 비밀 키가 없거나(로컬·GitHub 빌드) 실패하면 조용히 건너뜀 → 기기는 예전처럼 서버 묶음으로
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'public/data/snapshot_logs.json';
const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  || (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL ? JSON.stringify({ project_id: process.env.FIREBASE_PROJECT_ID || 'uzuhama', client_email: process.env.FIREBASE_CLIENT_EMAIL, private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) : '');
if (!raw) { console.log('[snapshot] 비밀 키 없음 → 건너뜀'); process.exit(0); }
const timer = setTimeout(() => { console.log('[snapshot] 시간 초과 → 건너뜀'); process.exit(0); }, 30000);
try {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  // 서버(api/_firebase.ts)와 같은 방식으로 읽기: JSON / base64 / 줄바꿈 섞인 JSON
  const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  const sa = parse(raw) || parse(Buffer.from(raw, 'base64').toString('utf8')) || parse(raw.replace(/[\r\n\t]/g, ' '));
  if (!sa?.private_key) throw new Error('비밀 키를 못 읽음');
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  const app = initializeApp({ credential: cert(sa) }, 'snapshot');
  const db = getFirestore(app);
  const [m, c] = await Promise.all([db.collection('logs_by_month').get(), db.collection('compilations').get()]);
  const months = m.docs.map((d) => ({ id: d.id, ...d.data() }));
  const comps = c.docs.map((d) => ({ docId: d.id, comp: d.data() }));
  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), months, comps }));
  console.log(`[snapshot] 달 ${months.length}개 · 몰아보기 ${comps.length}개 저장`);
} catch (e) {
  console.log('[snapshot] 실패 → 건너뜀:', String(e?.message || e).slice(0, 200));
}
clearTimeout(timer);
process.exit(0);
