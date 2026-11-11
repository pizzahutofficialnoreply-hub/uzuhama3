import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
const sa = JSON.parse(process.env.SA || '{}');
initializeApp({ credential: cert(sa), storageBucket: 'uzuhama.firebasestorage.app' });
try {
  const b = getStorage().bucket();
  const [ex] = await b.exists(); console.log('bucket exists', ex);
  if (ex) { await b.file('probe/hello.txt').save('hi', { contentType: 'text/plain' }); console.log('write ok'); const [m] = await b.file('probe/hello.txt').getMetadata(); console.log('size', m.size); }
} catch (e) { console.log('ERR', String(e.message || e).slice(0, 300)); }
try { const [bs] = await getStorage().bucket('uzuhama.appspot.com').exists(); console.log('appspot exists', bs); } catch (e) { console.log('appspot ERR', String(e.message).slice(0, 200)); }
