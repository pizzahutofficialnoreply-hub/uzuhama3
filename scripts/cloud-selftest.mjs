/**
 * 클라우드 점검 (백그라운드 작업에서 2분마다 부름)
 *  - 서버에 줄 선 점검이 있으면 하나 받아서(이 실행이 진짜 이 저장소의 worker 인지 서버가 GitHub 에 확인),
 *    아이폰 크기·터치를 흉내 낸 브라우저(크롬 엔진)로 /selftest 를 돌림
 *  - 15초마다 진행 상황을 서버에 알리고, 사용자가 '중단'하면 바로 멈춤
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.SELFTEST_BASE || 'https://uzuhama.vercel.app';
const RUN = process.env.GITHUB_RUN_ID || '';
const DRY = process.env.SELFTEST_DRY === '1'; // 시험: 서버에 안 알리고 돌려만 봄
const api = async (op, body) => {
  if (DRY) return op === 'claim' ? { id: 'dry-run', deep: false } : {};
  const r = await fetch(`${BASE}/api/health?selftest=${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: RUN, ...body }), signal: AbortSignal.timeout(20000) });
  return r.json().catch(() => ({}));
};

const job = await api('claim', {}).catch(() => ({}));
if (!job?.id) process.exit(0);
console.log('selftest', job.id, job.deep ? 'deep' : 'quick');

let b;
try { b = await chromium.launch(); } catch (e) {
  const msg = `브라우저를 열지 못했어요: ${String(e?.message || e).slice(0, 200)}`;
  console.log(msg);
  await api('progress', { id: job.id, stage: msg, results: [], final: 'error', error: msg }).catch(() => {});
  process.exit(0);
}
const ctx = await b.newContext({ ...devices['iPhone 15'] });
await ctx.addInitScript(() => { try { localStorage.setItem('uzuhama_onboarding_version', '999'); localStorage.setItem('uzuhama_tutorial_done_v1', '1'); } catch {} });
const p = await ctx.newPage();
let final = 'done';
let error = '';
let last = { results: [], stage: '' };
const end = Date.now() + 45 * 60000;
try {
  await p.goto(`${BASE}/selftest?auto=1${job.deep ? '' : '&quick=1'}`, { timeout: 60000 });
  let lastSend = 0;
  for (;;) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => { const s = window.__selftest || {}; return { done: Boolean(s.done), results: s.results || [], stage: String(s.stage || '') }; }).catch(() => null);
    if (st) last = st;
    if (st?.done) break;
    if (Date.now() > end) { final = 'error'; error = '45분이 넘어서 멈췄어요'; break; }
    if (Date.now() - lastSend > 15000) {
      lastSend = Date.now();
      const r = await api('progress', { id: job.id, stage: last.stage, results: last.results }).catch(() => ({}));
      if (r?.status === 'cancel') { final = 'cancel'; break; }
    }
  }
} catch (e) {
  final = 'error'; error = String(e?.message || e).slice(0, 300);
  console.log('selftest error', error);
}
await b.close().catch(() => {});
if (final !== 'cancel') await api('progress', { id: job.id, stage: final === 'done' ? '끝났어요' : error, results: last.results, final, error }).catch(() => {});
console.log('selftest end', final, last.results.length);
if (DRY) (last.results || []).forEach((r) => console.log(`${r.ok ? (r.warn ? '!' : '✓') : '✗'} [${r.group}] ${r.name}${r.err ? ` — ${r.err}` : ''} (${r.ms}ms)`));
process.exit(0);
