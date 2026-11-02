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
  return s.replace(/[​‌‍﻿ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function labelOf(line: string): 'live' | 'video' | 'shorts' | null {
  const t = line.replace(/\s+/g, '');
  if (/쇼츠|shorts/i.test(t) && !/https?:/.test(line)) return 'shorts';
  if (/생방(송)?(링크|다시보기|풀영상|원본)|다시보기|풀영상/.test(t)) return 'live';
  if (/(영상|편집본|편집영상)(링크)?[:：]?$|^영상링크|편집본/.test(t)) return 'video';
  return null;
}

/** 날짜로 쓸 수 있는 줄인지 (머리말의 '2017. 2018. 3월' 같은 건 제외) */
function dateOf(line: string): string | null {
  const m = DATE_RE.exec(line);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 2010 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // 날짜만 있는 줄이거나 '생방날짜/날짜/방송일' 이 붙은 줄만 (본문 중간 날짜는 무시)
  const rest = line.replace(m[0], '').replace(/[\[\]()<>:：\s]/g, '');
  if (rest && !/^(생방)?(날짜|방송일|일자)/.test(rest)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseCafePost(text: string): CafeDay[] {
  const days = new Map<string, CafeDay>();
  let cur = null as CafeDay | null;
  let label = null as 'live' | 'video' | 'shorts' | null;
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
    if (hit) return hit;
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
    urls.forEach((u) => {
      const url = u.replace(/[.,]+$/, '');
      const id = youtubeIdOf(url);
      if (!id) return; // 유튜브 링크만 (치지직 등은 아직 기록 형식이 달라 제외)
      const isShortUrl = /\/shorts\//.test(url);
      if (kind === 'live') { const l = add(cur!.lives, { id, url }); if (!blockLives.includes(l)) blockLives.push(l); }
      else if (kind === 'shorts' || isShortUrl) lastVideo = add(cur!.shorts, { id, url });
      else { lastVideo = add(cur!.videos, { id, url }); if (!blockVideos.includes(lastVideo)) blockVideos.push(lastVideo); }
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
  via: { title: string; postDate: string }[];
  notes: string[];
  status: 'new-log' | 'add';
};

/**
 * 영상 링크 기준으로 맞춤:
 * 1) 사이트에 이미 있는 영상이면 → 그 영상이 들어 있는 방송 기록에, 없는 생방 링크만 추가
 * 2) 사이트에 없는 영상이면 → 글의 날짜 기록에 영상·생방 추가 (그날 기록이 없으면 새 기록)
 * - 다른 기록에 이미 있는 링크는 넣지 않고 skipped 로 알려 줌
 */
export function planCafeImport(days: CafeDay[], logs: any[], titleOf: Map<string, string> = new Map()): { plans: CafePlan[]; skipped: string[]; already: number } {
    const editedAt = new Map<string, any>();
    const linkAt = new Map<string, any>();
    logs.forEach((l) => {
      (l.edited || []).forEach((e: any) => { const id = youtubeIdOf(e?.url || ''); if (id && !e.isCompilation && !e.compilationId && !editedAt.has(id)) editedAt.set(id, l); });
      [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].forEach((x: any) => { const id = youtubeIdOf(typeof x === 'string' ? x : x?.url || ''); if (id && !linkAt.has(id)) linkAt.set(id, l); });
    });
    const byKey = new Map<string, CafePlan>();
    const planFor = (log: any | null, date: string): CafePlan => {
      const key = log ? log.id : `new:${date}`;
      let p = byKey.get(key);
      if (!p) { p = { key, log, date: log?.date || date, lives: [], videos: [], shorts: [], via: [], notes: [], status: log ? 'add' : 'new-log' }; byKey.set(key, p); }
      return p;
    };
    const has = (list: CafeLink[], id: string) => list.some((x) => x.id === id);
    const skippedList: string[] = [];
    let alreadyCount = 0;

    days.forEach((day) => {
      const dateLog = logs.find((l) => l.date === day.date && !l.isAbsence) || null;
      day.pairs.forEach(({ video, lives }) => {
        const target = editedAt.get(video.id) || null;
        if (target) {
          lives.forEach((live) => {
            const at = linkAt.get(live.id);
            if (at && at.id === target.id) { alreadyCount++; return; }
            if (at) { skippedList.push(`생방 ${live.id}: 영상은 ${target.date} 기록에 있는데 이 생방 링크는 ${at.date} 기록에 있어요`); return; }
            const p = planFor(target, target.date);
            if (!has(p.lives, live.id)) p.lives.push(live);
            const t = (target.edited || []).find((e: any) => youtubeIdOf(e?.url || '') === video.id)?.title || titleOf.get(video.id) || video.title || video.id;
            if (!p.via.some((v) => v.title === t)) p.via.push({ title: t, postDate: day.date });
            if (day.date !== target.date) p.notes.push(`글의 날짜는 ${day.date}, 영상이 있는 기록은 ${target.date}`);
          });
          if (!lives.length) alreadyCount++;
          return;
        }
        // 사이트에 없는 영상: 글의 날짜 기록으로
        const at = linkAt.get(video.id);
        if (at) { alreadyCount++; return; }
        const p = planFor(dateLog, day.date);
        if (!has(p.videos, video.id)) p.videos.push({ ...video, title: titleOf.get(video.id) || video.title || '' });
        lives.forEach((live) => {
          const lat = linkAt.get(live.id);
          if (lat && (!dateLog || lat.id !== dateLog.id)) { skippedList.push(`생방 ${live.id}: 이미 ${lat.date} 기록에 있어요`); return; }
          if (lat) { alreadyCount++; return; }
          if (!has(p.lives, live.id)) p.lives.push(live);
        });
      });
      day.shorts.forEach((sh) => {
        if (linkAt.has(sh.id)) { alreadyCount++; return; }
        const p = planFor(dateLog, day.date);
        if (!has(p.shorts, sh.id)) p.shorts.push({ ...sh, title: titleOf.get(sh.id) || sh.title || '' });
      });
    });
    const list = [...byKey.values()].filter((p) => p.lives.length + p.videos.length + p.shorts.length > 0)
      .map((p) => ({ ...p, notes: [...new Set(p.notes)] }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { plans: list, skipped: skippedList, already: alreadyCount };
}
