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
