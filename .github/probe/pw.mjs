import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
let fsReq = 0;
p.on('request', (r) => { if (/firestore\.googleapis/.test(r.url())) fsReq++; });
const check = async (label) => {
  const r = await p.evaluate(() => {
    const v = Object.values(JSON.parse(localStorage.getItem('uzuhama_logs_cache_v4') || '{}'));
    const old = v.filter((l) => l.date < '2026');
    return { total: v.length, old: old.length, oldTimed: old.filter((l) => /^\d{1,2}:\d{2}/.test(l.time || '')).length };
  });
  console.log(label, JSON.stringify(r), 'firestore requests', fsReq);
};
await p.goto('https://uzuhama.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(20000); await check('first');
fsReq = 0; await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(15000); await check('reload');
await b.close();
