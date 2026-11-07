/**
 * AI 검색 요청 (서버: /api/videos/search-index?ai=search&q=)
 * - 서버가 키워드로 1단계 거른 뒤 장면 단위로 점수를 매겨 최대 8개만 돌려줌. 같은 검색어는 기기에서 10분 재사용
 */
export type AiResult = { id: string; title: string; kind?: string; publishedAt?: string; summary?: string; scenes: { t: number; d: string; vague?: boolean }[]; games?: string[]; partial?: boolean; score: number };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const mem = new Map<string, { at: number; r: AiResult[]; ex: string[] }>();
/** 마지막 검색에서 AI 가 넓힌 말 (예: 갑툭튀 → 점프스케어) */
export const lastExpanded = new Map<string, string[]>();

export async function aiSearch(q: string): Promise<AiResult[]> {
  const key = q.trim().toLowerCase();
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.r;
  try {
    const r = await fetch(`${API_BASE}/api/videos/search-index?ai=search&q=${encodeURIComponent(q.trim())}`);
    const j = await r.json();
    const out: AiResult[] = Array.isArray(j?.results) ? j.results : [];
    const ex: string[] = Array.isArray(j?.expanded) ? j.expanded : [];
    mem.set(key, { at: Date.now(), r: out, ex });
    lastExpanded.set(key, ex);
    return out;
  } catch {
    return [];
  }
}

export const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/** '1:23', '1:02:03', '83', '1분 23초' → 초 */
export function parseTime(v: string): number | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const k = s.match(/^(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?$/);
  if (k && (k[1] || k[2] || k[3])) return (+k[1] || 0) * 3600 + (+k[2] || 0) * 60 + (+k[3] || 0);
  if (/^\d+(:\d{1,2}){0,2}$/.test(s)) return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  return null;
}

/** 유튜브 주소의 t= / start= */
export function timeFromUrl(url: string): number | null {
  const m = String(url || '').match(/[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/);
  if (!m) return null;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
}

/** 후보 장면을 AI 가 영상에서 직접 확인 (서버가 검색어·영상별로 저장해 둬서 두 번째부터는 바로) */
export type AiVerify = { verified: { id: string; title: string; kind?: string; moments: { t: number; d: string }[] }[]; rejected: string[]; pending: string[]; limited?: boolean };
const vmem = new Map<string, AiVerify>();
let verifyOff = false;
export async function aiVerify(q: string): Promise<AiVerify | null> {
  if (verifyOff) return null;
  const key = q.trim().toLowerCase();
  if (vmem.has(key)) return vmem.get(key)!;
  try {
    const r = await fetch(`${API_BASE}/api/videos/search-index?ai=verify&q=${encodeURIComponent(q.trim())}`, { signal: AbortSignal.timeout(150000) });
    const j = await r.json();
    if (j.disabled) { verifyOff = true; return null; }
    const out: AiVerify = { verified: j.verified || [], rejected: j.rejected || [], pending: j.pending || [], limited: j.limited };
    if (!out.pending.length) vmem.set(key, out);
    return out;
  } catch {
    return null;
  }
}
