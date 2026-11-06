/**
 * 화면 자동 점검 (배포 전에 CI 에서 실제 브라우저로 한 번씩 눌러 봄)
 * 서버 데이터 없이 사이트에 들어 있는 과거 기록(public/data)만으로 돌아감
 * 실행: npm run build && npx vite preview --port 4173 & node e2e/smoke.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:4173';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['✓', name]); }
  catch (e) { results.push(['✗', name, String(e?.message || e).split('\n')[0]]); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await check('첫 화면: 약관·시작 안내가 뜬다', async () => {
  await page.goto(BASE);
  await page.waitForTimeout(5000);
  expect(await page.locator('text=약관').count() > 0 || await page.locator('text=시작하기').count() > 0, '처음 화면이 안 보여요');
});

// 이후 점검은 처음 화면을 건너뛰고
await ctx.addInitScript(() => { localStorage.setItem('uzuhama_onboarding_version', '999'); localStorage.setItem('uzuhama_tutorial_done_v1', '1'); });
await page.goto(BASE);
await page.waitForTimeout(5000);

await check('홈: 방송 확률 카드', async () => {
  expect(await page.locator('text=%').count() > 0, '확률 숫자가 없어요');
});

await check('검색 탭 열기', async () => {
  await page.locator('button:has(svg.lucide-search)').last().click({ force: true });
  await page.waitForTimeout(2500);
  expect(await page.locator('input[name="search_query"]').count() === 1, '검색창이 없어요');
});

await check('검색: 결과가 나온다 (공포)', async () => {
  await page.locator('input[name="search_query"]').fill('공포');
  await page.waitForTimeout(2500);
  const n = Number((await page.evaluate(() => document.body.innerText.match(/총 (\d+)개 영상/)?.[1])) || 0);
  expect(n > 10, `결과 ${n}개`);
});

await check('검색: 긴 글을 빨리 쳐도 글자가 밀리지 않는다', async () => {
  const text = '우주하마 마인크래프트 하드코어 생존 레전드 편집본 모음 abc 123';
  const inp = page.locator('input[name="search_query"]');
  await inp.fill('');
  await inp.pressSequentially(text, { delay: 5 });
  expect((await inp.inputValue()) === text, '입력이 달라졌어요');
});

await check('말하듯 검색: 수면방송 추천 → 라이브 탭', async () => {
  await page.locator('input[name="search_query"]').fill('수면방송 추천해줘');
  await page.waitForTimeout(3000);
  expect(await page.locator('text=라이브 탭에서 찾았어요').count() > 0, '해석 안내가 없어요');
});

await check('⋮ 메뉴 → 저장 → 내 재생목록', async () => {
  await page.locator('input[name="search_query"]').fill('공포');
  await page.waitForTimeout(2500);
  await page.locator('input[name="search_query"]').blur();
  await page.locator('button[aria-label="더 보기"]').first().click();
  await page.locator('[role="menuitem"]', { hasText: '저장' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="나중에 볼 영상"]').fill('테스트 목록');
  await page.getByRole('button', { name: '새로 만들기' }).click();
  await page.getByRole('button', { name: '완료' }).click();
  const store = await page.evaluate(() => localStorage.getItem('uzuhama_my_playlists_v1') || '');
  expect(store.includes('테스트 목록'), '저장이 안 됐어요');
});

await check('시청 기록 전체 보기 → 뒤로 가기로 닫힘', async () => {
  await page.evaluate(() => window.dispatchEvent(new Event('uzuhama-open-history')));
  await page.waitForTimeout(800);
  expect(await page.locator('[aria-label="시청 기록"]').count() === 1, '기록 화면이 안 열렸어요');
  await page.goBack();
  await page.waitForTimeout(800);
  expect(await page.locator('[aria-label="시청 기록"]').count() === 0, '뒤로 가기로 안 닫혀요');
});

await check('약관 페이지에 표가 보인다', async () => {
  await page.goto(`${BASE}/privacy`);
  await page.waitForTimeout(3000);
  expect(await page.locator('table').count() > 0, '표가 없어요');
});

await check('화면 오류 없음', async () => {
  const real = errors.filter((m) => !/Firestore|firebase|fetch|network|Load failed/i.test(m));
  expect(real.length === 0, real.slice(0, 2).join(' / '));
});

await browser.close();
results.forEach((r) => console.log(r.join(' ')));
const failed = results.filter((r) => r[0] === '✗');
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
