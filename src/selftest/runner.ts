/**
 * 화면·기능 전체 점검 (사람이 누르는 순서 그대로)
 * - /selftest 화면이 사이트를 안쪽 창(iframe)에 띄워 놓고 차례로 눌러 봄
 * - 관리자 › 시스템 › 자동화 › '화면·기능 전체 점검' 에서 손으로, 주간 점검 때 자동으로 같은 걸 돌림
 * - 점검 전 이 기기의 저장 내용(설정·재생목록·기록)을 그대로 돌려놓음
 */
export type StepResult = { group: string; name: string; ok: boolean; ms: number; err?: string; warn?: boolean; details?: string[] };

const API = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSelfTests(frame: HTMLIFrameElement, onStep: (r: StepResult) => void, opts: { only?: string[]; skip?: string[]; onProgress?: (t: string) => void } = {}) {
  const results: StepResult[] = [];
  const errors: string[] = [];
  const W = () => frame.contentWindow as any as Window & typeof globalThis;
  const D = () => frame.contentDocument as Document;

  // 이 기기의 저장 내용 지키기
  const saved: Record<string, string> = {};
  // 로그인 정보(firebase:…)와 기기 연결은 건드리지 않음 — 예전 것으로 되돌리면 관리자 로그인이 풀림
  const keep = (k: string) => k.startsWith('firebase:') || k.startsWith('uzuhama_device_link');
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (!keep(k)) saved[k] = localStorage.getItem(k) || ''; }
  // 점검 창(iframe)이 바꾼 것만 되돌림 — 점검하는 동안 사용자가 바깥 화면에서 바꾼 건(새 시청 기록 등) 그대로
  // (같은 사이트의 다른 창이 바꾸면 이 창에 storage 이벤트가 옴 → 그 이름만 모아 둠)
  const touched = new Set<string>(['uzuhama_onboarding_version', 'uzuhama_tutorial_done_v1']);
  const onStorage = (e: StorageEvent) => { if (e.key && e.storageArea === localStorage) touched.add(e.key); };
  window.addEventListener('storage', onStorage);
  const restore = () => {
    try {
      touched.forEach((k) => {
        if (keep(k)) return;
        if (k in saved) localStorage.setItem(k, saved[k]); else localStorage.removeItem(k);
      });
    } catch { /* */ }
  };
  try {
    localStorage.setItem('uzuhama_onboarding_version', '999');
    localStorage.setItem('uzuhama_tutorial_done_v1', '1');
  } catch { /* */ }

  const hook = () => {
    try {
      const w = W();
      if ((w as any).__selftestHooked) return;
      (w as any).__selftestHooked = true;
      w.addEventListener('error', (e: any) => errors.push(String(e?.message || e)));
      w.addEventListener('unhandledrejection', (e: any) => errors.push(String(e?.reason?.message || e?.reason || e)));
      // 바깥으로 나가는 동작은 실제로 하지 않고 '불렸는지'만 셈 (새 창·공유·복사·확인창·다운로드·알림 권한·인쇄)
      const calls = ((w as any).__stubCalls = { n: 0, last: '' });
      const note = (what: string) => { calls.n++; calls.last = what; };
      try { (w as any).open = (u?: any) => { note(`새 창 ${String(u || '').slice(0, 60)}`); return null; }; } catch { /* */ }
      try { (w as any).confirm = (m?: any) => { note(`확인창 ${String(m || '').slice(0, 40)}`); return false; }; } catch { /* */ }
      try { (w as any).alert = (m?: any) => { note(`알림창 ${String(m || '').slice(0, 40)}`); }; } catch { /* */ }
      try { (w as any).prompt = () => { note('입력창'); return null; }; } catch { /* */ }
      try { (w as any).print = () => note('인쇄'); } catch { /* */ }
      try { Object.defineProperty(w.navigator, 'share', { configurable: true, value: async () => { note('공유'); } }); } catch { /* */ }
      try { Object.defineProperty(w.navigator, 'canShare', { configurable: true, value: () => true }); } catch { /* */ }
      try { Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { note('복사'); }, write: async () => { note('복사'); }, readText: async () => '' } }); } catch { /* */ }
      try { if ((w as any).Notification) (w as any).Notification.requestPermission = async () => { note('알림 권한'); return 'default'; }; } catch { /* */ }
      // 영상 재생: 눌렀을 때 플레이어가 생기는지만 보고 실제로는 안 틀어 둠
      // (점검 창 안에서 유튜브가 여러 개 돌면 휴대폰이 버벅이다 멈춤)
      try {
        const M = (w as any).HTMLMediaElement.prototype;
        M.play = function () { note('재생'); return Promise.resolve(); };
      } catch { /* */ }
      try {
        const blank = (el: any) => {
          if (el?.tagName !== 'IFRAME') return;
          const src = String(el.getAttribute('src') || '');
          if (/youtube|youtu\.be|chzzk|naver|twitch/i.test(src)) { note(`재생 ${src.slice(0, 50)}`); el.setAttribute('data-selftest-src', src); el.setAttribute('src', 'about:blank'); }
        };
        const mo = new (w as any).MutationObserver((list: MutationRecord[]) => list.forEach((m) => {
          if (m.type === 'attributes') blank(m.target);
          m.addedNodes.forEach((n: any) => { blank(n); n?.querySelectorAll?.('iframe').forEach(blank); });
        }));
        mo.observe(w.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      } catch { /* */ }
      try {
        const A = (w as any).HTMLAnchorElement.prototype;
        const orig = A.click;
        A.click = function (this: HTMLAnchorElement) { if (this.download || /^blob:|^data:/.test(this.href)) { note(`다운로드 ${this.download || ''}`); return; } return orig.call(this); };
      } catch { /* */ }
    } catch { /* */ }
  };
  const waitFor = async <T,>(fn: () => T | null | undefined | false, ms = 12000, what = '화면'): Promise<T> => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = fn(); if (v) return v as T; } catch { /* */ }
      await sleep(120);
    }
    throw new Error(`${what}이(가) ${Math.round(ms / 1000)}초 안에 안 나와요`);
  };
  const go = async (path: string) => {
    await new Promise<void>((res) => {
      const t = setTimeout(res, 15000);
      frame.onload = () => { clearTimeout(t); res(); };
      frame.src = path;
    });
    hook();
    await waitFor(() => D()?.body && D().body.innerText.length > 30, 15000, '내용');
    await sleep(600);
  };
  const $ = (sel: string) => D().querySelector(sel) as HTMLElement | null;
  const $$ = (sel: string) => Array.from(D().querySelectorAll(sel)) as HTMLElement[];
  const byText = (sel: string, text: string | RegExp) => $$(sel).find((el) => (typeof text === 'string' ? (el.innerText || el.getAttribute('aria-label') || '').includes(text) : text.test(el.innerText || el.getAttribute('aria-label') || '')));
  const visible = (el: HTMLElement | null) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const setInput = (el: HTMLInputElement, v: string) => {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    desc?.set?.call(el, v);
    el.dispatchEvent(new (W() as any).Event('input', { bubbles: true }));
    el.dispatchEvent(new (W() as any).Event('change', { bubbles: true }));
  };
  const tab = (label: string) => byText('nav[aria-label="하단 네비게이션"] button', label);
  const uiCheck = (where: string) => {
    const d = D();
    const vw = W().innerWidth;
    const over = d.documentElement.scrollWidth - vw;
    const broken = Array.from(d.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:') && visible(i as any)).length;
    const unlabeled = $$('button').filter((b) => visible(b) && !b.innerText.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
    const issues = [over > 2 ? `가로 넘침 ${over}px` : '', broken ? `깨진 이미지 ${broken}` : '', unlabeled ? `이름 없는 버튼 ${unlabeled}` : ''].filter(Boolean);
    if (issues.length) throw Object.assign(new Error(`${where}: ${issues.join(', ')}`), { warn: !over && !broken });
  };

  let stepDetails: string[] | undefined;
  const step = async (group: string, name: string, fn: () => Promise<void>, limitMs = 30000) => {
    stepDetails = undefined;
    if (opts.only && !opts.only.includes(group)) return;
    if (opts.skip && opts.skip.includes(group)) return;
    const t0 = Date.now();
    const before = errors.length;
    let r: StepResult;
    try {
      await Promise.race([fn(), sleep(limitMs).then(() => { throw new Error(`${Math.round(limitMs / 1000)}초 넘게 걸려요`); })]);
      const newErr = errors.slice(before).filter((m) => !/Firestore|firebase|network|Failed to fetch|Load failed|ResizeObserver/i.test(m));
      r = newErr.length ? { group, name, ok: false, ms: Date.now() - t0, err: `화면 오류: ${newErr[0].slice(0, 160)}` } : { group, name, ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      r = { group, name, ok: Boolean(e?.warn), warn: Boolean(e?.warn), ms: Date.now() - t0, err: String(e?.message || e).slice(0, 200) };
    }
    if (stepDetails?.length) r.details = stepDetails.slice(0, 60);
    results.push(r);
    onStep(r);
  };

  try {
    /* ── 1. 홈·탭 ── */
    await step('홈', '첫 화면이 열리고 방송 확률이 보여요', async () => {
      await go('/');
      await waitFor(() => /\d+\s*%/.test(D().body.innerText), 15000, '확률 숫자');
      uiCheck('홈');
    });
    await step('홈', '아래 탭바로 기록 → 분석 → 요약 이동', async () => {
      (await waitFor(() => tab('기록'), 5000, '기록 탭')).click();
      await waitFor(() => $('[data-testid="cal-day"]'), 10000, '달력');
      tab('분석')!.click();
      await waitFor(() => $('[data-testid^="stats-tab-"]'), 10000, '분석 화면');
      tab('요약')!.click();
      await waitFor(() => /\d+\s*%/.test(D().body.innerText), 8000, '요약 화면');
    });

    /* ── 2. 달력 → 날짜 → 상세 → 영상 ── */
    let dayDate = '';
    await step('달력', '방송한 날 칸을 누르면 그날 기록이 열려요', async () => {
      tab('기록')!.click();
      await waitFor(() => $('[data-testid="cal-day"]'), 10000, '달력');
      for (let i = 0; i < 14 && !$('[data-testid="cal-day"][data-has-log="1"]'); i++) {
        const prev = $('[data-testid="cal-prev"]') as HTMLButtonElement | null;
        if (!prev || prev.disabled) break;
        prev.click();
        await sleep(400);
      }
      const cell = await waitFor(() => $$('[data-testid="cal-day"][data-has-log="1"]').pop(), 3000, '방송한 날');
      dayDate = cell.dataset.date || '';
      cell.click();
      await waitFor(() => $('[data-testid="day-detail"]'), 8000, '그날 기록');
      uiCheck('달력 상세');
    });
    await step('달력', '그날 기록에 영상·게임 링크가 제대로 걸려 있어요', async () => {
      const box = await waitFor(() => $('[data-testid="day-detail"]'), 3000, '그날 기록');
      const links = Array.from(box.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const bad = links.filter((a) => !/^https?:\/\//.test(a.href));
      if (bad.length) throw new Error(`이상한 링크 ${bad.length}개 (${dayDate})`);
      if (!links.length && !/휴방|기록/.test(box.innerText)) throw new Error(`링크도 안내도 없어요 (${dayDate})`);
    });
    await step('달력', '닫기를 누르면 그날 기록이 닫혀요', async () => {
      const close = $('button[title="닫기"]');
      if (!close) throw Object.assign(new Error('닫기 버튼이 없어요'), { warn: true });
      close.click();
      await waitFor(() => !$('[data-testid="day-detail"]'), 4000, '닫힘');
    });
    await step('달력', '달력에서 옆 달로 넘기기', async () => {
      const prev = $('[data-testid="cal-prev"]') as HTMLButtonElement | null;
      const next = $('[data-testid="cal-next"]') as HTMLButtonElement | null;
      const first = $('[data-testid="cal-day"]')?.dataset.date;
      if (prev && !prev.disabled) { prev.click(); await sleep(400); }
      else if (next && !next.disabled) { next.click(); await sleep(400); }
      const after = $('[data-testid="cal-day"]')?.dataset.date;
      if (first === after) throw new Error('달이 안 바뀌어요');
    });

    /* ── 3. 분석 ── */
    await step('분석', '하위 탭(방송 추이·요일별·카테고리)이 다 열려요', async () => {
      tab('분석')!.click();
      await waitFor(() => $('[data-testid^="stats-tab-"]'), 8000, '분석 화면');
      for (const id of ['trend', 'day', 'category']) {
        const b = $(`[data-testid="stats-tab-${id}"]`);
        if (!b) continue;
        b.click();
        await sleep(700);
      }
      uiCheck('분석');
    });
    await step('분석', '카테고리 표에서 여러 번 한 게임을 누르면 그 게임으로 검색돼요', async () => {
      $('[data-testid="stats-tab-category"]')?.click();
      const chip = await waitFor(() => $$('[data-testid="cat-game"]').find((x) => Number(x.dataset.count) > 1), 8000, '여러 번 한 게임');
      const name = (chip.querySelector('span')?.textContent || '').trim();
      chip.click();
      const inp = await waitFor(() => $('input[name="search_query"]') as HTMLInputElement, 8000, '검색창');
      await waitFor(() => inp.value.trim() === name, 5000, `검색어 '${name}'`);
    });

    /* ── 4. 검색 ── */
    await step('검색', '검색하면 결과가 나와요', async () => {
      const searchBtn = $('button[aria-label="영상 검색 및 추천"]');
      if (!$('input[name="search_query"]')) searchBtn?.click();
      const inp = await waitFor(() => $('input[name="search_query"]') as HTMLInputElement, 8000, '검색창');
      setInput(inp, '공포');
      await waitFor(() => /총\s*\d+\s*개/.test(D().body.innerText), 10000, '검색 결과');
      uiCheck('검색');
    });
    await step('검색', '⋮ 메뉴 → AI 영상 요약이 열리고 닫혀요', async () => {
      ($('input[name="search_query"]') as HTMLInputElement)?.blur();
      // AI가 보기 시작한 영상에만 메뉴가 있음 → ⋮ 를 차례로 열어 찾기
      await waitFor(() => $('button[aria-label="더 보기"]'), 6000, '⋮ 버튼');
      let item: HTMLElement | null = null;
      for (const more of $$('button[aria-label="더 보기"]').slice(0, 8)) {
        more.click();
        await waitFor(() => $('[role="menuitem"]'), 3000, '메뉴').catch(() => null);
        item = await waitFor(() => byText('[role="menuitem"]', 'AI 영상 요약'), 1500, 'AI 메뉴').catch(() => null);
        if (item) break;
        D().dispatchEvent(new (W() as any).MouseEvent('mousedown', { bubbles: true }));
        await sleep(200);
      }
      if (!item) throw Object.assign(new Error('보이는 영상 중 AI가 본 영상이 없어서 건너뜀 (정상)'), { warn: true });
      item.click();
      await waitFor(() => $('[role="dialog"][aria-label="AI 영상 요약"]'), 5000, 'AI 요약 창');
      await waitFor(() => !/불러오는 중/.test($('[role="dialog"][aria-label="AI 영상 요약"]')!.innerText), 12000, 'AI 요약 내용');
      $('[role="dialog"][aria-label="AI 영상 요약"] button[aria-label="닫기"]')?.click();
      await waitFor(() => !$('[role="dialog"][aria-label="AI 영상 요약"]'), 4000, '닫힘');
    });
    await step('검색', '⋮ 메뉴 → 저장 창이 열려요 (저장은 안 함)', async () => {
      $('button[aria-label="더 보기"]')!.click();
      const item = await waitFor(() => byText('[role="menuitem"]', '저장'), 4000, '저장 메뉴');
      item.click();
      await waitFor(() => $('input[placeholder="나중에 볼 영상"]') || byText('button', '완료'), 5000, '저장 창');
      W().history.back();
      await sleep(600);
    });

    /* ── 5. 설정 ── */
    await step('설정', '설정이 열리고 항목을 하나씩 펼쳐 봐요', async () => {
      await go('/?settings=true');
      await waitFor(() => $('[data-settings-section]'), 10000, '설정');
      for (const h of $$('[data-settings-section]').slice(0, 9)) { h.click(); await sleep(350); }
      uiCheck('설정');
    });
    await step('설정', '시청 기록 전체 보기 → 뒤로 가기로 닫혀요', async () => {
      W().dispatchEvent(new (W() as any).Event('uzuhama-open-history'));
      await waitFor(() => $('[aria-label="시청 기록"]'), 5000, '시청 기록');
      W().history.back();
      await waitFor(() => !$('[aria-label="시청 기록"]'), 5000, '닫힘');
    });

    /* ── 6. 패치노트·문서 ── */
    let ver = '';
    await step('패치노트', '목록 → 글 열기 → 원문 보기 버튼', async () => {
      await go('/patch');
      const card = await waitFor(() => $('[id^="patch-card-"]'), 12000, '패치노트 카드');
      ver = card.id.replace('patch-card-', '');
      card.click();
      await waitFor(() => D().querySelector('article') && (D().querySelector('article') as HTMLElement).innerText.length > 80, 8000, '패치노트 내용');
      uiCheck('패치노트 글');
    });
    await step('패치노트', '버전 주소(/patch-버전)로 바로 들어가도 열려요', async () => {
      if (!ver || ver === '0.0.0') throw Object.assign(new Error('버전 있는 글이 없어요'), { warn: true });
      await go(`/patch-${ver}`);
      await waitFor(() => D().querySelector('article') && (D().querySelector('article') as HTMLElement).innerText.length > 80, 10000, `v${ver} 내용`);
    });
    for (const [path, label] of [['/terms', '이용약관'], ['/privacy', '개인정보처리방침']]) {
      await step('문서', `${label} 페이지`, async () => {
        await go(path);
        await waitFor(() => D().body.innerText.length > 400, 10000, label);
        uiCheck(label);
      });
    }
    await step('문서', '없는 주소는 홈으로 돌아가요', async () => {
      await go('/no-such-page-xyz');
      await waitFor(() => W().location.pathname === '/', 6000, '홈으로 이동');
    });

    /* ── 6-2. 누를 수 있는 건 전부 눌러 보기 ──
     * 화면마다 버튼·링크·탭·스위치를 하나씩 누르고: 화면 오류가 없는지, 뭔가 반응하는지(화면·주소·열림 상태·창),
     * 누르면 나오는 메뉴·창 안의 항목까지 한 번 더 눌러 봄. 지우기·보내기·구독 같은 되돌릴 수 없는 건 안 누름.
     * 바깥 링크는 누르지 않고 주소가 제대로인지만 봄. 새 창·공유·복사·다운로드는 실제로 안 하고 불렸는지만 셈 */
    // 이 기기 안에서만 바뀌는 것(검색 기록 지우기·보기 방식 등)은 점검 뒤 되돌리니 누름. 서버·바깥으로 나가거나 되돌릴 수 없는 것만 안 누름
    const SKIP = /로그아웃|연결 끊기|(?<!내)보내기|제출|신고하기|구독하기|알림 (켜|끄)|알림 받기|허용|설치하기|앱 설치|홈 화면에 추가|기기 연결 만들기|QR·연결 코드|먼저 봐 달라|의견 남기기|패치 등록|많이 보고 싶어요|투표|점검 시작|다시 점검/;
    const CTRL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], input[type="checkbox"], input[type="radio"], summary';
    const labelOf = (el: HTMLElement) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const keyOf = (el: HTMLElement) => `${el.tagName}|${el.getAttribute('role') || ''}|${labelOf(el).replace(/[\d,.:%]+/g, '#')}`;
    const isVisible = (el: HTMLElement) => {
      if (!el.getClientRects().length) return false;
      const cs = W().getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) return false;
      return !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
    };
    const overlays = () => {
      const list = $$('[role="dialog"], [role="menu"], [aria-modal="true"], [role="listbox"]').filter(isVisible);
      // role 없이 메뉴 항목만 있는 것도 (항목들의 부모)
      $$('[role="menuitem"]').filter(isVisible).forEach((m) => { const p = m.parentElement as HTMLElement | null; if (p && !list.some((x) => x.contains(p))) list.push(p); });
      return list;
    };
    const sig = () => `${W().location.pathname}${W().location.search}|${overlays().length}`;
    const controls = (root: ParentNode = D()) => {
      const seen = new Map<string, number>();
      const out: { el: HTMLElement; id: string; label: string }[] = [];
      (Array.from(root.querySelectorAll(CTRL)) as HTMLElement[]).forEach((el) => {
        if (!isVisible(el) || el.closest('[data-selftest-skip]')) return;
        const k = keyOf(el);
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        if (n > 2) return; // 같은 모양(카드마다 있는 ⋮ 등)은 2개까지만
        out.push({ el, id: `${k}#${n}`, label: labelOf(el) || el.tagName.toLowerCase() });
      });
      return out;
    };
    const snap = (el?: HTMLElement) => ({
      url: W().location.href,
      ov: overlays().length,
      text: D().body.innerText.length,
      // 글자 수가 같아도 순서·내용이 바뀌면 알아채게 (추천 새로고침 등)
      hash: (() => { const t = D().body.innerText; let h = 0; for (let i = 0; i < t.length; i += 3) h = (h * 31 + t.charCodeAt(i)) | 0; return h; })(),
      html: D().body.innerHTML.length,
      aria: el ? `${el.getAttribute('aria-expanded')}|${el.getAttribute('aria-pressed')}|${el.getAttribute('aria-checked')}|${el.getAttribute('aria-selected')}|${(el as HTMLInputElement).checked}|${el.className}` : '',
      calls: (W() as any).__stubCalls?.n || 0,
      y: W().scrollY,
    });
    const reacted = (a: ReturnType<typeof snap>, b: ReturnType<typeof snap>) =>
      a.url !== b.url || a.ov !== b.ov || a.text !== b.text || a.hash !== b.hash || Math.abs(a.html - b.html) > 20 || a.aria !== b.aria || a.calls !== b.calls || Math.abs(a.y - b.y) > 40;
    // 이미 골라져 있는 것(지금 탭·지금 보기 방식)은 눌러도 바뀌는 게 없는 게 맞음
    const already = (el: HTMLElement) => ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => el.getAttribute(a) === 'true') || Boolean(el.getAttribute('aria-current'));
    const press = async (el: HTMLElement) => {
      try { el.scrollIntoView({ block: 'center' }); } catch { /* */ }
      await sleep(60);
      el.click();
      await sleep(450);
    };
    const checkLink = (a: HTMLAnchorElement): string => {
      const raw = a.getAttribute('href') || '';
      if (!raw || raw === '#' || /undefined|null|NaN/.test(raw)) return `빈 링크/잘못된 주소: '${labelOf(a)}' → ${raw || '(없음)'}`;
      if (/^javascript:/i.test(raw)) return `자바스크립트 링크: '${labelOf(a)}'`;
      try { new URL(a.href); } catch { return `주소 형식 오류: '${labelOf(a)}' → ${raw}`; }
      return '';
    };
    const tapAll = async (screen: string, setup: () => Promise<void>, opts2: { max?: number; nested?: number } = {}) => step('전부 눌러 보기', screen, async () => {
      const max = opts2.max ?? 70;
      const nestedMax = opts2.nested ?? 6;
      const notes: string[] = [];
      const dead: string[] = [];
      const broken: string[] = [];
      let pressed = 0;
      let nestedDone = 0;
      restore(); // 앞 화면에서 바꾼 설정(기간·보기 방식 등)이 넘어오지 않게
      try { localStorage.setItem('uzuhama_onboarding_version', '999'); localStorage.setItem('uzuhama_tutorial_done_v1', '1'); } catch { /* */ }
      await setup();
      const base = sig();
      const reset = async () => {
        if (sig() === base) return;
        try { D().dispatchEvent(new (W() as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch { /* */ }
        await sleep(250);
        if (sig() !== base && W().location.href !== '' ) { try { W().history.back(); } catch { /* */ } await sleep(600); }
        if (sig() !== base) { setups++; await setup(); }
      };
      // 같은 버튼을 또 누르지 않게: 글자가 바뀌어도(펼치기↔접기 등) 같은 모양이면 2번까지만
      const done = new Set<string>();
      const seenKey = new Map<string, number>();
      let setups = 0;
      const t0 = Date.now();
      while (pressed < max && Date.now() - t0 < 200000 && setups < 30) {
        const next = controls().find((c) => !done.has(c.id) && (seenKey.get(c.id.replace(/#\d+$/, '')) || 0) < 2);
        if (!next) break;
        done.add(next.id);
        const k0 = next.id.replace(/#\d+$/, '');
        seenKey.set(k0, (seenKey.get(k0) || 0) + 1);
        opts.onProgress?.(`${screen} · ${pressed + 1}/${max} · ${next.label.slice(0, 20)}`);
        const el = next.el;
        // 되돌릴 수 없는 건 안 누름
        if (SKIP.test(next.label)) { notes.push(`안 누름(되돌릴 수 없음): ${next.label}`); continue; }
        // 링크: 바깥 링크는 주소만 확인
        if (el.tagName === 'A') {
          const bad = checkLink(el as HTMLAnchorElement);
          if (bad) { broken.push(bad); continue; }
          const a = el as HTMLAnchorElement;
          const external = new URL(a.href).origin !== W().location.origin || a.target === '_blank';
          if (external) continue;
        }
        const errBefore = errors.length;
        const before = snap(el);
        const ovBefore = overlays();
        await Promise.race([press(el), sleep(5000)]);
        pressed++;
        let after = snap(el);
        // 오래 걸리는 동작(PDF·CSV 만들기, 화면 이동 뒤 불러오기)은 조금 더 기다려 봄
        for (let w = 0; w < 10 && !reacted(before, after); w++) { await sleep(300); after = snap(el); }
        if (before.url !== after.url) { await waitFor(() => D().body.innerText.trim().length >= 30, 8000, '이동한 화면').catch(() => null); after = snap(el); }
        const newErr = errors.slice(errBefore).filter((m) => !/Firestore|firebase|network|Failed to fetch|Load failed|ResizeObserver|youtube|googlevideo/i.test(m));
        if (newErr.length) broken.push(`'${next.label}' 누르면 화면 오류: ${newErr[0].slice(0, 100)}`);
        else if (!reacted(before, after) && !already(el)) dead.push(next.label);
        // 같은 주소 안 링크로 갔으면 그 화면이 비어 있지 않은지
        if (before.url !== after.url && D().body.innerText.trim().length < 30) broken.push(`'${next.label}' → 빈 화면 (${W().location.pathname})`);
        // 눌러서 새로 열린 메뉴·창 안의 것도 한 번씩
        const opened = overlays().filter((o) => !ovBefore.includes(o));
        if (opened.length && nestedDone < nestedMax) {
          nestedDone++;
          const inner = controls(opened[opened.length - 1]).slice(0, 10);
          for (const c of inner) {
            if (SKIP.test(c.label)) { notes.push(`안 누름: ${next.label} › ${c.label}`); continue; }
            if (c.el.tagName === 'A') { const bad = checkLink(c.el as HTMLAnchorElement); if (bad) broken.push(`${next.label} › ${bad}`); continue; }
            // 매번 그 메뉴를 다시 열고 누름
            if (!c.el.isConnected || !isVisible(c.el)) {
              await reset();
              const again = controls().find((x) => x.id === next.id);
              if (!again) break;
              await press(again.el);
            }
            const cur = controls(overlays().pop() || D()).find((x) => x.id === c.id);
            if (!cur) continue;
            const e0 = errors.length;
            const b2 = snap(cur.el);
            await press(cur.el);
            pressed++;
            let a2 = snap(cur.el);
            for (let w = 0; w < 6 && !reacted(b2, a2); w++) { await sleep(300); a2 = snap(cur.el); }
            const ne = errors.slice(e0).filter((m) => !/Firestore|firebase|network|Failed to fetch|Load failed|ResizeObserver|youtube|googlevideo/i.test(m));
            if (ne.length) broken.push(`'${next.label} › ${c.label}' 화면 오류: ${ne[0].slice(0, 100)}`);
            else if (!reacted(b2, a2) && !already(cur.el)) dead.push(`${next.label} › ${c.label}`);
          }
        }
        // 처음 화면으로 (멈추면 20초 뒤 다시 불러옴, 그래도 안 되면 이 화면은 여기까지)
        const ok = await Promise.race([reset().then(() => true).catch(() => false), sleep(20000).then(() => false)]);
        if (!ok) {
          notes.push(`'${next.label}' 누른 뒤 처음 화면으로 못 돌아와서 다시 불러옴`);
          try { setups++; await Promise.race([setup(), sleep(20000).then(() => { throw new Error('멈춤'); })]); } catch { notes.push('화면을 다시 못 불러와서 이 화면은 여기까지'); break; }
        }
      }
      if (setups >= 30) notes.push('처음 화면으로 너무 자주 돌아가서 여기까지만 눌렀어요');
      stepDetails = [
        `눌러 본 것 ${pressed}개 (메뉴·창 안 ${nestedDone}곳 포함)`,
        ...broken.map((x) => `❌ ${x}`),
        ...dead.map((x) => `반응 없음: ${x}`),
        ...notes,
      ];
      if (broken.length) throw new Error(`${screen}: 문제 ${broken.length}개 — ${broken[0]}`);
      if (dead.length) throw Object.assign(new Error(`${screen}: 눌렀는데 반응 없는 것 ${dead.length}개 (${dead.slice(0, 4).join(', ')})`), { warn: true });
    }, 260000);

    await tapAll('홈(요약)', async () => { await go('/'); await waitFor(() => /\d+\s*%/.test(D().body.innerText), 15000, '확률'); });
    await tapAll('기록(달력)', async () => { await go('/'); (await waitFor(() => tab('기록'), 6000, '기록 탭')).click(); await waitFor(() => $('[data-testid="cal-day"]'), 10000, '달력'); });
    for (const sub of ['trend', 'day', 'category']) {
      await tapAll(`분석 · ${sub === 'trend' ? '방송 추이' : sub === 'day' ? '요일별' : '카테고리'}`, async () => {
        await go('/');
        (await waitFor(() => tab('분석'), 6000, '분석 탭')).click();
        await waitFor(() => $('[data-testid^="stats-tab-"]'), 10000, '분석 화면');
        const b = await waitFor(() => $(`[data-testid="stats-tab-${sub}"]`), 3000, '하위 탭').catch(() => null);
        if (!b) throw Object.assign(new Error('지금 고른 기간에서는 없는 하위 탭이에요'), { warn: true });
        b.click();
        await sleep(600);
      }, { max: 50 });
    }
    await tapAll('검색 결과', async () => {
      await go('/');
      (await waitFor(() => $('button[aria-label="영상 검색 및 추천"]'), 6000, '검색 버튼')).click();
      const inp = await waitFor(() => $('input[name="search_query"]') as HTMLInputElement, 8000, '검색창');
      setInput(inp, '공포');
      await waitFor(() => /총\s*\d+\s*개/.test(D().body.innerText), 10000, '검색 결과');
      inp.blur();
    }, { max: 60 });
    await tapAll('설정', async () => {
      await go('/?settings=true');
      await waitFor(() => $('[data-settings-section]'), 10000, '설정');
    }, { max: 80, nested: 4 });
    await tapAll('패치노트', async () => { await go('/patch'); await waitFor(() => $('[id^="patch-card-"]'), 12000, '패치노트'); }, { max: 40 });

    /* ── 7. 서버(API·DB) ── */
    const api = async (name: string, path: string, ok: (j: any, r: Response, text: string) => boolean, init?: RequestInit) => step('서버', name, async () => {
      const t0 = Date.now();
      const r = await fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, cache: 'no-store' });
      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { /* */ }
      if (!ok(j, r, text)) throw new Error(`HTTP ${r.status} ${text.slice(0, 120)}`);
      if (Date.now() - t0 > 6000) throw Object.assign(new Error(`느려요 ${Date.now() - t0}ms`), { warn: true });
    });
    await api('상태 확인', '/api/health', (j) => j?.status === 'ok');
    await api('패치노트 (노션 포함)', '/api/patch-notes', (j) => Array.isArray(j?.notes) && j.notes.length > 0 && !j?.notion?.error);
    await api('검색 색인', '/api/videos/search-index?status=1', (j, r) => r.ok && Boolean(j));
    await api('AI 분석 상태', '/api/videos/search-index?ai=status', (j) => typeof j?.total === 'number');
    await api('AI 검색', '/api/videos/search-index?ai=search&q=%EA%B3%B5%ED%8F%AC', (j) => Array.isArray(j?.results));
    await api('재생목록', '/api/videos/playlists', (j, r) => r.ok && !j?.error);
    await api('쇼츠', '/api/videos/shorts', (j, r) => r.ok && !j?.error);
    await api('상태 문구', '/api/status-messages', (j, r) => r.ok && !j?.error);
    await api('캘린더 구독(ics)', '/api/calendar', (_j, r, t) => r.ok && /BEGIN:VCALENDAR/.test(t));
    await api('관리자 API는 로그인 없이 막혀요', '/api/admin/mutate', (_j, r) => r.status === 401 || r.status === 403, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mfaStatus' }) });
    await api('DB: 설정 읽기', 'https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents/config/system?key=AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM&mask.fieldPaths=appVersion', (j, r) => r.ok && Boolean(j?.fields));
    await api('DB: 방송 기록 읽기', 'https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents/logs?key=AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM&pageSize=3', (j, r) => r.ok && (j?.documents || []).length > 0);
    await api('DB: 방문자는 푸시 구독 목록을 못 읽어요', 'https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents/push_subscriptions?key=AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM&pageSize=1', (j, r) => r.status === 403 || (r.ok && !(j?.documents || []).length));
  } finally {
    await sleep(400); // 마지막 storage 이벤트까지 받고
    restore();
    window.removeEventListener('storage', onStorage);
  }
  return { results, errors };
}
