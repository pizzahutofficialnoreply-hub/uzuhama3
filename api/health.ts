const ALLOWED_ORIGINS = new Set([
  'https://uzuhama-beta.web.app',
  'https://uzuhama.web.app',
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token, X-Api-Version',
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

export default {
  fetch(request: Request): Response {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders(request),
      });
    }

    return new Response(JSON.stringify({
      status: 'ok',
      serverTime: new Date().toISOString(),
      message: 'Vercel Serverless Function 연결 정상',
    }), {
      status: 200,
      headers: new Headers({
        ...Object.fromEntries(corsHeaders(request)),
        'Content-Type': 'application/json; charset=utf-8',
      }),
    });
  },
};

export const config = {
  runtime: 'nodejs22.x',
};
