import { describe, it, expect, vi } from 'vitest';
import { exportCode, parseImport } from '../src/utils/myPlaylists';
import { matchesLiveKeywords } from '../api/_push';
import { checkDeadVideos } from '../api/_deadVideos';
import { DEFAULT_PRIVACY, DEFAULT_TERMS } from '../src/content/legal';

describe('재생목록 옮기기', () => {
  it('내보낸 코드를 그대로 다시 읽음 (한글 제목 포함)', () => {
    const list = { id: 'x', name: '출퇴근용 🚇', createdAt: 0, updatedAt: 0, items: [
      { id: 'KLxfLhoHX_4', kind: 'live' as const, title: '2025-10-07 생방송', addedAt: 0 },
      { id: 'uaJxygoxbWI', kind: 'short' as const, title: '다 대가리 박아', addedAt: 0 },
    ] };
    const p = parseImport(`https://uzuhama.vercel.app/?pl=${exportCode(list)}`)!;
    expect(p.name).toBe('출퇴근용 🚇');
    expect(p.items.map((x) => x.kind)).toEqual(['live', 'short']);
    expect(p.items[1].title).toBe('다 대가리 박아');
  });
  it('엉터리 코드는 null', () => { expect(parseImport('hello')).toBeNull(); });
});

describe('게임별 방송 알림', () => {
  it('고른 게임·장르가 제목이나 카테고리에 있으면', () => {
    expect(matchesLiveKeywords([], '아무 방송', '')).toBe(true);
    expect(matchesLiveKeywords(['마인크래프트'], '오늘은 마크 하드코어', 'Minecraft')).toBe(false);
    expect(matchesLiveKeywords(['minecraft'], '오늘은 마크 하드코어', 'Minecraft')).toBe(true);
    expect(matchesLiveKeywords(['공포'], '심야 공포 게임', '')).toBe(true);
  });
});

describe('사라진 영상 찾기', () => {
  it('유튜브가 안 돌려준 영상은 삭제됨, private 은 비공개', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'k');
    const store: Record<string, any> = {};
    // 사이트 기록 = 과거 아카이브 + logs_by_month (logs 컬렉션 전체는 안 읽음)
    const month = { month: '2025-01', updatedAt: 'x', items: { l1: { id: 'l1', date: '2025-01-01', edited: [{ url: 'https://youtu.be/AAAAAAAAAAA', title: '살아 있음' }, { url: 'https://youtu.be/BBBBBBBBBBB', title: '지워짐' }], vods: ['https://www.youtube.com/watch?v=CCCCCCCCCCC'] } } };
    const db = { collection: (c: string) => (c === 'logs_by_month'
      ? { get: async () => ({ forEach: (f: any) => [{ data: () => month }].forEach(f) }) }
      : c === 'logs' ? { get: async () => { throw new Error('logs 전체를 읽으면 안 됨'); } }
      : { doc: (d: string) => ({ get: async () => ({ data: () => store[`${c}/${d}`] }), set: async (v: any, o?: any) => { store[`${c}/${d}`] = o?.merge ? { ...(store[`${c}/${d}`] || {}), ...v } : v; } }) }) };
    vi.stubGlobal('fetch', async (u: string) => (String(u).includes('historical_logs') ? { ok: false } : { ok: true, json: async () => ({ items: [{ id: 'AAAAAAAAAAA', status: { privacyStatus: 'public' } }, { id: 'CCCCCCCCCCC', status: { privacyStatus: 'private' } }] }) }));
    const r: any = await checkDeadVideos(db, { force: true });
    expect(r).toEqual({ total: 3, dead: 2 });
    expect(store['config/deadVideos'].items.BBBBBBBBBBB.reason).toBe('삭제됨');
    expect(store['config/deadVideos'].items.CCCCCCCCCCC.reason).toBe('비공개');
    vi.unstubAllGlobals();
  });
});

describe('약관·개인정보처리방침', () => {
  it('꼭 들어가야 할 항목', () => {
    ['국외 이전', '보호책임자', '파기', '권익침해', '자동 수집 장치', 'YouTube', '만 14세'].forEach((k) => expect(DEFAULT_PRIVACY).toContain(k));
    ['약관의 규제에 관한 법률', 'YouTube 서비스 약관', '부칙'].forEach((k) => expect(DEFAULT_TERMS).toContain(k));
  });
});
