/**
 * 관리자 2단계 인증 (함수 아님: '_' 로 시작)
 *
 * 1단계: 구글 로그인 (관리자 계정 + 이메일 인증 + 구글로 로그인한 경우만)
 * 2단계: 인증 앱(구글 OTP·Microsoft Authenticator·1Password 등)의 6자리 코드 (TOTP, RFC 6238)
 *   - 비밀 키는 서버에서만 만들고 AES-256-GCM 으로 암호화해 저장 (화면·DB 에 평문 없음)
 *   - 같은 코드 두 번 못 씀 (재사용 방지), 틀리면 5번마다 15분 잠금 → 계속 틀리면 더 길게
 *   - 복구 코드 10개 (한 번씩만, 해시로만 저장): 휴대폰을 잃어버렸을 때
 * 통과하면: Firebase 토큰에 'adm2fa'(만료 시각) 를 붙임 → 서버 API 와 Firestore 보안 규칙이 둘 다 이걸 확인
 *   (구글 계정만 뺏겨도, 이 코드 없이는 관리자 API·DB 쓰기가 막힘)
 * 모든 기기 로그아웃: 토큰 무효화 + 표시 지우기
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MFA_SESSION_MS = 4 * 3600 * 1000; // 2단계 인증 한 번에 4시간
// 인증 앱마다 한글 이름을 못 읽는 경우가 있어 영문으로 (아이폰 '암호' 앱 등)
const ISSUER = 'Uzuhama';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function b32decode(s: string) {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) { const i = B32.indexOf(c); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
/** 맞으면 그 시간 칸 번호, 아니면 -1 (앞뒤 30초까지 허용) */
export function verifyTotp(secretB32: string, code: string, now = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return -1;
  const step = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) {
    const exp = totpAt(secretB32, step + d);
    if (timingSafeEqual(Buffer.from(exp), Buffer.from(c))) return step + d;
  }
  return -1;
}

function key() {
  const raw = process.env.ADMIN_2FA_KEY || process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw) throw new Error('암호화 키가 없어요');
  return createHash('sha256').update(`uzuhama-admin-2fa|${raw}`).digest();
}
function enc(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), data: data.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
function dec(o: any) {
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(o.iv, 'base64'));
  d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8');
}
const hashCode = (c: string, salt: string) => createHash('sha256').update(`${salt}|${String(c).replace(/[^0-9A-Z]/gi, '').toUpperCase()}`).digest('hex');

const ref = (db: any) => db.collection('admin_security').doc('main');

export async function mfaStatus(db: any, decoded: any) {
  const d = (await ref(db).get()).data() || {};
  const lockedUntil = Number(d.lockUntil || 0);
  return {
    enabled: Boolean(d.totp && d.enabledAt),
    enabledAt: d.enabledAt || null,
    recoveryLeft: (d.recovery || []).filter((r: any) => !r.used).length,
    sessionUntil: Number(decoded?.adm2fa || 0),
    locked: lockedUntil > Date.now() ? lockedUntil : 0,
    recentLogins: (d.logins || []).slice(0, 10),
  };
}

/** 처음 설정: 비밀 키 만들기 (아직 켜지 않음) */
export async function mfaBeginSetup(db: any, decoded: any) {
  const d = (await ref(db).get()).data() || {};
  if (d.totp && d.enabledAt) throw Object.assign(new Error('이미 켜져 있어요. 바꾸려면 먼저 지금 코드로 확인하고 다시 설정하세요.'), { status: 409 });
  const secret = b32encode(randomBytes(20));
  await ref(db).set({ pending: enc(secret), pendingAt: new Date().toISOString() }, { merge: true });
  const label = encodeURIComponent(`${ISSUER}:admin`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
  return { uri, secret };
}

async function grant(db: any, auth: any, decoded: any, how: string, req: any) {
  const until = Date.now() + MFA_SESSION_MS;
  await auth.setCustomUserClaims(decoded.uid, { adm2fa: until });
  const r = ref(db);
  const d = (await r.get()).data() || {};
  const ua = String(req?.headers?.['user-agent'] || '').slice(0, 160);
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim().replace(/\.\d+$/, '.*'); // 끝자리는 가림
  const logins = [{ at: new Date().toISOString(), how, ua, ip }, ...(d.logins || [])].slice(0, 30);
  await r.set({ fails: 0, lockUntil: 0, logins }, { merge: true });
  return until;
}

async function fail(db: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  const fails = Number(d.fails || 0) + 1;
  // 5번마다 잠금: 15분 → 1시간 → 6시간
  const lock = fails % 5 === 0 ? [15, 60, 360][Math.min(2, fails / 5 - 1)] * 60000 : 0;
  await r.set({ fails, ...(lock ? { lockUntil: Date.now() + lock } : {}) }, { merge: true });
  return { fails, lock };
}

/** 처음 설정 마무리: 앱의 코드로 확인 → 켜기 + 복구 코드 */
export async function mfaConfirmSetup(db: any, auth: any, decoded: any, code: string, req: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  if (Number(d.lockUntil || 0) > Date.now()) throw Object.assign(new Error('잠시 잠겼어요. 나중에 다시 해 주세요.'), { status: 429 });
  if (!d.pending) throw Object.assign(new Error('설정을 다시 시작해 주세요.'), { status: 400 });
  const secret = dec(d.pending);
  const step = verifyTotp(secret, code);
  if (step < 0) { await fail(db); throw Object.assign(new Error('코드가 맞지 않아요. 휴대폰 시간이 맞는지도 확인해 주세요.'), { status: 401 }); }
  const salt = randomBytes(16).toString('hex');
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  await r.set({ totp: enc(secret), pending: null, enabledAt: new Date().toISOString(), lastStep: step, salt, recovery: codes.map((c) => ({ h: hashCode(c, salt), used: false })) }, { merge: true });
  const until = await grant(db, auth, decoded, '설정', req);
  return { recoveryCodes: codes, until };
}

/** 로그인 때마다: 6자리 코드 또는 복구 코드 */
export async function mfaVerify(db: any, auth: any, decoded: any, code: string, req: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  if (!d.totp || !d.enabledAt) throw Object.assign(new Error('2단계 인증이 아직 설정되지 않았어요.'), { status: 400 });
  const lockUntil = Number(d.lockUntil || 0);
  if (lockUntil > Date.now()) throw Object.assign(new Error(`여러 번 틀려서 ${new Date(lockUntil).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}까지 잠겼어요.`), { status: 429 });
  const raw = String(code || '').trim();
  if (/^\d{6}$/.test(raw.replace(/\s/g, ''))) {
    const step = verifyTotp(dec(d.totp), raw);
    if (step < 0 || step <= Number(d.lastStep || 0)) {
      const f = await fail(db);
      throw Object.assign(new Error(step >= 0 ? '이미 쓴 코드예요. 다음 코드를 기다려 주세요.' : `코드가 맞지 않아요.${f.lock ? ' 잠시 잠겼어요.' : ''}`), { status: 401 });
    }
    await r.set({ lastStep: step }, { merge: true });
    return { until: await grant(db, auth, decoded, '인증 앱', req) };
  }
  // 복구 코드
  const h = hashCode(raw, d.salt || '');
  const list = d.recovery || [];
  const i = list.findIndex((x: any) => !x.used && x.h === h);
  if (i < 0) { const f = await fail(db); throw Object.assign(new Error(`코드가 맞지 않아요.${f.lock ? ' 잠시 잠겼어요.' : ''}`), { status: 401 }); }
  list[i] = { ...list[i], used: true, usedAt: new Date().toISOString() };
  await r.set({ recovery: list }, { merge: true });
  return { until: await grant(db, auth, decoded, '복구 코드', req), recoveryLeft: list.filter((x: any) => !x.used).length };
}

/** 모든 기기에서 관리자 로그아웃 */
export async function mfaLogoutAll(db: any, auth: any, decoded: any) {
  await auth.setCustomUserClaims(decoded.uid, {});
  await auth.revokeRefreshTokens(decoded.uid);
  await ref(db).set({ revokedAt: new Date().toISOString() }, { merge: true });
}

/** 인증 앱 다시 설정 (지금 코드로 확인된 상태에서만) */
export async function mfaReset(db: any, auth: any, decoded: any) {
  if (!(Number(decoded?.adm2fa || 0) > Date.now())) throw Object.assign(new Error('먼저 지금 코드로 확인해 주세요.'), { status: 403 });
  await ref(db).set({ totp: null, enabledAt: null, recovery: [], pending: null }, { merge: true });
  await auth.setCustomUserClaims(decoded.uid, {}); // 다시 설정할 때까지 관리자 쓰기 막힘
}
