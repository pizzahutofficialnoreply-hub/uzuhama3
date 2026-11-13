import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { installReadStats } from './_readStats.js';

let app: App;
let serviceAccount: any = null;

if (getApps().length > 0) {
  app = getApps()[0];
} else {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawKey) {
    try {
      serviceAccount = JSON.parse(rawKey);
    } catch {
      try {
        const decoded = Buffer.from(rawKey, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
      } catch {
        try {
          serviceAccount = JSON.parse(rawKey.replace(/[\r\n\t]/g, ' '));
        } catch (error) {
          console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
        }
      }
    }

    if (serviceAccount?.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'uzuhama',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    };
  }

  app = serviceAccount?.private_key
    ? initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.projectId || 'uzuhama' })
    : initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'uzuhama' });
}

export const hasAdminCredentials = Boolean(
  (process.env.FIREBASE_SERVICE_ACCOUNT && serviceAccount?.private_key) ||
  (process.env.FIREBASE_PRIVATE_KEY && serviceAccount?.private_key)
);

export { app as adminApp };
export const db = getFirestore(app);
// DB 읽기 출처 세기 (관리자 › 시스템에서 봄)
installReadStats(db);
export const messaging = getMessaging(app);
export const auth = getAuth(app);

export { setCorsHeaders, ALLOWED_ORIGINS, isAllowedOrigin } from './_cors.js';

export async function verifyUserToken(req: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const idToken = authHeader.substring('Bearer '.length);
  try {
    return await auth.verifyIdToken(idToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired authentication token'), { status: 401 });
  }
}

export async function verifyUserTokenOptional(req: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const idToken = authHeader.substring('Bearer '.length);
    return await auth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

/**
 * 관리자 확인: 관리자 구글 계정 + 이메일 인증 + 구글로 로그인 + (기본) 2단계 인증 통과(adm2fa 가 아직 유효)
 * 토큰이 무효화됐는지(모든 기기 로그아웃)도 확인
 */
export async function verifyAdmin(req: any, opts: { require2fa?: boolean } = {}) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'), { status: 401 });
  let decodedToken: any;
  try {
    decodedToken = await auth.verifyIdToken(authHeader.substring('Bearer '.length), true); // true: 무효화된 토큰도 거부
  } catch {
    throw Object.assign(new Error('Invalid or expired authentication token'), { status: 401 });
  }
  if (decodedToken.email?.toLowerCase() !== 'saramoriyo@gmail.com' || decodedToken.email_verified !== true || decodedToken.firebase?.sign_in_provider !== 'google.com') {
    throw Object.assign(new Error('Administrator access required'), { status: 403 });
  }
  if (opts.require2fa !== false && !(Number(decodedToken.adm2fa || 0) > Date.now())) {
    throw Object.assign(new Error('2단계 인증이 필요해요'), { status: 403, code: 'mfa_required' });
  }
  return decodedToken;
}
