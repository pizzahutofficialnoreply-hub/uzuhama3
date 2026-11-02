import { describe, it, expect } from 'vitest';
// 캘린더 내보내기가 사이트 주소(window.location)를 쓰므로 테스트용으로 채움
(globalThis as any).window ??= { location: { origin: 'https://uzuhama.vercel.app', href: 'https://uzuhama.vercel.app/' } };
import { overlayMonthDocs } from '../src/utils/archiveOverlay';
import { buildGameCatalog, inferPlaylistGame } from '../src/utils/playlistGames';
import { generateMultipleIcsContent } from '../src/utils/calendarExport';
import { statusMessageKey, computeBroadcastProbability } from '../src/utils/probability';
import { OWNER_VOICE, STATE_REPORT } from '../api/status-messages';

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
  it('상태 문구 묶음 키는 v5', () => {
    expect(statusMessageKey({} as any, new Date('2026-11-01T03:00:00Z')).startsWith('v5|')).toBe(true);
  });
  it('채널 주인처럼 들리는 AI 문구는 거름', () => {
    for (const t of ['유튜브 놀러와요', '방송 보러 와 주세요', '구독 부탁해요', '저희 채널이에요']) expect(OWNER_VOICE.test(t), t).toBe(true);
    for (const t of ['푹 쉬고 오세요', '오늘은 켜지려나요?', '다시보기 봐요']) expect(OWNER_VOICE.test(t), t).toBe(false);
    // 스트리머의 지금 상태를 아는 척하는 문구도 거름
    for (const t of ['지금도 약 잘 챙겨먹고 누워 있어요', '푹 쉬는 중이에요', '엉덩이 찾는 중이에요', '회복 중이에요']) expect(STATE_REPORT.test(t), t).toBe(true);
    for (const t of ['약 잘 챙겨 드세요', '푹 쉬고 오세요', '엉덩이 꼭 찾길 바라요', '기다리고 있어요', '다시보기 보고 있어요']) expect(STATE_REPORT.test(t), t).toBe(false);
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

describe('관리자 지정 예정일·휴방일', () => {
  // 최근 두 달 이틀에 한 번 저녁 8시 방송
  const logs = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.parse('2026-10-14T00:00:00Z') - i * 2 * 86400000).toISOString().slice(0, 10);
    return { id: `l${i}`, date: d, time: '20:00', game: 'x', vods: [], edited: [], shorts: [], durationHours: 3, category: '' };
  });
  const at = new Date('2026-10-15T05:00:00Z'); // 2026-10-15 14:00 KST
  const base = computeBroadcastProbability(logs as any, at, {} as any);
  it('지정이 없으면 원래 계산 그대로', () => {
    const p = computeBroadcastProbability(logs as any, at, { system: { dateOverrides: [{ date: '2026-10-20', type: 'off' }] } as any });
    expect(p.finalProb).toBe(base.finalProb);
    expect(p.pattern.state).toBe(base.pattern.state);
  });
  it('휴방일이면 그날만 낮게', () => {
    const p = computeBroadcastProbability(logs as any, at, { system: { dateOverrides: [{ date: '2026-10-15', type: 'off' }] } as any });
    expect(p.pattern.state).toBe('absence');
    expect(p.finalProb).toBeLessThan(base.finalProb);
  });
  it('예정일이면 높게, 예정 시각이 유력 시간', () => {
    const p = computeBroadcastProbability(logs as any, at, { system: { dateOverrides: [{ date: '2026-10-15', type: 'on', time: '17:30' }] } as any });
    expect(p.pattern.state).toBe('scheduled');
    expect(p.dayProb).toBeGreaterThanOrEqual(92);
    expect(p.time.peakMinute).toBe(17 * 60 + 30);
  });
});

import { cleanShareUrl, formatRecommendShareText } from '../src/utils/shareUtils';
describe('공유 글 다듬기', () => {
  it('링크 꼬리표 정리', () => {
    expect(cleanShareUrl('https://youtu.be/0pYgdAREvwY?si=cxrTtCUSUIc8NN0t')).toBe('https://youtu.be/0pYgdAREvwY');
    expect(cleanShareUrl('https://www.youtube.com/watch?v=WKjD9xDIUlA&amp;t=3918s')).toBe('https://www.youtube.com/watch?v=WKjD9xDIUlA&t=3918s');
    expect(cleanShareUrl('https://www.youtube.com/watch?v=YTK7mgB7TlA&amp;list=PLtZ&amp;index=106')).toBe('https://www.youtube.com/watch?v=YTK7mgB7TlA');
    expect(cleanShareUrl('https://store.steampowered.com/app/2367230/X/?snr=1_7_7_151_150_1')).toBe('https://store.steampowered.com/app/2367230/X/');
  });
  it('몰아보기: 맨 위 요약, 중복 게임 정리', () => {
    const log = { id: 'a', date: '2020-12-14', vods: [{ url: 'https://youtu.be/x?feature=share' }], edited: [{ title: '마녀', url: 'https://youtu.be/w?si=1' }], shorts: [],
      games: [{ name: "The Witch's House", link: '' }, { name: "The Witch's House", link: 'https://store.steampowered.com/app/885810/' }, { name: '0.4576388888888889', link: '' }] };
    const text = formatRecommendShareText({ isCompilation: true, compilationId: 'c', videoTitle: '공포 몰아보기', videoUrl: 'https://youtu.be/comp?si=2', games: [], allBroadcastDates: ['2020-12-14'], parentLog: log }, [log]);
    expect(text.startsWith('• 몰아보기: 공포 몰아보기, https://youtu.be/comp\n• 생방 1개')).toBe(true);
    expect(text).toContain('0.4576'); // 숫자뿐인 게임 이름도 그대로 둠 (실제로 있을 수 있음)
    expect(text.match(/Witch's House/g)?.length).toBe(1);
    expect(text).not.toContain('si=');
  });
});

import { formatShortsShareText, formatPlaylistShareText } from '../src/utils/shareUtils';
describe('쇼츠·재생목록 공유 글 (몰아보기와 같은 모양)', () => {
  const log = { id: 'a', date: '2026-05-09', games: [{ name: '恶意', link: 'https://store.steampowered.com/app/4111260/_/' }],
    vods: [{ url: 'https://www.youtube.com/live/EqG77rNXsvU?si=gk' }], edited: [{ title: '편집자 탈주할 뻔한 공포게임', url: 'https://youtu.be/UxwuSGve30Q?si=lf' }],
    shorts: [{ title: '다른 쇼츠', url: 'https://youtube.com/shorts/OTHERxxxxxx' }] };
  it('쇼츠: 방송 블록 + 이 쇼츠만', () => {
    const t = formatShortsShareText({ title: '퇴근길 빌런', url: 'https://youtube.com/shorts/JNy9yKfXFns?si=vQ', date: '2026-05-09', editUrl: 'https://youtu.be/UxwuSGve30Q', relatedTitle: '편집자 탈주할 뻔한 공포게임' }, [log]);
    expect(t).toBe([
      '• 2026.05.09',
      '• 영상: 편집자 탈주할 뻔한 공포게임, https://youtu.be/UxwuSGve30Q',
      '• 게임: 恶意, https://store.steampowered.com/app/4111260/_/',
      '• 생방: https://www.youtube.com/live/EqG77rNXsvU',
      '• 쇼츠: 퇴근길 빌런, https://youtube.com/shorts/JNy9yKfXFns',
    ].join('\n'));
  });
  it('재생목록: 맨 위 요약 + 영상마다 블록', () => {
    const t = formatPlaylistShareText({ id: 'PL1', title: '공포게임 모음', items: [{ videoId: 'UxwuSGve30Q', title: '편집자 탈주할 뻔한 공포게임' }, { videoId: 'zzzzzzzzzzz', title: '기록 없는 영상' }] },
      (id) => (id === 'UxwuSGve30Q' ? log : null), [log]);
    const blocks = t.split('\n\n');
    expect(blocks[0]).toBe('• 재생목록: 공포게임 모음, https://www.youtube.com/playlist?list=PL1\n• 영상 2개 · 생방 1개');
    expect(blocks[1].startsWith('• 2026.05.09\n• 영상: 편집자 탈주할 뻔한 공포게임, https://www.youtube.com/watch?v=UxwuSGve30Q')).toBe(true);
    expect(blocks[2]).toBe('• 영상: 기록 없는 영상, https://www.youtube.com/watch?v=zzzzzzzzzzz');
  });
});
