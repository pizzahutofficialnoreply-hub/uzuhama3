/**
 * 클라우드 점검 (백그라운드 작업에서 2분마다 부름)
 *  - selftest_runs 에 줄 선 점검이 있으면 하나 꺼내서, 아이폰 모양(WebKit = 사파리 엔진) 브라우저로 /selftest 를 돌림
 *  - 진행 상황을 15초마다 문서에 적고, 사용자가 '중단'하면 바로 멈춤
 * 필요: FIREBASE_SERVICE_ACCOUNT (GitHub 비밀값), playwright webkit
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { webkit, devices } from 'playwright';

const BASE = process.env.SELFTEST_BASE || 'https://uzuhama.vercel.app';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.log('no service account'); process.exit(0); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const col = db.collection('selftest_runs');

const q = await col.where('status', '==', 'queued').limit(5).get();
if (q.empty) process.exit(0);
const first = q.docs.sort((a, b) => String(a.data().queuedAt).localeCompare(String(b.data().queuedAt)))[0];
const ref = first.ref;
// 내가 가져감 (동시에 두 곳이 가져가지 않게)
const took = await db.runTransaction(async (tx) => {
  const s = await tx.get(ref);
  if (s.data()?.status !== 'queued') return false;
  tx.update(ref, { status: 'running', startedAt: new Date().toISOString(), beatAt: new Date().toISOString(), stage: '아이폰 모양 브라우저를 여는 중…' });
  return true;
});
if (!took) process.exit(0);
const run = first.data();
console.log('selftest', ref.id, run.deep ? 'deep' : 'quick');

const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 15'] });
await ctx.addInitScript(() => { try { localStorage.setItem('uzuhama_onboarding_version', '999'); localStorage.setItem('uzuhama_tutorial_done_v1', '1'); } catch {} });
const p = await ctx.newPage();
let status = 'done';
let error = '';
let last = { results: [], stage: '' };
const end = Date.now() + 45 * 60000;
try {
  await p.goto(`${BASE}/selftest?auto=1${run.deep ? '' : '&quick=1'}`, { timeout: 60000 });
  let lastWrite = 0;
  for (;;) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => { const s = window.__selftest || {}; return { done: Boolean(s.done), results: (s.results || []).map((r) => ({ group: r.group, name: r.name, ok: r.ok, warn: r.warn || false, ms: r.ms, err: r.err ? String(r.err).slice(0, 300) : undefined, details: (r.details || []).slice(0, 15).map((d) => String(d).slice(0, 200)) })), stage: String(s.stage || '') }; }).catch(() => null);
    if (st) last = st;
    const cur = (await ref.get()).data() || {};
    if (cur.status === 'cancel') { status = 'cancel'; break; }
    if (st?.done) break;
    if (Date.now() > end) { status = 'error'; error = '45분이 넘어서 멈췄어요'; break; }
    if (Date.now() - lastWrite > 15000) {
      lastWrite = Date.now();
      await ref.set({ beatAt: new Date().toISOString(), stage: last.stage, results: JSON.parse(JSON.stringify(last.results)) }, { merge: true });
    }
  }
} catch (e) {
  status = 'error'; error = String(e?.message || e).slice(0, 300);
}
await b.close().catch(() => {});
const fin = { endedAt: new Date().toISOString(), beatAt: new Date().toISOString(), results: JSON.parse(JSON.stringify(last.results)), stage: status === 'cancel' ? '중단했어요' : status === 'done' ? '끝났어요' : error };
// 중단은 사용자가 이미 적어 둠 (덮어쓰지 않음)
await ref.set(status === 'cancel' ? fin : { ...fin, status, error }, { merge: true });
console.log('selftest end', status, last.results.length);
process.exit(0);
