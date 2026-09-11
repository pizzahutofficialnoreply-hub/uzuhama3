import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

let app: App;

if (getApps().length > 0) {
  app = getApps()[0];
} else {
  let serviceAccount: any = null;
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawKey) {
    try {
      serviceAccount = JSON.parse(rawKey);
    } catch (error) {
      try {
        serviceAccount = JSON.parse(rawKey.replace(/[\r\n\t]/g, ' '));
      } catch (error2) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
      }
    }

    if (serviceAccount?.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'uzuhama',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  app = serviceAccount?.private_key
    ? initializeApp({ credential: cert(serviceAccount) })
    : initializeApp();
}

export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const auth = getAuth(app);

const ALLOWED_ORIGINS = new Set([
  'https://uzuhama-beta.web.app',
  'https://uzuhama.web.app',
]);

export function setCorsHeaders(req: any, res: any) {
  const origin = req?.headers?.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

export async function verifyUserToken(req: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('인증 토큰이 누락되었습니다.');
  }

  const idToken = authHeader.substring('Bearer '.length);
  return auth.verifyIdToken(idToken);
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

export async function verifyAdmin(req: any) {
  const decodedToken = await verifyUserToken(req);
  if (decodedToken.email !== 'saramoriyo@gmail.com') {
    throw new Error('관리자 권한이 없습니다.');
  }
  return decodedToken;
}
