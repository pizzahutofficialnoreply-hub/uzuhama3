import { describe, it, expect } from 'vitest';
import { cafeCollectorBookmarklet } from './cafeCollector';

describe('카페 모으기 북마클릿', () => {
  it('javascript: 주소 하나로 바로 실행할 수 있는 코드', () => {
    const b = cafeCollectorBookmarklet();
    expect(b.startsWith('javascript:')).toBe(true);
    expect(() => new Function(decodeURIComponent(b.slice('javascript:'.length)))).not.toThrow();
  });
});
