/**
 * 팬카페 '영상 생방링크 정리' 글 → 날짜별 생방·영상·쇼츠 링크
 *
 * 이런 모양을 읽음 (줄 순서·괄호·콜론은 조금 달라도 됨):
 *   [생방날짜: 2017. 3. 31]
 *   생방링크
 *   : https://youtu.be/...
 *   영상링크
 *   : https://youtu.be/...
 *   [영상 제목]            ← 링크 아래 줄의 글은 바로 위 영상의 제목
 * - 같은 날짜가 여러 번 나오면 한 날로 합침
 * - '<2017 (2,3월) …>' 같은 머리말, 일(日)이 없는 날짜는 무시
 */

export type CafeLink = { id: string; url: string; title?: string };
export type CafeDay = { date: string; lives: CafeLink[]; videos: CafeLink[]; shorts: CafeLink[]; pairs: CafePair[] };
/** 한 묶음(날짜 하나 아래) 안에서 영상과 그 영상의 생방 링크 */
export type CafePair = { video: CafeLink; lives: CafeLink[] };

const YT_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^ ]*&)?v=|live\/|shorts\/|embed\/))([\w-]{11})/;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const DATE_RE = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/;

export function youtubeIdOf(url: string): string | null {
  return YT_ID.exec(url)?.[1] || null;
}

function cleanLine(s: string) {
  return s.replace(/[​‌‍﻿ ]/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    // 글머리 기호 (•, -, *, ·, ▶, 1. 등)
    .replace(/^(?:[•·\-*◦▪●○■□▶►▷➤✔✓☞→]|\d{1,2}[.)](?!\d))\s*/, '').trim();
}

type Kind = 'live' | 'video' | 'shorts' | 'game';
/** 줄 앞머리(링크 앞 글)로 무엇의 링크인지: '생방: …', '영상: 제목, …', '게임: …', '쇼츠 …' */
function labelOf(line: string): Kind | null {
  const head = line.split(/https?:\/\//)[0].replace(/\s+/g, '').toLowerCase();
  if (!head) return null;
  if (/^(게임|game|스팀|steam)/.test(head)) return 'game';
  if (/^(쇼츠|shorts|숏츠)/.test(head)) return 'shorts';
  if (/^(생방|라이브|live|다시보기|풀영상|원본|방송링크|방송[:：])/.test(head) || /생방(송)?(링크|다시보기|풀영상|원본)?[:：]?$/.test(head)) return 'live';
  if (/^(영상|편집|업로드|유튜브영상|video)/.test(head)) return 'video';
  return null;
}

/** '영상: 제목, https://…' 에서 제목 */
function inlineTitle(line: string): string {
  const head = line.split(/https?:\/\//)[0];
  const t = head.replace(/^[^:：]{0,12}[:：]\s*/, '').replace(/[,，\s]+$/, '').trim();
  return t && !/^(생방|영상|쇼츠|게임)(링크)?$/.test(t) ? t : '';
}

/** 날짜로 쓸 수 있는 줄인지 (머리말의 '2017. 2018. 3월' 같은 건 제외) */
function dateOf(line: string): string | null {
  const m = DATE_RE.exec(line);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 2010 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (/https?:\/\//.test(line)) return null;
  // 날짜만 있는 줄이거나 '생방날짜/날짜/방송일' 이 붙은 줄, 요일이 붙은 줄만 (본문 중간 날짜는 무시)
  const rest = line.replace(m[0], '').replace(/[\[\]()<>:：\s.,·]/g, '').replace(/^\(?[월화수목금토일](요일)?\)?/, '').replace(/^[월화수목금토일](요일)?$/, '');
  if (rest && !/^(생방|방송)?(날짜|방송일|일자)/.test(rest) && !/^(생방|방송)(날짜|일)?$/.test(rest)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseCafePost(text: string): CafeDay[] {
  const days = new Map<string, CafeDay>();
  let cur = null as CafeDay | null;
  let label = null as Kind | null;
  let lastVideo = null as CafeLink | null;
  // 지금 묶음(날짜 줄 하나 아래)의 생방·영상: 묶음이 끝나면 영상마다 그 묶음의 생방을 짝지음
  let blockLives: CafeLink[] = [];
  let blockVideos: CafeLink[] = [];
  const closeBlock = () => {
    if (cur && blockVideos.length) {
      blockVideos.forEach((v) => {
        const hit = cur!.pairs.find((p) => p.video.id === v.id);
        if (hit) blockLives.forEach((l) => { if (!hit.lives.some((x) => x.id === l.id)) hit.lives.push(l); });
        else cur!.pairs.push({ video: v, lives: [...blockLives] });
      });
    }
    blockLives = [];
    blockVideos = [];
  };

  const add = (list: CafeLink[], link: CafeLink) => {
    const hit = list.find((x) => x.id === link.id);
    if (hit) { if (!hit.title && link.title) hit.title = link.title; return hit; }
    list.push(link);
    return link;
  };

  String(text || '').split(/\r?\n/).map(cleanLine).forEach((line) => {
    if (!line) return;
    const d = dateOf(line);
    if (d) {
      closeBlock();
      cur = days.get(d) || { date: d, lives: [], videos: [], shorts: [], pairs: [] };
      days.set(d, cur);
      label = null;
      lastVideo = null;
      return;
    }
    const urls: string[] = line.match(URL_RE) || [];
    const lineLabel = labelOf(line);
    if (urls.length === 0) {
      if (lineLabel) { label = lineLabel; return; }
      // 링크 아래 글: 바로 위 영상(또는 쇼츠)의 제목
      if (lastVideo && !lastVideo.title && !/^[<＜].*[>＞]$/.test(line) && !/^대한민국 모임의 시작|^m\.cafe\.naver\.com/.test(line)) {
        // '[제목 전체]' 처럼 줄 전체를 감싼 괄호만 벗김 ('[오버워치] 제목' 은 그대로)
        const wrapped = line.startsWith('[') && line.endsWith(']') && line.indexOf(']') === line.length - 1;
        lastVideo.title = wrapped ? line.slice(1, -1).trim() : line;
      }
      return;
    }
    if (!cur) return;
    const kind = lineLabel || label;
    if (kind === 'game') return; // 게임 링크(스팀 등)는 여기서 안 씀
    const title = inlineTitle(line);
    urls.forEach((u) => {
      const url = u.replace(/[.,]+$/, '');
      const id = youtubeIdOf(url);
      if (!id) return; // 유튜브 링크만 (치지직 등은 아직 기록 형식이 달라 제외)
      const isShortUrl = /\/shorts\//.test(url);
      // 표시가 없으면 주소로: /live/ 는 생방
      const k = kind || (/\/live\//.test(url) ? 'live' : isShortUrl ? 'shorts' : 'video');
      if (k === 'live') { const l = add(cur!.lives, { id, url }); if (!blockLives.includes(l)) blockLives.push(l); }
      else if (k === 'shorts' || isShortUrl) lastVideo = add(cur!.shorts, { id, url, ...(title ? { title } : {}) });
      else { lastVideo = add(cur!.videos, { id, url, ...(title ? { title } : {}) }); if (!blockVideos.includes(lastVideo)) blockVideos.push(lastVideo); }
    });
  });

  closeBlock();
  return [...days.values()]
    .filter((d) => d.lives.length || d.videos.length || d.shorts.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 반영 계획: 기록 하나(또는 새 기록) 마다 넣을 링크 */
export type CafePlan = {
  key: string;
  log: any | null;
  date: string;
  lives: CafeLink[];
  videos: CafeLink[];
  shorts: CafeLink[];
  /** 생방 없는 다른 기록(예전 가져오기로 잘못 만든 기록 등)에서 이 기록으로 옮겨 올 영상 */
  moves: { from: any; video: CafeLink }[];
  via: { title: string; postDate: string }[];
  notes: string[];
  status: 'new-log' | 'add';
};

const idOfItem = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
const isComp = (e: any) => Boolean(e?.isCompilation || e?.compilationId);

/**
 * 영상과 생방을 같은 방송 기록에 모음 (생방이 있는 기록이 기준):
 * 1) 생방이 이미 어떤 기록에 있으면 → 영상도 그 기록에. 영상이 생방 없는 다른 기록에 들어가 있으면 옮겨 옴
 * 2) 생방은 없고 영상이 이미 어떤 기록에 있으면 → 그 기록에 생방 추가
 * 3) 둘 다 사이트에 없으면 → 글의 날짜 기록에 (그날 기록이 없으면 새 기록)
 * - 영상과 생방이 각각 '생방이 있는' 서로 다른 기록에 있으면 건드리지 않고 알려 줌
 */
export function planCafeImport(days: CafeDay[], logs: any[], titleOf: Map<string, string> = new Map(), dateOf: Map<string, string> = new Map()): { plans: CafePlan[]; skipped: string[]; already: number } {
  const editedAt = new Map<string, any>();
  const liveAt = new Map<string, any>();
  const linkAt = new Map<string, any>();
  logs.forEach((l) => {
    (l.edited || []).forEach((e: any) => { const id = idOfItem(e); if (id && !isComp(e) && !editedAt.has(id)) editedAt.set(id, l); });
    (l.vods || []).forEach((v: any) => { const id = idOfItem(v); if (id && !liveAt.has(id)) liveAt.set(id, l); });
    [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].forEach((x: any) => { const id = idOfItem(x); if (id && !linkAt.has(id)) linkAt.set(id, l); });
  });
  const hasLive = (l: any) => (l?.vods || []).some((v: any) => idOfItem(v));
  const byKey = new Map<string, CafePlan>();
  const planFor = (log: any | null, date: string): CafePlan => {
    const key = log ? log.id : `new:${date}`;
    let p = byKey.get(key);
    if (!p) { p = { key, log, date: log?.date || date, lives: [], videos: [], shorts: [], moves: [], via: [], notes: [], status: log ? 'add' : 'new-log' }; byKey.set(key, p); }
    return p;
  };
  const has = (list: CafeLink[], id: string) => list.some((x) => x.id === id);
  const skippedList: string[] = [];
  let alreadyCount = 0;
  const titleFor = (video: CafeLink, inLog?: any) => (inLog?.edited || []).find((e: any) => idOfItem(e) === video.id)?.title || titleOf.get(video.id) || video.title || '';

  const logOn = (date: string) => logs.find((l) => l.date === date && !l.isAbsence) || null;
  /** 생방 날짜는 유튜브(API)가 더 정확: 카페 글 날짜와 다르면 유튜브 날짜로 */
  const liveDate = (lives: CafeLink[], cafeDate: string) => lives.map((lv) => dateOf.get(lv.id)).find(Boolean) || cafeDate;
  days.forEach((day) => {
    const dateLog = logOn(day.date);
    day.pairs.forEach(({ video, lives }) => {
      const vLog = editedAt.get(video.id) || null;
      const liveLogs = lives.map((lv) => liveAt.get(lv.id)).filter(Boolean);
      const home = liveLogs[0] || null; // 생방이 들어 있는 기록
      if (home) {
        // 1) 생방 기록 기준
        const p = planFor(home, home.date);
        if (vLog && vLog.id === home.id) alreadyCount++;
        else if (vLog && hasLive(vLog)) { skippedList.push(`영상 「${titleFor(video, vLog) || video.id}」: ${vLog.date} 기록에 있는데 생방은 ${home.date} 기록에 있어요 (둘 다 생방이 있는 기록이라 그대로 둠)`); return; }
        else if (vLog) { if (!p.moves.some((m) => m.video.id === video.id)) p.moves.push({ from: vLog, video: { ...video, title: titleFor(video, vLog) } }); }
        else if (!has(p.videos, video.id)) p.videos.push({ ...video, title: titleFor(video) });
        lives.forEach((lv) => {
          const at = liveAt.get(lv.id) || linkAt.get(lv.id);
          if (at && at.id === home.id) return;
          if (at) { skippedList.push(`생방 ${lv.id}: 이미 ${at.date} 기록에 있어요`); return; }
          if (!has(p.lives, lv.id)) p.lives.push(lv);
        });
        if (home.date !== day.date) p.notes.push(`글의 날짜는 ${day.date}, 생방이 있는 기록은 ${home.date}`);
        return;
      }
      if (vLog) {
        // 2) 영상이 있는 기록에 생방 추가
        if (!lives.length) { alreadyCount++; return; }
        lives.forEach((lv) => {
          const at = linkAt.get(lv.id);
          if (at && at.id === vLog.id) { alreadyCount++; return; }
          if (at) { skippedList.push(`생방 ${lv.id}: 영상은 ${vLog.date} 기록에 있는데 이 생방 링크는 ${at.date} 기록에 있어요`); return; }
          const p = planFor(vLog, vLog.date);
          if (!has(p.lives, lv.id)) p.lives.push(lv);
          const t = titleFor(video, vLog) || video.id;
          if (!p.via.some((v) => v.title === t)) p.via.push({ title: t, postDate: day.date });
          if (day.date !== vLog.date) p.notes.push(`글의 날짜는 ${day.date}, 영상이 있는 기록은 ${vLog.date}`);
        });
        return;
      }
      // 3) 둘 다 없음: 생방 날짜(유튜브 기준, 없으면 글의 날짜) 기록으로
      if (linkAt.get(video.id)) { alreadyCount++; return; }
      const d3 = liveDate(lives, day.date);
      const dLog = d3 === day.date ? dateLog : logOn(d3);
      const p = planFor(dLog, d3);
      if (d3 !== day.date) p.notes.push(`카페 글 날짜는 ${day.date}, 유튜브 생방 날짜는 ${d3} → 유튜브 날짜로`);
      if (!has(p.videos, video.id)) p.videos.push({ ...video, title: titleFor(video) });
      lives.forEach((lv) => {
        const lat = linkAt.get(lv.id);
        if (lat && (!dLog || lat.id !== dLog.id)) { skippedList.push(`생방 ${lv.id}: 이미 ${lat.date} 기록에 있어요`); return; }
        if (lat) { alreadyCount++; return; }
        if (!has(p.lives, lv.id)) p.lives.push(lv);
      });
    });
    // 영상 없이 생방 링크만 있는 날: 그날 기록에
    const paired = new Set(day.pairs.flatMap((p) => p.lives.map((l) => l.id)));
    day.lives.filter((l) => !paired.has(l.id)).forEach((live) => {
      const lat = linkAt.get(live.id);
      if (lat) { alreadyCount++; return; }
      const d4 = dateOf.get(live.id) || day.date;
      const p = planFor(d4 === day.date ? dateLog : logOn(d4), d4);
      if (d4 !== day.date) p.notes.push(`카페 글 날짜는 ${day.date}, 유튜브 생방 날짜는 ${d4} → 유튜브 날짜로`);
      if (!has(p.lives, live.id)) p.lives.push(live);
    });
    day.shorts.forEach((sh) => {
      if (linkAt.has(sh.id)) { alreadyCount++; return; }
      const p = planFor(dateLog, day.date);
      if (!has(p.shorts, sh.id)) p.shorts.push({ ...sh, title: titleOf.get(sh.id) || sh.title || '' });
    });
  });
  const list = [...byKey.values()].filter((p) => p.lives.length + p.videos.length + p.shorts.length + p.moves.length > 0)
    .map((p) => ({ ...p, notes: [...new Set(p.notes)] }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { plans: list, skipped: skippedList, already: alreadyCount };
}

/** 옮긴 뒤 빈 기록인지 (게임·시간·생방·영상·쇼츠 아무것도 없음) */
export function isEmptyLog(l: any): boolean {
  return !(l.vods || []).length && !(l.edited || []).length && !(l.shorts || []).length && !(l.games || []).length && !l.game && !l.time;
}

// ───────────────────────── 팬카페 '[생방날짜: …]' 묶음 글 (월별 정리·웃음참기 정리) ─────────────────────────

/** 묶음 하나: [생방날짜: …] 부터 다음 [생방날짜] 까지 */
export type CafeBlock = {
  post: string;
  headerRaw: string;
  headerDates: string[];
  lives: (CafeLink & { date?: string; note?: string })[];
  videos: CafeLink[];
  shorts: CafeLink[];
};
/** 한 영상에 여러 날 생방 (웃음참기처럼): 각 생방은 그날 기록에, 영상은 '생방 여러 개'로 연결 */
export type CafeMulti = { video: CafeLink; lives: { id: string; url: string; date: string }[]; post: string };
/** 날짜를 알 수 없어서 자동으로 넣지 않는 것 (직접 확인) */
export type CafeUnsure = { video?: CafeLink; lives: CafeLink[]; shorts: CafeLink[]; header: string; post: string; why: string };

const ZW = /[​-‍﻿ ]/g;
const iso = (y: number, m: number, d: number) => (y >= 2010 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');

/** '2019. 2. 21' · '2019. 3. (4, 5)' · '2019. (2. 25), (3. 3)' · '2023' · '???' · 'X' → 날짜들 */
export function parseHeaderDates(raw: string): { year: number | null; dates: string[] } {
  const s = String(raw || '').replace(ZW, ' ');
  const out: string[] = [];
  let firstYear: number | null = null;
  // 연도마다 나눠서 (드물게 '2018. 12. 31, 2019. 1. 2')
  const parts = s.split(/(\d{4})\s*[.년]?/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const y = Number(parts[i]);
    const rest = parts[i + 1] || '';
    if (firstYear == null) firstYear = y;
    // 쓴 순서대로 (생방 링크 순서와 맞추려고): 찾은 자리를 같은 길이의 빈칸으로 가려 가며 위치를 기억
    let r = rest;
    const found: { at: number; v: string }[] = [];
    const take = (re: RegExp, fn: (m: RegExpMatchArray) => string[]) => {
      for (const m of [...r.matchAll(re)]) {
        fn(m).forEach((v, k) => { if (v) found.push({ at: (m.index || 0) + k / 100, v }); });
        r = r.slice(0, m.index) + ' '.repeat(m[0].length) + r.slice((m.index || 0) + m[0].length);
      }
    };
    // '3. (4, 5)' · '10. (7/11)' → 그 달의 여러 날
    take(/(\d{1,2})\s*[.월]\s*\(([\d,\s/]+)\)/g, (m) => m[2].split(/[,/]/).map((d) => iso(y, Number(m[1]), Number(d))));
    // '(6/ 6, 7, 9)' → 6월 6·7·9일
    take(/\((\d{1,2})\s*\/\s*([\d,\s]+)\)/g, (m) => m[2].split(',').map((d) => iso(y, Number(m[1]), Number(d))));
    take(/(\d{1,2})\s*[.월]\s*(\d{1,2})(?!\d)/g, (m) => [iso(y, Number(m[1]), Number(m[2]))]);
    // '2021. 3 7' (점 하나 빠짐)
    take(/^\s*(\d{1,2})\s+(\d{1,2})\s*$/g, (m) => [iso(y, Number(m[1]), Number(m[2]))]);
    found.sort((p1, p2) => p1.at - p2.at).forEach((f) => out.push(f.v));
  }
  return { year: firstYear, dates: [...new Set(out)] };
}

/** 생방 링크 아래 '(핫클립 부분 생방 2. 25)' · '(2019. 2. 25 영상: …)' · '(1. 17 : …)' 의 날짜 */
export function noteDate(note: string, year: number | null): string {
  const s = String(note || '').replace(ZW, ' ');
  const full = s.match(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)/);
  if (full) return iso(Number(full[1]), Number(full[2]), Number(full[3]));
  if (!year) return '';
  const md = s.match(/(?:^\(|\s|생방|^)\s*(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)(?!\s*초)/);
  return md ? iso(year, Number(md[1]), Number(md[2])) : '';
}

export function parseCafeBlocks(text: string): CafeBlock[] {
  const blocks: CafeBlock[] = [];
  let post = '';
  let cur: CafeBlock | null = null;
  let year: number | null = null;
  let section: 'live' | 'video' | 'shorts' | null = null;
  let last: CafeLink | (CafeLink & { note?: string }) | null = null;
  let lastKind: 'live' | 'video' | 'shorts' | null = null;
  const seen = new Set<string>();
  const close = () => { if (cur && (cur.lives.length || cur.videos.length || cur.shorts.length)) blocks.push(cur); cur = null; section = null; last = null; lastKind = null; seen.clear(); };

  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(ZW, ' ').trim();
    if (!line) return;
    if (line.startsWith('=====')) { close(); post = line.replace(/^=+\s*/, '').trim(); return; }
    const h = line.match(/^\[\s*생방\s*날짜\s*[:：]\s*([^\]]*)\]/);
    if (h) {
      close();
      const p = parseHeaderDates(h[1]);
      year = p.year;
      cur = { post, headerRaw: h[1].trim(), headerDates: p.dates, lives: [], videos: [], shorts: [] };
      return;
    }
    if (!cur) return;
    const b: CafeBlock = cur;
    // 글 끝의 안내(생방송 찾는 방법…)나 다음 달 머리말에서 묶음 끝
    if (/^<\s*생방송 찾는 방법|^<\s*\d{4}\s*\./.test(line)) { close(); return; }
    const head = line.replace(/[\s:：]/g, '');
    if (/^생방(송)?링크/.test(head) && !/https?:/.test(line)) { section = 'live'; return; }
    if (/^(영상|편집본|편집)링크/.test(head) && !/https?:/.test(line)) { section = 'video'; return; }
    if (/^(쇼츠|숏츠)링크/.test(head) && !/https?:/.test(line)) { section = 'shorts'; return; }
    const urls: string[] = line.match(URL_RE) || [];
    if (urls.length) {
      urls.forEach((u) => {
        const url = u.replace(/[.,\\]+$/, '');
        const id = youtubeIdOf(url);
        if (!id) return;
        if (seen.has(id)) return; // 미리보기(embed)로 같은 영상이 한 번 더 나옴
        seen.add(id);
        const k = /\/shorts\//.test(url) ? 'shorts' : section || (/\/live\//.test(url) ? 'live' : 'video');
        const clean = `https://youtu.be/${id}`;
        if (k === 'live') { const l = { id, url: clean }; b.lives.push(l); last = l; lastKind = 'live'; }
        else if (k === 'shorts') { const l = { id, url: clean }; b.shorts.push(l); last = l; lastKind = 'shorts'; }
        else { const l = { id, url: clean }; b.videos.push(l); last = l; lastKind = 'video'; }
      });
      return;
    }
    // 생방 링크 아래 괄호 설명: 그 생방의 날짜가 들어 있으면 씀
    if (lastKind === 'live' && last && /^\(/.test(line)) {
      const lv = last as CafeLink & { date?: string; note?: string };
      lv.note = line.slice(0, 120);
      let d = noteDate(line, year);
      // 연도 없이 '12. 18' 다음 '2. 1' 처럼 해가 바뀐 경우: 앞의 생방보다 반년 넘게 이르면 다음 해로
      if (d && !/\d{4}/.test(line)) {
        const prev = b.lives.map((x: any) => x.date).filter(Boolean).pop();
        if (prev && Date.parse(prev) - Date.parse(d) > 180 * 86400000) d = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
      }
      if (d) lv.date = d;
      return;
    }
    // 영상·쇼츠 아래 '[제목]'
    if ((lastKind === 'video' || lastKind === 'shorts') && last && !(last as CafeLink).title && /^\[.*\]$/.test(line)) {
      (last as CafeLink).title = line.slice(1, -1).trim();
    }
  });
  close();
  return blocks;
}

/**
 * 묶음들 → 날짜별(CafeDay) + 여러 날 생방 영상(multi) + 날짜 모름(unsure)
 * - 생방 날짜: 유튜브(API) 날짜 > 링크 아래 괄호 날짜 > 머리말 날짜 (생방 수와 날짜 수가 같으면 순서대로, 날짜가 하나면 모두 그날)
 * - 같은 영상이 여러 글에 나오면(웃음참기 모음 등) 생방을 합침
 * - before 보다 이전 날짜만 (기본 2026-01-01: 그 뒤는 사이트가 자동으로 기록)
 */
export function blocksToPlanInput(blocks: CafeBlock[], dateOfVideo: Map<string, string> = new Map(), before = '2026-01-01') {
  const days = new Map<string, CafeDay>();
  const day = (d: string) => { let x = days.get(d); if (!x) { x = { date: d, lives: [], videos: [], shorts: [], pairs: [] }; days.set(d, x); } return x; };
  const pushU = <T extends { id: string }>(list: T[], v: T) => { if (!list.some((x) => x.id === v.id)) list.push(v); };
  // 영상별로 모음 (여러 글에 같은 영상)
  type V = { video: CafeLink; lives: Map<string, { id: string; url: string; date: string }>; shorts: CafeLink[]; post: string; header: string; headerOnly: string };
  const byVideo = new Map<string, V>();
  const loose: { lives: { id: string; url: string; date: string }[]; shorts: CafeLink[]; header: string; post: string; headerOnly: string }[] = [];
  const unsure: CafeUnsure[] = [];

  blocks.forEach((b) => {
    const hd = b.headerDates;
    const lives = b.lives.map((l, i) => ({
      id: l.id, url: l.url,
      date: dateOfVideo.get(l.id) || l.date || (hd.length === b.lives.length ? hd[i] : hd.length === 1 ? hd[0] : '') || '',
    }));
    const headerOnly = hd.length === 1 ? hd[0] : '';
    if (!b.videos.length) { loose.push({ lives, shorts: b.shorts, header: b.headerRaw, post: b.post, headerOnly }); return; }
    b.videos.forEach((v, vi) => {
      const cur = byVideo.get(v.id) || { video: { ...v }, lives: new Map(), shorts: [], post: b.post, header: b.headerRaw, headerOnly };
      if (!cur.video.title && v.title) cur.video.title = v.title;
      lives.forEach((l) => { const old = cur.lives.get(l.id); if (!old || (!old.date && l.date)) cur.lives.set(l.id, l); });
      if (vi === 0) b.shorts.forEach((s) => pushU(cur.shorts, s));
      if (!cur.headerOnly && headerOnly) cur.headerOnly = headerOnly;
      byVideo.set(v.id, cur);
    });
  });

  const multis: CafeMulti[] = [];
  byVideo.forEach((v) => {
    const lives = [...v.lives.values()];
    const known = lives.filter((l) => l.date);
    const unknownLives = lives.filter((l) => !l.date);
    const dates = [...new Set(known.map((l) => l.date))].sort();
    const vDate = dateOfVideo.get(v.video.id) || '';
    if (dates.length >= 2) {
      // 여러 날 생방: 각 생방은 그날 기록에, 영상은 multi 로
      known.forEach((l) => { if (l.date < before) pushU(day(l.date).lives, { id: l.id, url: l.url }); });
      if (dates[0] < before) multis.push({ video: v.video, lives: known, post: v.post });
      if (v.shorts.length && dates[0] < before) v.shorts.forEach((s) => pushU(day(dates[0]).shorts, s));
      if (unknownLives.length) unsure.push({ video: v.video, lives: unknownLives, shorts: [], header: v.header, post: v.post, why: '생방 날짜를 모름' });
      return;
    }
    const d = dates[0] || v.headerOnly;
    if (!d) { unsure.push({ video: v.video, lives, shorts: v.shorts, header: v.header, post: v.post, why: lives.length ? '생방 날짜를 모름' : `생방 링크 없음${vDate ? ` (영상 올린 날 ${vDate})` : ''}` }); return; }
    if (d >= before) return;
    const x = day(d);
    const pairLives = lives.map((l) => ({ id: l.id, url: l.url }));
    const hit = x.pairs.find((p) => p.video.id === v.video.id);
    if (hit) pairLives.forEach((l) => pushU(hit.lives, l)); else x.pairs.push({ video: v.video, lives: pairLives });
    pushU(x.videos, v.video);
    pairLives.forEach((l) => pushU(x.lives, l));
    v.shorts.forEach((s) => pushU(x.shorts, s));
  });
  // 영상 없이 생방(·쇼츠)만 있는 묶음
  loose.forEach((g) => {
    g.lives.forEach((l) => {
      const d = l.date || g.headerOnly;
      if (!d) { unsure.push({ lives: [l], shorts: [], header: g.header, post: g.post, why: '생방 날짜를 모름' }); return; }
      if (d < before) pushU(day(d).lives, { id: l.id, url: l.url });
    });
    const sd = g.lives.find((l) => l.date)?.date || g.headerOnly;
    if (g.shorts.length) { if (sd) { if (sd < before) g.shorts.forEach((s) => pushU(day(sd).shorts, s)); } else unsure.push({ lives: [], shorts: g.shorts, header: g.header, post: g.post, why: '날짜를 모름' }); }
  });
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), multis, unsure };
}
