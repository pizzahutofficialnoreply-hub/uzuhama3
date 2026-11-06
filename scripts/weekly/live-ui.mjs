/**
 * 주간 점검: 실제 사이트 화면·개발자 콘솔·UI/UX
 * - 두 주소(vercel.app, web.app) × 휴대폰/PC × 밝게/어둡게
 * - 콘솔 오류·경고, 페이지 오류, 실패한 요청(4xx/5xx), 가로 넘침, 깨진 이미지, 너무 작은 버튼, 로딩 시간
 * - 화면 사진은 weekly-out/shots 에 (GitHub 실행 결과에서 내려받기)
 * 결과: weekly-out/live-ui.json
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'weekly-out';
mkdirSync(`${OUT}/shots`, { recursive: true });
const HOSTS = (process.env.LIVE_HOSTS || 'https://uzuhama.vercel.app,https://uzuhama.web.app').split(',');
const PAGES = [
  ['홈', '/'],
  ['검색', '/?q=%EA%B3%B5%ED%8F%AC'],
  ['패치노트', '/patch'],
  ['개인정보처리방침', '/privacy'],
  ['이용약관', '/terms'],
];
const VIEWS = [
  { name: '휴대폰', opts: { ...devices['iPhone 13'] } },
  { name: 'PC', opts: { viewport: { width: 1366, height: 860 } } },
];
// 우리 사이트 문제가 아닌 것 (유튜브 광고·추적 차단 등)
const IGNORE = /doubleclick|googlesyndication|google-analytics|googletagmanager|youtube\.com\/(api\/stats|generate_204|ptracking)|play\.google|ERR_BLOCKED_BY_CLIENT|favicon|net::ERR_ABORTED/i;

const browser = await chromium.launch();
const report = { at: new Date().toISOString(), runs: [] };

for (const host of HOSTS) {
  for (const view of VIEWS) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ ...view.opts, colorScheme: scheme });
      await ctx.addInitScript(() => {
        try { localStorage.setItem('uzuhama_onboarding_version', '999'); localStorage.setItem('uzuhama_tutorial_done_v1', '1'); } catch {}
      });
      for (const [label, path] of PAGES) {
        // 밝게/어둡게는 홈·검색만 (나머지는 밝게만)
        if (scheme === 'dark' && !['홈', '검색'].includes(label)) continue;
        const page = await ctx.newPage();
        const issues = { console: [], warn: [], pageerror: [], failed: [] };
        page.on('console', (m) => {
          const t = m.text();
          if (IGNORE.test(t)) return;
          if (m.type() === 'error') issues.console.push(t.slice(0, 300));
          else if (m.type() === 'warning' && issues.warn.length < 20) issues.warn.push(t.slice(0, 200));
        });
        page.on('pageerror', (e) => issues.pageerror.push(String(e.message).slice(0, 300)));
        page.on('requestfailed', (r) => { const u = r.url(); if (!IGNORE.test(u) && !IGNORE.test(r.failure()?.errorText || '')) issues.failed.push(`${r.failure()?.errorText} ${u.slice(0, 160)}`); });
        page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !IGNORE.test(u)) issues.failed.push(`${r.status()} ${u.slice(0, 160)}`); });
        const t0 = Date.now();
        let ok = true;
        let err = '';
        try {
          await page.goto(host + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(6000);
        } catch (e) { ok = false; err = String(e?.message || e).split('\n')[0]; }
        const ms = Date.now() - t0;
        const dom = ok ? await page.evaluate(() => {
          const vw = window.innerWidth;
          const overflow = document.documentElement.scrollWidth - vw;
          const wide = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className || '').toString().split(' ').slice(0, 2).join('.')}`);
          const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.src.slice(0, 120)).slice(0, 10);
          const small = [...document.querySelectorAll('button, a[href], [role=button]')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top < innerHeight && (r.width < 28 || r.height < 28) && getComputedStyle(el).visibility !== 'hidden';
          }).length;
          const noLabel = [...document.querySelectorAll('button')].filter((b) => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
          const nav = performance.getEntriesByType('navigation')[0];
          const fcp = performance.getEntriesByName('first-contentful-paint')[0];
          return {
            overflow: Math.max(0, Math.round(overflow)), wide, broken, small, noLabel,
            dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null, fcp: fcp ? Math.round(fcp.startTime) : null,
            title: document.title, textLen: document.body.innerText.length,
            maintenance: /점검 중|점검 안내/.test(document.body.innerText.slice(0, 400)),
          };
        }) : null;
        const shot = `${OUT}/shots/${host.replace(/https?:\/\//, '').replace(/\W+/g, '_')}-${view.name}-${scheme}-${label}.png`;
        try { await page.screenshot({ path: shot }); } catch {}
        report.runs.push({ host, view: view.name, scheme, page: label, path, ok, err, ms, ...dom, ...issues, shot });
        await page.close();
      }
      await ctx.close();
    }
  }
}
await browser.close();

// 요약
const runs = report.runs;
report.summary = {
  pages: runs.length,
  loadFail: runs.filter((r) => !r.ok).length,
  pageErrors: runs.reduce((a, r) => a + r.pageerror.length, 0),
  consoleErrors: runs.reduce((a, r) => a + r.console.length, 0),
  failedRequests: runs.reduce((a, r) => a + r.failed.length, 0),
  overflowPages: runs.filter((r) => r.overflow > 2).length,
  brokenImages: runs.reduce((a, r) => a + (r.broken?.length || 0), 0),
  smallTargetsMax: Math.max(0, ...runs.map((r) => r.small || 0)),
  unlabeledButtonsMax: Math.max(0, ...runs.map((r) => r.noLabel || 0)),
  slowestMs: Math.max(0, ...runs.map((r) => r.fcp || 0)),
  emptyPages: runs.filter((r) => r.ok && (r.textLen || 0) < 30).length,
};
writeFileSync(`${OUT}/live-ui.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.summary));
