import { describe, expect, it } from 'vitest';
import { parseCafePost, planCafeImport, parseCafeBlocks, blocksToPlanInput, parseHeaderDates } from './cafeImport';

describe('카페 정리 글', () => {
  it('글머리 기호 · "영상: 제목, 링크" · "생방: 링크" 모양', () => {
    const d = parseCafePost(`• 2022.05.06
• 영상: 단연코 1위 공포게임 2, https://youtu.be/ZxMKS9JYrd0
• 게임: Poppy Playtime 2, https://store.steampowered.com/app/1817490/
• 생방: https://youtu.be/FAXrY2xwK10

• 2023.11.02
• 영상: (소름주의)납치 공포게임.. 영화 한편을 만들어버렸네, https://www.youtube.com/watch?v=v7QjZc8OT6M
• 생방: https://www.youtube.com/live/zr7lncBKjr8?si=nU-b_qc_-86uiGcL`);
    expect(d.map((x) => x.date)).toEqual(['2022-05-06', '2023-11-02']);
    expect(d[0].pairs[0]).toMatchObject({ video: { id: 'ZxMKS9JYrd0', title: '단연코 1위 공포게임 2' }, lives: [{ id: 'FAXrY2xwK10' }] });
    expect(d[1].pairs[0].lives[0].id).toBe('zr7lncBKjr8');
    expect(d[0].videos.length).toBe(1);
  });
  it('예전 모양: [생방날짜] / 생방링크 / : 링크', () => {
    const d = parseCafePost(`[생방날짜: 2017. 3. 31]
생방링크
: https://youtu.be/AAAAAAAAAAA
영상링크
: https://youtu.be/BBBBBBBBBBB
[영상 제목]`);
    expect(d[0].pairs[0]).toMatchObject({ video: { id: 'BBBBBBBBBBB', title: '영상 제목' }, lives: [{ id: 'AAAAAAAAAAA' }] });
  });
  it('이미 있는 영상이면 그 기록에 생방만, 영상 없이 생방만 있으면 그날 기록에', () => {
    const logs = [
      { id: 'a', date: '2022-05-06', edited: [{ url: 'https://youtu.be/ZxMKS9JYrd0', title: 't' }], vods: [] },
      { id: 'b', date: '2022-06-01', edited: [], vods: [] },
    ];
    const days = parseCafePost(`2022.05.07\n영상: x, https://youtu.be/ZxMKS9JYrd0\n생방: https://youtu.be/FAXrY2xwK10\n\n2022.06.01\n생방: https://youtu.be/CCCCCCCCCCC`);
    const { plans } = planCafeImport(days, logs);
    expect(plans.find((p) => p.key === 'a')?.lives.map((l) => l.id)).toEqual(['FAXrY2xwK10']);
    expect(plans.find((p) => p.key === 'b')?.lives.map((l) => l.id)).toEqual(['CCCCCCCCCCC']);
  });
});

describe('생방 기록 기준으로 모음', () => {
  const post = `[생방날짜: 2017. 10. 19]
생방링크
: https://youtu.be/HS7jvcdsyF8

영상링크
: https://youtu.be/F4aNNqUT784
[PUBG] 늪지대 엔딩 '하마메타' 여기 완전 개꿀자리자너~? | 우주하마`;
  const archive = { id: '2017-10-18_archive_1960', date: '2017-10-18', vods: [{ url: 'https://youtu.be/HS7jvcdsyF8' }], edited: [] };
  it('생방이 다른 날 기록에 있으면 영상을 그 기록에', () => {
    const { plans } = planCafeImport(parseCafePost(post), [archive]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ key: archive.id, videos: [{ id: 'F4aNNqUT784' }], lives: [] });
  });
  it('예전에 생방 없이 따로 만든 기록의 영상은 옮겨 옴', () => {
    const cafe = { id: 'cafe_20171019_x', date: '2017-10-19', vods: [], edited: [{ url: 'https://youtu.be/F4aNNqUT784', title: 't' }] };
    const { plans } = planCafeImport(parseCafePost(post), [archive, cafe]);
    expect(plans).toHaveLength(1);
    expect(plans[0].moves.map((m) => [m.from.id, m.video.id])).toEqual([['cafe_20171019_x', 'F4aNNqUT784']]);
  });
});

describe('생방 날짜는 유튜브 기준', () => {
  it('카페 글 날짜와 유튜브 생방 날짜가 다르면 유튜브 날짜 기록으로, 알림 남김', () => {
    const logs = [{ id: 'd', date: '2017-03-30', edited: [], vods: [] }];
    const days = parseCafePost(`[생방날짜: 2017. 3. 31]\n생방링크\n: https://youtu.be/LLLLLLLLLLL\n영상링크\n: https://youtu.be/VVVVVVVVVVV\n[영상 제목]`);
    const { plans } = planCafeImport(days, logs, new Map(), new Map([['LLLLLLLLLLL', '2017-03-30']]));
    expect(plans).toHaveLength(1);
    expect(plans[0].key).toBe('d');
    expect(plans[0].notes.join()).toContain('유튜브 생방 날짜는 2017-03-30');
  });
});

describe('[생방날짜] 묶음 글 (카페 모으기)', () => {
  const post = `===== 2019. 3월 유튭 영상 생방정리
[생방날짜: 2019. 3. 1]
생방링크
: https://youtu.be/lqdjHjGkUfk
영상링크
: https://youtu.be/PoHbe3zCtB8
[내맘대로 움직이는 신규차량]
[생방날짜: 2019. (2. 25), (3. 3)]
생방링크
: https://youtu.be/m4OswxOY8_c
(핫클립 부분 생방 2. 25)
: https://youtu.be/bAczCcJZvLQ
(뒷부분 내용 생방 3. 3)
영상링크
: ​https://youtu.be/AhvVmfSljq0
https://www.youtube.com/embed/AhvVmfSljq0?feature=oembed
[스쿼드에서 혼자가 됐다고 포기하지마]
쇼츠링크
: https://youtube.com/shorts/ZaDt_zfLg8I?si=x
[이게 되네 #shorts]
[생방날짜: x]
생방링크
: 생방링크 없음
영상링크
: https://youtu.be/QIoUUugrLXw
[에이펙스]
<생방송 찾는 방법>
1. https://youtu.be/ZZZZZZZZZZZ`;
  it('여러 날 머리말이 앞 날짜로 섞이지 않고, 여러 날 생방 영상은 multi 로', () => {
    const r = blocksToPlanInput(parseCafeBlocks(post));
    expect(r.days.find((d) => d.date === '2019-03-01')!.videos.map((v) => v.id)).toEqual(['PoHbe3zCtB8']);
    expect(r.days.find((d) => d.date === '2019-03-03')!.lives.map((v) => v.id)).toEqual(['bAczCcJZvLQ']);
    expect(r.days.find((d) => d.date === '2019-02-25')!.shorts.map((v) => v.title)).toEqual(['이게 되네 #shorts']);
    expect(r.multis).toHaveLength(1);
    expect(r.multis[0]).toMatchObject({ video: { id: 'AhvVmfSljq0', title: '스쿼드에서 혼자가 됐다고 포기하지마' } });
    expect(r.multis[0].lives.map((l) => l.date)).toEqual(['2019-02-25', '2019-03-03']);
    expect(r.unsure.map((u) => u.video?.id)).toEqual(['QIoUUugrLXw']);
    expect(JSON.stringify(r)).not.toContain('ZZZZZZZZZZZ');
  });
  it('머리말 날짜 여러 모양', () => {
    expect(parseHeaderDates('2019. 3. (4, 5)').dates).toEqual(['2019-03-04', '2019-03-05']);
    expect(parseHeaderDates('2019. (5. 30), (6/ 6, 7)').dates).toEqual(['2019-05-30', '2019-06-06', '2019-06-07']);
    expect(parseHeaderDates('???').dates).toEqual([]);
  });
  it('2026년 이후는 빼고, 웃음참기처럼 해가 바뀌면 다음 해로', () => {
    const r = blocksToPlanInput(parseCafeBlocks(`[생방날짜: 2024. 11, 2025. 1]\n생방링크\n: https://youtu.be/AAAAAAAAAAA\n(11. 14 : 장난감)\n: https://youtu.be/BBBBBBBBBBB\n(1. 6 : 소리)\n영상링크\n: https://youtu.be/CCCCCCCCCCC\n[웃음참기14]\n[생방날짜: 2026. 2. 1]\n생방링크\n: https://youtu.be/DDDDDDDDDDD\n영상링크\n: https://youtu.be/EEEEEEEEEEE`));
    expect(r.multis[0].lives.map((l) => l.date)).toEqual(['2024-11-14', '2025-01-06']);
    expect(r.days.some((d) => d.date >= '2026')).toBe(false);
  });
});

import { hideOldCafe } from './cafeFilter';
describe('실험실 과거 영상 생방 연동', () => {
  it('2020년 전 cafe 표시만 숨기고, multi 로 바꾼 원래 영상은 되돌려 보여 줌', () => {
    const data = { logs: {
      a: { id: 'a', date: '2019-03-01', vods: [{ url: 'u1' }, { url: 'u2', cafe: 1 }], edited: [{ url: 'v1', multiId: 'm', allBroadcastDates: ['x'], cafe: 'multi' }], shorts: [] },
      b: { id: 'b', date: '2019-03-02', cafe: 1, vods: [{ url: 'u3', cafe: 1 }], edited: [], shorts: [] },
      c: { id: 'c', date: '2021-01-01', vods: [{ url: 'u4', cafe: 1 }], edited: [], shorts: [] },
    } };
    const r: any = hideOldCafe(data);
    expect(r.logs.a.vods).toEqual([{ url: 'u1' }]);
    expect(r.logs.a.edited).toEqual([{ url: 'v1' }]);
    expect(r.logs.b).toBeUndefined();
    expect(r.logs.c.vods).toHaveLength(1);
  });
});
