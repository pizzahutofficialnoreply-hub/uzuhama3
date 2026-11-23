// 일회용: 스팀 공식 이름 (영어·한국어) + 그 밖의 게임 링크 페이지 제목
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
const ids = JSON.parse(readFileSync('ops/tmp/steam_ids.json', 'utf8'));
const others = JSON.parse(readFileSync('ops/tmp/other_links.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
async function get(id, l) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=${l}&cc=kr`, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429) { await sleep(60000); continue; }
      const j = await r.json();
      const d = j?.[id];
      if (!d?.success) return { ok: false };
      return { ok: true, name: d.data.name, type: d.data.type, fullgame: d.data.fullgame?.appid || null, fullname: d.data.fullgame?.name || null };
    } catch { await sleep(5000); }
  }
  return { ok: false, err: true };
}
let i = 0;
for (const id of ids) {
  const en = await get(id, 'english'); await sleep(1600);
  const ko = en.ok ? await get(id, 'koreana') : { ok: false }; if (en.ok) await sleep(1600);
  out[id] = { en: en.name || null, ko: ko.name || null, ok: en.ok, type: en.type || null, fullgame: en.fullgame, fullname: en.fullname, err: en.err || false };
  if (++i % 50 === 0) { console.log(i, '/', ids.length); writeFileSync('out/steam.json', JSON.stringify(out)); }
}
writeFileSync('out/steam.json', JSON.stringify(out));
// 스팀 밖 링크: 페이지 제목
const titles = {};
for (const u of others) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko,en' } });
    const h = (await r.text()).slice(0, 200000);
    const og = (h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1];
    const t = (h.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
    titles[u] = { status: r.status, final: r.url, og: og || null, title: (t || '').trim().slice(0, 200) };
  } catch (e) { titles[u] = { status: 0, err: String(e?.message || e).slice(0, 80) }; }
  await sleep(300);
}
writeFileSync('out/other_titles.json', JSON.stringify(titles));
console.log('done', Object.keys(out).length, Object.keys(titles).length);
