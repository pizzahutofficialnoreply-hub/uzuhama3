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

/** 글자 몇 개만 다른 것(오타·띄어쓰기·& ↔ and 등)은 같은 게임으로 */
function close(x: string, y: string): boolean {
  const a = [...x], b = [...y];
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 3) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  const d = prev[b.length];
  return d <= 2 || d / Math.max(a.length, b.length) <= 0.15;
}
function nameMatch(a: string, b: string): boolean {
  const x = normG(a.replace(/&/g, 'and').replace(/\b(demo|데모|체험판|prologue|프롤로그)\b/gi, '')), y = normG(b.replace(/&/g, 'and').replace(/\b(demo|데모|체험판|prologue|프롤로그)\b/gi, ''));
  if (!x || !y) return false;
  if (close(x, y)) return true;
  if (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return true;
  const sa = seriesOf(a), sb = seriesOf(b);
  return sa.base === sb.base && sa.n === sb.n && sa.base.length >= 3;
}

/** 링크를 열어 그 페이지가 말하는 게임 이름 */
async function linkTitle(link: string): Promise<{ ok: boolean; title?: string; kind: string; why?: string }> {
  try {
    const u = new URL(link);
    const steam = link.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (steam) {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steam[1]}&l=english`, { signal: AbortSignal.timeout(6000) });
      const j: any = await r.json().catch(() => null);
      const d = j?.[steam[1]];
      return d?.success ? { ok: true, title: d.data?.name, kind: 'steam' } : { ok: false, kind: 'steam', why: '스팀에 없는 앱' };
    }
    const apple = link.match(/apps\.apple\.com\/.*\/id(\d+)/);
    if (apple) {
      const j: any = await (await fetch(`https://itunes.apple.com/lookup?id=${apple[1]}&country=kr`, { signal: AbortSignal.timeout(6000) })).json().catch(() => null);
      return j?.results?.[0] ? { ok: true, title: j.results[0].trackName, kind: 'appstore' } : { ok: false, kind: 'appstore', why: '앱스토어에 없음' };
    }
    const r = await fetch(link, { signal: AbortSignal.timeout(6000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (uzuhama link check)', 'Accept-Language': 'ko,en' } });
    if (!r.ok) return { ok: false, kind: u.hostname, why: `열리지 않음 (${r.status})` };
    const html = (await r.text()).slice(0, 200000);
    const og = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1];
    const t = og || (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || '';
    return { ok: true, title: t.replace(/\s*[-|–]\s*(Apps on Google Play|Google Play 앱|Steam|itch\.io).*$/i, '').trim(), kind: /play\.google/.test(u.hostname) ? 'googleplay' : u.hostname };
  } catch (e: any) {
    return { ok: false, kind: 'web', why: `열리지 않음 (${String(e?.message || e).slice(0, 60)})` };
  }
}

export async function gameCheckRun(db: any, opts: { reset?: boolean } = {}) {
  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!key) return { ok: false, reason: 'YOUTUBE_API_KEY 없음' };
  const stRef = db.collection('youtube_cache').doc('game_check_state');
  const st = opts.reset ? {} : ((await stRef.get()).data() || {});
  if (st.running && Date.now() - Number(st.running) < 4 * 60000) return { ok: true, skipped: '다른 대조가 도는 중' };
  // 다 했으면 (새 영상은 일주일에 한 번 처음부터 다시) 바로 끝
  if (st.v === 2 && st.done && Date.now() - Date.parse(st.at || '0') < 7 * 86400000) return { ok: true, done: true, total: st.total };
  if (st.done) { st.cursor = 0; }
  // 비교 방식이 바뀌면(글자 몇 개 차이 = 같은 게임) 처음부터 다시
  if (st.v !== 2) { st.cursor = 0; st.done = false; }
  await stRef.set({ running: Date.now(), v: 2 }, { merge: true });
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
        const hit = games.filter((g: any) => names.some((n) => nameMatch(n, g.name)));
        const status: 'match' | 'mismatch' | 'noinfo' | 'gone' = !s ? 'gone' : !names.length ? 'noinfo' : hit.length ? 'match' : 'mismatch';
        return { b, s, games, names, hit, status };
      });
      // 2) 일치한 게임의 링크: 저장해 둔 것 먼저, 처음 보는 링크는 8개씩 동시에 열어 봄
      const links = [...new Set(work.flatMap((w) => w.hit.map((g: any) => g.link).filter(Boolean)))] as string[];
      const ids = await Promise.all(links.map((l) => sha(l)));
      const cached = links.length ? await db.getAll(...ids.map((id) => linkCache.doc(id))) : [];
      const info: Record<string, any> = {};
      const todo: number[] = [];
      cached.forEach((d: any, i: number) => { if (d.exists) info[links[i]] = d.data(); else todo.push(i); });
      for (let k = 0; k < todo.length; k += 8) {
        await Promise.all(todo.slice(k, k + 8).map(async (i) => {
          const t = await linkTitle(links[i]);
          info[links[i]] = { link: links[i], ...t, at: new Date().toISOString() };
          await linkCache.doc(ids[i]).set(info[links[i]]);
        }));
      }
      // 3) 결과 저장
      const wb = db.batch();
      for (const w of work) {
        const per = w.hit.map((g: any) => {
          if (!g.link) return { name: g.name, link: '', link_status: 'nolink' };
          const c = info[g.link] || {};
          const ls = !c.ok ? 'broken' : c.title && (nameMatch(c.title, g.name) || w.names.some((n) => nameMatch(n, c.title))) ? 'ok' : 'name_diff';
          return { name: g.name, link: g.link, link_status: ls, link_title: c.title || '', why: c.why || '' };
        });
        counts[w.status]++;
        wb.set(db.collection('game_check').doc(`${w.b.l.id}__${w.b.vid}`), {
          logId: w.b.l.id, date: w.b.l.date, vid: w.b.vid, title: w.s?.title || w.b.title, status: w.status, names: w.names.slice(0, 6),
          games: w.games.map((g: any) => ({ name: g.name, link: g.link || '' })), links: per,
          linkIssue: per.some((p: any) => p.link_status !== 'ok'), at: new Date().toISOString(),
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
