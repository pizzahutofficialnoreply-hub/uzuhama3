import { describe, it, expect, vi } from 'vitest';
import { tuneSearch } from '../api/_searchTune';

function fakeDb(feedbacks: any[]) {
  const store: Record<string, any> = {};
  const docRef = (path: string) => ({
    get: async () => ({ exists: path in store, data: () => store[path] }),
    set: async (v: any, o?: any) => { store[path] = o?.merge ? { ...(store[path] || {}), ...v } : v; },
  });
  const q: any = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ docs: feedbacks.map((f, i) => ({ id: String(i), data: () => f })) }) };
  return { store, db: { collection: (c: string) => (c === 'feedbacks' ? q : { doc: (d: string) => docRef(`${c}/${d}`) }) } };
}

describe('검색 조정 규칙', () => {
  it('신고된 영상은 그 검색어에서, 같은 느낌 2번이면 느낌 전체에서 빠짐', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const ts = { toMillis: () => Date.now() };
    const { db, store } = fakeDb([
      { type: 'search_report', reason: 'not_match', videoId: 'AAAAAAAAAAA', query: '수면방송 추천해줘', concepts: ['잔잔한 방송'], createdAt: ts },
      { type: 'search_report', reason: 'not_match', videoId: 'AAAAAAAAAAA', query: '잠잘때 볼 거', concepts: ['잔잔한 방송'], createdAt: ts },
      { type: 'search_rating', good: false, query: '겨울 특집', createdAt: ts },
    ]);
    const r: any = await tuneSearch(db, { force: true });
    expect(r.reports).toBe(2);
    const t = store['config/searchTuning'];
    expect(t.demote['수면방송추천해줘']).toContain('AAAAAAAAAAA');
    expect(t.conceptDemote['잔잔한 방송']).toContain('AAAAAAAAAAA');
    expect(t.log[0].bad).toBe(1);
  });
});
