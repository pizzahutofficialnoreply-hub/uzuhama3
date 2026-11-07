import { describe, expect, it } from 'vitest';
import { mergeState, type SyncState } from './deviceSync';

const T = (o: any = {}) => ({ h: {}, hClear: 0, l: {}, s: 0, ...o });
const st = (o: Partial<SyncState>): SyncState => ({ h: [], l: [], s: { list: [], at: 0 }, t: T(), ...o });

describe('기기 연결 합치기', () => {
  it('시청 기록: 영상마다 더 최근 것, 최신순', () => {
    const a = st({ h: [{ id: 'x', kind: 'video', title: 'X', at: 10, pos: 5 }, { id: 'y', kind: 'video', title: 'Y', at: 3 }] });
    const b = st({ h: [{ id: 'x', kind: 'video', title: 'X', at: 20, pos: 50 }, { id: 'z', kind: 'short', title: 'Z', at: 15 }] });
    const m = mergeState(a, b);
    expect(m.h.map((e) => e.id)).toEqual(['x', 'z', 'y']);
    expect(m.h[0].pos).toBe(50);
  });
  it('지운 기록은 다시 안 살아나고, 지운 뒤에 다시 본 건 살아남', () => {
    const a = st({ h: [{ id: 'x', kind: 'video', title: '', at: 10 }], t: T({ h: {} }) });
    const b = st({ h: [], t: T({ h: { x: 12 } }) });
    expect(mergeState(a, b).h).toHaveLength(0);
    const c = st({ h: [{ id: 'x', kind: 'video', title: '', at: 30 }] });
    expect(mergeState(c, b).h).toHaveLength(1);
    const d = st({ t: T({ hClear: 25 }) });
    expect(mergeState(st({ h: [{ id: 'q', kind: 'video', title: '', at: 20 }] }), d).h).toHaveLength(0);
  });
  it('재생목록: 목록마다 더 최근에 고친 것, 지운 목록은 빠짐', () => {
    const L = (id: string, u: number, n = 0) => ({ id, name: id, items: Array.from({ length: n }, (_, i) => ({ id: `v${i}`, kind: 'video' as const, title: '', addedAt: 1 })), createdAt: 1, updatedAt: u });
    const a = st({ l: [L('p1', 5, 1), L('p2', 5)] });
    const b = st({ l: [L('p1', 9, 3)], t: T({ l: { p2: 7 } }) });
    const m = mergeState(a, b);
    expect(m.l.map((x) => x.id)).toEqual(['p1']);
    expect(m.l[0].items).toHaveLength(3);
  });
  it('최근 검색어: 더 최근에 바뀐 쪽', () => {
    const m = mergeState(st({ s: { list: ['a'], at: 5 } }), st({ s: { list: ['b', 'c'], at: 9 } }));
    expect(m.s.list).toEqual(['b', 'c']);
  });
});
