import fs from 'fs';
import { normalizeHistorical, overlayMonthDocs } from '../../src/utils/archiveOverlay.ts';
const K = 'AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM';
const yt = (u) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const url = (x) => (typeof x === 'string' ? x : x?.url || '');
const hist = normalizeHistorical(JSON.parse(fs.readFileSync('h.json', 'utf8')));
const conv = (v) => v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? (v.arrayValue ? (v.arrayValue.values || []).map(conv) : v.mapValue ? obj(v.mapValue.fields || {}) : v.nullValue === null ? null : undefined));
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, conv(v)]));
const docs = JSON.parse(fs.readFileSync('all.json', 'utf8')).documents.map((d) => obj(d.fields));
const site = overlayMonthDocs(hist, docs);
const logs = Object.values(site).filter((l) => l?.date && !l.isAbsence);
// 원본(JSON)과 비교해서 새로 들어간 링크
const added = [];
for (const l of logs) {
  const h = hist[l.id];
  const old = new Set(h ? [...(h.vods || []), ...(h.edited || []), ...(h.shorts || [])].map((x) => yt(url(x))) : []);
  for (const [kind, list] of [['생방', l.vods], ['영상', l.edited], ['쇼츠', l.shorts]]) {
    for (const x of list || []) { const id = yt(url(x)); if (id && !old.has(id) && !x.isCompilation && !x.compilationId) added.push({ log: l, kind, id, title: x.title || '' }); }
  }
}
// 링크가 들어 있는 기록들
const where = new Map();
logs.forEach((l) => ['vods', 'edited', 'shorts'].forEach((k) => (l[k] || []).forEach((x) => { if (x?.isCompilation || x?.compilationId) return; const id = yt(url(x)); if (!id) return; where.set(id, [...(where.get(id) || []), `${l.date}(${k})`]); })));
// 유튜브 페이지에서 실제 날짜
const pageInfo = async (id) => {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
    if (r.status === 401 || r.status === 403) return { gone: '비공개/퍼가기 막힘' };
    if (r.status === 404 || r.status === 400) return { gone: '없는 영상' };
    if (!r.ok) return {};
    const j = await r.json();
    return { title: j.title, author: j.author_name };
  } catch { return {}; }
};
const kst = (iso) => iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '';
const out = [];
const byLog = new Map();
added.forEach((a) => byLog.set(a.log.id, [...(byLog.get(a.log.id) || []), a]));
console.log(`원본과 다르게 추가된 링크 ${added.length}개 · 기록 ${byLog.size}개 (새로 만든 기록 ${[...byLog.keys()].filter((k) => !hist[k]).length}개)`);
for (const [id, list] of byLog) {
  const l = list[0].log;
  const hasLive = (l.vods || []).some((v) => yt(url(v)));
  const probs = [];
  if (!hist[id] && !hasLive) probs.push('생방 없는 새 기록');
  if (logs.filter((o) => o.date === l.date).length > 1) probs.push(`같은 날 기록 ${logs.filter((o) => o.date === l.date).length}개`);
  const lines = [];
  for (const a of list) {
    const p = await pageInfo(a.id);
    const w = where.get(a.id) || [];
    const ap = [];
    if (w.length > 1) ap.push(`중복: ${w.join(', ')}`);
    if (p.gone) ap.push(p.gone);
    if (p.author && !/우주하마|astrohippo|hama/i.test(p.author)) ap.push(`다른 채널(${p.author})`);
    if (a.kind === '생방' && p.title && !/생방|live|라이브|LIVE|방송/i.test(p.title)) ap.push('제목이 생방송 같지 않음');
    if (a.kind === '영상' && p.title && /^우주하마 (생방송|LIVE)|생방송!$/i.test(p.title)) ap.push('생방 영상인데 영상 칸에');
    lines.push(`   ${ap.length ? '❗' : '·'} ${a.kind} ${a.id} ${(a.title || p.title || '').slice(0, 40)}${ap.length ? ' — ' + ap.join(' / ') : ''}`);
  }
  out.push({ bad: probs.length || lines.some((x) => x.includes('❗')), text: `${l.date} ${hist[id] ? '' : '[새 기록] '}${l.game || (l.games || []).map((g) => g.name).join(', ') || '(게임 없음)'}${probs.length ? ' — ' + probs.join(' / ') : ''}\n${lines.join('\n')}` });
}
out.sort((a, b) => Number(b.bad) - Number(a.bad));
console.log(`문제 있는 기록 ${out.filter((o) => o.bad).length}개\n`);
console.log(out.map((o) => o.text).join('\n'));
