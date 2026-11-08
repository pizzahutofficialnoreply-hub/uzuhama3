import { describe, expect, it } from 'vitest';
import { pickTrendLabels } from './SmartTrendLabel';

describe('공유 이미지 이름표 고르기', () => {
  it('꺾이는 점은 전부, 같은 값이 이어지면 첫 점만, 끝 점', () => {
    const v = [0, 4, 4, 4, 3, 3, 5, 5, 2, 0, 0, 0, 0];
    const m = pickTrendLabels(v, 2);
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([0, 1, 4, 6, 9, 12]);
    expect(m.get(4)!.dir).toBe('down');
    expect(m.get(6)!.dir).toBe('up');
  });
  it('작은 꺾임도 빠지지 않고, 가까운 같은 쪽은 높이를 번갈아', () => {
    const v = [3, 4, 3, 4, 3, 9, 3];
    const m = pickTrendLabels(v, 2);
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(m.get(1)!.level).not.toBe(m.get(3)!.level);
  });
});
