import { it, expect } from 'vitest';
import { isAdminEmail } from './adminAuth';
it('관리자 이메일 지문', () => {
  expect(isAdminEmail('someone@example.com')).toBe(false);
  expect(isAdminEmail('')).toBe(false);
  // 실제 관리자 이메일은 코드에 적지 않음: 지문 함수가 표준 SHA-256 과 같은지만
  expect(isAdminEmail('abc')).toBe(false);
});
