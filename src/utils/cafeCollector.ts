/**
 * 네이버 카페 정리 글 한 번에 모으기 (북마클릿)
 * - 관리자가 네이버에 로그인한 브라우저에서 카페 정리 글(목차 글)을 열고 북마크를 누르면
 *   그 글에 연결된 카페 글들(연·월별 정리 글 → 그 안의 글까지 2단계)을 차례로 읽어 글자만 모음
 * - 읽기는 그 사람 브라우저의 로그인으로 (비밀번호·쿠키를 어디에도 저장·전송하지 않음)
 * - naver.me 짧은 주소만 사이트 서버가 원래 주소로 풀어 줌 (로그인 정보 없이, 주소만)
 * - 다 모으면 카페 화면 위에 창을 띄워 '복사' → 관리자 › 등록 › 카페 정리 글 가져오기에 붙여 넣기
 *
 * 주의: 아래 함수는 문자열로 바꿔 북마크에 넣으므로 바깥 변수·import 를 쓰면 안 됨
 */
export function cafeCollector() {
  const W = window as any;
  if (W.__uzuCafe) { W.__uzuCafe.remove(); W.__uzuCafe = null; }
  const API = 'https://uzuhama.vercel.app/api/health?unshort=';
  const MAX = 400;
  const box = document.createElement('div');
  W.__uzuCafe = box;
  box.setAttribute('style', 'position:fixed;z-index:2147483647;top:16px;right:16px;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#18181b;color:#fafafa;font:13px/1.5 system-ui,sans-serif;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:16px');
  box.innerHTML = '<b style="font-size:15px">우주하마 · 카페 글 모으기</b><div id="uzu-st" style="margin:8px 0;color:#d4d4d8">시작하는 중…</div><div id="uzu-log" style="font-size:11px;color:#a1a1aa;max-height:120px;overflow:auto;white-space:pre-wrap"></div><div id="uzu-out"></div><button id="uzu-x" style="margin-top:8px;background:#3f3f46;color:#fff;border:0;border-radius:10px;padding:6px 12px;cursor:pointer">닫기</button>';
  document.body.appendChild(box);
  const $ = (id: string) => box.querySelector('#' + id) as HTMLElement;
  ($('uzu-x') as HTMLButtonElement).onclick = () => { stop = true; box.remove(); W.__uzuCafe = null; };
  let stop = false;
  const st = (t: string) => { $('uzu-st').textContent = t; };
  const log = (t: string) => { const l = $('uzu-log'); l.textContent += t + '\n'; l.scrollTop = 1e9; };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // 카페 주소 → { club(숫자 또는 카페 주소 이름), aid }
  const parseCafe = (u: string): { club: string; aid: string; art?: string } | null => {
    try {
      const x = new URL(u, location.href);
      if (!/(^|\.)cafe\.naver\.com$/.test(x.hostname)) return null;
      const aidQ = x.searchParams.get('articleid') || x.searchParams.get('articleId');
      const clubQ = x.searchParams.get('clubid') || x.searchParams.get('clubId');
      // 공유 링크(naver.me)에 붙는 읽기 표 (이게 있으면 그 글은 공유 링크로 읽을 수 있음)
      const art = x.searchParams.get('art') || undefined;
      const m1 = x.pathname.match(/\/cafes\/(\d+)\/articles\/(\d+)/);
      if (m1) return { club: m1[1], aid: m1[2], art };
      const m2 = x.pathname.match(/^\/(?:ca-fe\/)?([A-Za-z][\w-]*)\/(\d+)\/?$/);
      if (m2) return { club: m2[1], aid: m2[2], art };
      if (aidQ) return { club: clubQ || '', aid: aidQ, art };
    } catch { /* */ }
    return null;
  };
  // 지금 열어 둔 글
  const here = (() => {
    const p = parseCafe(location.href);
    const fr = document.querySelector('iframe#cafe_main') as HTMLIFrameElement | null;
    let inner: { club: string; aid: string; art?: string } | null = null;
    try { if (fr?.contentWindow) inner = parseCafe(fr.contentWindow.location.href); } catch { /* */ }
    if (!inner && fr?.src) inner = parseCafe(fr.src);
    return inner || p;
  })();
  let clubId = String(W.g_sClubId || (here && /^\d+$/.test(here.club) ? here.club : '') || '');
  const clubName = (location.pathname.match(/^\/([A-Za-z][\w-]*)/) || [])[1] || 'uzuhama';

  // 글 하나 읽기 (네이버 카페가 쓰는 글 API, 이 브라우저 로그인으로)
  async function readArticle(club: string, aid: string, art?: string): Promise<{ title: string; html: string; writer: string } | null> {
    const ids = [...new Set([club, clubId].filter(Boolean))];
    const tries: string[] = [];
    ids.forEach((c) => {
      const useId = /^\d+$/.test(c);
      ['v3', 'v2.1', 'v2'].forEach((v) => tries.push(`https://apis.naver.com/cafe-web/cafe-articleapi/${v}/cafes/${c}/articles/${aid}?useCafeId=${useId}&requestFrom=A`));
    });
    if (!ids.some((c) => !/^\d+$/.test(c))) ['v3', 'v2.1'].forEach((v) => tries.push(`https://apis.naver.com/cafe-web/cafe-articleapi/${v}/cafes/${clubName}/articles/${aid}?useCafeId=false&requestFrom=A`));
    for (const u0 of tries) {
      const u = art ? `${u0}&art=${encodeURIComponent(art)}` : u0;
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) continue;
        const j: any = await r.json();
        const a = j?.result?.article || j?.article;
        const html = a?.contentHtml || a?.content || '';
        if (!html) continue;
        const cid = String(j?.result?.cafe?.id || a?.cafeId || '');
        if (cid && !clubId) clubId = cid;
        const w = a?.writer || j?.result?.article?.writer || {};
        return { title: String(a?.subject || ''), html, writer: String(w.nick || w.nickname || w.memberNickname || a?.writerNickname || '') };
      } catch { /* 다음 */ }
    }
    return null;
  }

  // 글 HTML → 줄 바꿈 살린 글자 (링크 주소는 글 옆에 붙임) + 그 글이 가리키는 카페 글 주소들
  function toText(html: string) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const links: string[] = [];
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).getAttribute('href') || '';
      if (!/^https?:/.test(href)) return;
      links.push(href);
      if (!(a.textContent || '').includes(href)) a.append(' ' + href + ' ');
    });
    // 링크 미리보기 카드: 주소가 data 속성에만 있는 경우
    doc.querySelectorAll('[data-linkdata],[data-module]').forEach((el) => {
      const raw = el.getAttribute('data-linkdata') || el.getAttribute('data-module') || '';
      const m = raw.match(/https?:\\?\/\\?\/[^"'\s]+/);
      if (m) { const u = m[0].replace(/\\\//g, '/'); links.push(u); if (!(el.textContent || '').includes(u)) el.append(' ' + u + ' '); }
    });
    doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,h1,h2,h3,h4,tr,blockquote').forEach((el) => el.append('\n'));
    const text = (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    (text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).forEach((u) => links.push(u));
    return { text, links: [...new Set(links)] };
  }

  async function resolve(u: string): Promise<string> {
    if (!/^https?:\/\/naver\.me\//.test(u)) return u;
    try {
      const r = await fetch(API + encodeURIComponent(u));
      const j = await r.json();
      return String(j?.url || u);
    } catch { return u; }
  }

  // ── 글 목록·검색 결과 화면에서 누르면: 이 화면에 보이는 글들을 읽어 이 브라우저에 쌓아 둠 (다음 페이지로 가서 또 누르면 이어서 쌓임)
  const ACC = 'uzuCafeAcc';
  const loadAcc = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(ACC) || '{}'); } catch { return {}; } };
  const saveAcc = (o: Record<string, string>) => { try { localStorage.setItem(ACC, JSON.stringify(o)); } catch { /* 너무 큼 */ } };
  function showCopy(all: string, extra = '') {
    const o = $('uzu-out');
    o.innerHTML = '<textarea id="uzu-ta" readonly style="width:100%;height:140px;margin-top:8px;background:#27272a;color:#fafafa;border:0;border-radius:10px;padding:8px;font:11px monospace"></textarea><button id="uzu-cp" style="margin-top:8px;margin-right:6px;background:#9333ea;color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">전부 복사</button>' + extra;
    ($('uzu-ta') as HTMLTextAreaElement).value = all;
    ($('uzu-cp') as HTMLButtonElement).onclick = async () => {
      try { await navigator.clipboard.writeText(all); } catch { ($('uzu-ta') as HTMLTextAreaElement).select(); document.execCommand('copy'); }
      ($('uzu-cp') as HTMLButtonElement).textContent = '복사했어요 ✓';
    };
  }
  // 한 화면(문서)에서 글 링크·그 줄 글자, 페이지 번호 링크 찾기
  function scan(d0: Document) {
    const docs: Document[] = [d0];
    d0.querySelectorAll('iframe').forEach((f) => { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* 다른 사이트 */ } });
    const rows: { club: string; aid: string; art?: string; title: string; row: string }[] = [];
    const pages: { n: number; href: string; next: boolean }[] = [];
    docs.forEach((d) => d.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^javascript:/i.test(href)) return;
      if (/^\d{1,3}$/.test(t) && /page/i.test(href)) { pages.push({ n: Number(t), href, next: false }); return; }
      if (/^(다음|다음 ?페이지|›|>)$/.test(t) && /page/i.test(href)) { pages.push({ n: 1e9, href, next: true }); return; }
      const p = parseCafe(href);
      if (!p || !t || t.length < 2 || /^\d+$/.test(t)) return;
      // 그 글이 있는 줄 전체 (표의 줄·목록 항목까지 올라감: 작성자 이름이 같은 줄에 있음)
      let row: Element | null = a.parentElement;
      for (let i = 0; i < 8 && row && !/^(TR|LI)$/.test(row.tagName) && row.getAttribute('role') !== 'row'; i++) row = row.parentElement;
      const rowText = (row && (row.textContent || '').length < 600 ? row.textContent : a.parentElement?.parentElement?.textContent) || t;
      rows.push({ ...p, title: t, row: rowText.replace(/\s+/g, ' ').slice(0, 300) });
    }));
    return { rows, pages };
  }
  // 다음 페이지를 숨은 창에 열어 읽기 (지금 화면은 그대로)
  function loadHidden(href: string): Promise<Document | null> {
    return new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:1000px;height:800px;opacity:0');
      let done = false;
      const fin = (d: Document | null) => { if (done) return; done = true; setTimeout(() => f.remove(), 100); resolve(d); };
      f.onload = () => setTimeout(() => { try { fin(f.contentDocument); } catch { fin(null); } }, 2500);
      setTimeout(() => fin(null), 20000);
      f.src = href;
      document.body.appendChild(f);
    });
  }
  async function listMode() {
    const who = (window.prompt('작성자 이름으로 거를까요? (비우면 모든 글)', '이츠하마타임') || '').trim();
    const auto = window.confirm('다음 페이지들도 자동으로 넘기며 모을까요? (취소: 이 화면만)');
    const acc = loadAcc();
    let ok = 0; let fail = 0; let skip = 0; let pageNo = 0;
    const seenPages = new Set<string>([location.href]);
    let d: Document | null = document;
    let lastNum = 0;
    while (d && !stop) {
      pageNo++;
      const { rows, pages } = scan(d);
      const uniq = rows.filter((r, i) => rows.findIndex((x) => x.aid === r.aid) === i);
      let list = uniq.filter((r) => !who || r.row.includes(who));
      // 줄 글자에서 작성자를 못 찾으면: 글을 읽어서 작성자 이름으로 거름
      const byWriter = !!who && !list.length && uniq.length > 0;
      if (byWriter) list = uniq;
      log(`— ${pageNo}번째 화면: 글 링크 ${uniq.length}개${who ? (byWriter ? ` (작성자는 글을 열어 확인)` : ` · '${who}' ${list.length}개`) : ''}`);
      for (const r of list) {
        if (stop) break;
        if (acc[r.aid]) { skip++; continue; }
        st(`${pageNo}번째 화면 읽는 중… 새로 읽음 ${ok}개 · 지금까지 모은 글 ${Object.keys(acc).length}개`);
        const a = await readArticle(r.club, r.aid, r.art);
        if (!a) { fail++; log(`✗ ${r.title}`); continue; }
        if (byWriter && a.writer && !a.writer.includes(who)) { log(`· 건너뜀 (${a.writer}) ${a.title || r.title}`); continue; }
        ok++;
        log(`✓ ${a.title || r.title}`);
        acc[r.aid] = `===== ${a.title || r.title}\n${toText(a.html).text}`;
        saveAcc(acc);
        await sleep(350);
      }
      if (!auto || pageNo >= 60) break;
      // 다음 페이지: 지금 번호보다 큰 가장 작은 번호 → 없으면 '다음'
      const nums = pages.filter((x) => !x.next && !seenPages.has(x.href) && x.n > lastNum).sort((x, y) => x.n - y.n);
      const nxt = nums[0] || pages.find((x) => x.next && !seenPages.has(x.href));
      if (!nxt) break;
      if (!nxt.next) lastNum = nxt.n;
      seenPages.add(nxt.href);
      st(`${nxt.next ? '다음 묶음' : `${nxt.n}페이지`} 여는 중…`);
      d = await loadHidden(nxt.href);
      if (!d) log('다음 페이지를 열지 못했어요 (직접 넘겨서 다시 눌러 주세요)');
    }
    const all = Object.values(acc).join('\n\n');
    st(`새로 ${ok}개 읽음${skip ? ` · 이미 모은 ${skip}개` : ''}${fail ? ` · 못 읽음 ${fail}개` : ''} · 지금까지 모은 글 ${Object.keys(acc).length}개${auto ? '' : ' (다음 페이지로 가서 또 누르면 이어서 쌓여요)'}`);
    showCopy(all, '<button id="uzu-clr" style="margin-top:8px;background:#3f3f46;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer">모은 것 비우기</button>');
    ($('uzu-clr') as HTMLButtonElement).onclick = () => { saveAcc({}); st('비웠어요'); };
  }

  (async () => {
    if (!here) { await listMode(); return; }
    const seen = new Set<string>();
    const out: string[] = [];
    let ok = 0;
    let fail = 0;
    const queue: { club: string; aid: string; art?: string; depth: number }[] = [{ ...here, depth: 0 }];
    while (queue.length && !stop) {
      if (seen.size >= MAX) { log(`${MAX}개까지만 읽었어요`); break; }
      const cur = queue.shift()!;
      if (seen.has(cur.aid)) continue;
      seen.add(cur.aid);
      st(`읽는 중… ${ok + fail + 1}번째 글 (남은 글 ${queue.length}개)`);
      const a = await readArticle(cur.club, cur.aid, cur.art);
      if (!a) { fail++; log(`✗ 글 ${cur.aid} 못 읽음`); continue; }
      ok++;
      const { text, links } = toText(a.html);
      log(`✓ ${a.title || cur.aid}`);
      out.push(`===== ${a.title || '글 ' + cur.aid}\n${text}`);
      if (cur.depth < 2) {
        for (const l of links) {
          if (!/cafe\.naver\.com|naver\.me\//.test(l)) continue;
          const real = await resolve(l);
          const p = parseCafe(real);
          if (p && !seen.has(p.aid)) queue.push({ ...p, depth: cur.depth + 1 });
        }
      }
      await sleep(350);
    }
    const all = out.join('\n\n');
    st(`다 모았어요 · 글 ${ok}개${fail ? ` · 못 읽은 글 ${fail}개` : ''} · ${all.length.toLocaleString()}자`);
    const o = $('uzu-out');
    o.innerHTML = '<textarea id="uzu-ta" readonly style="width:100%;height:160px;margin-top:8px;background:#27272a;color:#fafafa;border:0;border-radius:10px;padding:8px;font:11px monospace"></textarea><button id="uzu-cp" style="margin-top:8px;margin-right:6px;background:#9333ea;color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">전부 복사</button><span style="font-size:11px;color:#a1a1aa">복사한 뒤 사이트 관리자 › 등록 › 카페 정리 글 가져오기에 붙여 넣으세요</span>';
    const ta = $('uzu-ta') as HTMLTextAreaElement;
    ta.value = all;
    ($('uzu-cp') as HTMLButtonElement).onclick = async () => {
      try { await navigator.clipboard.writeText(all); } catch { ta.select(); document.execCommand('copy'); }
      ($('uzu-cp') as HTMLButtonElement).textContent = '복사했어요 ✓';
    };
  })();
}

export const cafeCollectorBookmarklet = () => `javascript:${encodeURIComponent(`(${cafeCollector.toString()})()`)}`;
