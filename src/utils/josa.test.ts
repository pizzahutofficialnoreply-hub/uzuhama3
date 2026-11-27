import { describe, it, expect } from 'vitest';
import { josa } from './josa';

describe('josa', () => {
  it('한글 받침', () => {
    expect(josa('배틀그라운드', '을/를')).toBe('배틀그라운드를');
    expect(josa('마인크래프트', '이/가')).toBe('마인크래프트가');
    expect(josa('노가리', '은/는')).toBe('노가리는');
    expect(josa('공포 게임', '을/를')).toBe('공포 게임을');
    expect(josa('서울', '으로/로')).toBe('서울로');
    expect(josa('부산', '으로/로')).toBe('부산으로');
  });
  it('영어 (외래어 표기 끝소리)', () => {
    expect(josa('MECCHA CHAMELEON', '을/를')).toBe('MECCHA CHAMELEON을'); // 카멜레온
    expect(josa('Human Fall Flat', '을/를')).toBe('Human Fall Flat을'); // 플랫
    expect(josa('Wirm', '을/를')).toBe('Wirm을'); // 웜
    expect(josa('Librarian', '을/를')).toBe('Librarian을'); // 라이브러리언
    expect(josa('Overwatch', '을/를')).toBe('Overwatch를'); // 오버워치
    expect(josa('Minecraft', '을/를')).toBe('Minecraft를'); // 마인크래프트
    expect(josa('Roblox', '을/를')).toBe('Roblox를'); // 로블록스
    expect(josa('Lethal Company', '을/를')).toBe('Lethal Company를'); // 컴퍼니
    expect(josa('Apple', '을/를')).toBe('Apple을'); // 애플
    expect(josa('Stray', '을/를')).toBe('Stray를'); // 스트레이
    expect(josa('Phasmophobia', '을/를')).toBe('Phasmophobia를');
    expect(josa('Cake', '을/를')).toBe('Cake를'); // 케이크
    expect(josa('Game', '을/를')).toBe('Game을'); // 게임
    expect(josa('Hollow Knight', '을/를')).toBe('Hollow Knight를'); // 나이트
    expect(josa('Pacific Drive', '을/를')).toBe('Pacific Drive를'); // 드라이브
    expect(josa('PUBG: BATTLEGROUNDS', '을/를')).toBe('PUBG: BATTLEGROUNDS를'); // 그라운즈
    expect(josa('Bus', '을/를')).toBe('Bus를');
    expect(josa('Cat', '을/를')).toBe('Cat을');
    expect(josa('PC', '을/를')).toBe('PC를');
    expect(josa('Portal', '으로/로')).toBe('Portal로');
  });
  it('숫자 · 괄호 · 가나', () => {
    expect(josa('Portal 2', '을/를')).toBe('Portal 2를');
    expect(josa('Left 4 Dead 3', '을/를')).toBe('Left 4 Dead 3을');
    expect(josa('Persona 5', '을/를')).toBe('Persona 5를');
    expect(josa('2077', '을/를')).toBe('2077을');
    expect(josa('10', '이/가')).toBe('10이');
    expect(josa('후르츠 박스 (フルーツボックス)', '을/를')).toBe('후르츠 박스 (フルーツボックス)를');
    expect(josa('ラーメン', '을/를')).toBe('ラーメン을');
    expect(josa('후르츠 박스 フルーツボックス (사과게임)', '을/를')).toBe('후르츠 박스 フルーツボックス (사과게임)를');
    expect(josa('Poppy Playtime - Chapter 4', '을/를')).toBe('Poppy Playtime - Chapter 4를');
    expect(josa("'배그'", '으로/로')).toBe("'배그'로");
  });
});
