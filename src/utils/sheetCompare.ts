/**
 * 스프레드시트(우주하마 생방송 아카이브 V3) ↔ 사이트 방송 기록 대조
 * - xlsx 를 그대로 읽음 (압축 풀기 fflate + XML 은 글자로) → 브라우저·서버 둘 다에서 씀
 * - 칸: A 방송일 · C 우주하마 생방송!(링크) · D 유튜브업로드(링크) · E 게임 · F 키워드 · G 오팬무 · H 오음무 · I 오저무
 */
import { unzipSync, strFromU8 } from 'fflate';

export type SheetRow = { row: number; date: string; liveId: string; video: string; videoId: string; game: string; kw: string; pan: string; eum: string; jeo: string };

const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1] || '';
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const colOf = (ref: string) => { const m = ref.match(/^([A-Z]+)(\d+)$/); if (!m) return { c: -1, r: -1 }; let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return { c: c - 1, r: Number(m[2]) }; };

/** xlsx 첫 시트 → 행들 (값 + 링크) */
export function readXlsx(buf: Uint8Array): SheetRow[] {
  const z = unzipSync(buf);
  const get = (p: string) => (z[p] ? strFromU8(z[p]) : '');
  const shared: string[] = [];
  for (const si of get('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(unxml((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  // 첫 시트 파일 이름
  const wbRels = get('xl/_rels/workbook.xml.rels');
  const firstSheetRid = (get('xl/workbook.xml').match(/<sheet [^>]*r:id="([^"]+)"/) || [])[1];
  const target = ((wbRels.match(new RegExp(`<Relationship [^>]*Id="${firstSheetRid}"[^>]*Target="([^"]+)"`)) || wbRels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${firstSheetRid}"`)) || [])[1] || 'worksheets/sheet1.xml').replace(/^\/?xl\//, '');
  const sheetPath = `xl/${target}`;
  const xml = get(sheetPath);
  const rels = get(sheetPath.replace(/worksheets\/(.*)$/, 'worksheets/_rels/$1.rels'));
  const relTarget: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) relTarget[m[1]] = unxml(m[2]);
  for (const m of rels.matchAll(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) relTarget[m[2]] ||= unxml(m[1]);
  const links: Record<string, string> = {};
  for (const m of xml.matchAll(/<hyperlink [^>]*?ref="([A-Z]+\d+)"[^>]*?\/?>/g)) { const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1]; if (rid && relTarget[rid]) links[m[1]] = relTarget[rid]; }
  const cells = new Map<number, Map<number, { v: string; link: string }>>();
  for (const m of xml.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = (m[1].match(/r="([A-Z]+\d+)"/) || [])[1];
    if (!ref) continue;
    const { c, r } = colOf(ref);
    if (c < 0 || c > 9) continue;
    const t = (m[1].match(/t="([^"]+)"/) || [])[1];
    const inner = m[2] || '';
    const f = unxml((inner.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1] || '');
    let v = unxml((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || (inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
    if (t === 's') v = shared[Number(v)] || '';
    let link = links[ref] || '';
    const hf = f.match(/^HYPERLINK\(\s*"([^"]+)"\s*[,;]\s*"([^"]*)"/i);
    if (hf) { link = hf[1]; v = v || hf[2]; }
    if (!cells.has(r)) cells.set(r, new Map());
    cells.get(r)!.set(c, { v: v.trim(), link });
  }
  const rows: SheetRow[] = [];
  for (const [r, m] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
    const g = (c: number) => m.get(c) || { v: '', link: '' };
    const d = g(0).v.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (!d) continue;
    // 숫자로 저장된 칸: 140.0 → 140, 0.4576… (시각) → 10:59
    const txt = (x: string) => (/^\d+\.0$/.test(x) ? x.slice(0, -2) : /^0\.\d{4,}$/.test(x) ? (() => { const mins = Math.round(Number(x) * 1440); return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`; })() : x);
    rows.push({
      row: r, date: `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`,
      liveId: ytId(g(2).link), video: g(3).v, videoId: ytId(g(3).link), game: txt(g(4).v), kw: g(5).v, pan: g(6).v, eum: g(7).v, jeo: g(8).v,
    });
  }
  return rows;
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/\b(demo|데모)\b|\(데모\)/g, '').replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '');
const hangul = (s: string) => /[가-힣]/.test(s);
const latin = (s: string) => /[a-z]/i.test(s);

export type SheetDiff = { kind: 'moved' | 'nolog' | 'live' | 'video' | 'game' | 'gameLang' | 'siteOnly'; date: string; row?: number; text: string; logId?: string };

/** 대조: 시트 행마다 그날 사이트 기록과 비교 + 시트 기간 안인데 시트에 없는 사이트 기록 */
export function compareSheet(rows: SheetRow[], logs: any[]) {
  const byDate = new Map<string, any[]>();
  for (const l of logs) if (l?.date) (byDate.get(l.date) || byDate.set(l.date, []).get(l.date)!).push(l);
  const ids = (l: any, k: string) => (l[k] || []).map((v: any) => ytId(typeof v === 'string' ? v : v?.url)).filter(Boolean);
  const diffs: SheetDiff[] = [];
  let same = 0;
  const sheetDates = new Set(rows.map((r) => r.date));
  for (const r of rows) {
    const here = (byDate.get(r.date) || []).filter((l) => !l.isAbsence);
    const issues: SheetDiff[] = [];
    if (!here.length) {
      // 원래 이 날짜(아카이브 번호)였던 기록이 다른 날로 옮겨졌으면: 유튜브 시작 시각 기준으로 옮긴 것
      const moved = logs.find((l) => String(l.id || '').startsWith(`${r.date}_archive`) && l.date !== r.date);
      issues.push(moved ? { kind: 'moved', date: r.date, row: r.row, logId: moved.id, text: `${r.date} → ${moved.date} 로 옮겨짐 (유튜브 생방 시작 시각 기준)` } : { kind: 'nolog', date: r.date, row: r.row, text: `사이트에 그날 기록 없음 (시트: ${r.game.slice(0, 40)})` });
    } else {
      const vods = new Set(here.flatMap((l) => ids(l, 'vods')));
      const vids = new Set(here.flatMap((l) => [...ids(l, 'edited'), ...ids(l, 'shorts')]));
      const games: string[] = here.flatMap((l) => ((l.games || []).map((g: any) => g?.name).filter(Boolean).length ? (l.games || []).map((g: any) => g?.name) : [l.game]).filter(Boolean));
      if (r.liveId && !vods.has(r.liveId)) issues.push({ kind: 'live', date: r.date, row: r.row, logId: here[0].id, text: `생방 링크 다름 (시트 ${r.liveId} · 사이트 ${[...vods].join(', ') || '없음'})` });
      if (r.videoId && !vids.has(r.videoId)) {
        const where = [...new Set(logs.filter((l) => [...ids(l, 'edited'), ...ids(l, 'shorts')].includes(r.videoId)).map((l) => l.date))];
        issues.push({ kind: 'video', date: r.date, row: r.row, logId: here[0].id, text: `영상 「${r.video.replace(/\n/g, ' ').slice(0, 30)}」 → 사이트는 ${where.join(', ') || '어디에도 없음'}` });
      }
      for (const g of r.game.split(/[\n①②③④⑤⑥⑦⑧⑨⑩]+/).map((x) => x.trim()).filter((x) => norm(x).length >= 2)) {
        const ng = norm(g);
        const hit = games.some((x) => { const nx = norm(x); return nx && (nx === ng || (ng.length >= 4 && nx.includes(ng)) || (nx.length >= 4 && ng.includes(nx))); });
        if (hit) continue;
        // 한쪽은 한글, 한쪽은 영문 이름이면 같은 게임을 다르게 적은 것일 가능성이 큼
        const lang = games.length > 0 && games.every((x) => (hangul(x) && !hangul(g) && latin(g)) || (!hangul(x) && latin(x) && hangul(g)));
        issues.push({ kind: lang ? 'gameLang' : 'game', date: r.date, row: r.row, logId: here[0].id, text: `게임 「${g.slice(0, 40)}」 · 사이트 「${games.join(' · ').slice(0, 60) || '없음'}」` });
      }
    }
    if (issues.length) diffs.push(...issues); else same++;
  }
  const lo = rows.reduce((a, r) => (r.date < a ? r.date : a), '9999');
  const hi = rows.reduce((a, r) => (r.date > a ? r.date : a), '0000');
  for (const l of logs) {
    if (!l?.date || l.isAbsence || l.date < lo || l.date > hi || sheetDates.has(l.date)) continue;
    if (String(l.id || '').match(/^(\d{4}-\d{2}-\d{2})_archive/) && sheetDates.has(String(l.id).slice(0, 10))) continue; // 옮긴 것
    diffs.push({ kind: 'siteOnly', date: l.date, logId: l.id, text: `시트에 없는 사이트 기록 (${(l.games || []).map((g: any) => g?.name).join(', ') || l.game || '게임 없음'})` });
  }
  const count: Record<string, number> = {};
  for (const d of diffs) count[d.kind] = (count[d.kind] || 0) + 1;
  return { total: rows.length, same, range: [lo, hi], count, diffs: diffs.sort((a, b) => b.date.localeCompare(a.date)) };
}

export const SHEET_DIFF_LABEL: Record<SheetDiff['kind'], string> = {
  live: '생방 링크 다름', video: '영상 연결 다름', game: '게임 이름 다름', nolog: '사이트에 기록 없음', siteOnly: '시트에 없는 사이트 기록', gameLang: '게임 이름 표기(한·영)만 다름', moved: '날짜 옮김 (유튜브 시작 시각 기준 · 정상)',
};
