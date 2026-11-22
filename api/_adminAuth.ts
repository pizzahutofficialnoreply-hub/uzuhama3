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
 * 모든 기기 로그아웃: 토큰 무효화 + 표시 지우기 + 기억된 기기 모두 지움
 * 기억된 기기: 코드 통과 때 고르면 30일 동안 그 기기(브라우저)에서는 코드 없이 (아래 mfaTrusted)
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

/** 코드 입력 제한 시간: 코드 입력 화면을 연 뒤 이 시간 안에 넣어야 함 (지나면 처음부터) */
export const CODE_WINDOW_MS = 3 * 60 * 1000;
export async function mfaChallenge(db: any) {
  const at = Date.now();
  await ref(db).set({ challengeAt: at }, { merge: true });
  return { expiresAt: at + CODE_WINDOW_MS };
}
const checkWindow = async (db: any, d: any) => {
  const at = Number(d.challengeAt || 0);
  if (!at || Date.now() - at > CODE_WINDOW_MS) {
    await ref(db).set({ challengeAt: 0 }, { merge: true });
    throw Object.assign(new Error('입력 시간이 지났어요. 처음부터 다시 해 주세요.'), { status: 408, expired: true });
  }
};

/** 처음 설정: 비밀 키 만들기 (아직 켜지 않음) */
export async function mfaBeginSetup(db: any, decoded: any) {
  const d = (await ref(db).get()).data() || {};
  if (d.totp && d.enabledAt) throw Object.assign(new Error('이미 켜져 있어요. 바꾸려면 먼저 지금 코드로 확인하고 다시 설정하세요.'), { status: 409 });
  const secret = b32encode(randomBytes(20));
  await ref(db).set({ pending: enc(secret), pendingAt: new Date().toISOString(), challengeAt: Date.now() }, { merge: true });
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
  await r.set({ fails: 0, lockUntil: 0, logins, challengeAt: 0 }, { merge: true }); // 한 번 통과하면 그 입력 창은 끝
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
  if (Number(d.challengeAt || 0) && Date.now() - Number(d.challengeAt) > 10 * 60 * 1000) throw Object.assign(new Error('설정 시간이 지났어요. 처음부터 다시 해 주세요.'), { status: 408, expired: true });
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
export async function mfaVerify(db: any, auth: any, decoded: any, code: string, req: any, remember?: { name: string } | null) {
  const out: any = await mfaVerifyCode(db, auth, decoded, code, req);
  if (remember) out.deviceToken = await addTrusted(db, remember.name, req);
  return out;
}
async function mfaVerifyCode(db: any, auth: any, decoded: any, code: string, req: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  if (!d.totp || !d.enabledAt) throw Object.assign(new Error('2단계 인증이 아직 설정되지 않았어요.'), { status: 400 });
  const lockUntil = Number(d.lockUntil || 0);
  if (lockUntil > Date.now()) throw Object.assign(new Error(`여러 번 틀려서 ${new Date(lockUntil).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}까지 잠겼어요.`), { status: 429 });
  await checkWindow(db, d);
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

/**
 * 신뢰 기기 (같은 기기에서는 2단계 인증 건너뛰기)
 *  - 코드로 통과할 때 '이 기기 기억하기'를 고르면, 그 기기 브라우저에만 무작위 열쇠(256비트)를 주고 서버엔 해시만 저장
 *  - 다음부터 그 열쇠로 코드 없이 통과 · 30일 지나거나 목록에서 지우거나 '모든 기기 로그아웃' 하면 끝
 *  - 기기 = 브라우저 저장소 단위 (같은 아이폰이라도 사파리와 홈 화면 앱은 따로)
 */
export const TRUST_MS = 30 * 86400000;
const hashTok = (t: string) => createHash('sha256').update(`uzuhama-trusted|${t}`).digest('hex');
const cleanName = (n: any) => String(n || '').replace(/[^\p{L}\p{N} ·()./-]/gu, '').slice(0, 40) || '이름 없는 기기';

async function addTrusted(db: any, name: string, req: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  const id = randomBytes(6).toString('hex');
  const tok = randomBytes(32).toString('hex');
  const now = Date.now();
  const list = (d.trusted || []).filter((x: any) => Number(x.expiresAt) > now);
  list.unshift({ id, h: hashTok(tok), name: cleanName(name), ua: String(req?.headers?.['user-agent'] || '').slice(0, 160), createdAt: now, lastUsedAt: now, expiresAt: now + TRUST_MS });
  await r.set({ trusted: list.slice(0, 10) }, { merge: true });
  return `${id}.${tok}`;
}

/** 신뢰 기기 열쇠로 통과 */
export async function mfaTrusted(db: any, auth: any, decoded: any, deviceToken: string, req: any) {
  const r = ref(db);
  const d = (await r.get()).data() || {};
  if (!d.totp || !d.enabledAt) throw Object.assign(new Error('2단계 인증이 아직 설정되지 않았어요.'), { status: 400 });
  if (Number(d.lockUntil || 0) > Date.now()) throw Object.assign(new Error('잠시 잠겼어요.'), { status: 429 });
  const [id, tok] = String(deviceToken || '').split('.');
  const list = d.trusted || [];
  const i = list.findIndex((x: any) => x.id === id);
  const x = list[i];
  const ok = x && tok && Number(x.expiresAt) > Date.now() && timingSafeEqual(Buffer.from(x.h), Buffer.from(hashTok(tok)));
  if (!ok) throw Object.assign(new Error('이 기기는 기억된 기기가 아니에요. 코드로 확인해 주세요.'), { status: 401, untrusted: true });
  list[i] = { ...x, lastUsedAt: Date.now() };
  await r.set({ trusted: list }, { merge: true });
  return { until: await grant(db, auth, decoded, `기억된 기기 (${x.name})`, req) };
}

/** 신뢰 기기 목록 (코드로 확인된 상태에서만) */
export async function mfaDevices(db: any, decoded: any) {
  if (!(Number(decoded?.adm2fa || 0) > Date.now())) throw Object.assign(new Error('먼저 지금 코드로 확인해 주세요.'), { status: 403 });
  const d = (await ref(db).get()).data() || {};
  return { devices: (d.trusted || []).filter((x: any) => Number(x.expiresAt) > Date.now()).map(({ h, ...rest }: any) => rest) };
}

/** 신뢰 기기 지우기 (id 또는 'all') */
export async function mfaDeviceRevoke(db: any, decoded: any, id: string) {
  if (!(Number(decoded?.adm2fa || 0) > Date.now())) throw Object.assign(new Error('먼저 지금 코드로 확인해 주세요.'), { status: 403 });
  const r = ref(db);
  const d = (await r.get()).data() || {};
  const list = id === 'all' ? [] : (d.trusted || []).filter((x: any) => x.id !== id);
  await r.set({ trusted: list }, { merge: true });
  return { devices: list.map(({ h, ...rest }: any) => rest) };
}

/** 복구 코드만 새로 받기 (인증 앱은 그대로, 예전 복구 코드는 모두 못 씀) — 지금 코드로 확인된 상태에서만 */
export async function mfaNewRecovery(db: any, decoded: any) {
  if (!(Number(decoded?.adm2fa || 0) > Date.now())) throw Object.assign(new Error('먼저 지금 코드로 확인해 주세요.'), { status: 403 });
  const r = ref(db);
  const d = (await r.get()).data() || {};
  if (!d.totp || !d.enabledAt) throw Object.assign(new Error('2단계 인증이 켜져 있지 않아요.'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  const codes = Array.from({ length: 10 }, () => randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  await r.set({ salt, recovery: codes.map((c) => ({ h: hashCode(c, salt), used: false })), recoveryAt: new Date().toISOString() }, { merge: true });
  return { recoveryCodes: codes };
}

/** 모든 기기에서 관리자 로그아웃 */
export async function mfaLogoutAll(db: any, auth: any, decoded: any) {
  await auth.setCustomUserClaims(decoded.uid, {});
  await auth.revokeRefreshTokens(decoded.uid);
  await ref(db).set({ revokedAt: new Date().toISOString(), trusted: [] }, { merge: true }); // 기억된 기기도 모두 지움
}

/** 인증 앱 다시 설정 (지금 코드로 확인된 상태에서만) */
export async function mfaReset(db: any, auth: any, decoded: any) {
  if (!(Number(decoded?.adm2fa || 0) > Date.now())) throw Object.assign(new Error('먼저 지금 코드로 확인해 주세요.'), { status: 403 });
  await ref(db).set({ totp: null, enabledAt: null, recovery: [], pending: null, trusted: [] }, { merge: true });
  await auth.setCustomUserClaims(decoded.uid, {}); // 다시 설정할 때까지 관리자 쓰기 막힘
}
