import { describe, it, expect } from 'vitest';
import { currentSeason, isSeasonDate } from '../src/utils/seasonal';

describe('명절 특집 기간', () => {
  it('추석 며칠 전부터', () => {
    expect(currentSeason(new Date('2026-09-22T03:00:00Z'))?.key).toBe('추석');
    expect(currentSeason(new Date('2026-09-10T03:00:00Z'))).toBeNull();
  });
  it('크리스마스', () => {
    expect(currentSeason(new Date('2026-12-24T03:00:00Z'))?.key).toBe('성탄절');
  });
  it('예전 추석 방송 알아보기', () => {
    expect(isSeasonDate('2024-09-17', { key: '추석', title: '', emoji: '' })).toBe(true);
    expect(isSeasonDate('2024-10-17', { key: '추석', title: '', emoji: '' })).toBe(false);
  });
});
