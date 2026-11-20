import { it, expect } from 'vitest';
import { compareSheet } from './sheetCompare';
it('시트 ↔ 사이트 대조', () => {
  const rows = [
    { row: 5, date: '2026-01-02', liveId: 'AAAAAAAAAAA', video: 'v', videoId: 'BBBBBBBBBBB', game: 'The Corridor', kw: '', pan: '', eum: '', jeo: '' },
    { row: 6, date: '2026-01-01', liveId: 'CCCCCCCCCCC', video: '', videoId: '', game: '더 코리도르', kw: '', pan: '', eum: '', jeo: '' },
    { row: 7, date: '2025-12-31', liveId: '', video: '', videoId: '', game: 'X', kw: '', pan: '', eum: '', jeo: '' },
  ];
  const logs = [
    { id: 'a', date: '2026-01-02', games: [{ name: 'The Corridor' }], vods: [{ url: 'https://youtu.be/AAAAAAAAAAA' }], edited: [{ url: 'https://youtu.be/BBBBBBBBBBB' }] },
    { id: 'b', date: '2026-01-01', games: [{ name: 'The Corridor' }], vods: [{ url: 'https://youtu.be/DDDDDDDDDDD' }], edited: [] },
    { id: '2025-12-31_archive_9', date: '2026-01-01', games: [{ name: 'X' }], vods: [], edited: [] },
  ];
  const r = compareSheet(rows as any, logs);
  expect(r.same).toBe(1);
  expect(r.count.live).toBe(1);
  expect(r.count.gameLang).toBe(1);
  expect(r.count.moved).toBe(1);
});
