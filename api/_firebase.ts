import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  let serviceAccount: any = null;
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawKey) {
    try {
      serviceAccount = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
    } catch (e) {
      try {
        const cleaned = rawKey.replace(/[\r\n\t]/g, ' ');
        serviceAccount = JSON.parse(cleaned);
      } catch (err2) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
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

  if (serviceAccount && serviceAccount.private_key) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp();
  }
}

export const db = admin.firestore();
export const messaging = admin.messaging();
export const auth = admin.auth();

// CORS: allow only the site's known origins.
export function setCorsHeaders(req: any, res?: any) {
  const actualRes = res || req;
  const origin = req?.headers?.origin;
  const allowedOrigins = [
    'https://uzuhama-beta.web.app',
    'https://uzuhama.web.app',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    actualRes.setHeader('Access-Control-Allow-Origin', origin);
    actualRes.setHeader('Vary', 'Origin');
    actualRes.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  actualRes.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );
  actualRes.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret'
  );
}

// 로그인 유저 토큰 검증 헬퍼 (필수)
export async function verifyUserToken(req: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('인증 토큰이 누락되었습니다.');
  }
  const idToken = authHeader.split('Bearer ')[1];
  return await auth.verifyIdToken(idToken);
}

// 로그인 유저 토큰 검증 헬퍼 (선택 - 비로그인 지원)
export async function verifyUserTokenOptional(req: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  try {
    const idToken = authHeader.split('Bearer ')[1];
    return await auth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

// 관리자 권한 검증 헬퍼 (기존 이메일 대조 방식 유지 및 백엔드 격리)
export async function verifyAdmin(req: any) {
  const decodedToken = await verifyUserToken(req);
  if (decodedToken.email !== 'saramoriyo@gmail.com') {
    throw new Error('관리자 권한이 없습니다.');
  }
  return decodedToken;
}
