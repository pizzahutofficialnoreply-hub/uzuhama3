/**
 * 주간 점검: 화면·기능 전체 점검(/selftest)을 실제 사이트에서 휴대폰 크기로 자동 실행
 * 사람이 누르는 순서(홈 → 달력 칸 → 그날 기록 → 분석 → 검색 → ⋮ → 설정 → 패치노트 → 문서 → 서버·DB)
 * 결과: weekly-out/selftest.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('weekly-out', { recursive: true });
const BASE = process.env.SELFTEST_BASE || 'https://uzuhama.vercel.app';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
let out = { done: false, results: [], errors: [] };
try {
  await p.goto(`${BASE}/selftest?auto=1${process.env.SELFTEST_ONLY ? `&only=${encodeURIComponent(process.env.SELFTEST_ONLY)}` : ''}`, { timeout: 60000 });
  await p.waitForFunction(() => (window).__selftest?.done, null, { timeout: 30 * 60 * 1000 });
  out = await p.evaluate(() => (window).__selftest);
} catch (e) {
  out.error = String(e?.message || e).slice(0, 300);
  try { out.results = await p.evaluate(() => (window).__selftest?.results || []); } catch { /* */ }
}
try { await p.screenshot({ path: 'weekly-out/selftest.png', fullPage: true }); } catch { /* */ }
await b.close();
const failed = (out.results || []).filter((r) => !r.ok);
out.summary = { total: (out.results || []).length, failed: failed.length, warn: (out.results || []).filter((r) => r.warn).length };
writeFileSync('weekly-out/selftest.json', JSON.stringify(out, null, 1));
(out.results || []).forEach((r) => { console.log(`${r.ok ? (r.warn ? '⚠️' : '✓') : '✗'} [${r.group}] ${r.name}${r.err ? ` — ${r.err}` : ''}`); (r.details || []).forEach((d) => console.log(`    · ${d}`)); });
console.log(JSON.stringify(out.summary));
