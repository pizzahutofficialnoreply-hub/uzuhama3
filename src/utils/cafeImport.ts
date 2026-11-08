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
export function planCafeImport(days: CafeDay[], logs: any[], titleOf: Map<string, string> = new Map()): { plans: CafePlan[]; skipped: string[]; already: number } {
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

  days.forEach((day) => {
    const dateLog = logs.find((l) => l.date === day.date && !l.isAbsence) || null;
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
      // 3) 둘 다 없음: 글의 날짜 기록으로
      if (linkAt.get(video.id)) { alreadyCount++; return; }
      const p = planFor(dateLog, day.date);
      if (!has(p.videos, video.id)) p.videos.push({ ...video, title: titleFor(video) });
      lives.forEach((lv) => {
        const lat = linkAt.get(lv.id);
        if (lat && (!dateLog || lat.id !== dateLog.id)) { skippedList.push(`생방 ${lv.id}: 이미 ${lat.date} 기록에 있어요`); return; }
        if (lat) { alreadyCount++; return; }
        if (!has(p.lives, lv.id)) p.lives.push(lv);
      });
    });
    // 영상 없이 생방 링크만 있는 날: 그날 기록에
    const paired = new Set(day.pairs.flatMap((p) => p.lives.map((l) => l.id)));
    day.lives.filter((l) => !paired.has(l.id)).forEach((live) => {
      const lat = linkAt.get(live.id);
      if (lat) { if (dateLog && lat.id === dateLog.id) alreadyCount++; else alreadyCount++; return; }
      const p = planFor(dateLog, day.date);
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
