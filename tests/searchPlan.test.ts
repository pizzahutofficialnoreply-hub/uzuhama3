import { describe, it, expect } from 'vitest';
import { planQuery, makeDoc, scoreDoc, groupWeights, isHit, hasTerm, stripRequest, autoAliases, sq } from '../src/utils/searchPlan';

const ON = { smart: true, alias: true, natural: true };
// 가짜 영상 목록 (테스트는 흔하고 IQ 는 드묾)
const titles = [
  '우주하마 IQ 테스트 결과 공개',
  '내 IQ 는 148 인증합니다',
  '과자 테스트 해봤습니다',
  '4차 테스트 서버 들어가 봄',
  '테스트 서버 버그 모음',
  '스피드 테스트',
  'Unique 아이템 테스트',
  '배틀그라운드 치킨 먹기',
  '눈사람 만들기 대회 [크리스마스 특집]',
  '여름 바다 물놀이 게임',
  '그냥 아무 게임',
];
const docs = titles.map((t) => makeDoc({ title: t }));
const df = (term: string) => docs.filter((d) => hasTerm(d.title, d.titleSq, term)).length;
const run = (q: string) => {
  const plan = planQuery(q, ON, df);
  const w = groupWeights(plan, df, docs.length);
  return titles
    .map((t, i) => ({ t, s: scoreDoc(plan, w, docs[i]) }))
    .filter((x) => isHit(plan, x.s))
    .sort((a, b) => Number(b.s.phrase) - Number(a.s.phrase) || b.s.rel - a.s.rel)
    .map((x) => x.t);
};

describe('검색어 해석', () => {
  it('영어 단어는 단어 단위로만 (iq ≠ unique)', () => {
    expect(hasTerm('unique 아이템', sq('unique 아이템'), 'iq')).toBe(false);
    expect(hasTerm('내 iq는 148', sq('내 iq는 148'), 'iq')).toBe(true);
  });
  it('IQ 테스트: 붙은 것 → IQ 만 → (테스트만 맞는 건 빼기)', () => {
    const r = run('IQ 테스트');
    expect(r[0]).toBe('우주하마 IQ 테스트 결과 공개');
    expect(r).toContain('내 IQ 는 148 인증합니다');
    expect(r).not.toContain('과자 테스트 해봤습니다');
    expect(r).not.toContain('Unique 아이템 테스트');
    expect(hasTerm('iq20 천재', 'iq20천재', 'iq')).toBe(true);
  });
  it('띄어쓰기 없이 쳐도 나눠서 (iq테스트)', () => {
    expect(run('iq테스트')[0]).toBe('우주하마 IQ 테스트 결과 공개');
  });
  it('게임 줄임말', () => {
    expect(run('배그')).toContain('배틀그라운드 치킨 먹기');
  });
  it('자연어: 부탁하는 말 빼기', () => {
    expect(stripRequest('겨울 특집 추천해줘')).toBe('겨울 특집');
    expect(stripRequest('무서운 거 보여줘')).toBe('무서운');
    expect(stripRequest('여름 느낌 영상 있어?')).toBe('여름');
  });
  it('자연어: 겨울특집 추천해줘 → 눈사람·크리스마스', () => {
    const plan = planQuery('겨울특집 추천해줘', ON, df);
    expect(plan.natural).toBe(true);
    expect(run('겨울특집 추천해줘')).toContain('눈사람 만들기 대회 [크리스마스 특집]');
  });
  it('자연어: 피서 → 여름', () => {
    expect(run('피서 가는 느낌 추천')).toContain('여름 바다 물놀이 게임');
  });
  it('끄면 그대로', () => {
    const plan = planQuery('배그 추천해줘', { smart: false, alias: false, natural: false }, df);
    expect(plan.natural).toBe(false);
    expect(plan.groups.map((g) => g.variants.length)).toEqual([1, 1]);
  });
  it('게임 이름으로 줄임말 만들기', () => {
    const a = autoAliases(['휴먼 : 폴 플랫 (Human: Fall Flat)', 'Totally Accurate Battle Simulator']);
    expect(a['휴폴플']).toBeTruthy();
    expect(a['tabs']).toBeTruthy();
  });
});
