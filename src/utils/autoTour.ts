/**
 * 최종 확인 자동 둘러보기
 *  1) 설정 › '최종 확인 둘러보기' → 안내 창 ("화면 녹화를 켜고 돌아오면 시작")
 *  2) 제어 센터에서 화면 녹화를 켜고 앱으로 돌아오면(화면이 가려졌다 다시 보임) 3초 세고 메인 화면부터 시작
 *     (웹은 화면 녹화가 켜졌는지 알 수 없어서 '돌아온 순간'을 신호로 씀 · '지금 시작'도 있음)
 *  3) 요약 → 기록 → 분석 → 검색 → 설정 순서로 화면을 끝까지 내려 보고, 눌러서 열리는 것들을 열었다 닫음
 *     (지우기·보내기 같은 되돌릴 수 없는 버튼은 누르지 않음)
 *  화면 위쪽 '자동 둘러보기' 막대를 누르면 언제든 멈춤
 */

let running = false;
let stopFlag = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const check = () => { if (stopFlag) throw new Error('stopped'); };

function bar(text: string) {
  let el = document.getElementById('auto-tour-bar');
  if (!el) {
    el = document.createElement('button');
    el.id = 'auto-tour-bar';
    el.setAttribute('type', 'button');
    el.setAttribute('aria-label', '자동 둘러보기 멈추기');
    el.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 6px);transform:translateX(-50%);z-index:2147483000;padding:6px 14px;border-radius:999px;border:0;background:rgba(17,17,20,.82);color:#fff;font:600 12px/1.3 system-ui,sans-serif;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;max-width:90vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    el.addEventListener('click', () => { stopFlag = true; });
    document.body.appendChild(el);
  }
  el.textContent = text;
}
const removeBar = () => document.getElementById('auto-tour-bar')?.remove();

/** 글자로 버튼 찾기 (보이는 것만) */
function byText(text: string | RegExp, root: ParentNode = document, sel = 'button, a, [role="tab"], [role="button"]'): HTMLElement | null {
  const els = Array.from(root.querySelectorAll<HTMLElement>(sel));
  const ok = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return els.find((e) => ok(e) && (typeof text === 'string' ? (e.textContent || '').trim() === text : text.test((e.textContent || '').trim()))) || null;
}

async function tap(el: Element | null, wait = 900) {
  check();
  if (!el) return false;
  (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
  await sleep(450);
  check();
  (el as HTMLElement).click();
  await sleep(wait);
  return true;
}

/** 천천히 끝까지 내렸다가 위로 */
async function scrollThrough(speed = 1.1, back = true) {
  check();
  const max = () => document.documentElement.scrollHeight - window.innerHeight;
  let y = window.scrollY;
  while (y < max() - 4) {
    check();
    y = Math.min(max(), y + 9 * speed);
    window.scrollTo(0, y);
    await sleep(16);
  }
  await sleep(600);
  if (back) { window.scrollTo({ top: 0, behavior: 'smooth' }); await sleep(900); }
}

async function goTab(label: '요약' | '기록' | '분석') {
  // 검색 중이면 아래 바가 검색창이라 먼저 닫기
  const closeSearch = document.querySelector<HTMLElement>('button[aria-label="검색 닫기"]');
  if (closeSearch && closeSearch.getBoundingClientRect().width > 0) await tap(closeSearch, 900);
  const t = byText(label, document, 'nav button, button');
  await tap(t, 1300);
  window.scrollTo({ top: 0 }); await sleep(400);
}

async function closeTopLayer() {
  const x = Array.from(document.querySelectorAll<HTMLElement>('button[aria-label="닫기"]')).reverse().find((e) => e.getBoundingClientRect().width > 0);
  if (x) await tap(x, 900); else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(700); }
}

async function run() {
  // 1. 요약
  bar('자동 둘러보기 · 요약 (누르면 멈춰요)');
  await goTab('요약');
  await tap(byText(/확률 계산 자세히 보기/), 1500);
  await tap(byText(/확률 계산 자세히 보기|접기/), 700);
  const more = Array.from(document.querySelectorAll('section')).find((s) => /새 영상/.test(s.textContent || ''));
  if (more) await tap(byText(/^더보기/, more), 1200);
  await scrollThrough(1.2);

  // 2. 기록
  bar('자동 둘러보기 · 기록 (누르면 멈춰요)');
  await goTab('기록');
  const day = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="cal-day"]')).reverse().find((d) => (d.firstElementChild as HTMLElement | null)?.style.backgroundColor);
  if (day) await tap(day, 1800);
  await scrollThrough(1.3);

  // 3. 분석 (하위 탭마다)
  bar('자동 둘러보기 · 분석 (누르면 멈춰요)');
  await goTab('분석');
  for (const sub of [/^방송 추이/, /^요일별/, /^카테고리/]) {
    const b = byText(sub);
    if (!b) continue;
    await tap(b, 1400);
    await scrollThrough(1.6);
  }

  // 4. 검색 (하위 탭마다 + 영상 카드 펼쳐 보기)
  bar('자동 둘러보기 · 검색 (누르면 멈춰요)');
  await tap(document.querySelector<HTMLElement>('button[aria-label="영상 검색 및 추천"]'), 1800);
  for (const sub of ['홈', '동영상', 'Shorts', '라이브', '재생목록', '추천']) {
    const b = byText(sub, document, 'button, [role="tab"]');
    if (!b) continue;
    await tap(b, 1500);
    await scrollThrough(2, true);
  }
  await tap(byText('동영상', document, 'button, [role="tab"]'), 1500);
  const first = document.querySelector<HTMLElement>('[data-thumb] button, [data-ai-card] button');
  if (first) { await tap(first, 3500); const sc = document.querySelector<HTMLElement>('.overflow-y-auto.overscroll-contain'); if (sc) { for (let i = 0; i < 60; i++) { check(); sc.scrollTop += 14; await sleep(16); } await sleep(800); } await closeTopLayer(); }
  // 검색 닫기 → 요약
  await goTab('요약');

  // 5. 설정
  bar('자동 둘러보기 · 설정 (누르면 멈춰요)');
  const gear = Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => b.querySelector('svg.lucide-settings') && b.getBoundingClientRect().width > 0);
  await tap(gear || null, 1500);
  for (const sec of [/^알림 설정/, /^화면 설정/, /^보기·정렬/]) {
    const b = byText(sec);
    if (b) { await tap(b, 1300); await tap(b, 700); }
  }
  await scrollThrough(1.4);
  await closeTopLayer();
  await goTab('요약');
}

/** 설정에서 부름: 안내 → (돌아오면) 시작 */
export function startAutoTour(opts: { now?: boolean } = {}) {
  if (running) return;
  running = true; stopFlag = false;
  const begin = async () => {
    cleanup();
    try {
      for (const n of [3, 2, 1]) { bar(`자동 둘러보기 ${n}초 뒤 시작 · 누르면 취소`); await sleep(1000); check(); }
      await run();
      bar('자동 둘러보기 끝 · 녹화를 멈춰 주세요'); await sleep(3500);
    } catch { /* 멈춤 */ }
    removeBar(); running = false;
  };
  let wasAway = false;
  const onVis = () => { if (document.visibilityState === 'hidden') wasAway = true; else if (wasAway) begin(); };
  const onBlur = () => { wasAway = true; };
  const onFocus = () => { if (wasAway) begin(); };
  const cleanup = () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  if (opts.now) { begin(); return; }
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  bar('화면 녹화를 켜고 돌아오면 자동으로 시작해요 · 누르면 취소');
  // 취소: 막대를 누르면
  const cancelWatch = setInterval(() => { if (stopFlag) { clearInterval(cancelWatch); cleanup(); removeBar(); running = false; } if (!running) clearInterval(cancelWatch); }, 300);
}
