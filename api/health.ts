import { setCorsHeaders } from './_cors.js';

export default function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    message: 'Vercel Serverless Function 연결 정상',
  });
}
