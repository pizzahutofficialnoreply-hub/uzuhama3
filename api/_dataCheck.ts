/**
 * 방송 기록 데이터 검증 (하루 한 번 자동 · 관리자 › 시스템 › 자동화 '데이터 검증'에서 보고 고침)
 *  1) 방송 시간: 다시보기가 유튜브 생방송 기록이면 유튜브가 아는 실제 시작·끝 시각과 비교
 *  2) 게임 이름: 영상 제목·설명란·AI가 영상에서 본 게임과 방송 기록의 게임 이름이 맞는지 (안 맞으면 AI가 판단)
 *  3) 게임 링크: 링크를 실제로 열어 봐서 없는 페이지(404 등)인지, 다른 게임 페이지인지
 * 결과는 admin_data/dataCheck 에 (관리자만) (고칠 제안 포함). 자동으로 고치지는 않음 → 관리자가 '적용'
 * 참고: 치지직은 다시보기를 남기지 않아(목록 0개) 비교할 수 없고, 옛 트위치 기록은 공식 API로 볼 수 없음
 */
import { aiGen, aiParseJson, ytApi, ytApiKey, AI_TEXT_MODELS } from './_aiVideo.js';
import { normalizeHistorical, overlayMonthDocs } from '../src/utils/archiveOverlay.js';

/**
 * 사이트가 보여 주는 것과 같은 방송 기록: 과거 아카이브 JSON + logs_by_month 수정분
 * (logs 컬렉션은 일부만 있어서 쓰지 않음)
 */
async function loadSiteLogs(db: any): Promise<{ logs: any[]; historical: Record<string, any> }> {
  let historical: Record<string, any> = {};
  try {
    const r = await fetch('https://uzuhama.vercel.app/data/historical_logs.json', { signal: AbortSignal.timeout(15000) });
    if (r.ok) historical = normalizeHistorical(await r.json());
  } catch { /* */ }
  const monthDocs: any[] = [];
  (await db.collection('logs_by_month').get()).forEach((d: any) => monthDocs.push(d.data()));
  const map = overlayMonthDocs(historical, monthDocs);
  return { logs: Object.values(map).filter((l: any) => l?.date), historical };
}

/** 방송 기록 고치기: 사이트가 읽는 logs_by_month 에 (아카이브 기록이면 바뀐 필드만 _patch 로) */
async function patchSiteLog(db: any, log: any, fields: Record<string, any>, historical: Record<string, any>) {
  const monthRef = db.collection('logs_by_month').doc(String(log.date).slice(0, 7));
  const now = new Date().toISOString();
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(monthRef);
    const items = (snap.exists ? snap.data()?.items : null) || {};
    if (historical[log.id]) {
      // 아카이브 기록: 검증용 수정분을 따로 (다른 수정분과 섞이지 않게)
      const key = `${log.id}__dc`;
      const prev = items[key] || {};
      const entry = { ...prev, id: log.id, date: log.date, _patch: true, _updatedAt: now, ...fields };
      if (snap.exists) tx.update(monthRef, { updatedAt: now, [`items.${key}`]: entry });
      else tx.set(monthRef, { month: String(log.date).slice(0, 7), updatedAt: now, items: { [key]: entry } });
    } else {
      // 아카이브에 없는 새 기록: 통째로 들어 있는 항목의 필드를 바꿈
      const cur = items[log.id] || log;
      const entry = { ...cur, ...fields };
      if (snap.exists) tx.update(monthRef, { updatedAt: now, [`items.${log.id}`]: entry });
      else tx.set(monthRef, { month: String(log.date).slice(0, 7), updatedAt: now, items: { [log.id]: entry } });
    }
  });
  try { await db.collection('logs').doc(log.id).set(fields, { merge: true }); } catch { /* 사본 */ }
}

/** 여러 기록을 달별로 묶어 한 번에 (기록마다 쓰면 느림) */
async function patchSiteLogs(db: any, list: { l: any; fill: Record<string, any> }[], historical: Record<string, any>) {
  const byMonth = new Map<string, { l: any; fill: any }[]>();
  list.forEach((x) => { const m = String(x.l.date).slice(0, 7); byMonth.set(m, [...(byMonth.get(m) || []), x]); });
  const now = new Date().toISOString();
  for (const [month, xs] of byMonth) {
    const ref = db.collection('logs_by_month').doc(month);
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const items = (snap.exists ? snap.data()?.items : null) || {};
      const upd: Record<string, any> = { updatedAt: now };
      xs.forEach(({ l, fill }) => {
        if (historical[l.id]) { const key = `${l.id}__dc`; upd[`items.${key}`] = { ...(items[key] || {}), id: l.id, date: l.date, _patch: true, _updatedAt: now, ...fill }; }
        else upd[`items.${l.id}`] = { ...(items[l.id] || l), ...fill };
      });
      if (snap.exists) tx.update(ref, upd);
      else { const it: any = {}; Object.entries(upd).forEach(([k, v]) => { if (k.startsWith('items.')) it[k.slice(6)] = v; }); tx.set(ref, { month, updatedAt: now, items: it }); }
    });
  }
}

const KST = 9 * 3600000;
/** 제목·설명란에 적힌 방송 날짜 (유튜브 날짜와 이틀 안쪽인 것만, 여러 개면 가장 가까운 것) */
export function writtenDate(text: string, near: string): string | null {
  const re = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?|(?<![\d.])(\d{2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{1,2})(?![\d])/g;
  const base = Date.parse(`${near}T00:00:00Z`);
  let best: string | null = null; let bestDiff = Infinity;
  for (const m of String(text || '').matchAll(re)) {
    const y = Number(m[1] || (m[4] ? `20${m[4]}` : 0)); const mo = Number(m[2] || m[5]); const d = Number(m[3] || m[6]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const diff = Math.abs(Date.parse(`${iso}T00:00:00Z`) - base);
    if (diff <= 2 * 86400000 && diff < bestDiff) { best = iso; bestDiff = diff; }
  }
  return best;
}
/** 검증 방식 버전: 바뀌면 그날 이미 했어도 한 번 더 */
export const DC_VER = 7;
const ytIdOf = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const sq = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const kstDate = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
const kstTime = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(11, 16);
const minutesOf = (d: string, t: string) => Date.parse(`${d}T${t || '00:00'}:00Z`) / 60000;
const looseMatch = (a: string, b: string) => { const x = sq(a); const y = sq(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

export type Issue = {
  id: string; type: 'time' | 'game' | 'link' | 'link_dead' | 'dup';
  logId: string; date: string; msg: string;
  fix?: { field: 'time' | 'endTime' | 'game' | 'link'; index?: number; from: string; to: string }[];
  video?: string;
};

async function checkLink(url: string, name: string): Promise<{ ok: boolean; why?: string; title?: string }> {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (uzuhama data check)', 'Accept-Language': 'ko,en;q=0.8' } });
    if (r.status === 404 || r.status === 410) return { ok: false, why: `없는 페이지 (${r.status})` };
    if (r.status >= 400) return { ok: true, why: `확인 못 함 (${r.status})` }; // 막힌 사이트는 문제로 안 봄
    const html = (await r.text()).slice(0, 60000);
    const title = (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    // 스팀: 없는 앱이면 메인으로 돌려보냄
    if (/store\.steampowered\.com\/app\//.test(url) && /store\.steampowered\.com\/?$/.test(r.url)) return { ok: false, why: '스팀에 없는 게임 (메인으로 이동)', title };
    return { ok: true, title };
  } catch (e: any) {
    return { ok: true, why: `확인 못 함 (${String(e?.name || e).slice(0, 30)})` };
  }
}


/**
 * 링크(생방·영상) 고치기: 관리자 수정분 자리(items[id], 아카이브면 _patch)에 씀
 * (__dc 는 맨 나중에 덮어써서 나중에 관리자가 넣은 링크를 지울 수 있으니 시간·날짜만 둠)
 */
async function patchLinks(db: any, list: { l: any; fill: Record<string, any> }[], historical: Record<string, any>) {
  const byMonth = new Map<string, { l: any; fill: any }[]>();
  // 아카이브 기록은 원래 날짜의 달 문서에 (관리자 수정분이 있는 곳)
  list.forEach((x) => { const m = String(historical[x.l.id]?.date || x.l.date).slice(0, 7); byMonth.set(m, [...(byMonth.get(m) || []), x]); });
  const now = new Date().toISOString();
  const { FieldValue } = await import('firebase-admin/firestore');
  for (const [month, xs] of byMonth) {
    const ref = db.collection('logs_by_month').doc(month);
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const items = (snap.exists ? snap.data()?.items : null) || {};
      const upd: Record<string, any> = { updatedAt: now };
      xs.forEach(({ l, fill }) => {
        if (historical[l.id]) {
          const prev = items[l.id]?._patch ? items[l.id] : {};
          upd[`items.${l.id}`] = { ...prev, id: l.id, date: prev.date || historical[l.id].date, _patch: true, _updatedAt: now, ...fill };
          // 옛 방식 전체 사본은 정리 (내용은 위 fill 에 이미 합쳐져 있음)
          Object.entries(items).forEach(([k, v]: [string, any]) => { if (k !== l.id && !k.endsWith('__dc') && !v?._patch && (v?.id === l.id || k === l.id)) upd[`items.${k}`] = FieldValue.delete(); });
        } else upd[`items.${l.id}`] = { ...(items[l.id] || l), ...fill };
      });
      if (snap.exists) tx.update(ref, upd);
      else { const it: any = {}; Object.entries(upd).forEach(([k, v]) => { if (k.startsWith('items.')) it[k.slice(6)] = v; }); tx.set(ref, { month, updatedAt: now, items: it }); }
    });
  }
}

const idsIn = (text: string) => [...String(text || '').matchAll(/(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/g)].map((m) => m[1]);
const itemId = (x: any) => ytIdOf(typeof x === 'string' ? x : x?.url);

/**
 * 링크 정리 — 영상 설명란·제목을 기준으로
 *  A) 같은 생방 링크가 여러 기록에: 설명란에 적힌 날짜(없으면 유튜브 시작일)·설명란에 걸린 편집 영상·게임 이름으로 맞는 기록 하나만 남기고 나머지에서 뺌
 *  B) 생방 없는 기록(예전 카페 가져오기 등)의 편집 영상: 그 영상을 설명란에 건 생방, 또는 영상 설명란에 걸린 생방·적힌 날짜의 기록으로 옮김. 빈 기록은 지움
 *  C) 같은 날 기록 둘 이상: 한쪽에 생방이 없으면 B와 같이 합치고, 둘 다 생방이 있으면 각 생방의 실제 방송일을 알려 줌
 * 바꾼 내용은 applied 에 (이전 값 포함) 남김
 */
async function cleanupLinks(db: any, logs: any[], info: Map<string, any>, historical: Record<string, any>) {
  const issues: Issue[] = [];
  const summary: any = { dupLives: 0, removedLinks: 0, movedVideos: 0, deletedLogs: 0, sameDay: 0, actions: [] as any[] };
  const deleted = new Set<string>();
  const changed = new Map<string, any>(); // id → 바뀐 기록
  const cur = (l: any) => changed.get(l.id) || l;
  const set = (l: any, fields: any) => { const n = { ...cur(l), ...fields }; changed.set(l.id, n); Object.assign(l, fields); };

  // 편집 영상 정보도 필요 (생방 없는 기록 · 같은 날 기록)
  const need = new Set<string>();
  logs.forEach((l: any) => { if (!(l.vods || []).some(itemId) || logs.some((o) => o !== l && o.date === l.date)) (l.edited || []).forEach((e: any) => { const id = itemId(e); if (id && !info.has(id)) need.add(id); }); });
  const ids = [...need];
  for (let i = 0; i < ids.length && ytApiKey(); i += 50) {
    try { const j = await ytApi(`videos?part=snippet,liveStreamingDetails&id=${ids.slice(i, i + 50).join(',')}`); (j.items || []).forEach((it: any) => info.set(it.id, it)); } catch { break; }
  }
  const textOf = (id: string) => { const sn = info.get(id)?.snippet; return sn ? `${sn.title}\n${sn.description || ''}` : ''; };
  const liveDate = (id: string) => {
    const it = info.get(id); if (!it) return '';
    const st = it.liveStreamingDetails?.actualStartTime || it.liveStreamingDetails?.scheduledStartTime;
    const base = st ? kstDate(st) : kstDate(it.snippet?.publishedAt || new Date().toISOString());
    return writtenDate(textOf(id), base) || (st ? base : '');
  };
  const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
  const names = (l: any) => (l.games?.length ? l.games.map((g: any) => g.name) : [l.game]).filter(Boolean);

  // ── A) 같은 생방이 여러 기록에 ──
  const liveAt = new Map<string, any[]>();
  logs.forEach((l: any) => (l.vods || []).forEach((v: any) => { const id = itemId(v); if (id) liveAt.set(id, [...new Set([...(liveAt.get(id) || []), l])]); }));
  for (const [vid, ls] of liveAt) {
    if (ls.length < 2) continue;
    summary.dupLives++;
    const real = liveDate(vid);
    const desc = textOf(vid);
    const dIds = new Set(idsIn(desc));
    const score = (l: any) => (real && l.date === real ? 10 : 0)
      + (l.edited || []).concat(l.shorts || []).filter((e: any) => dIds.has(itemId(e))).length * 5
      + (names(l).some((n: string) => looseMatch(desc, n)) ? 3 : 0)
      - (real ? dayGap(l.date, real) * 0.5 : 0);
    const ranked = ls.map((l) => ({ l, s: score(l) })).sort((a, b) => b.s - a.s);
    if (!desc || ranked[0].s <= 0 || (ranked[1] && ranked[1].s === ranked[0].s)) {
      issues.push({ id: `dup:${vid}`, type: 'dup', logId: ranked[0].l.id, date: ranked[0].l.date, video: vid, msg: `생방 ${vid} 가 ${ls.map((l) => l.date).join(', ')} 기록에 다 있는데 설명란으로는 어느 날인지 못 정했어요${real ? ` (유튜브 방송일 ${real})` : ''}` });
      continue;
    }
    const keep = ranked[0].l;
    for (const { l } of ranked.slice(1)) {
      const before = (cur(l).vods || []);
      set(l, { vods: before.filter((v: any) => itemId(v) !== vid) });
      summary.removedLinks++;
      summary.actions.push({ id: `dedupe:${vid}:${l.id}`, at: new Date().toISOString(), logId: l.id, kind: '중복 생방 뺌', msg: `생방 ${vid}: ${keep.date} 기록에 남기고 ${l.date} 기록에서 뺌 (설명란${real ? ` 방송일 ${real}` : ''})`, from: { vods: before } });
    }
  }

  // ── D) 생방이 빠진 기록: 채널의 생방송 중 아무 기록에도 안 걸린 것에서, 방송일(설명란 날짜 → 시작일)이 같은 것을 찾아 넣음 ──
  try {
    const q = (await db.collection('youtube_cache').doc('ai_queue').get()).data();
    const linked = new Set<string>();
    logs.forEach((l: any) => (cur(l).vods || []).concat(cur(l).edited || [], cur(l).shorts || []).forEach((v: any) => { const id = itemId(v); if (id) linked.add(id); }));
    const free = (q?.items || []).filter((x: any) => x.kind === 'live' && !linked.has(x.id));
    const noLive = logs.filter((l: any) => !(cur(l).vods || []).some(itemId) && ((cur(l).edited || []).length || names(cur(l)).length));
    const near = free.filter((x: any) => noLive.some((l: any) => x.publishedAt && dayGap(kstDate(x.publishedAt), l.date) <= 2));
    const miss = near.map((x: any) => x.id).filter((id: string) => !info.has(id));
    for (let i = 0; i < miss.length && ytApiKey(); i += 50) {
      try { const j = await ytApi(`videos?part=snippet,liveStreamingDetails&id=${miss.slice(i, i + 50).join(',')}`); (j.items || []).forEach((it: any) => info.set(it.id, it)); } catch { break; }
    }
    summary.freeLives = free.length; summary.freeNear = near.length; summary.noLive = noLive.length;
    const used = new Set<string>();
    for (const l of noLive) {
      const c = near.filter((x: any) => !used.has(x.id) && info.get(x.id)?.liveStreamingDetails?.actualStartTime && liveDate(x.id) === l.date);
      const byGame = c.filter((x: any) => names(cur(l)).some((n: string) => looseMatch(textOf(x.id), n)));
      const pick = c.length === 1 ? c[0] : byGame.length === 1 ? byGame[0] : null;
      if (!pick) { if (c.length > 1) issues.push({ id: `nolive:${l.id}`, type: 'dup', logId: l.id, date: l.date, msg: `${l.date} 기록에 생방이 없는데 그날 생방송이 ${c.length}개라 못 골랐어요 (${c.map((x: any) => x.id).join(', ')})` }); continue; }
      used.add(pick.id);
      set(l, { vods: [...(cur(l).vods || []), { title: info.get(pick.id)?.snippet?.title || '우주하마 생방송!', url: `https://youtu.be/${pick.id}`, category: '종합' }] });
      summary.addedLives = (summary.addedLives || 0) + 1;
      summary.actions.push({ id: `addlive:${l.id}`, at: new Date().toISOString(), logId: l.id, kind: '생방 넣음', msg: `${l.date} 기록에 생방 ${pick.id} (방송일 ${l.date}, 어느 기록에도 없던 생방송)`, from: { vods: [] } });
    }
  } catch (e: any) { summary.addLiveError = String(e?.message || e).slice(0, 120); }

  // ── B·C) 생방 없는 기록의 편집 영상 → 맞는 생방 기록으로 ──
  const liveOfVideo = new Map<string, any>(); // 생방 설명란에 걸린 편집 영상 → 그 생방 기록
  logs.forEach((l: any) => (l.vods || []).forEach((v: any) => idsIn(textOf(itemId(v))).forEach((id) => { if (!liveOfVideo.has(id)) liveOfVideo.set(id, l); })));
  const liveLogOf = (id: string) => logs.find((l: any) => !deleted.has(l.id) && (cur(l).vods || []).some((v: any) => itemId(v) === id));
  for (const l of logs) {
    if (deleted.has(l.id) || (cur(l).vods || []).some(itemId) || !(cur(l).edited || []).length) continue;
    const moves: { item: any; to: any; why: string }[] = [];
    for (const e of cur(l).edited || []) {
      if (e?.isCompilation || e?.compilationId) continue;
      const id = itemId(e); if (!id) continue;
      let to = liveOfVideo.get(id); let why = '생방 설명란에 이 영상이 걸려 있음';
      if (!to) { const lid = idsIn(textOf(id)).find((x) => liveLogOf(x)); if (lid) { to = liveLogOf(lid); why = '영상 설명란에 생방 링크'; } }
      if (!to) {
        const sn = info.get(id)?.snippet;
        const wd = sn ? writtenDate(textOf(id), kstDate(sn.publishedAt)) : null;
        const cands = wd ? logs.filter((o: any) => o !== l && !deleted.has(o.id) && o.date === wd && (cur(o).vods || []).some(itemId)) : [];
        if (cands.length === 1) { to = cands[0]; why = `영상 설명란 날짜 ${wd}`; }
      }
      if (to && to !== l) moves.push({ item: e, to, why });
    }
    if (!moves.length) {
      if (logs.some((o: any) => o !== l && o.date === l.date && !deleted.has(o.id)) || !historical[l.id]) issues.push({ id: `orphan:${l.id}`, type: 'dup', logId: l.id, date: l.date, msg: `${l.date} 기록에 생방이 없고, 영상 설명란으로도 어느 방송인지 못 찾았어요 (${(l.edited || []).map((e: any) => e.title || itemId(e)).slice(0, 3).join(', ')})` });
      continue;
    }
    for (const m of moves) {
      const tgt = cur(m.to);
      if (!(tgt.edited || []).some((x: any) => itemId(x) === itemId(m.item))) set(m.to, { edited: [...(tgt.edited || []), m.item] });
      summary.movedVideos++;
      summary.actions.push({ id: `move:${itemId(m.item)}`, at: new Date().toISOString(), logId: m.to.id, kind: '영상 옮김', msg: `「${m.item.title || itemId(m.item)}」 ${l.date} → ${m.to.date} 기록 (${m.why})`, from: { logId: l.id } });
    }
    const movedIds = new Set(moves.map((m) => itemId(m.item)));
    const left = { ...cur(l), edited: (cur(l).edited || []).filter((e: any) => !movedIds.has(itemId(e))) };
    const empty = !(left.vods || []).length && !(left.edited || []).length && !(left.shorts || []).length && !names(left).length && !left.time;
    if (empty && !historical[l.id]) {
      deleted.add(l.id); changed.delete(l.id); summary.deletedLogs++;
      summary.actions.push({ id: `del:${l.id}`, at: new Date().toISOString(), logId: l.id, kind: '빈 기록 지움', msg: `${l.date} 기록 (영상을 다 옮겨서 비었음)`, from: { log: cur(l) } });
    } else set(l, { edited: left.edited });
  }

  // C) 같은 날 생방 있는 기록 둘 이상: 각 생방의 실제 방송일 알려 줌 (자동으로 안 바꿈)
  const byDate = new Map<string, any[]>();
  logs.forEach((l: any) => { if (!deleted.has(l.id)) byDate.set(l.date, [...(byDate.get(l.date) || []), l]); });
  for (const [d, ls] of byDate) {
    if (ls.length < 2) continue;
    summary.sameDay++;
    const desc = ls.map((l: any) => `${names(cur(l)).join(', ') || '게임 없음'}: ${(cur(l).vods || []).map((v: any) => { const id = itemId(v); const rd = id ? liveDate(id) : ''; return `생방 ${id}${rd ? ` (방송일 ${rd})` : ''}`; }).join(', ') || '생방 없음'}`).join(' / ');
    issues.push({ id: `sameday:${d}`, type: 'dup', logId: ls[0].id, date: d, msg: `${d} 에 기록 ${ls.length}개 — ${desc}` });
  }

  // 저장: 바뀐 기록은 달별로 한 번에, 지울 기록은 항목 삭제
  const list = [...changed.entries()].filter(([id]) => !deleted.has(id)).map(([id, l]) => {
    const fields: any = {};
    ['vods', 'edited', 'shorts', 'games'].forEach((k) => { fields[k] = l[k] || []; });
    return { l: logs.find((x: any) => x.id === id), fill: fields };
  }).filter((x) => x.l);
  if (list.length) await patchLinks(db, list, historical);
  const now = new Date().toISOString();
  for (const id of deleted) {
    const l = logs.find((x: any) => x.id === id);
    const ref = db.collection('logs_by_month').doc(String(l.date).slice(0, 7));
    const { FieldValue } = await import('firebase-admin/firestore');
    await ref.update({ updatedAt: now, [`items.${id}`]: FieldValue.delete() });
    try { await db.collection('logs').doc(id).delete(); } catch { /* */ }
  }
  summary.notes = issues.map((i) => i.msg);
  return { issues, summary, deleted };
}

export async function runDataCheck(db: any, opts: { linkLimit?: number; aiLimit?: number } = {}) {
  const t0 = Date.now();
  const ref = db.collection('admin_data').doc('dataCheck');
  const prev = (await ref.get()).data() || {};
  const ignored: string[] = prev.ignored || [];
  const linkCache: Record<string, { at: string; ok: boolean; why?: string; title?: string }> = prev.linkCache || {};
  const site = await loadSiteLogs(db);
  let logs = site.logs.filter((l: any) => !l.isAbsence);
  const issues: Issue[] = [];
  const stats: any = { logs: logs.length, videos: 0, timeChecked: 0, gameChecked: 0, linksChecked: 0, ai: 0 };

  // ── 유튜브 영상 정보 한꺼번에 (50개씩) ──
  const vidToLog = new Map<string, any>();
  logs.forEach((l: any) => (l.vods || []).forEach((v: any) => { const id = ytIdOf(typeof v === 'string' ? v : v?.url); if (id && !vidToLog.has(id)) vidToLog.set(id, l); }));
  const info = new Map<string, any>();
  if (ytApiKey()) {
    const ids = [...vidToLog.keys()];
    for (let i = 0; i < ids.length && Date.now() - t0 < 60000; i += 50) {
      try {
        const j = await ytApi(`videos?part=snippet,liveStreamingDetails&id=${ids.slice(i, i + 50).join(',')}`);
        (j.items || []).forEach((it: any) => info.set(it.id, it));
      } catch { break; }
    }
  }
  stats.videos = info.size;

  // ── 0) 링크 정리 (영상 설명란 기준): 같은 생방이 여러 기록에 / 생방 없는 기록의 영상 / 같은 날 기록 둘 ──
  try {
    const r = await cleanupLinks(db, logs, info, site.historical);
    stats.cleanup = r.summary;
    r.issues.forEach((i) => issues.push(i));
    if (r.deleted.size) logs = logs.filter((l: any) => !r.deleted.has(l.id));
  } catch (e: any) { stats.cleanupError = String(e?.message || e).slice(0, 200); }

  // ── 1) 방송 시간: 기록의 다시보기(여러 개면 가장 이른 시작 ~ 가장 늦은 끝)와 비교 ──
  //   비어 있는 시작·끝·방송 시간은 유튜브 값으로 바로 채움 (덮어쓰지는 않음), 다르면 고칠 제안
  const autoFilled: any[] = [];
  const pending: { l: any; fill: any }[] = [];
  const dateFixed: any[] = [];
  for (const l of logs) {
    const lives = (l.vods || []).map((v: any) => info.get(ytIdOf(typeof v === 'string' ? v : v?.url))?.liveStreamingDetails).filter((x: any) => x?.actualStartTime);
    if (!lives.length) continue;
    stats.timeChecked++;
    const startIso = lives.map((x: any) => x.actualStartTime).sort()[0];
    const ends = lives.map((x: any) => x.actualEndTime).filter(Boolean).sort();
    const endIso = ends[ends.length - 1] || '';
    const sDate = kstDate(startIso); const sTime = kstTime(startIso);
    const eTime = endIso ? kstTime(endIso) : '';
    const hours = endIso ? Math.round(((Date.parse(endIso) - Date.parse(startIso)) / 3600000) * 10) / 10 : 0;
    // 날짜가 하루 넘게 다르면 다른 방송의 영상일 수 있음 → 건드리지 않음
    if (Math.abs(Date.parse(`${sDate}T00:00:00Z`) - Date.parse(`${l.date}T00:00:00Z`)) > 86400000) continue;
    // 유튜브 생방송 기록이 있으면 그 시간이 정답 → 다르면 바로 바꿈 (1분 이내 차이는 그대로)
    const fill: any = {};
    // 방송 날짜: 영상 설명란·제목에 적힌 날짜가 있으면 그게 우선, 없으면 유튜브 시작 시각(한국 시간)의 날짜
    //  (옛 스프레드시트 기록은 자정 넘어 시작한 방송을 전날로 적은 경우가 있음)
    const firstVid = (l.vods || []).map((v: any) => ytIdOf(typeof v === 'string' ? v : v?.url)).find((id: string) => info.get(id)?.liveStreamingDetails?.actualStartTime);
    const sn = firstVid ? info.get(firstVid)?.snippet : null;
    const written = writtenDate(`${sn?.title || ''}\n${sn?.description || ''}`, sDate);
    const realDate = written || sDate;
    if (realDate !== l.date) {
      const taken = logs.some((o: any) => o !== l && o.date === realDate);
      const crossMonth = realDate.slice(0, 7) !== String(l.date).slice(0, 7);
      if (!taken && !crossMonth) { fill.date = realDate; dateFixed.push({ id: l.id, from: l.date, to: realDate, by: written ? '설명란' : '유튜브 시작 시각' }); }
      else issues.push({ id: `date:${l.id}`, type: 'time', logId: l.id, date: l.date, video: firstVid || '', msg: `실제 방송일은 ${realDate}(${written ? '설명란' : '유튜브 시작 시각'})인데 기록은 ${l.date}${taken ? ` — ${realDate}에 다른 기록이 있어서 그대로 둠` : crossMonth ? ' — 달이 바뀌는 날짜라 직접 확인 필요' : ''}` } as any);
    }
    const off = (x: string, y: string) => !x || Math.abs(minutesOf('2000-01-01', x) - minutesOf('2000-01-01', y)) > 1;
    if (off(l.time, sTime)) fill.time = sTime;
    if (eTime && off(l.endTime, eTime)) fill.endTime = eTime;
    if (hours > 0 && hours < 30 && Math.abs((Number(l.durationHours) || 0) - hours) > 0.05) fill.durationHours = hours;
    if (Object.keys(fill).length) {
      pending.push({ l, fill });
      autoFilled.push({ id: `fill:${l.id}`, at: new Date().toISOString(), logId: l.id, patch: fill, from: { time: l.time || '', endTime: l.endTime || '', durationHours: l.durationHours || 0 } });
      Object.assign(l, fill);
    }
  }
  try { await patchSiteLogs(db, pending, site.historical); } catch (e: any) { stats.fillError = String(e?.message || e).slice(0, 200); }
  stats.autoFilled = autoFilled.length;
  stats.dateFixed = dateFixed.length;
  stats.dateFixedSample = dateFixed.slice(0, 5);

  // ── 2) 게임 이름: 제목·설명란·AI가 본 게임에 방송 기록의 게임이 하나도 없으면 AI에게 물어봄 ──
  const suspects: { l: any; vid: string; title: string; desc: string; aiGames: string[] }[] = [];
  for (const [vid, l] of vidToLog) {
    const names: string[] = (l.games?.length ? l.games.map((g: any) => g.name) : [l.game]).filter(Boolean);
    if (!names.length) continue;
    const sn = info.get(vid)?.snippet;
    if (!sn) continue;
    stats.gameChecked++;
    const text = `${sn.title} ${sn.description || ''}`;
    // 제목·설명란에 이미 있으면 AI 결과는 안 읽음 (DB 읽기 아낌)
    if (names.some((n) => looseMatch(text, n))) continue;
    const ai = (await db.collection('ai_video').doc(vid).get().catch(() => null))?.data?.();
    const aiGames: string[] = (ai?.status === 'done' ? ai.games || [] : []).flatMap((g: any) => [g.name, g.ko]).filter(Boolean);
    const seen = aiGames.some((a) => names.some((n) => looseMatch(a, n)));
    if (!seen) suspects.push({ l, vid, title: sn.title, desc: String(sn.description || '').slice(0, 500), aiGames });
  }
  const aiLimit = opts.aiLimit ?? 40;
  for (let i = 0; i < Math.min(suspects.length, aiLimit) && Date.now() - t0 < 200000; i += 10) {
    const batch = suspects.slice(i, Math.min(i + 10, aiLimit));
    const list = batch.map((s, k) => `${k + 1}. 기록된 게임: ${(s.l.games?.map((g: any) => g.name) || [s.l.game]).join(', ')} / 영상 제목: ${s.title} / 설명란: ${s.desc.replace(/\s+/g, ' ')}${s.aiGames.length ? ` / AI가 영상에서 본 게임: ${s.aiGames.join(', ')}` : ''}`).join('\n');
    try {
      const { text } = await aiGen([{ text: `스트리머 방송 기록의 '플레이한 게임'이 실제 영상과 맞는지 확인해 줘. 제목·설명란·AI가 본 게임을 근거로. 같은 게임의 한국어/영어/줄임 이름이면 맞는 거야. 근거가 부족하면 ok:true.\nJSON 배열로만: [{"n":번호,"ok":true/false,"real":["틀렸으면 실제 게임 이름(설명란·제목에 쓰인 이름 그대로)"],"why":"한 줄"}]\n\n${list}` }], true, 30000, AI_TEXT_MODELS);
      stats.ai++;
      const arr = aiParseJson(text);
      (Array.isArray(arr) ? arr : arr?.items || []).forEach((r: any) => {
        const s = batch[Number(r?.n) - 1];
        if (!s || r?.ok !== false) return;
        const real: string[] = (Array.isArray(r.real) ? r.real : []).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 3);
        const cur: string[] = (s.l.games?.map((g: any) => g.name) || [s.l.game]);
        issues.push({
          id: `game:${s.l.id}`, type: 'game', logId: s.l.id, date: s.l.date, video: s.vid,
          msg: `기록된 게임 '${cur.join(', ')}' ↔ 영상에는 '${real.join(', ') || '?'}' — ${String(r.why || '').slice(0, 120)}`,
          fix: real.length && cur.length === 1 && s.l.games?.length === 1 ? [{ field: 'game', index: 0, from: cur[0], to: real[0] }] : undefined,
        });
      });
    } catch { break; }
  }

  // ── 3) 게임 링크: 오래 안 본 것부터 몇 개씩 실제로 열어 봄 ──
  const links: { l: any; i: number; name: string; url: string }[] = [];
  logs.forEach((l: any) => (l.games || []).forEach((g: any, i: number) => { if (/^https?:\/\//.test(g?.link || '')) links.push({ l, i, name: g.name, url: g.link }); }));
  const uniq = new Map<string, typeof links[number]>();
  links.forEach((x) => { if (!uniq.has(x.url)) uniq.set(x.url, x); });
  const order = [...uniq.values()].sort((a, b) => String(linkCache[a.url]?.at || '').localeCompare(String(linkCache[b.url]?.at || '')));
  const linkLimit = opts.linkLimit ?? 40;
  for (const x of order.slice(0, linkLimit)) {
    if (Date.now() - t0 > 240000) break;
    const r = await checkLink(x.url, x.name);
    linkCache[x.url] = { at: new Date().toISOString(), ok: r.ok, why: r.why, title: (r.title || '').slice(0, 120) };
    stats.linksChecked++;
  }
  // 캐시 결과로 문제 목록 (같은 링크를 쓰는 기록 전부)
  links.forEach((x) => {
    const c = linkCache[x.url];
    if (!c) return;
    if (!c.ok) issues.push({ id: `link:${x.l.id}:${x.i}`, type: 'link_dead', logId: x.l.id, date: x.l.date, msg: `'${x.name}' 링크가 ${c.why} — ${x.url}` });
    else if (c.title && !/steam|스팀|store|epic|play\.google|apps\.apple|nintendo|playstation|xbox/i.test(x.url) ? false : c.title && !looseMatch(c.title, x.name) && !sq(c.title).includes(sq(x.name).slice(0, 6))) {
      issues.push({ id: `link:${x.l.id}:${x.i}`, type: 'link', logId: x.l.id, date: x.l.date, msg: `'${x.name}' 링크 페이지 제목이 '${c.title}' — 다른 게임일 수 있어요` });
    }
  });

  const kept = issues.filter((i) => !ignored.includes(i.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400);
  const urls = new Set(links.map((x) => x.url));
  const cache = Object.fromEntries(Object.entries(linkCache).filter(([u]) => urls.has(u)));
  const out = { v: DC_VER, at: new Date().toISOString(), ms: Date.now() - t0, stats, issues: kept, applied: [...(prev.applied || []), ...(stats.cleanup?.actions || []), ...autoFilled].slice(-400), counts: kept.reduce((a: any, i) => { a[i.type] = (a[i.type] || 0) + 1; return a; }, {}), ignored, linkCache: cache };
  await ref.set(JSON.parse(JSON.stringify(out)));
  return { at: out.at, ms: out.ms, stats, counts: out.counts };
}

/** 관리자 '적용': 제안대로 방송 기록 고치기 */
export async function applyDataFix(db: any, issueId: string) {
  const ref = db.collection('admin_data').doc('dataCheck');
  const d = (await ref.get()).data() || {};
  const issue: Issue | undefined = (d.issues || []).find((x: Issue) => x.id === issueId);
  if (!issue?.fix?.length) throw Object.assign(new Error('고칠 제안이 없는 항목이에요'), { status: 400 });
  const site = await loadSiteLogs(db);
  const log = site.logs.find((l: any) => l.id === issue.logId);
  if (!log) throw Object.assign(new Error('방송 기록이 없어요'), { status: 404 });
  const patch: any = {};
  for (const f of issue.fix) {
    if (f.field === 'time' || f.field === 'endTime') patch[f.field] = f.to;
    // 시작·끝이 다 있으면 방송 시간도 맞춤
    const st = f.field === 'time' ? f.to : patch.time || log.time; const en = f.field === 'endTime' ? f.to : patch.endTime || log.endTime;
    if ((f.field === 'time' || f.field === 'endTime') && st && en) { let m = minutesOf('2000-01-01', en) - minutesOf('2000-01-01', st); if (m <= 0) m += 1440; patch.durationHours = Math.round((m / 60) * 10) / 10; }
    if (f.field === 'game') {
      const games = [...(log.games || [])];
      const i = f.index ?? 0;
      if (games[i]) games[i] = { ...games[i], name: f.to, link: '' }; // 이름이 바뀌면 옛 링크는 다른 게임 → 비움 (다음 검증·AI가 채움)
      patch.games = games;
      if (i === 0) patch.game = f.to;
    }
  }
  await patchSiteLog(db, log, patch, site.historical);
  await ref.set({ issues: (d.issues || []).filter((x: Issue) => x.id !== issueId), applied: [...(d.applied || []), { id: issueId, at: new Date().toISOString(), patch }].slice(-200) }, { merge: true });
  return { patch };
}
export async function ignoreDataIssue(db: any, issueId: string) {
  const ref = db.collection('admin_data').doc('dataCheck');
  const d = (await ref.get()).data() || {};
  await ref.set({ ignored: [...new Set([...(d.ignored || []), issueId])].slice(-1000), issues: (d.issues || []).filter((x: Issue) => x.id !== issueId) }, { merge: true });
}
