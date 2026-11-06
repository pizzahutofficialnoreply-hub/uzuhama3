/**
 * 맞춤 추천용 관심 기록 (이 기기 안에만 저장, 서버로 보내지 않음)
 *
 * 영상을 '틀지는 않았지만 관심 있어 보이는' 행동을 모아 게임·장르별 점수를 만듦
 *  - 화면에서 스크롤을 멈추고 카드를 2.5초 이상 봄           → 조금
 *  - (PC) 카드 위에 마우스를 1.5초 이상 올려 둠               → 조금
 *  - 쇼츠·편집본 목록 펼치기, 공유, 날짜 눌러 보기 등 손을 댐   → 중간
 *  - 실제로 재생(영상 보기·쇼츠 열기)                          → 크게 + '본 영상' 으로 기록
 *  - 화면에 여러 번 나왔는데 아무 반응이 없으면               → 그 영상만 조금씩 뒤로
 * 점수는 하루에 3%씩 옅어져서 요즘 관심이 더 크게 반영됨
 */

import { clearWatchEntries, recordWatch } from './watchHistory';

export type InterestKind = 'video' | 'short' | 'live';
export type InterestItem = { id: string; kind: InterestKind; tokens: string[]; /** 시청 기록에 보일 제목 */ title?: string };
export type InterestSignal = 'dwell' | 'dwell-long' | 'hover' | 'engage' | 'play';

type Store = {
  v: 1;
  tokens: Record<string, number>; // 게임·장르별 관심 점수
  kinds: Record<InterestKind, number>; // 영상/쇼츠/라이브 중 무엇을 더 보는지
  items: Record<string, { imp: number; score: number; last: number }>; // 영상별: 노출 수, 반응 점수
  watched: Record<string, number>; // 본 영상 → 시각
  labels?: Record<string, string>; // 토큰 → 원래 표기 (설정 화면 표시용)
  decayedAt: number;
};

const KEY = 'uzuhama_interest_v1';
const WEIGHT: Record<InterestSignal, number> = { dwell: 0.4, 'dwell-long': 0.8, hover: 0.5, engage: 1.5, play: 3 };
const DAY = 86400000;

let cache: Store | null = null;

function empty(): Store {
  return { v: 1, tokens: {}, kinds: { video: 0, short: 0, live: 0 }, items: {}, watched: {}, decayedAt: Date.now() };
}

export function loadInterest(): Store {
  if (cache) return cache;
  let s: Store = empty();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === 1) s = { ...empty(), ...raw };
  } catch { /* 처음이거나 저장 불가 */ }
  // 하루 3%씩 옅어짐
  const days = Math.floor((Date.now() - (s.decayedAt || Date.now())) / DAY);
  if (days > 0) {
    const f = Math.pow(0.97, days);
    Object.keys(s.tokens).forEach((k) => { s.tokens[k] *= f; if (s.tokens[k] < 0.05) delete s.tokens[k]; });
    (Object.keys(s.kinds) as InterestKind[]).forEach((k) => { s.kinds[k] *= f; });
    s.decayedAt = Date.now();
  }
  cache = s;
  return s;
}

let saveTimer: number | undefined;
function save() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = loadInterest();
    // 너무 커지지 않게: 오래된 영상 기록 정리
    const ids = Object.keys(s.items);
    if (ids.length > 3000) ids.sort((a, b) => s.items[a].last - s.items[b].last).slice(0, ids.length - 2500).forEach((id) => delete s.items[id]);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 공간 없음 */ }
  }, 800);
}

/** 관심 행동 하나 기록 */
export function recordInterest(item: InterestItem, signal: InterestSignal) {
  if (!item?.id || isInterestPaused()) return;
  const s = loadInterest();
  const w = WEIGHT[signal];
  const it = s.items[item.id] || { imp: 0, score: 0, last: 0 };
  // 같은 영상에서 같은 종류 신호가 몇 초 안에 반복되면 한 번만
  if (signal !== 'play' && Date.now() - it.last < 4000 && it.score >= w) return;
  it.score += w;
  it.last = Date.now();
  s.items[item.id] = it;
  const toks = [...new Set(item.tokens.filter(Boolean))];
  toks.forEach((t) => {
    s.tokens[t] = (s.tokens[t] || 0) + w / Math.sqrt(toks.length || 1);
    const label = LABELS.get(t);
    if (label) (s.labels ||= {})[t] = label;
  });
  s.kinds[item.kind] = (s.kinds[item.kind] || 0) + w;
  if (signal === 'play') { s.watched[item.id] = Date.now(); recordWatch({ id: item.id, kind: item.kind, title: item.title }); }
  save();
}

/** 화면에 한 번 나옴 (반응이 없으면 그 영상만 조금씩 뒤로) */
export function recordImpression(id: string) {
  if (!id || isInterestPaused()) return;
  const s = loadInterest();
  const it = s.items[id] || { imp: 0, score: 0, last: 0 };
  it.imp += 1;
  it.last = it.last || Date.now();
  s.items[id] = it;
  save();
}

/** 관심 기록이 추천에 쓸 만큼 쌓였는지 */
export function hasInterestProfile(s: Store = loadInterest()) {
  return Object.values(s.tokens).reduce((a, b) => a + b, 0) >= 2;
}

/**
 * 영상 하나의 맞춤 점수
 * - 관심 게임·장르가 겹칠수록 높음 (가장 관심 큰 것 대비 비율)
 * - 이미 본 영상은 크게 낮춤 (최근일수록 더)
 * - 여러 번 보였는데 반응이 없던 영상은 조금 낮춤
 */
export function interestScore(item: InterestItem, s: Store = loadInterest()): number {
  const max = Math.max(1e-6, ...Object.values(s.tokens));
  const toks = [...new Set(item.tokens.filter(Boolean))];
  let match = 0;
  toks.forEach((t) => { match += (s.tokens[t] || 0) / max; });
  match = toks.length ? match / Math.sqrt(toks.length) : 0;
  const kindMax = Math.max(1e-6, ...Object.values(s.kinds));
  const kindBoost = 0.15 * ((s.kinds[item.kind] || 0) / kindMax);
  const watchedAt = s.watched[item.id];
  const watchedPenalty = watchedAt ? (Date.now() - watchedAt < 3 * DAY ? 3 : 1.5) : 0;
  const it = s.items[item.id];
  const fatigue = it && it.score < 0.5 ? Math.min(1, Math.max(0, it.imp - 3) * 0.15) : 0;
  return match + kindBoost - watchedPenalty - fatigue;
}

/** 관심 있는 게임·장르가 하나도 겹치지 않는 영상인지 (새로운 걸 섞어 보여 줄 때) */
export function isUnexplored(item: InterestItem, s: Store = loadInterest()) {
  return !item.tokens.some((t) => (s.tokens[t] || 0) > 0.2);
}

/** 영상 정보 → 관심 토큰 (게임 이름, 장르) */
const LABELS = new Map<string, string>();
export function tokensOf(games: any[] = [], extra: (string | undefined)[] = []): string[] {
  const out: string[] = [];
  games.forEach((g: any) => {
    const name = String((typeof g === 'string' ? g : g?.name) || '').trim();
    if (name) { const t = `g:${name.toLowerCase()}`; out.push(t); if (!LABELS.has(t)) LABELS.set(t, name); }
    String((typeof g === 'string' ? '' : g?.category) || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => out.push(`c:${c}`));
  });
  extra.forEach((e) => String(e || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => out.push(`c:${c}`)));
  return [...new Set(out)];
}

/** 맞춤 순서로 섞기: 점수순 + 4개마다 하나는 아직 안 본 쪽(새로운 게임) */
export function personalize<T>(list: T[], itemOf: (x: T) => InterestItem, s: Store = loadInterest()): T[] {
  if (!hasInterestProfile(s)) return list;
  const scored = list.map((x, i) => ({ x, i, it: itemOf(x), sc: interestScore(itemOf(x), s) }));
  const main = scored.filter((o) => !isUnexplored(o.it, s)).sort((a, b) => b.sc - a.sc || a.i - b.i);
  const fresh = scored.filter((o) => isUnexplored(o.it, s)).sort((a, b) => b.sc - a.sc || a.i - b.i);
  // 관심 쪽을 거의 다 봤으면(점수가 바닥) 새로운 쪽이 앞으로
  const out: T[] = [];
  let mi = 0, fi = 0;
  while (mi < main.length || fi < fresh.length) {
    const takeFresh = fi < fresh.length && (mi >= main.length || (out.length + 1) % 4 === 0 || main[mi].sc < 0);
    if (takeFresh) out.push(fresh[fi++].x); else out.push(main[mi++].x);
  }
  return out;
}

// ── 설정: 일시 중지 · 지우기 ──
const PAUSE_KEY = 'uzuhama_interest_paused';

/** 기록 일시 중지 중인지 (중지해도 지금까지의 기록으로 추천은 계속) */
export function isInterestPaused(): boolean {
  try { return localStorage.getItem(PAUSE_KEY) === '1'; } catch { return false; }
}
export function setInterestPaused(paused: boolean) {
  try { if (paused) localStorage.setItem(PAUSE_KEY, '1'); else localStorage.removeItem(PAUSE_KEY); } catch { /* 무시 */ }
}

function persistNow() {
  try { localStorage.setItem(KEY, JSON.stringify(loadInterest())); } catch { /* 무시 */ }
}

/** 시청 기록만 지움 (본 영상 표시가 사라져 다시 추천될 수 있음) */
export function clearWatchHistory() {
  const s = loadInterest();
  s.watched = {};
  persistNow();
  clearWatchEntries();
  try { localStorage.removeItem('userVideoHistory'); } catch { /* 무시 */ }
}

/** 관심 기록 전부 초기화 (게임·장르 점수, 노출 기록, 시청 기록) */
export function clearInterest() {
  cache = empty();
  persistNow();
  clearWatchEntries();
  try { localStorage.removeItem('userVideoHistory'); } catch { /* 무시 */ }
}

/** 설정 화면용 요약: 본 영상 수, 관심 큰 게임·장르 */
export function interestSummary(top = 5): { watched: number; games: string[]; genres: string[] } {
  const s = loadInterest();
  const sorted = Object.entries(s.tokens).sort((a, b) => b[1] - a[1]);
  return {
    watched: Object.keys(s.watched).length,
    games: sorted.filter(([k]) => k.startsWith('g:')).slice(0, top).map(([k]) => s.labels?.[k] || LABELS.get(k) || k.slice(2)),
    genres: sorted.filter(([k]) => k.startsWith('c:')).slice(0, top).map(([k]) => k.slice(2)),
  };
}
