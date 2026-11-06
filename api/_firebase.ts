import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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

export async function verifyAdmin(req: any) {
  const decodedToken = await verifyUserToken(req);
  if (decodedToken.email?.toLowerCase() !== 'saramoriyo@gmail.com' || decodedToken.email_verified !== true) {
    throw Object.assign(new Error('Administrator access required'), { status: 403 });
  }
  return decodedToken;
}
