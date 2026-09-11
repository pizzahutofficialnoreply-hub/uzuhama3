const ALLOWED_ORIGINS = new Set([
  'https://uzuhama-beta.web.app',
  'https://uzuhama.web.app',
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,PATCH,DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-CSRF-Token, x-cron-secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });

  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return headers;
}

function json(data: unknown, init: ResponseInit, request: Request): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of corsHeaders(request)) headers.set(key, value);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Vercel's Node.js runtime handles this request directly.
    // Resolve the CORS preflight before loading Firebase Admin or reading env vars.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(request),
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 }, request);
    }

    try {
      const { verifyAdmin, db, messaging } = await import('../_firebase');

      const cronSecret = request.headers.get('x-cron-secret');
      if (cronSecret !== process.env.CRON_SECRET) {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return json({ error: '인증 토큰이 누락되었습니다.' }, { status: 401 }, request);
        }
        await verifyAdmin({ headers: { authorization: authHeader } });
      }

      const contentType = request.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        return json({ error: 'Content-Type must be application/json' }, { status: 415 }, request);
      }

      const body = await request.json() as {
        title?: string;
        body?: string;
        url?: string;
      };

      const tokensSnapshot = await db.collection('push_subscriptions').get();
      const tokens = tokensSnapshot.docs
        .map((doc: any) => doc.data().token)
        .filter((token: unknown): token is string => typeof token === 'string' && token.length > 0);

      if (tokens.length === 0) {
        return json({ message: '등록된 구독 토큰이 없습니다.' }, { status: 200 }, request);
      }

      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: body.title || '우주하마 알림',
          body: body.body || '',
        },
        data: {
          url: body.url || '/',
        },
      });

      return json({
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      }, { status: 200 }, request);
    } catch (error: any) {
      console.error('FCM notification send failed:', error);
      return json({
        error: error?.message || '알림 발송 중 오류가 발생했습니다.',
      }, { status: 500 }, request);
    }
  },
};

export const config = {
  runtime: 'nodejs22.x',
};
