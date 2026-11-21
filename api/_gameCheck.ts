/**
 * 게임 이름·링크 대조 (관리자 › 연동 › 게임 이름·링크 대조)
 * 1) 방송 기록의 편집 영상마다 유튜브 설명창·해시태그의 게임 이름과 기록의 게임 이름을 비교
 *    → 일치 / 불일치 / 설명창에 정보 없음 (예전 영상은 설명창 형식이 없어서 보류가 많음)
 * 2) 일치한 게임의 링크(스팀·앱스토어·구글 플레이·웹)를 열어 그 페이지의 게임 이름과 1:1 대조
 *    → 맞음 / 이름이 다름 / 링크가 안 열림 / 링크 없음
 * 한 번 불리면 약 40초 동안 영상 40개씩 계속 (유튜브 할당량 묶음당 1) · 새 링크는 8개씩 동시에 열어 봄 · 한 번 본 링크는 저장해 두고 다시 안 봄 · 워커가 3분마다 이어서 함
 * 글자 몇 개만 다른 이름(오타·띄어쓰기·&·데모 등)은 같은 게임으로 봄
 */
import { gameNamesFrom, seriesOf, normG } from './_ytSync.js';

const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const sha = async (s: string) => { const { createHash } = await import('node:crypto'); return createHash('sha1').update(s).digest('hex').slice(0, 24); };

/** 비교용 정리: 대소문자·악센트(Ö→o)·기호 무시, 한글·영문·일본어·중국어·숫자만 남김 */
const nz = (x: string) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** 이름 하나 → 비교할 조각들: 전체 / 괄호·|·/ 로 나눈 것 / 영문 쪽·나머지 쪽 ('파놉티콘 Panopticon' ↔ 'Panopticon (파놉티콘)') */
function parts(name: string): string[] {
  const clean = String(name || '').replace(/[(（\[]\s*(데모|demo|체험판|prologue|프롤로그|플래시게임|하다가 때려침)\s*[)）\]]/gi, ' ').replace(/\b(demo|prologue)\b|데모|체험판/gi, ' ');
  const out = [clean, ...clean.split(/[()（）\[\]|/,·]|\s[-–:]\s|:\s/)];
  for (const p of [...out]) {
    const en = (p.match(/[A-Za-zÀ-ɏ0-9][A-Za-zÀ-ɏ0-9 .!?'&+-]*[A-Za-zÀ-ɏ0-9!?]/g) || []).join(' ');
    const rest = p.replace(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9 .!?'&+-]*/g, ' ');
    out.push(en, rest);
  }
  return [...new Set(out.map((x) => nz(x.replace(/&/g, 'and'))).filter((x) => x.length >= 2))];
}
/** 글자 몇 개만 다른 것(오타·띄어쓰기 등)은 같은 게임으로 */
function close(x: string, y: string): boolean {
  const a = [...x], b = [...y];
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 3) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  const d = prev[b.length], L = Math.max(a.length, b.length);
  return d <= (L >= 10 ? 3 : L >= 6 ? 2 : 1) && d / L <= 0.3;
}
export function nameMatch(a: string, b: string): boolean {
  const pa = parts(a), pb = parts(b);
  for (const x of pa) for (const y of pb) {
    if (x === y && x.length >= 3) return true;
    // 일본어·한자는 글자 수가 짧아서 3글자부터 ('たんぼ')
    const min = (z: string) => (/[\u3040-\u30ff\u4e00-\u9fff]/.test(z) ? 3 : 4);
    if ((x.length >= min(x) && y.includes(x)) || (y.length >= min(y) && x.includes(y))) return true;
    if (close(x, y)) return true;
  }
  const sa = seriesOf(a), sb = seriesOf(b);
  return sa.base === sb.base && sa.n === sb.n && sa.base.length >= 3;
}

/** &#xC5C5; · &amp; 같은 글자 풀기 */
const unent = (t: string) => String(t || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
/** 게임 상점 페이지인지 (아니면 이름 대조는 안 하고 열리는지만) */
const STORE = /store\.steampowered\.com|apps\.apple\.com|play\.google\.com|store\.epicgames\.com|itch\.io|freem\.ne\.jp|nintendo\.|store\.playstation\.com|xbox\.com|gog\.com|store\.onstove\.com/;
export const LINK_V = 2;
type LinkInfo = { ok: boolean; title?: string; titles?: string[]; kind: string; why?: string; transient?: boolean; appId?: string };

/** 링크를 열어 그 페이지가 말하는 게임 이름 (스팀은 영어·한국어 이름 둘 다) */
async function linkTitle(link: string): Promise<LinkInfo> {
  try {
    const u = new URL(link);
    const steam = link.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (steam) {
      const one = async (l: string, cc: string) => {
        const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steam[1]}&l=${l}&cc=${cc}&filters=basic`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { err: r.status };
        const j: any = await r.json().catch(() => null);
        return j ? { d: j[steam[1]] } : { err: 0 };
      };
      let en: any = await one('english', 'kr');
      if (en.err !== undefined) return { ok: false, transient: true, kind: 'steam', why: `스팀이 잠깐 막음 (${en.err || '빈 답'})`, appId: steam[1] };
      if (!en.d?.success) en = await one('english', 'us'); // 한국에서 막힌 게임
      if (en.err !== undefined) return { ok: false, transient: true, kind: 'steam', why: '스팀이 잠깐 막음', appId: steam[1] };
      if (!en.d?.success) return { ok: false, kind: 'steam', why: '스팀에서 내려감 (상점에 없음)', appId: steam[1] };
      const ko: any = await one('koreana', 'kr').catch(() => ({}));
      const titles = [en.d.data?.name, ko?.d?.data?.name].filter(Boolean);
      return { ok: true, title: titles[0], titles: [...new Set(titles)], kind: 'steam', appId: steam[1] };
    }
    const apple = link.match(/apps\.apple\.com\/.*\/id(\d+)/);
    if (apple) {
      const r = await fetch(`https://itunes.apple.com/lookup?id=${apple[1]}&country=kr`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { ok: false, transient: true, kind: 'appstore', why: `앱스토어가 잠깐 막음 (${r.status})`, appId: apple[1] };
      const j: any = await r.json().catch(() => null);
      return j?.results?.[0] ? { ok: true, title: j.results[0].trackName, titles: [j.results[0].trackName], kind: 'appstore', appId: apple[1] } : { ok: false, kind: 'appstore', why: '앱스토어에서 내려감', appId: apple[1] };
    }
    const r = await fetch(link, { signal: AbortSignal.timeout(8000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'ko,en' } });
    const kind = /play\.google/.test(u.hostname) ? 'googleplay' : STORE.test(u.hostname) ? u.hostname : 'web';
    // 404·410: 진짜 없음 / 403·429·5xx: 사이트가 로봇을 막은 것일 수 있어 '확인 못 함'
    if (r.status === 404 || r.status === 410) return { ok: false, kind, why: `없는 페이지 (${r.status})` };
    if (!r.ok) return { ok: false, transient: true, kind, why: `사이트가 확인을 막음 (${r.status})` };
    // 글자 인코딩 맞춰 읽기 (네이버 카페 등 EUC-KR)
    const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 300000);
    let cs = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || '';
    if (!cs) cs = (new TextDecoder('latin1').decode(buf.slice(0, 4000)).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
    let html = '';
    try { html = new TextDecoder(cs.toLowerCase()).decode(buf); } catch { html = new TextDecoder('utf-8').decode(buf); }
    const og = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1];
    const t = unent(og || (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || '');
    const title = t.replace(/\s*[-|–]\s*(Apps on Google Play|Google Play 앱|Google Play의 앱|Steam|itch\.io|Epic Games Store).*$/i, '').trim();
    return { ok: true, title, titles: title ? [title] : [], kind };
  } catch (e: any) {
    return { ok: false, transient: true, kind: 'web', why: `연결 안 됨 (${String(e?.message || e).slice(0, 50)})` };
  }
}

/** 이름이 다르게 보여도 (영어 ↔ 한글 이름) 그 상점에서 기록의 게임 이름으로 검색했을 때 이 게임이 나오면 맞는 링크 */
async function storeSearchHas(c: LinkInfo, name: string): Promise<boolean> {
  try {
    if (c.kind === 'steam' && c.appId) {
      const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=koreana&cc=kr`, { signal: AbortSignal.timeout(8000) });
      const j: any = await r.json().catch(() => null);
      return ((j?.items || []) as any[]).slice(0, 10).some((x) => String(x.id) === c.appId);
    }
    if (c.kind === 'appstore' && c.appId) {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=kr&entity=software&limit=15`, { signal: AbortSignal.timeout(8000) });
      const j: any = await r.json().catch(() => null);
      return ((j?.results || []) as any[]).some((x) => String(x.trackId) === c.appId);
    }
  } catch { /* */ }
  return false;
}

/** 설명창 맨 위 줄이 게임 이름처럼 생겼는지 (예전 영상은 '재밌게 보셨다면…' 같은 문장이나 알림 안내가 있음 → 정보 없음으로) */
export function gameish(n: string): boolean {
  const t = String(n || '').trim();
  if (!t || t.length > 40 || t.split(/\s+/).length > 7) return false;
  if (/[🔔💜❤♥]|알림\s*설정|팔로우|구독|좋아요|재밌게|재미있게|감사|시청|보셨|보셧|보시고|합니다|습니다|했어요|해요|에요|예요|네요|어요|봤|ㅋㅋ|ㅎㅎ|\^.?\^|:D|:\)|재밌|재미|레전드|미션/i.test(t)) return false;
  if (!/게임$/.test(t) && /(다|요|죠|까|임|음|네|지|야|라|자|함|됨)[\s.?!~…,]*$/.test(t) && /[가-힣]{2,}\s+[가-힣]/.test(t)) return false;
  // 조사가 붙은 말이 이어지는 문장 ('…가 될 미션', '…를 해 봤다')
  if (t.split(/\s+/).length >= 3 && /[가-힣](이|가|을|를|은|는|에서|으로|에게|한테)\s/.test(t) && !/[A-Za-z]{3,}/.test(t)) return false;
  return true;
}

export async function gameCheckRun(db: any, opts: { reset?: boolean } = {}) {
  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!key) return { ok: false, reason: 'YOUTUBE_API_KEY 없음' };
  const stRef = db.collection('youtube_cache').doc('game_check_state');
  const st = opts.reset ? {} : ((await stRef.get()).data() || {});
  if (st.running && Date.now() - Number(st.running) < 4 * 60000) return { ok: true, skipped: '다른 대조가 도는 중' };
  // 다 했으면 (새 영상은 일주일에 한 번 처음부터 다시) 바로 끝
  if (st.v === 4 && st.done && Date.now() - Date.parse(st.at || '0') < 7 * 86400000) return { ok: true, done: true, total: st.total };
  if (st.done) { st.cursor = 0; }
  // 비교 방식이 바뀌면(글자 몇 개 차이 = 같은 게임) 처음부터 다시
  if (st.v !== 4) { st.cursor = 0; st.done = false; }
  await stRef.set({ running: Date.now(), v: 4 }, { merge: true });
  try {
    const { loadSiteLogs } = await import('./_siteLogs.js');
    const logs = ((await loadSiteLogs(db)).logs as any[]).filter((l) => l && !l.isAbsence && (l.edited || []).length);
    logs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const pairs: { l: any; vid: string; title: string }[] = [];
    for (const l of logs) for (const e of l.edited || []) {
      const v = ytId(e?.url);
      if (v && !e?.isCompilation && !e?.compilationId && !e?.multiId) pairs.push({ l, vid: v, title: String(e?.title || '') });
    }
    // 한 번 불리면 약 40초 동안: 영상 40개씩 묶어서 (유튜브 1번) → 처음 보는 링크는 8개씩 한꺼번에 열어 봄 → 묶음마다 진행을 저장
    const t0 = Date.now();
    const linkCache = db.collection('game_link_check');
    const counts: Record<string, number> = { match: 0, mismatch: 0, noinfo: 0, gone: 0 };
    let cursor = Number(st.cursor || 0);
    while (cursor < pairs.length && Date.now() - t0 < 40000) {
      const batch = pairs.slice(cursor, cursor + 40);
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.map((b) => b.vid).join(',')}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`유튜브 ${r.status}`);
      const sn = new Map<string, any>((((await r.json())?.items || []) as any[]).map((it) => [it.id, it.snippet]));
      // 1) 이름 대조
      const work = batch.map((b) => {
        const s = sn.get(b.vid);
        const games = ((b.l.games || []).length ? b.l.games : b.l.game ? [{ name: b.l.game, link: '' }] : []).filter((g: any) => g?.name);
        const names = s ? gameNamesFrom(s.title || '', s.description || '') : [];
        // 설명창 맨 위 '게임 이름 / 우주하마' 줄이 있을 때만 불일치로 봄 · 해시태그(#공포게임 #협동게임 …)뿐이면 '정보 없음'
        const main = (s ? gameNamesFrom('', String(s.description || '').replace(/#[^\s#]+/g, '')) : []).filter(gameish);
        const hit = games.filter((g: any) => names.some((n) => nameMatch(n, g.name)));
        let status: 'match' | 'mismatch' | 'noinfo' | 'gone' = !s ? 'gone' : hit.length ? 'match' : main.length ? 'mismatch' : 'noinfo';
        return { b, s, games, names, main, hit, status, via: '' };
      });
      // 2) 링크: 일치한 게임 + 불일치한 영상의 모든 게임 (다른 나라 이름이라 다른 것처럼 보이는지 링크 페이지 이름으로 확인)
      const links = [...new Set(work.flatMap((w) => (w.status === 'mismatch' ? w.games : w.hit).map((g: any) => g.link).filter(Boolean)))] as string[];
      const ids = await Promise.all(links.map((l) => sha(l)));
      const cached = links.length ? await db.getAll(...ids.map((id) => linkCache.doc(id))) : [];
      const info: Record<string, any> = {};
      const todo: number[] = [];
      cached.forEach((d: any, i: number) => { const x = d.exists ? d.data() : null; if (x && x.lv === LINK_V) info[links[i]] = x; else todo.push(i); });
      // 스팀은 너무 빨리 많이 물으면 막아서 4개씩
      for (let k = 0; k < todo.length; k += 4) {
        await Promise.all(todo.slice(k, k + 4).map(async (i) => {
          const t = await linkTitle(links[i]);
          info[links[i]] = { link: links[i], ...t, lv: LINK_V, at: new Date().toISOString() };
          if (!t.transient) await linkCache.doc(ids[i]).set(info[links[i]]); // 잠깐 막힌 건 저장 안 함 (다음에 다시)
        }));
      }
      // 불일치인데 게임 링크 페이지 이름이 설명창 이름과 같으면 → 일치 (예: 恶意 ↔ Dread Neighbor)
      for (const w of work) {
        if (w.status !== 'mismatch') continue;
        const g = w.games.find((g: any) => { const c = g.link && info[g.link]; return c?.ok && STORE.test(g.link) && (c.titles || [c.title]).filter(Boolean).some((t: string) => w.main.some((n) => nameMatch(n, t))); });
        if (g) { w.status = 'match'; w.hit = [g]; w.via = 'link'; }
      }
      // 3) 결과 저장
      const wb = db.batch();
      for (const w of work) {
        const per: any[] = [];
        for (const g of w.hit) {
          if (!g.link) { per.push({ name: g.name, link: '', link_status: 'nolink' }); continue; }
          const c: any = info[g.link] || {};
          const titles: string[] = (c.titles || [c.title]).filter(Boolean);
          const named = titles.some((t) => nameMatch(t, g.name) || w.names.some((n) => nameMatch(n, t)));
          // 맞음 / 상점 아닌 웹(열리기만 확인) / 확인 못 함(사이트가 막음) / 안 열림 / 이름 다름(상점 검색으로도 안 나옴)
          let ls = c.transient ? 'unknown' : !c.ok ? 'broken' : c.kind === 'web' ? 'web' : named ? 'ok' : '';
          if (!ls) ls = (await storeSearchHas(c, g.name)) || (await Promise.all(w.main.slice(0, 2).map((n) => storeSearchHas(c, n)))).some(Boolean) ? 'ok' : 'name_diff';
          per.push({ name: g.name, link: g.link, link_status: ls, link_title: c.title || '', why: c.why || '' });
        }
        counts[w.status]++;
        wb.set(db.collection('game_check').doc(`${w.b.l.id}__${w.b.vid}`), {
          logId: w.b.l.id, date: w.b.l.date, vid: w.b.vid, title: w.s?.title || w.b.title, status: w.status, via: w.via, names: w.names.slice(0, 6),
          games: w.games.map((g: any) => ({ name: g.name, link: g.link || '' })), links: per,
          linkIssue: per.some((p: any) => ['broken', 'name_diff', 'nolink'].includes(p.link_status)), at: new Date().toISOString(),
        }, { merge: true });
      }
      await wb.commit();
      cursor += batch.length;
      await stRef.set({ cursor, total: pairs.length, done: cursor >= pairs.length, at: new Date().toISOString(), running: Date.now() }, { merge: true });
    }
    await stRef.set({ running: 0 }, { merge: true });
    return { ok: true, cursor, total: pairs.length, counts };
  } catch (e: any) {
    await stRef.set({ running: 0, lastError: String(e?.message || e).slice(0, 200) }, { merge: true });
    return { ok: false, error: String(e?.message || e) };
  }
}
