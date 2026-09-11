// api/health.ts
export default function handler(req: any, res: any) {
  // CORS 허용 설정 (Firebase Hosting 도메인에서의 호출 허용)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // 브라우저 사전 요청(OPTIONS) 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    message: 'Vercel Serverless Function 연결 정상'
  });
}