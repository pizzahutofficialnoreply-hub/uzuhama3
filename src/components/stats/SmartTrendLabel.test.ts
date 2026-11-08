import { describe, expect, it } from 'vitest';
import { pickTrendLabels } from './SmartTrendLabel';

describe('공유 이미지 이름표 고르기', () => {
  it('같은 값이 이어지면 첫 점만, 꺾이는 점, 끝 점', () => {
    const v = [0, 4, 4, 4, 3, 3, 5, 5, 2, 0, 0, 0, 0];
    const m = pickTrendLabels(v, 1);
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([0, 1, 4, 6, 9, 12]);
    expect(m.get(4)).toBe('down');
    expect(m.get(6)).toBe('up');
  });
  it('가까우면 큰 변화 쪽만', () => {
    const v = [3, 4, 3, 4, 3, 9, 3];
    const m = pickTrendLabels(v, 3);
    expect(m.has(5)).toBe(true);
    const ks = [...m.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ks.length; i++) expect(ks[i] - ks[i - 1]).toBeGreaterThanOrEqual(3);
  });
});
