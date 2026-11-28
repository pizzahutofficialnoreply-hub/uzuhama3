import { describe, it, expect } from 'vitest';
import { pickEdit, fixGameName, gameDatesOf } from './compilationPick';
import fx from './__fixtures__/compilation.json';
import { extractYoutubeId } from './urlUtils';

describe('몰아보기 방송마다 맞는 편집 영상 고르기 (실제 데이터)', () => {
  const gd = gameDatesOf(fx.broadcasts as any);
  for (const c of fx.cases as any[]) {
    it(`${c.date} ${c.targets.join(',')}`, () => {
      const e = pickEdit(c.edits, c.targets.map(fixGameName), c.logGames, gd, c.date);
      expect(extractYoutubeId(e?.url)).toBe(c.want);
    });
  }
});

describe('깨진 게임 이름', () => {
  it('엑셀 시각 → 원래 이름', () => { expect(fixGameName('0.4576388888888889')).toBe('10:59'); });
  it('보통 이름은 그대로', () => { expect(fixGameName('NIGHT BUS')).toBe('NIGHT BUS'); expect(fixGameName('0.5층')).toBe('0.5층'); });
});

import { mergeLegacyArchiveCopy } from './archiveOverlay';
describe('예전 사본의 방송 시각', () => {
  it('원본에 시각이 없으면 사본 값으로 채움', () => {
    const m = mergeLegacyArchiveCopy({ id: 'a', date: '2021-04-30', time: '', durationHours: 0 }, { time: '17:02', endTime: '19:25', durationHours: 2.4 });
    expect([m.time, m.endTime, m.durationHours]).toEqual(['17:02', '19:25', 2.4]);
  });
  it('원본에 있으면 원본 그대로', () => {
    const m = mergeLegacyArchiveCopy({ id: 'a', date: 'x', time: '20:00', durationHours: 3 }, { time: '17:02', durationHours: 2.4 });
    expect([m.time, m.durationHours]).toEqual(['20:00', 3]);
  });
});
