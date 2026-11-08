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

const KST = 9 * 3600000;
/** 검증 방식 버전: 바뀌면 그날 이미 했어도 한 번 더 */
export const DC_VER = 2;
const ytIdOf = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const sq = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const kstDate = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
const kstTime = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(11, 16);
const minutesOf = (d: string, t: string) => Date.parse(`${d}T${t || '00:00'}:00Z`) / 60000;
const looseMatch = (a: string, b: string) => { const x = sq(a); const y = sq(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

export type Issue = {
  id: string; type: 'time' | 'game' | 'link' | 'link_dead';
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

export async function runDataCheck(db: any, opts: { linkLimit?: number; aiLimit?: number } = {}) {
  const t0 = Date.now();
  const ref = db.collection('admin_data').doc('dataCheck');
  const prev = (await ref.get()).data() || {};
  const ignored: string[] = prev.ignored || [];
  const linkCache: Record<string, { at: string; ok: boolean; why?: string; title?: string }> = prev.linkCache || {};
  const site = await loadSiteLogs(db);
  const logs = site.logs.filter((l: any) => !l.isAbsence);
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

  // ── 1) 방송 시간: 기록의 다시보기(여러 개면 가장 이른 시작 ~ 가장 늦은 끝)와 비교 ──
  //   비어 있는 시작·끝·방송 시간은 유튜브 값으로 바로 채움 (덮어쓰지는 않음), 다르면 고칠 제안
  const autoFilled: any[] = [];
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
    const fill: any = {};
    if (!l.time) fill.time = sTime;
    if (!l.endTime && eTime) fill.endTime = eTime;
    if (!(Number(l.durationHours) > 0) && hours > 0 && hours < 30) fill.durationHours = hours;
    if (Object.keys(fill).length) {
      try { await patchSiteLog(db, l, fill, site.historical); Object.assign(l, fill); autoFilled.push({ id: `fill:${l.id}`, at: new Date().toISOString(), logId: l.id, patch: fill }); } catch { /* */ }
    }
    const fix: Issue['fix'] = [];
    const diff = Math.abs(minutesOf(l.date, l.time) - minutesOf(sDate, sTime));
    if (l.time && diff > 45 && diff < 36 * 60) fix.push({ field: 'time', from: l.time, to: sTime });
    const eDiff = eTime && l.endTime ? Math.abs(minutesOf('2000-01-01', l.endTime) - minutesOf('2000-01-01', eTime)) : 0;
    if (eDiff > 45 && eDiff < 23 * 60) fix.push({ field: 'endTime', from: l.endTime, to: eTime });
    if (fix.length) issues.push({ id: `time:${l.id}`, type: 'time', logId: l.id, date: l.date, video: ytIdOf(typeof l.vods[0] === 'string' ? l.vods[0] : l.vods[0]?.url), msg: `유튜브 생방송 기록은 ${sDate} ${sTime}${eTime ? `~${eTime}` : ''} 인데 방송 기록은 ${l.time || '-'}${l.endTime ? `~${l.endTime}` : ''}`, fix });
  }
  stats.autoFilled = autoFilled.length;

  // ── 2) 게임 이름: 제목·설명란·AI가 본 게임에 방송 기록의 게임이 하나도 없으면 AI에게 물어봄 ──
  const suspects: { l: any; vid: string; title: string; desc: string; aiGames: string[] }[] = [];
  for (const [vid, l] of vidToLog) {
    const names: string[] = (l.games?.length ? l.games.map((g: any) => g.name) : [l.game]).filter(Boolean);
    if (!names.length) continue;
    const sn = info.get(vid)?.snippet;
    if (!sn) continue;
    stats.gameChecked++;
    const text = `${sn.title} ${sn.description || ''}`;
    const ai = (await db.collection('ai_video').doc(vid).get().catch(() => null))?.data?.();
    const aiGames: string[] = (ai?.status === 'done' ? ai.games || [] : []).flatMap((g: any) => [g.name, g.ko]).filter(Boolean);
    const seen = names.some((n) => looseMatch(text, n) || aiGames.some((a) => looseMatch(a, n)));
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
  const out = { v: DC_VER, at: new Date().toISOString(), ms: Date.now() - t0, stats, issues: kept, applied: [...(prev.applied || []), ...autoFilled].slice(-300), counts: kept.reduce((a: any, i) => { a[i.type] = (a[i.type] || 0) + 1; return a; }, {}), ignored, linkCache: cache };
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
