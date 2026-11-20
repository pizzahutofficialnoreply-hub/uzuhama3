import { describe, it, expect } from 'vitest';
import { nameMatch } from '../../api/_gameCheck';

describe('게임 이름 대조: 표기만 다른 것은 같은 게임', () => {
  const same: [string, string][] = [
    ['집으로 가는 길 The Way Home', 'The Way Home | 집으로 가는 길'],
    ['실격입니다 Disqualified', '실격입니다 (데모)'],
    ['PRATFALL 프랫폴', '프랫폴 (데모)'],
    ['오오오 Öoo', 'Öoo'],
    ['여동생 운전 가르치기 Teach my little sister how to drive', '여동생 운전 가르치기 (데모)'],
    ['파놉티콘 Panopticon', 'Panopticon (파놉티콘)'],
    ['우주암석파괴자 Space Rock Breaker', 'Space Rock Breaker (우주 암석 파괴자)'],
    ['북쪽의 도살자 Butcher of the North', 'Butcher of the north (북쪽의 도살자)'],
    ['가자! 나무늘보 Go! Sloth', 'Go! Sloth (가자! 나무늘보)'],
    ['집 놀이 Playing House おままごと', 'Playing House (집 놀이)'],
    ['촉수전쟁 Tentacle Wars', 'Tentacle Wars(플래시게임)'],
    ['All Abroad! 기차 방어 특급 All Aboard! The Train Defense Express', 'All Aboard! 기차 방어 특급'],
    ['디 엘리베이터 The elevator', 'The elevator 더 엘리베이터'],
    ['본타 The Paddy Field たんぼ', 'たんぼ'],
    ['자기야 나 달라진 거 없어? 8번남친', '8番彼氏 (8번남친)'],
    ['AI가 그린 속담 마추기io', 'AI가 그린 속담 맞추기'],
  ];
  it.each(same)('%s = %s', (a, b) => expect(nameMatch(a, b)).toBe(true));
  const diff: [string, string][] = [
    ['Barbotine 바보틴', '바나툰: 보물을 찾아서!'],
    ['챗GPT VS 제미나이', '간장 라멘 포에버'],
    ['공포게임', 'Floor 9'],
    ['악의 Dread Neighbor', '恶意'],
  ];
  it.each(diff)('%s ≠ %s', (a, b) => expect(nameMatch(a, b)).toBe(false));
});
