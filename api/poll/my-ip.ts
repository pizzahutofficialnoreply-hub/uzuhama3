export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forwarded = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    ip = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = forwarded[0].trim();
  } else {
    ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  }

  // IPv6 매핑(::ffff:192.168.x.x) 정제
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ ip });
}
