/**
 * 관리자 확인 (화면에서 쓰는 판단)
 * - 실제 Firebase 로그인 계정이 관리자 이메일이고, 이메일 인증까지 된 경우만 관리자
 * - 기기에 저장된 표시(localStorage)만으로는 절대 관리자로 보지 않음 (누구나 바꿀 수 있으므로)
 * - 데이터 쓰기는 이와 별개로 Firestore 규칙·서버(Admin SDK 토큰 검사)가 막음
 */
export const ADMIN_EMAIL = 'saramoriyo@gmail.com';
/** 관리자 화면을 연 뒤 다시 확인(구글 재로그인)을 요구하기까지의 시간 */
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

export function isAdminUser(user: { email?: string | null; emailVerified?: boolean } | null | undefined): boolean {
  return Boolean(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL && user.emailVerified !== false);
}

export function adminSessionValid(): boolean {
  try {
    const t = Number(localStorage.getItem('admin_verified_time') || sessionStorage.getItem('admin_verified_time') || 0);
    return t > 0 && Date.now() - t < ADMIN_SESSION_MS;
  } catch {
    return false;
  }
}

export function clearAdminSession() {
  try {
    ['admin_verified_session', 'admin_verified_time'].forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  } catch { /* 무시 */ }
}
