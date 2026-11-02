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
export type CafeDay = { date: string; lives: CafeLink[]; videos: CafeLink[]; shorts: CafeLink[] };

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
      cur = days.get(d) || { date: d, lives: [], videos: [], shorts: [] };
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
      if (kind === 'live') add(cur!.lives, { id, url });
      else if (kind === 'shorts' || isShortUrl) lastVideo = add(cur!.shorts, { id, url });
      else lastVideo = add(cur!.videos, { id, url });
    });
  });

  return [...days.values()]
    .filter((d) => d.lives.length || d.videos.length || d.shorts.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}
