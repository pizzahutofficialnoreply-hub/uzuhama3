/**
 * 주간 점검: API(Vercel) 작동 · 보안 · DB(Firestore) 데이터 점검
 * - 공개 API 가 200·올바른 JSON 으로 빨리 오는지
 * - 관리자·알림 보내기 API 가 로그인 없이 막히는지
 * - Firestore: 방문자 권한으로 읽을 것만 읽히고, 쓰면 안 되는 곳은 막히는지
 * - 방송 기록 데이터 검사: 날짜 형식·중복·링크 형식·미래 날짜·빈 기록
 * 결과: weekly-out/api-db.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'weekly-out';
mkdirSync(OUT, { recursive: true });
const API = process.env.API_BASE || 'https://uzuhama.vercel.app';
const KEY = 'AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM';
const FS = 'https://firestore.googleapis.com/v1/projects/uzuhama/databases/(default)/documents';
const checks = [];
const add = (group, name, ok, detail = '', ms = null, warn = false) => { checks.push({ group, name, ok: ok || warn, warn: warn && !ok, detail: String(detail).slice(0, 300), ms }); console.log(`${ok ? '✓' : '✗'} [${group}] ${name} ${detail ? `— ${String(detail).slice(0, 120)}` : ''}`); };

async function hit(path, { method = 'GET', body, headers = {}, expect = 200, json = true, maxMs = 10000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const ms = Date.now() - t0;
    const text = await r.text();
    let data = null;
    if (json) { try { data = JSON.parse(text); } catch { /* */ } }
    const expOk = Array.isArray(expect) ? expect.includes(r.status) : r.status === expect;
    return { status: r.status, ms, data, text, ok: expOk && (!json || data !== null || r.status >= 400) && ms <= maxMs };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, ok: false, text: String(e?.message || e) };
  }
}

// ── 1. 공개 API ──
const pub = [
  ['상태', '/api/health', (d) => d?.status === 'ok'],
  ['패치노트', '/api/patch-notes', (d) => Array.isArray(d?.notes) && d.notes.length > 0 && !d?.notion?.error],
  ['검색 색인 상태', '/api/videos/search-index?status=1', (d) => d && typeof d === 'object'],
  ['AI 분석 상태', '/api/videos/search-index?ai=status', (d) => typeof d?.total === 'number' && d.total > 0],
  ['AI 검색', '/api/videos/search-index?ai=search&q=%EA%B3%B5%ED%8F%AC', (d) => Array.isArray(d?.results)],
  ['재생목록', '/api/videos/playlists', (d) => d && !d.error],
  ['쇼츠', '/api/videos/shorts', (d) => d && !d.error],
  ['영상 정보', '/api/videos/meta?ids=dQw4w9WgXcQ', (d) => d && !d.error],
  ['상태 문구', '/api/status-messages', (d) => d && !d.error],
  ['방송 점검(tick)', '/api/notifications/tick?src=weekly', (d) => d && !d.error],
];
for (const [name, path, valid] of pub) {
  const r = await hit(path, { maxMs: 15000 });
  const good = r.status === 200 && (r.data ? valid(r.data) : false);
  add('API', name, good, good ? `${r.ms}ms` : `HTTP ${r.status} ${String(r.text).slice(0, 160)}`, r.ms);
  if (good && r.ms > 5000) add('API', `${name} 느림`, false, `${r.ms}ms (5초 넘음)`, r.ms);
}
{
  const r = await hit('/api/calendar', { json: false });
  add('API', '캘린더 구독(ics)', r.status === 200 && /BEGIN:VCALENDAR/.test(r.text), `HTTP ${r.status} ${r.ms}ms`, r.ms);
}
{
  const r = await hit('/v/dQw4w9WgXcQ', { json: false });
  add('API', '공유 미리보기 페이지', r.status === 200 && /og:title/.test(r.text), `HTTP ${r.status}`, r.ms);
}

// ── 2. 막혀야 하는 것 ──
{
  const r = await hit('/api/admin/mutate', { method: 'POST', body: { action: 'aiVideo', op: 'status' }, expect: [401, 403] });
  add('보안', '관리자 API: 로그인 없이 막힘', r.ok, `HTTP ${r.status}`);
  const r2 = await hit('/api/admin/mutate', { method: 'POST', body: { action: 'aiVideo' }, headers: { Authorization: 'Bearer fake-token' }, expect: [401, 403] });
  add('보안', '관리자 API: 가짜 토큰 막힘', r2.ok, `HTTP ${r2.status}`);
  const r3 = await hit('/api/notifications/send', { method: 'POST', body: { title: 't', body: 'b' }, expect: [401, 403] });
  add('보안', '알림 보내기: 로그인 없이 막힘', r3.ok, `HTTP ${r3.status}`);
}

// ── 3. Firestore (방문자 권한) ──
async function fs(path, opts = {}) {
  const r = await fetch(`${FS}/${path}${path.includes('?') ? '&' : '?'}key=${KEY}`, { ...opts, signal: AbortSignal.timeout(20000) });
  let data = null;
  try { data = await r.json(); } catch { /* */ }
  return { status: r.status, data };
}
const fromFs = (v) => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  return v;
};
{
  const sys = await fs('config/system?mask.fieldPaths=appVersion');
  add('DB', '설정 읽기(config/system)', sys.status === 200, `HTTP ${sys.status}`);
  // 방문자가 푸시 구독을 만들거나 지울 수 없어야 함 (없는 문서로 시험)
  const pw = await fs('push_subscriptions/zz-weekly-probe?updateMask.fieldPaths=probe', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { probe: { stringValue: 'x' } } }) });
  add('보안', 'DB: 방문자가 푸시 구독을 못 씀', pw.status === 403 || pw.status === 401, `HTTP ${pw.status}`);
  if (pw.status === 200) await fs('push_subscriptions/zz-weekly-probe', { method: 'DELETE' });
  const w = await fs('config/system?updateMask.fieldPaths=weeklyProbe', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { weeklyProbe: { stringValue: 'x' } } }) });
  add('보안', 'DB: 방문자가 설정을 못 바꿈', w.status === 403 || w.status === 401, `HTTP ${w.status}`);
  for (const col of ['admin_audit', 'feedbacks', 'push_subscriptions', 'weekly_reports', 'ai_video', 'users']) {
    const r = await fs(`${col}?pageSize=1`);
    const blocked = r.status === 403 || r.status === 401 || (r.status === 200 && !(r.data?.documents?.length));
    add('보안', `DB: 방문자가 ${col} 를 못 읽음`, blocked, `HTTP ${r.status}`);
  }
}

// 방송 기록 전체 읽어서 검사
const logs = [];
{
  let token = '';
  let pages = 0;
  do {
    const r = await fs(`logs?pageSize=300${token ? `&pageToken=${token}` : ''}`);
    if (r.status !== 200) { add('DB', '방송 기록 읽기', false, `HTTP ${r.status}`); break; }
    (r.data.documents || []).forEach((d) => logs.push({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])) }));
    token = r.data.nextPageToken || '';
  } while (token && ++pages < 20);
  add('DB', '방송 기록 읽기', logs.length > 0, `${logs.length}개`);
}
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const ytRe = /(youtu\.be\/|youtube\.com\/(watch\?v=|live\/|shorts\/|embed\/))[\w-]{11}/;
const badDate = logs.filter((l) => !dateRe.test(String(l.date || '')));
const future = logs.filter((l) => dateRe.test(String(l.date)) && l.date > today && !l.isAbsence);
const dupDates = Object.entries(logs.reduce((a, l) => { if (!l.isAbsence) a[l.date] = (a[l.date] || 0) + 1; return a; }, {})).filter(([, n]) => n > 2);
const badLinks = [];
const linkIds = new Map();
logs.forEach((l) => ['vods', 'edited', 'shorts'].forEach((k) => (Array.isArray(l[k]) ? l[k] : []).forEach((v) => {
  const url = typeof v === 'string' ? v : v?.url;
  if (!url) return;
  if (/youtu/.test(url) && !ytRe.test(url)) badLinks.push(`${l.date} ${k} ${url.slice(0, 80)}`);
  const m = url.match(/[\w-]{11}(?=[?&#]|$)/);
  if (m && k !== 'edited') linkIds.set(`${k}:${m[0]}`, [...(linkIds.get(`${k}:${m[0]}`) || []), l.date]);
})));
const dupLinks = [...linkIds.entries()].filter(([, d]) => new Set(d).size > 1).slice(0, 10).map(([k, d]) => `${k} → ${[...new Set(d)].join(', ')}`);
const emptyLogs = logs.filter((l) => !l.isAbsence && !(l.games?.length || l.game) && !(l.vods?.length) && !l.category);
const badTime = logs.filter((l) => !l.isAbsence && l.time && !/^\d{1,2}:\d{2}$/.test(String(l.time)));
add('DB', '기록 날짜 형식', badDate.length === 0, badDate.slice(0, 5).map((l) => l.id).join(', '));
add('DB', '미래 날짜 방송 기록 없음', future.length === 0, future.slice(0, 5).map((l) => l.date).join(', '));
add('DB', '같은 날 기록 3개 이상 없음', dupDates.length === 0, dupDates.slice(0, 5).map(([d, n]) => `${d}×${n}`).join(', '));
add('DB', '유튜브 링크 형식', badLinks.length === 0, badLinks.slice(0, 5).join(' | '));
add('DB', '같은 다시보기·쇼츠가 여러 날에 없음 (참고: 이틀에 걸친 방송이면 정상)', dupLinks.length === 0, dupLinks.join(' | '), null, true);
add('DB', '시간 형식(HH:MM)', badTime.length === 0, badTime.slice(0, 5).map((l) => `${l.date} ${l.time}`).join(', '));
add('DB', '내용 없는 방송 기록 없음', emptyLogs.length === 0, emptyLogs.slice(0, 5).map((l) => l.date).join(', '), null, true);
const last = logs.map((l) => l.date).filter((d) => dateRe.test(d)).sort().pop();

const report = {
  at: new Date().toISOString(),
  checks,
  stats: { logs: logs.length, absence: logs.filter((l) => l.isAbsence).length, lastLogDate: last },
  summary: { total: checks.length, failed: checks.filter((c) => !c.ok).length, slowest: Math.max(0, ...checks.map((c) => c.ms || 0)) },
};
writeFileSync(`${OUT}/api-db.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.summary));
