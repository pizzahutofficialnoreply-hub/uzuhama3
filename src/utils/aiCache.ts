/**
 * AI 요약·스크립트를 기기(IndexedDB)에 저장해 두고 다시 열 때 서버를 안 부름
 * - 다 끝난 요약은 7일, 스크립트는 1일 보관 (스크립트는 아직 만드는 중일 수 있어서)
 * - 설정 › 새로고침이나 화면을 당겨 새로고침하면 저장해 둔 걸 버리고 새로 받음
 */
import { kvGet, kvSet } from './kv';

const CLEAR_KEY = 'uzuhama_ai_cache_clear_at';
export const markAiCacheStale = () => { try { localStorage.setItem(CLEAR_KEY, String(Date.now())); } catch { /* */ } };
const clearedAt = () => { try { return Number(localStorage.getItem(CLEAR_KEY) || 0); } catch { return 0; } };

export async function cachedJson<T>(key: string, maxAgeMs: number, load: () => Promise<T>, keep: (v: T) => boolean): Promise<T> {
  try {
    const hit = await kvGet<{ at: number; v: T }>(key);
    if (hit && hit.at > clearedAt() && Date.now() - hit.at < maxAgeMs) return hit.v;
  } catch { /* 저장소를 못 쓰면 그냥 받음 */ }
  const v = await load();
  try { if (keep(v)) await kvSet(key, { at: Date.now(), v }); } catch { /* */ }
  return v;
}
export async function putCached(key: string, v: any) { try { await kvSet(key, { at: Date.now(), v }); } catch { /* */ } }
