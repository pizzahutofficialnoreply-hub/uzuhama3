import { describe, it, expect } from 'vitest';
// 캘린더 내보내기가 사이트 주소(window.location)를 쓰므로 테스트용으로 채움
(globalThis as any).window ??= { location: { origin: 'https://uzuhama.vercel.app', href: 'https://uzuhama.vercel.app/' } };
import { overlayMonthDocs } from '../src/utils/archiveOverlay';
import { buildGameCatalog, inferPlaylistGame } from '../src/utils/playlistGames';
import { generateMultipleIcsContent } from '../src/utils/calendarExport';
import { statusMessageKey, computeBroadcastProbability } from '../src/utils/probability';
import { OWNER_VOICE } from '../api/status-messages';

const log = (over: any = {}) => ({ id: 'l1', date: '2026-10-31', time: '21:30', durationHours: 3, game: '배틀그라운드', games: [{ name: '배틀그라운드', link: '', category: '액션' }], category: '', vods: [], edited: [], shorts: [], ...over });

describe('아카이브 덮어쓰기', () => {
  it('관리자 수정분(_patch)은 바뀐 필드만 덮어쓰고, 새 기록은 추가', () => {
    const historical = { a: { id: 'a', date: '2020-01-01', time: '20:00', game: 'A', games: [] } };
    const out = overlayMonthDocs(historical, [{ items: {
      a: { id: 'a', date: '2020-01-01', _patch: true, game: 'B' },
      n: { id: 'n', date: '2026-01-02', game: 'N', games: [] },
    } }]);
    expect(out.a.game).toBe('B');
    expect(out.a.time).toBe('20:00');
    expect(out.n.game).toBe('N');
  });
});

describe('재생목록 이름 → 게임', () => {
  const catalog = buildGameCatalog({ x: log() });
  it('기록에 있는 게임과 맞추기', () => {
    expect(inferPlaylistGame('우주하마 배틀그라운드', catalog)?.name).toBe('배틀그라운드');
  });
  it('묶음 이름은 건너뜀', () => {
    expect(inferPlaylistGame('우주하마 병맛게임', catalog)).toBeNull();
    expect(inferPlaylistGame('우주하마 하이라이트 모음', catalog)).toBeNull();
  });
  it('기록에 없으면 이름 그대로', () => {
    expect(inferPlaylistGame('우주하마 어몽어스', catalog)?.name).toBe('어몽어스');
  });
});

describe('캘린더 구독 파일(ICS)', () => {
  const ics = generateMultipleIcsContent([log() as any, log({ id: 'l2', date: '2026-11-01', time: '' }) as any]);
  it('형식과 줄 길이(75바이트 이하)', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('시간 있는 방송은 UTC(Z), 하루 종일은 다음 날로 끝남', () => {
    expect(ics).toMatch(/DTSTART:20261031T123000Z/);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20261101/);
    expect(ics).toMatch(/DTEND;VALUE=DATE:20261102/);
  });
  it('고유 번호(UID)가 같은 기록이면 매번 같음', () => {
    const again = generateMultipleIcsContent([log() as any]);
    const uid = (s: string) => s.match(/UID:([^\r\n]+)/)?.[1];
    expect(uid(again)).toBe(uid(ics));
  });
});

describe('방송 확률·상태 문구', () => {
  it('확률은 0~100 사이', () => {
    const logs = Array.from({ length: 40 }, (_, i) => log({ id: `l${i}`, date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10) }));
    const p = computeBroadcastProbability(logs as any, new Date('2026-10-15T11:00:00Z'), {} as any);
    for (const v of [p.dayProb, p.finalProb]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });
  it('상태 문구 묶음 키는 v4', () => {
    expect(statusMessageKey({} as any, new Date('2026-11-01T03:00:00Z')).startsWith('v4|')).toBe(true);
  });
  it('채널 주인처럼 들리는 AI 문구는 거름', () => {
    for (const t of ['유튜브 놀러와요', '방송 보러 와 주세요', '구독 부탁해요', '저희 채널이에요']) expect(OWNER_VOICE.test(t), t).toBe(true);
    for (const t of ['푹 쉬고 오세요', '오늘은 켜지려나요?', '다시보기 봐요']) expect(OWNER_VOICE.test(t), t).toBe(false);
  });
});

import { recurringMaintenanceWindow, effectiveMaintenanceSystem, checkMaintenanceStatus } from '../src/utils/maintenanceUtils';
describe('정기 점검 자동 켜기', () => {
  const rec = { enabled: true, autoApply: true, intervalWeeks: 1, dayOfWeek: 6, startTime: '10:00', endTime: '16:00', anchorDate: '2026-01-03' };
  const at = (iso: string) => Date.parse(iso);
  it('점검 시간에는 점검 중, 당일 아침엔 예고, 끝난 날 밤엔 완료', () => {
    const sys: any = { maintenance: false, recurringMaintenance: rec };
    // 2026-11-07 은 토요일
    const during = at('2026-11-07T12:00:00+09:00');
    expect(checkMaintenanceStatus(effectiveMaintenanceSystem(sys, during), during).isInProgress).toBe(true);
    const morning = at('2026-11-07T08:00:00+09:00');
    expect(checkMaintenanceStatus(effectiveMaintenanceSystem(sys, morning), morning).isScheduledToday).toBe(true);
    const evening = at('2026-11-07T20:00:00+09:00');
    const ev = checkMaintenanceStatus(effectiveMaintenanceSystem(sys, evening), evening);
    expect(ev.isInProgress).toBe(false);
    expect(ev.isCompletedRecently).toBe(true);
    const weekday = at('2026-11-04T12:00:00+09:00');
    expect(checkMaintenanceStatus(effectiveMaintenanceSystem(sys, weekday), weekday).isInProgress).toBe(false);
  });
  it('격주면 한 주 건너뜀', () => {
    const w1 = recurringMaintenanceWindow({ ...rec, intervalWeeks: 2 }, at('2026-11-02T00:00:00+09:00'));
    const w2 = recurringMaintenanceWindow({ ...rec, intervalWeeks: 2 }, at(w1!.end) + 86400000 * 2);
    expect(Date.parse(w2!.start) - Date.parse(w1!.start)).toBe(14 * 86400000);
  });
  it('끄면 아무것도 안 함, 직접 넣은 일정이 우선', () => {
    expect(recurringMaintenanceWindow({ ...rec, autoApply: false }, Date.now())).toBeNull();
    const manual: any = { maintenance: false, recurringMaintenance: rec, maintenanceStart: '2026-11-05T01:00:00+09:00', maintenanceEnd: '2026-11-05T02:00:00+09:00' };
    expect(effectiveMaintenanceSystem(manual, at('2026-11-05T01:30:00+09:00'))!.maintenanceStart).toBe(manual.maintenanceStart);
  });
});
