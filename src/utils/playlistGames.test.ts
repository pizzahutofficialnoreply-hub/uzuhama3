import { describe, it, expect } from 'vitest';
import { inferPlaylistGame as inferPG } from './playlistGames';
describe('배틀그라운드 재생목록', () => {
  it('여러 이름이 모두 스팀 이름·링크로', () => {
    const cat = new Map([['pubgbattlegrounds', { name: 'PUBG: BATTLEGROUNDS', link: 'https://store.steampowered.com/app/578080/', category: '배틀로얄' }]]);
    for (const t of ['배틀그라운드 UZUHAMA PUBG', '우주하마 배틀그라운드', '배그', 'PUBG']) expect(inferPG(t, cat as any)?.link).toBe('https://store.steampowered.com/app/578080/');
  });
});
