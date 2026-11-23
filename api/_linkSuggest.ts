/**
 * AI 연동 추천: AI가 받아 적은 말(스크립트)이 겹치는 생방송 ↔ 편집 영상·쇼츠를 찾아 연동 탭 '연결 확인'(yt_auto)에 올림
 *  - 편집 영상·쇼츠 분석이 끝나면: 연결이 없거나 AI가 '안 맞는다'고 본 것만, 앞뒤 기간의 생방송과 대사를 맞춰 봄
 *  - 생방송 분석이 끝나면: 그 뒤 기간에 올라온, 아직 연결 안 된 편집 영상·쇼츠와 맞춰 봄
 *  - 자동으로 고치지 않음 (관리자가 승인·바꾸기) · 이미 확인한 영상은 다시 안 올림
 * AI 호출 없음 · 글자 세 개씩 묶은 색인으로 빠르게 비교 (서버 CPU 아낌)
 */
type Line = { t: number; s: string; w?: string };
const nrm = (x: string) => String(x || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const tri = (s: string) => { const out = new Set<string>(); for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3)); return out; };
const ytId = (u: any) => (String(typeof u === 'string' ? u : u?.url || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const SCRIPT_V = 5;

/** a(편집본·쇼츠) 의 말이 b(생방송) 에 얼마나 나오는지: 비슷한 줄이 같은 시간 차이로 이어서 맞아야 인정 */
export function matchScripts(a: Line[], b: Line[]) {
  const bt = b.filter((l) => l.w !== '게임' && l.w !== '후원').map((l) => ({ t: l.t, g: tri(nrm(l.s)) })).filter((x) => x.g.size >= 3);
  const index = new Map<string, number[]>();
  bt.forEach((x, i) => x.g.forEach((g) => { const arr = index.get(g); if (arr) { if (arr.length < 400) arr.push(i); } else index.set(g, [i]); }));
  const elig = a.filter((l) => l.w !== '게임' && l.w !== '후원' && nrm(l.s).length >= 6);
  const hits: { at: number; bt: number; off: number }[] = [];
  for (const l of elig) {
    const g = tri(nrm(l.s));
    const cnt = new Map<number, number>();
    g.forEach((x) => (index.get(x) || []).forEach((i) => cnt.set(i, (cnt.get(i) || 0) + 1)));
    let best = -1, bs = 0;
    cnt.forEach((c, i) => { const d = (2 * c) / (g.size + bt[i].g.size); if (d > bs) { bs = d; best = i; } });
    if (best >= 0 && bs >= 0.6) hits.push({ at: l.t, bt: bt[best].t, off: bt[best].t - l.t });
  }
  // 근처(2분 안)의 다른 줄도 같은 시간 차이(±8초)로 맞아야 우연이 아님
  const ok = hits.filter((h) => hits.some((o) => o !== h && Math.abs(o.at - h.at) <= 120 && Math.abs(o.off - h.off) <= 8));
  const times = ok.map((h) => h.bt).sort((x, y) => x - y);
  return { eligible: elig.length, matched: ok.length, ratio: elig.length ? ok.length / elig.length : 0, from: times[0] ?? null, to: times[times.length - 1] ?? null };
}

async function scripts(db: any, ids: string[]): Promise<Record<string, Line[]>> {
  const out: Record<string, Line[]> = {};
  const u = [...new Set(ids)].filter((x) => /^[\w-]{11}$/.test(x));
  if (!u.length) return out;
  const snaps = await db.getAll(...u.map((x) => db.collection('ai_script').doc(x)));
  snaps.forEach((d: any, i: number) => {
    const segs = Object.values((d.exists && d.data()?.segs) || {}).filter((x: any) => Number(x.v || 1) >= SCRIPT_V) as any[];
    const lines = segs.flatMap((x) => x.lines || []).sort((p: any, q: any) => p.t - q.t);
    if (lines.length) out[u[i]] = lines;
  });
  return out;
}
const gnorm = (s: string) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '');
const sameGame = (a: string, b: string) => { const x = gnorm(a), y = gnorm(b); return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))); };
const logGames = (l: any): string[] => [...(l.games || []).map((g: any) => g?.name), l.game].filter(Boolean);
const fmt = (s: number | null) => (s == null ? '' : `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const STRONG = (m: any) => m.matched >= 4 && m.ratio >= 0.3;

/** 분석이 끝난 영상 하나에 대해 (편집본·쇼츠면 맞는 생방송을, 생방송이면 맞는 편집본·쇼츠를) 찾아 추천 */
export async function suggestLinks(db: any, id: string, me: any) {
  if (!me || me.comp) return { skipped: 'comp' };
  const kind = me.kind === 'live' ? 'live' : me.kind === 'short' ? 'short' : 'video';
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const logs = (await loadSiteLogs(db, { maxAgeMs: 3600000 })).logs as any[];
  const where = (vid: string) => logs.filter((l) => ['edited', 'shorts', 'vods'].some((k) => (l[k] || []).some((x: any) => ytId(x) === vid)));
  const autoRef = (vid: string) => db.collection('yt_auto').doc(vid);
  const bad: string[] = ((await db.collection('youtube_cache').doc('link_check').get()).data()?.bad || []) as string[];

  const put = async (vid: string, title: string, vkind: string, publishedAt: string, current: any[], ranked: { l: any; m: any; live: string }[]) => {
    if ((await autoRef(vid).get()).exists) return false; // 이미 올렸거나 확인한 영상
    const best = ranked[0];
    const ambiguous = ranked.length > 1 && ranked[1].m.ratio >= best.m.ratio * 0.8;
    await autoRef(vid).set({
      id: vid, title, kind: vkind, publishedAt, source: 'ai', status: 'pending', ambiguous,
      logs: current.map((l) => ({ id: l.id, date: l.date })),
      reason: `AI가 대사를 맞춰 봄: ${best.l.date} 생방송 ${fmt(best.m.from)}~${fmt(best.m.to)} 와 말 ${Math.round(best.m.ratio * 100)}% 겹침${current.length ? ` · 지금 연결(${current.map((l) => l.date).join(', ')})은 내용이 안 맞아 보여요` : ' · 지금은 어느 방송에도 연결 안 됨'}`,
      candidates: ranked.slice(0, 4).map((r) => ({ id: r.l.id, date: r.l.date, game: logGames(r.l)[0] || '', score: Math.round(r.m.ratio * 100), from: r.m.from, to: r.m.to, live: r.live })),
      names: (me.games || []).map((g: any) => g?.name || g).filter(Boolean).slice(0, 6),
      at: new Date().toISOString(),
    });
    return true;
  };

  if (kind !== 'live') {
    const current = where(id).filter((l) => !(l.vods || []).some((x: any) => ytId(x) === id));
    const isBad = current.some((l) => (l.vods || []).some((v: any) => bad.includes(`${id}|${ytId(v)}`) || bad.includes(`${ytId(v)}|${id}`)));
    if (current.length && !isBad) return { skipped: 'linked' };
    const pub = Date.parse(me.publishedAt || '');
    if (!Number.isFinite(pub)) return { skipped: 'no date' };
    const mine = (await scripts(db, [id]))[id] || [];
    if (mine.length < 5) return { skipped: 'no script' };
    const myGames = (me.games || []).map((g: any) => g?.name || g);
    const cands = logs.filter((l) => (l.vods || []).length && Date.parse(l.date) <= pub + 864e5 && Date.parse(l.date) >= pub - 150 * 864e5)
      .map((l) => ({ l, pri: (logGames(l).some((g) => myGames.some((x: string) => sameGame(g, x))) ? 1000 : 0) - (pub - Date.parse(l.date)) / 864e5 }))
      .sort((x, y) => y.pri - x.pri).slice(0, 6).map((x) => x.l);
    const lives = cands.flatMap((l) => (l.vods || []).slice(0, 2).map((v: any) => ({ l, live: ytId(v) }))).filter((x) => x.live);
    const sc = await scripts(db, lives.map((x) => x.live));
    const ranked = lives.filter((x) => sc[x.live]).map((x) => ({ ...x, m: matchScripts(mine, sc[x.live]) })).filter((x) => STRONG(x.m)).sort((x, y) => y.m.ratio - x.m.ratio);
    const seen = new Set<string>(); const uniq = ranked.filter((r) => (seen.has(r.l.id) ? false : (seen.add(r.l.id), true)));
    if (!uniq.length) return { none: true, checked: lives.length };
    if (current.some((l) => l.id === uniq[0].l.id)) return { ok: 'current link matches' };
    return { suggested: await put(id, me.title || '', kind === 'short' ? 'shorts' : 'edited', me.publishedAt || '', current, uniq) };
  }

  // 생방송: 이 방송 뒤 150일 안에 올라온, 연결 안 된 편집 영상·쇼츠
  const myLogs = logs.filter((l) => (l.vods || []).some((x: any) => ytId(x) === id));
  if (!myLogs.length) return { skipped: 'live not in logs' };
  const log = myLogs[0];
  const liveLines = (await scripts(db, [id]))[id] || [];
  if (liveLines.length < 20) return { skipped: 'no script' };
  const { readQueueDoc } = await import('./_aiVideo.js');
  const q = await readQueueDoc(db);
  const ix = (await db.collection('youtube_cache').doc('ai_ids').get()).data() || {};
  const doneIds = new Set<string>((ix.scan || ix.done || []) as string[]);
  const t0 = Date.parse(log.date);
  const lg = logGames(log);
  const items = ((q?.items || []) as any[]).filter((it) => it.kind !== 'live' && !it.comp && doneIds.has(it.id) && !where(it.id).length)
    .filter((it) => { const p = Date.parse(it.publishedAt || ''); return p >= t0 && p <= t0 + 150 * 864e5; })
    .map((it) => ({ it, pri: (lg.some((g) => String(it.title || '').toLowerCase().includes(gnorm(g).slice(0, 6))) ? 1000 : 0) - (Date.parse(it.publishedAt) - t0) / 864e5 }))
    .sort((x, y) => y.pri - x.pri).slice(0, 8).map((x) => x.it);
  const sc = await scripts(db, items.map((x) => x.id));
  let n = 0;
  for (const it of items) {
    const m = sc[it.id] ? matchScripts(sc[it.id], liveLines) : null;
    if (m && STRONG(m) && await put(it.id, it.title, it.kind === 'short' ? 'shorts' : 'edited', it.publishedAt, [], [{ l: log, m, live: id }])) n++;
  }
  return { suggested: n, checked: items.length };
}
