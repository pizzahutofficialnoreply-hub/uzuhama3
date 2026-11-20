import { describe, it, expect } from 'vitest';
import { gameNamesFrom, seriesOf, pickLogs } from '../../api/_ytSync';

const L = (id: string, date: string, game: string) => ({ id, date, games: [{ name: game }] });

describe('새 편집 영상 → 방송 자동 연결', () => {
  it('설명창 첫 줄에서 게임 이름 (영문·한글)', () => {
    const n = gameNamesFrom('어떤 제목', 'The Corridor 더 코리도르\n우주하마 UZUHAMA\nhttps://twip.kr');
    expect(n).toContain('The Corridor');
    expect(n).toContain('더 코리도르');
  });
  it('시리즈 번호', () => {
    expect(seriesOf('Mecha Chameleon 2')).toEqual({ base: 'mechachameleon', n: '2' });
    expect(seriesOf('Game II').n).toBe('2');
    expect(seriesOf('Baby Steps').n).toBe('');
  });
  it('번호가 맞는 편만', () => {
    const logs = [L('a', '2026-03-01', 'Spooky 2'), L('b', '2026-03-05', 'Spooky')];
    const p = pickLogs(logs, 't', 'Spooky 2\n우주하마 UZUHAMA', '2026-03-10')!;
    expect(p.logs.map((l) => l.id)).toEqual(['a']);
  });
  it('번호 없으면 가장 최근 편', () => {
    const logs = [L('a', '2026-03-01', 'Spooky 2'), L('b', '2026-02-01', 'Spooky')];
    const p = pickLogs(logs, 't', 'Spooky\n우주하마 UZUHAMA', '2026-03-10')!;
    expect(p.logs.map((l) => l.id)).toEqual(['b']); // 같은 이름(번호 없음)이 먼저
    const p2 = pickLogs([L('a', '2026-03-01', 'Spooky 2'), L('c', '2026-02-20', 'Spooky 3')], 't', 'Spooky\n우주하마 UZUHAMA', '2026-03-10')!;
    expect(p2.logs.map((l) => l.id)).toEqual(['a']);
  });
  it('이어서 한 방송은 전부, 한 달 넘게 띄면 최근 묶음만', () => {
    const logs = [L('a', '2026-01-01', 'Corridor'), L('b', '2026-02-20', 'Corridor'), L('c', '2026-03-01', 'Corridor')];
    const p = pickLogs(logs, 't', 'Corridor\n우주하마', '2026-03-05')!;
    expect(p.logs.map((l) => l.id)).toEqual(['b', 'c']);
  });
  it('너무 많이 한 게임은 가장 최근 하나 + 확인 필요', () => {
    const logs = Array.from({ length: 10 }, (_, i) => L(`m${i}`, `2026-03-${String(i + 1).padStart(2, '0')}`, '메챠카멜레온'));
    const p = pickLogs(logs, 't', '메챠카멜레온\n우주하마', '2026-03-20')!;
    expect(p.logs.map((l) => l.id)).toEqual(['m9']);
    expect(p.ambiguous).toBe(true);
  });
});
