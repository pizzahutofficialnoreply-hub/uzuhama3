/**
 * 게임 이름·링크 대조 (관리자 › 연동 › 게임 이름·링크 대조)
 * 1) 방송 기록의 편집 영상마다 유튜브 설명창·해시태그의 게임 이름과 기록의 게임 이름을 비교
 *    → 일치 / 불일치 / 설명창에 정보 없음 (예전 영상은 설명창 형식이 없어서 보류가 많음)
 * 2) 일치한 게임의 링크(스팀·앱스토어·구글 플레이·웹)를 열어 그 페이지의 게임 이름과 1:1 대조
 *    → 맞음 / 이름이 다름 / 링크가 안 열림 / 링크 없음
 * 한 번에 영상 40개씩 (새 링크는 6개까지) (유튜브 할당량 1) · 링크는 한 번 본 것은 저장해 두고 다시 안 봄 · 워커가 10분마다 이어서 함
 */
import { gameNamesFrom, seriesOf, normG } from './_ytSync.js';

const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const sha = async (s: string) => { const { createHash } = await import('node:crypto'); return createHash('sha1').update(s).digest('hex').slice(0, 24); };

function nameMatch(a: string, b: string): boolean {
  const x = normG(a), y = normG(b);
  if (!x || !y) return false;
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
  if (st.done && Date.now() - Date.parse(st.at || '0') < 7 * 86400000) return { ok: true, done: true, total: st.total };
  if (st.done) { st.cursor = 0; }
  await stRef.set({ running: Date.now() }, { merge: true });
  try {
    const { loadSiteLogs } = await import('./_siteLogs.js');
    const logs = ((await loadSiteLogs(db)).logs as any[]).filter((l) => l && !l.isAbsence && (l.edited || []).length);
    logs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const pairs: { l: any; vid: string; title: string }[] = [];
    for (const l of logs) for (const e of l.edited || []) {
      const v = ytId(e?.url);
      if (v && !e?.isCompilation && !e?.compilationId && !e?.multiId) pairs.push({ l, vid: v, title: String(e?.title || '') });
    }
    const cursor = Number(st.cursor || 0);
    if (cursor >= pairs.length) { await stRef.set({ running: 0, done: true, total: pairs.length, at: new Date().toISOString() }, { merge: true }); return { ok: true, done: true, total: pairs.length }; }
    const batch = pairs.slice(cursor, cursor + 40);
    let fetched = 0; let processed = 0;
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.map((b) => b.vid).join(',')}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`유튜브 ${r.status}`);
    const sn = new Map<string, any>((((await r.json())?.items || []) as any[]).map((it) => [it.id, it.snippet]));
    const linkCache = db.collection('game_link_check');
    const counts: Record<string, number> = { match: 0, mismatch: 0, noinfo: 0, gone: 0 };
    for (const b of batch) {
      if (fetched >= 6) break; // 링크를 새로 많이 열었으면 여기까지 (함수 시간 안에 끝나게) · 나머지는 다음 번에
      processed++;
      const s = sn.get(b.vid);
      const games = ((b.l.games || []).length ? b.l.games : b.l.game ? [{ name: b.l.game, link: '' }] : []).filter((g: any) => g?.name);
      let status: 'match' | 'mismatch' | 'noinfo' | 'gone' = 'noinfo';
      let names: string[] = [];
      const per: any[] = [];
      if (!s) status = 'gone';
      else {
        names = gameNamesFrom(s.title || '', s.description || '');
        if (names.length) {
          const hit = games.filter((g: any) => names.some((n) => nameMatch(n, g.name)));
          status = hit.length ? 'match' : 'mismatch';
          // 일치한 게임은 링크도 대조 (링크마다 한 번만 열어 봄)
          for (const g of hit) {
            if (!g.link) { per.push({ name: g.name, link: '', link_status: 'nolink' }); continue; }
            const id = await sha(g.link);
            let c = (await linkCache.doc(id).get()).data();
            if (!c) {
              const t = await linkTitle(g.link);
              fetched++;
              c = { link: g.link, ...t, at: new Date().toISOString() };
              await linkCache.doc(id).set(c);
            }
            const ls = !c.ok ? 'broken' : c.title && (nameMatch(c.title, g.name) || names.some((n) => nameMatch(n, c.title))) ? 'ok' : 'name_diff';
            per.push({ name: g.name, link: g.link, link_status: ls, link_title: c.title || '', why: c.why || '' });
          }
        }
      }
      counts[status]++;
      await db.collection('game_check').doc(`${b.l.id}__${b.vid}`).set({
        logId: b.l.id, date: b.l.date, vid: b.vid, title: s?.title || b.title, status, names: names.slice(0, 6),
        games: games.map((g: any) => ({ name: g.name, link: g.link || '' })), links: per,
        linkIssue: per.some((p) => p.link_status !== 'ok'), at: new Date().toISOString(),
      });
    }
    const next = cursor + processed;
    await stRef.set({ running: 0, cursor: next, total: pairs.length, done: next >= pairs.length, at: new Date().toISOString() }, { merge: true });
    return { ok: true, cursor: next, total: pairs.length, counts };
  } catch (e: any) {
    await stRef.set({ running: 0, lastError: String(e?.message || e).slice(0, 200) }, { merge: true });
    return { ok: false, error: String(e?.message || e) };
  }
}
