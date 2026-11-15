import { youtubeIdOf } from './cafeImport';

/** 관리자 '카페 기준으로 맞추기' 목록(/data/cafe_fix.json)의 한 줄씩: 확인·설명·메모리에서 고치기 */
type Base = { why: string; group?: string };
export type Op = Base & (
  | { t: 'setVod'; log: string; date: string; from: string; to: string }
  | { t: 'shorts'; id: string; title: string; add: string[]; remove: string[] }
  | { t: 'removeEdited'; log: string; id: string }
  | { t: 'multi'; id: string; title: string; logs: string[]; placeholderTitle: string }
  | { t: 'add'; kind: 'edited' | 'shorts'; id: string; title: string; to: string }
  | { t: 'move'; kind: 'edited' | 'shorts'; id: string; title: string; from: string[]; to: string }
  | { t: 'setDate'; log: string; from: string; to: string; fromTime?: string; time?: string }
  | { t: 'retitle'; log: string; titles: Record<string, string> }
  | { t: 'fillUrl'; log: string; kind: 'edited' | 'shorts'; title: string; id: string; newTitle: string }
  | { t: 'dropBlank'; log: string; kind: 'edited' | 'shorts'; title: string }
  | { t: 'errorStop'; log: string; main?: string; vod?: string }
);

export const GROUPS: Record<string, { name: string; on: boolean; note?: string }> = {
  '': { name: '이츠하마타임 글 기준 (처음 목록)', on: true },
  date: { name: '날짜·시작 시각을 유튜브 생방 시작 시각으로', on: true, note: '자정 넘어 시작했으면 그다음 날 (방송을 둘로 나누지는 않음)' },
  link: { name: '영상·쇼츠 연동을 카페 기준으로', on: true, note: '2024.7.20부터 이츠하마타임 글, 그 전은 예전 생방 정리 글 · 생방이 여러 개면 여러 날 생방으로' },
  title: { name: '영상 제목을 유튜브 제목으로', on: true, note: '스프레드시트에 줄여 적힌 제목 등 (몰아보기 제목은 그대로)' },
  blank: { name: '링크 없이 제목만 있는 칸 정리', on: true, note: '같은 영상이 링크로 있으면 빼고, 유튜브에서 찾으면 링크를 채움' },
  blankNone: { name: '유튜브 채널에 없는 제목만 있는 칸 빼기', on: true },
  add: { name: '빠진 영상·여러 날 생방 넣기', on: true },
  move: { name: '다른 날에 있는 것 옮기기', on: true },
  sheet: { name: '스프레드시트와 카페가 다른 것', on: true },
  err: { name: '30분 안에 끊기고 바로 다시 켠 생방을 방송 오류로', on: true, note: '관리자 › 끊긴 생방에서 풀 수 있음' },
};

export const yid = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
// 몰아보기·여러 날 생방으로 연결된 칸은 직접 만든 것이라 '빼기'에서 건드리지 않음
export const isLinked = (x: any) => Boolean(x?.isCompilation || x?.compilationId || x?.multiId);
export const opKey = (o: Op, i: number) => `${o.t}:${i}`;
export const postTitle = (why: string) => (why.match(/\[(.+)\]/)?.[1] || why).slice(0, 40);
const short = (t: string) => (t || '').replace(/\s*#shorts/i, '').slice(0, 40);
const has = (l: any, k: string, id: string) => (l?.[k] || []).some((x: any) => yid(x) === id);
export const logIds = (o: Op): string[] => {
  if (o.t === 'shorts') return [...o.add, ...o.remove];
  if (o.t === 'multi') return o.logs;
  if (o.t === 'add') return [o.to];
  if (o.t === 'move') return [...o.from, o.to];
  return [(o as any).log];
};

export function isDone(o: Op, logs: Record<string, any>, comps?: Set<string>): boolean {
  const L = (id: string) => logs[id] || {};
  if (o.t === 'setVod') return has(L(o.log), 'vods', o.to) && !has(L(o.log), 'vods', o.from);
  if (o.t === 'shorts') return o.add.every((id) => has(L(id), 'shorts', o.id)) && o.remove.every((id) => !has(L(id), 'shorts', o.id));
  if (o.t === 'removeEdited') return !(L(o.log).edited || []).some((x: any) => yid(x) === o.id && !isLinked(x));
  if (o.t === 'add') return has(L(o.to), o.kind, o.id);
  if (o.t === 'setDate') return L(o.log).date === o.to && (!o.time || !L(o.log).time || L(o.log).time === o.time);
  if (o.t === 'retitle') return Object.entries(o.titles).every(([id, t]) => ['edited', 'shorts'].every((k) => (L(o.log)[k] || []).every((x: any) => yid(x) !== id || x.isCompilation || x.title === t)));
  if (o.t === 'fillUrl') return has(L(o.log), o.kind, o.id) && !(L(o.log)[o.kind] || []).some((x: any) => !x?.url && x?.title === o.title);
  if (o.t === 'dropBlank') return !(L(o.log)[o.kind] || []).some((x: any) => !x?.url && x?.title === o.title);
  if (o.t === 'errorStop') return o.main ? L(o.log).errorStopOf === o.main : (L(o.log).vods || []).some((v: any) => yid(v) === o.vod && v.errorStop);
  if (o.t === 'move') return has(L(o.to), o.kind, o.id) && o.from.every((id) => !(L(id)[o.kind === 'shorts' ? 'edited' : 'shorts'] || []).some((x: any) => yid(x) === o.id && !isLinked(x)) && (id === o.to || !(L(id)[o.kind] || []).some((x: any) => yid(x) === o.id && !isLinked(x))));
  // 여러 날 생방: 각 기록의 연결 + 몰아보기 문서(compilations)까지 있어야 끝 (빈 제목 칸이 남아 있어도 아직)
  return (!comps || comps.has(`multi_${o.id}`)) && o.logs.every((id) => (L(id).edited || []).some((e: any) => yid(e) === o.id && e.multiId) && !(L(id).edited || []).some((e: any) => !e?.url && e?.title === o.placeholderTitle));
}

export function describe(o: Op, logs: Record<string, any>): string {
  const d = (id: string) => logs[id]?.date || id;
  if (o.t === 'setVod') return `${o.date} 기록의 생방 링크가 다른 날 것 → 카페에 적힌 생방으로 바꾸기 (「${postTitle(o.why)}」)`;
  if (o.t === 'shorts') {
    const parts = [o.remove.length ? `${o.remove.map(d).join(', ')}에서 빼고` : '', `${o.add.map(d).join(', ')}에 넣기`].filter(Boolean).join(' ');
    return `쇼츠 「${short(o.title)}」 ${parts}`;
  }
  if (o.t === 'removeEdited') return `${d(o.log)} 기록에 따로 한 번 더 들어간 「${postTitle(o.why)}」 빼기 (몰아보기 연결은 그대로)`;
  if (o.t === 'add') return `${o.kind === 'shorts' ? '쇼츠' : '영상'} 「${short(o.title)}」 ${d(o.to)} 생방에 넣기 — ${o.why}`;
  if (o.t === 'move') return `${o.kind === 'shorts' ? '쇼츠' : '영상'} 「${short(o.title)}」 ${o.from.map(d).join(', ')} → ${d(o.to)} — ${o.why}`;
  if (o.t === 'setDate') return o.from === o.to ? `${o.from} 시작 ${o.fromTime || '-'} → ${o.time} (${o.why})` : `${o.from}${o.fromTime ? ` ${o.fromTime}` : ''} 기록 → ${o.to} ${o.time || ''} (${o.why})`;
  if (o.t === 'retitle') return `${d(o.log)} 제목 ${Object.keys(o.titles).length}개: ${Object.values(o.titles).map((t) => `「${short(t)}」`).join(' ')}`;
  if (o.t === 'fillUrl') return `${d(o.log)} 「${short(o.title)}」 칸에 링크 채우기 — ${o.why}`;
  if (o.t === 'dropBlank') return `${d(o.log)} 「${short(o.title)}」 빈 칸 빼기 — ${o.why}`;
  if (o.t === 'errorStop') return `${o.why}`;
  return `「${o.title}」 영상 넣고 생방 ${o.logs.map(d).join(', ')}에 '여러 날 생방'으로 연결`;
}


/** 한 줄을 work(기록 id → 기록, 최신으로 새로 읽은 것)에 바로 반영. cur(id)는 그 기록을 '바뀜'으로 표시하고 돌려줌 */
export function applyOne(o: Op, work: Record<string, any>, cur: (id: string) => any, compDocs: any[]) {
  const itemOf = (id: string, kind: string) => Object.values(work).flatMap((x: any) => x[kind] || []).find((x: any) => yid(x) === id && !isLinked(x) && x.url);
  if (o.t === 'setVod') {
    const l = cur(o.log); l.vods = (l.vods || []).map((v: any) => (yid(v) === o.from ? { ...v, url: `https://youtu.be/${o.to}` } : v));
  } else if (o.t === 'shorts') {
    const prev = itemOf(o.id, 'shorts') || itemOf(o.id, 'edited');
    for (const id of o.remove) { const l = cur(id); l.shorts = (l.shorts || []).filter((x: any) => yid(x) !== o.id); l.edited = (l.edited || []).filter((x: any) => yid(x) !== o.id || isLinked(x)); }
    for (const id of o.add) {
      const l = cur(id);
      l.edited = (l.edited || []).filter((x: any) => yid(x) !== o.id || isLinked(x));
      if (!has(l, 'shorts', o.id)) l.shorts = [...(l.shorts || []), { ...(prev || {}), title: o.title || prev?.title, url: prev?.url || `https://youtu.be/${o.id}`, cafe: 1 }];
    }
  } else if (o.t === 'removeEdited') {
    const l = cur(o.log); l.edited = (l.edited || []).filter((x: any) => yid(x) !== o.id || isLinked(x));
  } else if (o.t === 'add') {
    const l = cur(o.to);
    if (!has(l, o.kind, o.id)) l[o.kind] = [...(l[o.kind] || []), { title: o.title, url: `https://youtu.be/${o.id}`, cafe: 1 }];
  } else if (o.t === 'move') {
    // 원래 항목(제목·카테고리 등)을 그대로 옮김. 쇼츠↔영상이 잘못 들어간 것도 바로잡음
    const other = o.kind === 'shorts' ? 'edited' : 'shorts';
    const prev = itemOf(o.id, o.kind) || itemOf(o.id, other);
    for (const id of o.from) {
      const l = cur(id);
      l[other] = (l[other] || []).filter((x: any) => yid(x) !== o.id || isLinked(x));
      if (id !== o.to) l[o.kind] = (l[o.kind] || []).filter((x: any) => yid(x) !== o.id || isLinked(x));
    }
    const l = cur(o.to);
    if (!has(l, o.kind, o.id)) l[o.kind] = [...(l[o.kind] || []), { ...(prev || {}), title: o.title || prev?.title, url: prev?.url || `https://youtu.be/${o.id}` }];
  } else if (o.t === 'setDate') {
    const l = cur(o.log);
    if (l.date !== o.from) throw new Error(`지금 날짜가 ${l.date}라서 건너뜀`);
    l.date = o.to; if (o.time) l.time = o.time;
  } else if (o.t === 'retitle') {
    const l = cur(o.log);
    (['edited', 'shorts'] as const).forEach((k) => { l[k] = (l[k] || []).map((x: any) => { const t = o.titles[yid(x)]; return t && !x.isCompilation ? { ...x, title: t } : x; }); });
  } else if (o.t === 'fillUrl') {
    const l = cur(o.log);
    const already = has(l, o.kind, o.id);
    l[o.kind] = (l[o.kind] || []).flatMap((x: any) => (!x?.url && x?.title === o.title ? (already ? [] : [{ ...x, title: o.newTitle || x.title, url: `https://youtu.be/${o.id}` }]) : [x]));
  } else if (o.t === 'errorStop') {
    const l = cur(o.log);
    if (o.main) l.errorStopOf = o.main; else l.vods = (l.vods || []).map((v: any) => (yid(v) === o.vod ? { ...v, errorStop: true } : v));
  } else if (o.t === 'dropBlank') {
    const l = cur(o.log); l[o.kind] = (l[o.kind] || []).filter((x: any) => x?.url || x?.title !== o.title);
  } else {
    const ls = o.logs.map(cur);
    const compId = `multi_${o.id}`;
    const url = `https://youtu.be/${o.id}`;
    const dates = ls.map((l: any) => l.date).sort();
    const createdAt = new Date().toISOString();
    const before = itemOf(o.id, 'edited');
    compDocs.push({ id: compId, kind: 'multi', title: o.title, url, createdAt, gameSortOrder: 'custom', source: 'cafe', broadcasts: ls.map((l: any) => ({ logId: l.id, date: l.date, games: [] })) });
    for (const l of ls) {
      // 이미 있는 같은 영상(다른 날에 일반 영상으로 있던 것 포함)·제목만 있고 주소가 빈 칸을 이 연결로 바꿈
      const prev = (l.edited || []).find((e: any) => yid(e) === o.id && !e.isCompilation) || (l.edited || []).find((e: any) => !e?.url && e?.title === o.placeholderTitle) || before;
      const link = { ...(prev || {}), title: o.title || prev?.title, url, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt, cafe: prev && !prev.cafe ? 'multi' : 1 };
      l.edited = [link, ...(l.edited || []).filter((e: any) => e !== prev && yid(e) !== o.id && !(!e?.url && e?.title === o.placeholderTitle))];
    }
  }
}
