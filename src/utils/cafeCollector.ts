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
  const parseCafe = (u: string): { club: string; aid: string } | null => {
    try {
      const x = new URL(u, location.href);
      if (!/(^|\.)cafe\.naver\.com$/.test(x.hostname)) return null;
      const aidQ = x.searchParams.get('articleid') || x.searchParams.get('articleId');
      const clubQ = x.searchParams.get('clubid') || x.searchParams.get('clubId');
      const m1 = x.pathname.match(/\/cafes\/(\d+)\/articles\/(\d+)/);
      if (m1) return { club: m1[1], aid: m1[2] };
      const m2 = x.pathname.match(/^\/(?:ca-fe\/)?([A-Za-z][\w-]*)\/(\d+)\/?$/);
      if (m2) return { club: m2[1], aid: m2[2] };
      if (aidQ) return { club: clubQ || '', aid: aidQ };
    } catch { /* */ }
    return null;
  };
  // 지금 열어 둔 글
  const here = (() => {
    const p = parseCafe(location.href);
    const fr = document.querySelector('iframe#cafe_main') as HTMLIFrameElement | null;
    let inner: { club: string; aid: string } | null = null;
    try { if (fr?.contentWindow) inner = parseCafe(fr.contentWindow.location.href); } catch { /* */ }
    if (!inner && fr?.src) inner = parseCafe(fr.src);
    return inner || p;
  })();
  let clubId = String(W.g_sClubId || (here && /^\d+$/.test(here.club) ? here.club : '') || '');
  const clubName = (location.pathname.match(/^\/([A-Za-z][\w-]*)/) || [])[1] || 'uzuhama';

  // 글 하나 읽기 (네이버 카페가 쓰는 글 API, 이 브라우저 로그인으로)
  async function readArticle(club: string, aid: string): Promise<{ title: string; html: string } | null> {
    const ids = [...new Set([club, clubId].filter(Boolean))];
    const tries: string[] = [];
    ids.forEach((c) => {
      const useId = /^\d+$/.test(c);
      ['v3', 'v2.1', 'v2'].forEach((v) => tries.push(`https://apis.naver.com/cafe-web/cafe-articleapi/${v}/cafes/${c}/articles/${aid}?useCafeId=${useId}&requestFrom=A`));
    });
    if (!ids.some((c) => !/^\d+$/.test(c))) ['v3', 'v2.1'].forEach((v) => tries.push(`https://apis.naver.com/cafe-web/cafe-articleapi/${v}/cafes/${clubName}/articles/${aid}?useCafeId=false&requestFrom=A`));
    for (const u of tries) {
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) continue;
        const j: any = await r.json();
        const a = j?.result?.article || j?.article;
        const html = a?.contentHtml || a?.content || '';
        if (!html) continue;
        const cid = String(j?.result?.cafe?.id || a?.cafeId || '');
        if (cid && !clubId) clubId = cid;
        return { title: String(a?.subject || ''), html };
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

  (async () => {
    if (!here) { st('카페 글을 연 화면에서 눌러 주세요 (글 주소를 못 찾았어요)'); return; }
    const seen = new Set<string>();
    const out: string[] = [];
    let ok = 0;
    let fail = 0;
    const queue: { club: string; aid: string; depth: number }[] = [{ ...here, depth: 0 }];
    while (queue.length && !stop) {
      if (seen.size >= MAX) { log(`${MAX}개까지만 읽었어요`); break; }
      const cur = queue.shift()!;
      if (seen.has(cur.aid)) continue;
      seen.add(cur.aid);
      st(`읽는 중… ${ok + fail + 1}번째 글 (남은 글 ${queue.length}개)`);
      const a = await readArticle(cur.club, cur.aid);
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
