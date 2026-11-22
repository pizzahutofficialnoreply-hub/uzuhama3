import { describe, it, expect } from 'vitest';
import { bumpVersion, hotfixNoticeBody } from '../../api/patch-notes';

describe('자동 패치 버전', () => {
  it('빌드 번호만 올림: 0.0.0+N', () => { expect(bumpVersion('1.2.0', 'fix')).toBe('1.2.0+1'); expect(bumpVersion('1.2.0+1', 'feature')).toBe('1.2.0+2'); expect(bumpVersion('1.3.0')).toBe('1.3.0+1'); });
  it('공지 글 양식', () => {
    const t = hotfixNoticeBody('1.2.0.1', Date.parse('2026-11-20T10:22:00Z'), ['쇼츠 공유 글 개선']);
    expect(t).toContain('◆ 패치 일시 : 11/20(금) 19:22 경');
    expect(t).toContain('- 쇼츠 공유 글 개선');
    expect(t).toContain('[의견 보내기로 이동하기](app://의견)');
  });
});
