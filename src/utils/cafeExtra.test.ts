import { describe, it, expect } from 'vitest';
import { parseCafeExtras, compareExtras, pickYear } from './cafeExtra';

describe('카페 오팬무 빼 오기', () => {
  const post = `[다시보기] 8/23 일요일 생방송 노가리요약 (7시13분쯤킴) ✔️오팬무 초록 ✔️오점무 김치볶음밥 ✔️오저무 된장찌개
본문 이야기…
[다시보기] 8/18 화요일 생방송 노가리요약
✔️오음무 콜라
✔️오팬무 ?`;
  it('날짜·값', () => {
    const r = parseCafeExtras(post, '2026-11-28');
    expect(r.map((d) => d.date)).toEqual(['2026-08-23', '2026-08-18']);
    expect(r[0].values).toEqual({ pan: '초록', jeo: '김치볶음밥, 된장찌개' });
    expect(r[1].values).toEqual({ eum: '콜라' });
  });
  it('글 올린 날의 연도 (모으기 도구가 붙인 ⟪날짜⟫)', () => {
    const t = `===== [다시보기] 8/23 일요일 생방송 노가리요약 ⟪2020-08-24 02:10 · 정리러⟫\n[다시보기] 8/23 일요일 생방송 노가리요약 ✔️오팬무 빨강\n\n===== [다시보기] 12/31 목요일 생방송 노가리요약 ⟪2021-01-01 03:00 · 정리러⟫\n[다시보기] 12/31 목요일 생방송 노가리요약 ✔️오음무 사이다`;
    expect(parseCafeExtras(t, '2026-11-28').map((d) => d.date)).toEqual(['2020-12-31', '2020-08-23']);
  });
  it('요일로 연도', () => { expect(pickYear(8, 23, 0, '2026-11-28')).toBe(2026); expect(pickYear(8, 23, 5, '2026-11-28')).toBe(2024); });
  it('시트와 비교: 같은 건 빼고, 없는 건 추가, 다른 건 고르기', () => {
    const r = compareExtras(parseCafeExtras(post, '2026-11-28'), { '2026-08-23': { pan: '초록색', jeo: '라면' }, '2026-08-18': {} });
    expect(r).toEqual([
      { date: '2026-08-23', key: 'jeo', cafe: '김치볶음밥, 된장찌개', sheet: '라면', kind: 'diff' },
      { date: '2026-08-18', key: 'eum', cafe: '콜라', sheet: '', kind: 'new' },
    ]);
  });
});
