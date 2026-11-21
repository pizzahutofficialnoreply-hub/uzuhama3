import { describe, it, expect } from 'vitest';
import { bumpVersion, hotfixNoticeBody } from '../../api/patch-notes';

describe('자동 패치 버전', () => {
  it('고치기만: 네 번째 자리', () => { expect(bumpVersion('1.2.0', 'fix')).toBe('1.2.0.1'); expect(bumpVersion('1.2.0.1', 'fix')).toBe('1.2.0.2'); });
  it('새 기능: 세 번째 자리', () => { expect(bumpVersion('1.2.0.3', 'feature')).toBe('1.2.1'); });
  it('공지 글 양식', () => {
    const t = hotfixNoticeBody('1.2.0.1', Date.parse('2026-11-20T10:22:00Z'), ['쇼츠 공유 글 개선']);
    expect(t).toContain('◆ 패치 일시 : 11/20(금) 19:22 경');
    expect(t).toContain('- 쇼츠 공유 글 개선');
    expect(t).toContain('[의견 보내기로 이동하기](app://의견)');
  });
});
