import { describe, it, expect } from 'vitest';
import { alignFromEdit, textSim } from '../../api/_aiVideo';

describe('생방송 스크립트를 편집본 자막으로 바로잡기', () => {
  const live = [
    { t: 100, s: '오 키가 없대요 키가' }, { t: 104, s: '야 2층까지 있내요' }, { t: 110, s: '상급일 경우에 싹 이동 해가지고' },
    { t: 115, s: '이거 뭐야' }, { t: 300, s: '오늘 날씨 좋다' },
  ];
  const edit = [
    { t: 10, s: '오 키가 없대요 키가' }, { t: 14, s: '야 2층까지 있네요' }, { t: 20, s: '상급일 경우에 싹 이동해가지고' },
    { t: 25, s: '전혀 다른 말이에요' },
  ];
  it('같은 시간 차이로 여러 줄이 맞으면 글자를 편집본 것으로', () => {
    const r = alignFromEdit(live, edit);
    expect(r.lines[1].s).toBe('야 2층까지 있네요');
    expect(r.lines[2].s).toBe('상급일 경우에 싹 이동해가지고');
    expect(r.lines[4].s).toBe('오늘 날씨 좋다');
    expect(r.lines[1].t).toBe(104);
  });
  it('한 줄만 비슷하면 안 바꿈', () => {
    const r = alignFromEdit([{ t: 50, s: '야 2층까지 있내요' }, { t: 60, s: '전혀 상관 없는 말' }], edit);
    expect(r.changed).toBe(0);
  });
  it('비슷함', () => { expect(textSim('야 2층까지 있내요', '야 2층까지 있네요')).toBeGreaterThan(0.75); });
});
