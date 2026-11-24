import { describe, it, expect } from 'vitest';
import { liveTitle, isGenericLiveTitle } from './liveTitle';
describe('liveTitle', () => {
  it('일반 제목은 날짜로', () => {
    for (const t of ['우주하마 생방송!', '생방송', '', '[다시보기] 230920 우주하마 생방송!', '2022.11.24. 우주하마 생방송!', '2026-08-23 생방송']) expect(liveTitle(t, '2026-08-23')).toBe('2026.08.23 생방송');
  });
  it('방제가 있으면 그대로', () => {
    expect(liveTitle('우주하마 생방송! 공포게임 3종', '2021-01-01')).toBe('우주하마 생방송! 공포게임 3종');
    expect(isGenericLiveTitle('하마의 마인크래프트 생방송')).toBe(false);
  });
});
