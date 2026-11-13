import { setReadRoute } from './_readStats.js';
export const ALLOWED_ORIGINS = new Set([
  'https://uzuhama.web.app',
  'https://uzuhama-beta.web.app',
  'https://uzuhama.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // 이 프로젝트의 Vercel 미리보기 주소만 (팀 이름 '-uzuhama' 로 끝나는 것) — 남이 만든 uzuhama-xxx.vercel.app 은 차단
  if (/^https:\/\/uzuhama-[a-z0-9-]+-uzuhama\.vercel\.app$/i.test(origin)) return true;
  return false;
}

export function setCorsHeaders(req: any, res: any): boolean {
  setReadRoute(req);
  const origin = req?.headers?.origin;
  const method = req?.method;
  const url = req?.url;

  if (process.env.DEBUG_CORS || process.env.NODE_ENV !== 'production') {
    console.log(`[CORS Request] ${method} ${url} | Origin: ${origin || '(same-origin/no-origin)'}`);
  }

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-cron-secret, X-Cron-Secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
