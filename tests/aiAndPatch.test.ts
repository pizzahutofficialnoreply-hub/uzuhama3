import { describe, expect, it } from 'vitest';
import { queryTokens, normWord } from '../api/_aiVideo';
import { parseTime, timeFromUrl, fmtTime } from '../src/utils/aiSearch';
import { latestReleaseVersion } from '../src/utils/appVersion';
import { DEFAULT_SERVICE_GUIDE, serviceGuideFrom } from '../src/content/serviceGuide';

describe('AI 검색 키워드', () => {
  it('조사·불용어를 빼고 붙여 쓴 말도 넣음', () => {
    const t = queryTokens('귀신 점프 스케어 나오는 영상 찾아줘');
    expect(t).toContain('귀신');
    expect(t).toContain('점프');
    expect(t).not.toContain('영상');
    expect(t).not.toContain('찾아줘');
    expect(queryTokens('점프 스케어')).toContain('점프스케어');
  });
  it('조사 제거', () => {
    expect(normWord('귀신이')).toBe('귀신');
    expect(normWord('엔딩에서')).toBe('엔딩');
  });
});

describe('시간', () => {
  it('여러 형식', () => {
    expect(parseTime('12:34')).toBe(754);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('1분 5초')).toBe(65);
    expect(parseTime('abc')).toBeNull();
    expect(timeFromUrl('https://youtu.be/abcdefghijk?t=90')).toBe(90);
    expect(timeFromUrl('https://www.youtube.com/watch?v=abcdefghijk&t=1m30s')).toBe(90);
    expect(fmtTime(3723)).toBe('1:02:03');
    expect(fmtTime(65)).toBe('1:05');
  });
});

describe('앱 버전', () => {
  it('개발자 노트·미래 날짜는 빼고 가장 높은 버전', () => {
    expect(latestReleaseVersion([
      { version: '1.0.0', category: 'update', date: '2026-10-18' },
      { version: '1.2.0', category: 'dev', date: '2026-10-01' },
      { version: '1.1.0', category: 'update', date: '2026-10-30' },
      { version: '9.0.0', category: 'update', date: '2999-01-01' },
    ])).toBe('1.1.0');
  });
});

describe('서비스 이용 전 안내', () => {
  it('공지가 있으면 공지 내용, 없으면 기본 글', () => {
    expect(serviceGuideFrom({ noticeList: [{ title: '서비스 이용 전 안내', content: '# 안내' }] })).toBe('# 안내');
    expect(serviceGuideFrom({})).toBe(DEFAULT_SERVICE_GUIDE);
    expect(DEFAULT_SERVICE_GUIDE).toContain('### 1. 공식 서비스가 아닙니다');
  });
});

import { readFileSync } from 'node:fs';
import { FIRESTORE_RULES } from '../api/_firestoreRules';
describe('보안 규칙', () => {
  it('서버가 적용하는 규칙 = firestore.rules', () => {
    expect(FIRESTORE_RULES).toBe(readFileSync('firestore.rules', 'utf8'));
  });
});

import { totpAt, verifyTotp } from '../api/_adminAuth';
describe('관리자 2단계 인증 (TOTP)', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC 6238 시험용 '12345678901234567890'
  it('RFC 6238 시험값', () => {
    expect(totpAt(secret, 1)).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('앞뒤 30초까지만 맞음', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, '081804', now)).toBeGreaterThan(0);
    expect(verifyTotp(secret, '081804', now + 20000)).toBeGreaterThan(0);
    expect(verifyTotp(secret, '081804', now + 120000)).toBe(-1);
    expect(verifyTotp(secret, '12345', now)).toBe(-1);
  });
});
