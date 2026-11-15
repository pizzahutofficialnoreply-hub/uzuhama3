// 임시: 기록의 게임 링크 점검 (스팀 appdetails·검색, 앱스토어 lookup, 그 밖은 페이지 제목)
import fs from 'fs';
const games = JSON.parse(fs.readFileSync('.github/workflows/_games.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { steam: {}, search: {}, apple: {}, web: {} };
const get = async (u, json = true) => { for (let t = 0; t < 3; t++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ko,en' } }); if (r.status === 429) { await sleep(60000); continue; } return { status: r.status, body: json ? await r.json().catch(() => null) : await r.text() }; } catch (e) { await sleep(3000); } } return { status: 0, body: null }; };
const apps = [...new Set(games.map((g) => (g.link.match(/store\.steampowered\.com\/app\/(\d+)/) || [])[1]).filter(Boolean))];
console.log('steam apps', apps.length);
for (let i = 0; i < apps.length; i++) {
  const id = apps[i];
  const { body } = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`);
  const d = body?.[id];
  out.steam[id] = d?.success ? { name: d.data.name, type: d.data.type, full: d.data.fullgame || null, coming: d.data.release_date?.coming_soon || false } : { gone: true };
  if (i % 50 === 0) console.log('steam', i);
  await sleep(1300);
}
// 링크 없는 것·스팀이 아닌 것: 스팀에서 이름으로
for (const g of games.filter((g) => !/store\.steampowered\.com\/app\/\d+/.test(g.link))) {
  if (out.search[g.name]) continue;
  const { body } = await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(g.name)}&l=english&cc=KR`);
  out.search[g.name] = (body?.items || []).slice(0, 5).map((x) => ({ id: x.id, name: x.name }));
  await sleep(1300);
}
for (const g of games.filter((g) => /apps\.apple\.com/.test(g.link))) {
  const id = (g.link.match(/id(\d+)/) || [])[1]; if (!id || out.apple[id]) continue;
  const { body } = await get(`https://itunes.apple.com/lookup?id=${id}&country=kr`);
  out.apple[id] = body?.results?.[0] ? { name: body.results[0].trackName } : { gone: true };
}
for (const g of games.filter((g) => g.link && !/store\.steampowered\.com|apps\.apple\.com/.test(g.link))) {
  if (out.web[g.link]) continue;
  const { status, body } = await get(g.link, false);
  const t = String(body || '');
  const title = (t.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || t.match(/<title[^>]*>([^<]*)</i) || [])[1] || '';
  out.web[g.link] = { status, title: title.trim().slice(0, 200) };
}
fs.writeFileSync('gamecheck.json', JSON.stringify(out));
console.log('done');
