/**
 * 시청자 추천 ('이 영상 추천하기')
 *  - 내가 추천한 영상: 이 기기에 저장 (다시 누르면 취소)
 *  - 모두의 추천 수: 서버에서 10분마다 갱신되는 숫자를 받아 둠 (1시간 보관)
 *  - 추천 탭·추천 쇼츠·추천 라이브에서 추천이 많은 영상을 조금 더 앞으로
 */
const API_BASE = ((import.meta as any).env?.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');

const MINE = 'uzuhama_my_recs';
const CNT = 'uzuhama_rec_counts';
const DEV = 'uzuhama_dev';
const listeners = new Set<() => void>();
export function onRecs(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = () => listeners.forEach((f) => f());

function dev(): string {
  try {
    let d = localStorage.getItem(DEV);
    if (!d) { d = (crypto as any).randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; localStorage.setItem(DEV, d!); }
    return d!;
  } catch { return ''; }
}
function mine(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(MINE) || '[]')); } catch { return new Set(); } }
export function isRecommended(id: string) { return mine().has(id); }

let counts: Record<string, number> = (() => { try { const v = JSON.parse(localStorage.getItem(CNT) || 'null'); return v?.counts || {}; } catch { return {}; } })();
let countsAt = (() => { try { return Number(JSON.parse(localStorage.getItem(CNT) || 'null')?.at || 0); } catch { return 0; } })();
let fetching = false;
export function recCount(id: string) { return Math.max(0, Number(counts[id] || 0)); }
/** 모두의 추천 수 받아 두기 (1시간에 한 번) */
export function loadRecCounts() {
  if (fetching || Date.now() - countsAt < 3600000) return;
  fetching = true;
  fetch(`${API_BASE}/api/videos/search-index?recs=1`).then((r) => r.json()).then((j) => {
    if (j && typeof j.counts === 'object') { counts = j.counts; countsAt = Date.now(); try { localStorage.setItem(CNT, JSON.stringify({ counts, at: countsAt })); } catch { /* */ } emit(); }
  }).catch(() => {}).finally(() => { fetching = false; });
}

/** 추천하기 · 다시 누르면 취소 → 바뀐 상태(true = 추천함) */
export function toggleRecommend(id: string): boolean {
  const m = mine();
  const on = !m.has(id);
  if (on) m.add(id); else m.delete(id);
  try { localStorage.setItem(MINE, JSON.stringify([...m].slice(-500))); } catch { /* */ }
  counts = { ...counts, [id]: Math.max(0, (counts[id] || 0) + (on ? 1 : -1)) };
  emit();
  fetch(`${API_BASE}/api/videos/search-index?rec=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, on, dev: dev() }) }).catch(() => {});
  return on;
}

/** 추천이 많을수록 조금 앞으로: 추천 수가 두 배가 될 때마다 약 6칸 (관심 순서는 거의 그대로) */
export const hasRecCounts = () => Object.keys(counts).length > 0;

export function boostByRecs<T>(list: T[], idOf: (x: T) => string): T[] {
  if (!Object.keys(counts).length) return list;
  return list.map((x, i) => ({ x, k: i - 6 * Math.log2(1 + recCount(idOf(x))) })).sort((a, b) => a.k - b.k).map((o) => o.x);
}
