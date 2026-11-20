/**
 * 관리자 확인 (화면에서 쓰는 판단)
 * - 실제 Firebase 로그인 계정이 관리자 이메일이고, 이메일 인증까지 된 경우만 관리자
 * - 기기에 저장된 표시(localStorage)만으로는 절대 관리자로 보지 않음 (누구나 바꿀 수 있으므로)
 * - 데이터 쓰기는 이와 별개로 Firestore 규칙·서버(Admin SDK 토큰 검사)가 막음
 */
// 관리자 이메일은 화면 코드에 그대로 두지 않고 지문(SHA-256)만 (누가 코드를 열어 봐도 이메일이 안 보이게)
const ADMIN_EMAIL_SHA256 = '518910d10ee683994d006c77045522059d0e402ba82f27b29e0460cc34f78cf1';
/** 작은 SHA-256 (동기) */
function sha256(str: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = Array.from(new TextEncoder().encode(str));
  const len = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (len >>> (i * 8)) & 0xff);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const memo = new Map<string, boolean>();
/** 이 이메일이 관리자 이메일인지 (이메일 자체는 코드에 없음) */
export function isAdminEmail(email?: string | null): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (!memo.has(e)) memo.set(e, sha256(e) === ADMIN_EMAIL_SHA256);
  return memo.get(e)!;
}
/** 관리자 화면을 연 뒤 다시 확인(구글 재로그인)을 요구하기까지의 시간 */
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

export function isAdminUser(user: { email?: string | null; emailVerified?: boolean } | null | undefined): boolean {
  return Boolean(user && isAdminEmail(user.email) && user.emailVerified !== false);
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

/** 이 기기에서 관리자로 들어온 적이 있는지 (없으면 /admin 은 '없는 페이지'처럼 보임 · 보안은 서버가 따로 지킴) */
const SEEN = 'uzuhama_adm_seen';
export const adminSeenHere = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } };
export const markAdminSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* */ } };
