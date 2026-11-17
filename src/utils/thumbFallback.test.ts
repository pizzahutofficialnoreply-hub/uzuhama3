import { describe, expect, it } from 'vitest';
import { nextThumb } from './thumbFallback';
describe('썸네일 대체', () => {
  it('다른 주소 → 다른 크기 → 빈 그림', () => {
    const s = 'https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg';
    expect(nextThumb(s, 0)).toBe('https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
    expect(nextThumb(s, 1)).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    expect(nextThumb(s, 3)!.startsWith('data:')).toBe(true);
    expect(nextThumb('https://example.com/a.jpg', 0)).toBeNull();
  });
});
