import { describe, it, expect } from 'vitest';
import { videoGames } from './videoGames';

const log = { games: [{ name: 'Chromatic Conundrum', category: '시뮬레이션' }, { name: 'Gore In Crayon', category: '공포', link: 'https://store.steampowered.com/app/1/' }] };
describe('영상마다 그 영상 게임만', () => {
  it('게임 이름 카테고리(2026)', () => {
    const r = videoGames({ url: 'https://youtu.be/rOcc_ACbnIc', categories: ['Gore In Crayon'], category: 'Gore In Crayon' }, log);
    expect(r.by).toBe('tag'); expect(r.games.map((g) => g.name)).toEqual(['Gore In Crayon']); expect(r.games[0].link).toContain('steampowered');
  });
  it('설명창에 적힌 게임', () => {
    const r = videoGames({ url: 'https://youtu.be/xxxxxxxxxxx', title: '퍼즐게임' }, log, { desc: 'Chromatic Conundrum / 우주하마 #퍼즐' });
    expect(r.by).toBe('desc'); expect(r.games.map((g) => g.name)).toEqual(['Chromatic Conundrum']);
  });
  it('장르만 적힌 카테고리는 게임으로 보지 않음', () => {
    const r = videoGames({ url: 'https://youtu.be/xxxxxxxxxxx', category: '공포' }, log, { desc: '' });
    expect(r.by).toBe('all'); expect(r.games).toHaveLength(2);
  });
});
