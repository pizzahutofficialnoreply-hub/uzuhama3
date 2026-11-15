import { describe, expect, it } from 'vitest';
import { findErrorStops, mergeErrorStops } from './streamErrors';

const h = 3600e3;
describe('끊긴 생방', () => {
  it('30분 이하로 끝나고 2시간 안에 1시간 넘게 다시 켜면 앞의 것은 방송 오류', () => {
    const c = findErrorStops([
      { id: 'a', logId: 'L1', start: 0, durationSec: 5 * 60 },
      { id: 'b', logId: 'L2', start: 0.2 * h, durationSec: 3 * 3600 },
      { id: 'c', logId: 'L3', start: 30 * h, durationSec: 10 * 60 },
      { id: 'd', logId: 'L4', start: 40 * h, durationSec: 3 * 3600 }, // 10시간 뒤라 따로
    ]);
    expect(c.map((x) => x.short.id)).toEqual(['a']);
    expect(c[0].sameLog).toBe(false);
  });
  it('따로 기록된 짧은 방송은 이어서 켠 방송에 합쳐 보임', () => {
    const d = mergeErrorStops({ logs: {
      s: { id: 's', date: '2020-01-01', time: '20:00', errorStopOf: 'm', vods: [{ url: 'https://youtu.be/aaaaaaaaaaa' }] },
      m: { id: 'm', date: '2020-01-01', time: '20:10', vods: [{ url: 'https://youtu.be/bbbbbbbbbbb' }] },
    } });
    expect(Object.keys(d.logs)).toEqual(['m']);
    expect(d.logs.m.time).toBe('20:00');
    expect((d.logs.m.vods[0] as any).errorStop).toBe(true);
    expect(d.logs.m.vods).toHaveLength(2);
  });
});
