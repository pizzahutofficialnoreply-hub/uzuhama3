import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const logs = [];
p.on('console', (m) => { if (/warn|error/.test(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
await p.goto('https://uzuhama.vercel.app/', { waitUntil: 'networkidle' });
await p.waitForTimeout(8000);
const r = await p.evaluate(() => {
  const c = JSON.parse(localStorage.getItem('uzuhama_logs_cache_v4') || '{}');
  const v = Object.values(c);
  const old = v.filter((l) => l.date < '2026');
  const t = old.filter((l) => /^\d{1,2}:\d{2}/.test(l.time || ''));
  const s = v.find((l) => l.date === '2020-08-18');
  return { total: v.length, old: old.length, oldTimed: t.length, sample: s && { time: s.time, end: s.endTime, h: s.durationHours }, keys: Object.keys(localStorage).filter((k) => /logs|fs_|hist/.test(k)) };
});
console.log(JSON.stringify(r));
console.log(logs.slice(0, 15).join('\n'));
await b.close();
