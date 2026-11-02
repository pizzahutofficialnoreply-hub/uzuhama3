import { describe, it, expect } from 'vitest';
import { parseCafePost } from '../src/utils/cafeImport';

const SAMPLE = `틀린 부분은 댓글 남겨주세요.
https://m.cafe.naver.com/uzuhama/88678

<2017. 2018. 3월 ~ 2022. 1월 영상 생방링크 정리>
대한민국 모임의 시작, 네이버 카페
m.cafe.naver.com
 <2017. (2,3월) 오버워치 영상 생방정리>
​
[생방날짜: 2017. 3. 31]
생방링크
: https://youtu.be/OaIqLiHaBlY
​
영상링크
: https://youtu.be/tTY1RVOr5IY

[오버워치] 포커싱을 시작한 팀의 위엄 | 우주하마 윈스턴
[생방날짜: 2017. 3. 30]
생방링크
: https://youtu.be/gtLzQhrgnE8
​
영상링크
: https://youtu.be/PgRL5ETMuY4

[변태 라인하르트를 조심해ㅋㅋㅋ]
[생방날짜: 2017. 3. 22]
생방링크
: https://youtu.be/pBWcIuod3TU
​
영상링크
: https://youtu.be/6hyMs6AGUKI

[오버워치] 다 이긴줄 알았던 게임, 방심했다.. 우주자리야 빡겜하마 | 우주하마
[생방날짜: 2017. 3. 22]
생방링크
: https://youtu.be/pBWcIuod3TU
​
영상링크
: https://youtu.be/prpUFwFm_N0

[오버워치] 경쟁전에서 요들송 불렀더니 다 따라해요ㅋㅋㅋ | 우주하마
[생방날짜: 2017. 3. 9]
생방링크
: https://youtu.be/KrtsaG72ODI
​
영상링크 
: https://youtu.be/xo8o6tIrT-s

[우리팀은 다들 포기했었다.. 150점을 지킨 킹스턴.. 또 만난 치킨쿤님]`;

describe('팬카페 생방링크 정리 글 읽기', () => {
  const days = parseCafePost(SAMPLE);
  it('날짜별로 묶음 (같은 날은 합침, 머리말 무시)', () => {
    expect(days.map((d) => d.date)).toEqual(['2017-03-09', '2017-03-22', '2017-03-30', '2017-03-31']);
  });
  it('생방·영상 링크와 제목', () => {
    const d31 = days.find((d) => d.date === '2017-03-31')!;
    expect(d31.lives.map((l) => l.id)).toEqual(['OaIqLiHaBlY']);
    expect(d31.videos).toEqual([{ id: 'tTY1RVOr5IY', url: 'https://youtu.be/tTY1RVOr5IY', title: '[오버워치] 포커싱을 시작한 팀의 위엄 | 우주하마 윈스턴' }]);
    const d22 = days.find((d) => d.date === '2017-03-22')!;
    expect(d22.lives.map((l) => l.id)).toEqual(['pBWcIuod3TU']);
    expect(d22.videos.map((v) => v.id)).toEqual(['6hyMs6AGUKI', 'prpUFwFm_N0']);
    expect(d22.videos[0].title).toBe('[오버워치] 다 이긴줄 알았던 게임, 방심했다.. 우주자리야 빡겜하마 | 우주하마');
    expect(days.find((d) => d.date === '2017-03-30')!.videos[0].title).toBe('변태 라인하르트를 조심해ㅋㅋㅋ');
    expect(days.find((d) => d.date === '2017-03-09')!.videos[0].title).toBe('우리팀은 다들 포기했었다.. 150점을 지킨 킹스턴.. 또 만난 치킨쿤님');
  });
});

describe('영상 ↔ 생방 짝', () => {
  it('같은 묶음의 생방을 영상에 짝지음', () => {
    const d22 = parseCafePost(SAMPLE).find((d) => d.date === '2017-03-22')!;
    expect(d22.pairs.map((p) => [p.video.id, p.lives.map((l) => l.id)])).toEqual([['6hyMs6AGUKI', ['pBWcIuod3TU']], ['prpUFwFm_N0', ['pBWcIuod3TU']]]);
  });
});

import { planCafeImport } from '../src/utils/cafeImport';
describe('영상 기준으로 생방 링크 채우기', () => {
  const days = parseCafePost(SAMPLE);
  const logs = [
    // 영상이 이미 있는 기록 (날짜가 글과 하루 다름)
    { id: 'L21', date: '2017-03-21', vods: [], edited: [{ title: '다 이긴줄 알았던 게임', url: 'https://www.youtube.com/watch?v=6hyMs6AGUKI' }, { title: '요들송', url: 'https://youtu.be/prpUFwFm_N0?si=x' }], shorts: [] },
    // 생방까지 이미 있는 기록
    { id: 'L31', date: '2017-03-31', vods: [{ url: 'https://youtu.be/OaIqLiHaBlY' }], edited: [{ url: 'https://youtu.be/tTY1RVOr5IY' }], shorts: [] },
    // 영상만 있는 기록
    { id: 'L09', date: '2017-03-09', vods: [], edited: [{ url: 'https://youtu.be/xo8o6tIrT-s' }], shorts: [] },
  ];
  const { plans, already } = planCafeImport(days, logs);
  it('영상이 있는 기록에 생방만 추가 (한 번만)', () => {
    const p21 = plans.find((p) => p.key === 'L21')!;
    expect(p21.lives.map((l) => l.id)).toEqual(['pBWcIuod3TU']);
    expect(p21.videos).toEqual([]);
    expect(p21.notes[0]).toContain('2017-03-22');
    expect(plans.find((p) => p.key === 'L09')!.lives.map((l) => l.id)).toEqual(['KrtsaG72ODI']);
  });
  it('이미 다 있으면 건너뜀, 사이트에 없는 영상은 날짜로 새 기록', () => {
    expect(plans.some((p) => p.key === 'L31')).toBe(false);
    const fresh = plans.find((p) => p.key === 'new:2017-03-30')!;
    expect(fresh.status).toBe('new-log');
    expect(fresh.videos.map((v) => v.id)).toEqual(['PgRL5ETMuY4']);
    expect(fresh.lives.map((l) => l.id)).toEqual(['gtLzQhrgnE8']);
    expect(already).toBeGreaterThan(0);
  });
});
