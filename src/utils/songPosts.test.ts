import { describe, expect, it } from 'vitest';
import { parseSongPosts } from './songPosts';

describe('생방쏭 글', () => {
  it('화면을 그대로 복사한 글', () => {
    const t = `[다시보기 링크] 8/23 일요일 생방쏭 (게임이름- Librarian: Tidy Up the Arcane Library!)
[인기멤버](https://cafe.naver.com/x)
우주 하 마
2026.08.23. 19:13조회 393
[출처] [[다시보기 링크] 8/23 일요일 생방쏭 (게임이름- Librarian: Tidy Up the Arcane Library!) (우주하마 공식 팬카페!)](https://cafe.naver.com/uzuhama/206240)`;
    expect(parseSongPosts(t)).toEqual([{ date: '2026-08-23', games: ['Librarian: Tidy Up the Arcane Library!'], title: '[다시보기 링크] 8/23 일요일 생방쏭 (게임이름- Librarian: Tidy Up the Arcane Library!)', postedAt: '2026-08-23 19:13' }]);
  });
  it('카페 모으기로 모은 글 · 1월에 쓴 12월 글 · 게임 여러 개', () => {
    const t = `===== 12/31 수요일 생방쏭 (게임이름- A Game, B Game) ⟪2027-01-01 00:10 · 우주 하 마⟫\n본문`;
    const r = parseSongPosts(t);
    expect(r[0].date).toBe('2026-12-31');
    expect(r[0].games).toEqual(['A Game', 'B Game']);
  });
});
