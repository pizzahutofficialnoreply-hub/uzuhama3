/**
 * 몰아보기 속 방송마다 '어느 편집 영상인지' 고르기 + 깨진 게임 이름 고치기
 *
 * 같은 날 편집 영상이 여러 개면(웃음참기 같은 여러 방송 묶음, 같은 날 다른 게임 영상) 그냥 첫 번째를 쓰면
 * '생방일만 같고 다른 영상'이 나옴 → 몰아보기에 들어간 그날 게임과 맞는 영상을 점수로 고름
 *  - 영상에 적힌 게임/분류(categories·category)가 그 게임 이름과 같음: +10
 *  - 영상 제목에 게임 이름이 들어 있음: +6
 *  - 영상 장르(category)가 그날 그 게임의 장르와 같음: +4 / 그날 다른 게임의 장르와만 같음: -3
 *  - 웃음참기·몰아보기·모음 같은 묶음 영상, 방송 3개 이상을 묶은 영상: -8
 *  - 장르라도 적혀 있음: +1 (동점일 때)
 */

export type Edit = { url?: string; title?: string; games?: any[]; category?: string; categories?: string[]; multiId?: string; allBroadcastDates?: string[]; isCompilation?: boolean; compilationId?: string };

const nameOf = (g: any): string => fixGameName(typeof g === 'string' ? g : g?.name || '');

/** 엑셀에서 '10:59' 같은 이름이 하루의 몇 분의 몇(0.4576…)으로 바뀌어 저장된 것 → 원래 시각으로 */
export function fixGameName(name: string): string {
  const s = String(name ?? '').trim();
  if (/^0\.\d{4,}$/.test(s)) {
    const mins = Math.round(parseFloat(s) * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  return s;
}

/** 비교용: 소문자, [제작사]·| 뒤 다른 언어 이름·괄호 빼고 글자만 */
export function normGame(s: string): string {
  return fixGameName(s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .split('|')[0]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^0-9a-z가-힣ぁ-んァ-ン一-龥]/g, '');
}

export const sameGame = (a: string, b: string) => {
  const x = normGame(a), y = normGame(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 4 && l.includes(s);
};

const BUNDLE = /웃음\s*참기|웃참|몰아\s*보기|모음/;

export function scoreEdit(e: Edit, targets: string[], logGames: { name: string; category?: string }[], gameDates?: Map<string, Set<string>>, date?: string): number {
  let sc = 0;
  // 여러 방송을 묶은 영상: 몰아보기에서도 그 게임이 그 날들에 함께 있으면(이틀에 걸쳐 한 게임) 맞는 영상, 아니면 다른 영상
  const multi = (e.allBroadcastDates || []).filter((d) => d && d !== date);
  if (e.multiId && multi.length && gameDates) {
    const hit = targets.some((t) => { const ds = gameDates.get(normGame(t)); return !!ds && multi.some((d) => ds.has(d)); });
    sc += hit ? 5 : -2;
  }
  const tags = [...(e.games || []).map(nameOf), ...(e.categories || []), e.category || ''].filter(Boolean);
  if (targets.some((t) => tags.some((x) => sameGame(x, t)))) sc += 10;
  const title = String(e.title || '');
  const nt = title.toLowerCase().replace(/[^0-9a-z가-힣:]/g, '');
  if (targets.some((t) => { const n = fixGameName(t).toLowerCase().replace(/[^0-9a-z가-힣:]/g, ''); return n.length >= 3 && nt.includes(n); })) sc += 6;
  if (e.category) {
    const cat = e.category.trim();
    const mine = logGames.filter((g) => targets.some((t) => sameGame(g.name, t)));
    const others = logGames.filter((g) => !mine.includes(g));
    if (mine.some((g) => g.category && g.category.trim() === cat)) sc += 4;
    else if (others.some((g) => g.category && g.category.trim() === cat)) sc -= 3;
    sc += 1;
  }
  if (BUNDLE.test(title) || (e.multiId && (e.allBroadcastDates?.length || 0) > 2)) sc -= 8;
  return sc;
}

/** 그날 편집 영상들 중 몰아보기 게임(targets)에 맞는 것 하나 (없으면 undefined) */
export function pickEdit(edits: Edit[], targets: string[], logGames: any[], gameDates?: Map<string, Set<string>>, date?: string): Edit | undefined {
  if (edits.length <= 1) return edits[0];
  const lg = (logGames || []).map((g: any) => ({ name: nameOf(g), category: typeof g === 'object' ? g?.category : undefined })).filter((g) => g.name);
  let best: Edit | undefined, bestSc = -Infinity;
  edits.forEach((e) => { const s = scoreEdit(e, targets, lg, gameDates, date); if (s > bestSc) { best = e; bestSc = s; } });
  return best;
}

/** 몰아보기 방송 목록 → 게임(비교용 이름)마다 들어간 날짜들 */
export function gameDatesOf(broadcasts: { date?: string; games?: any[] }[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  (broadcasts || []).forEach((b) => (b.games || []).forEach((g) => {
    const k = normGame(nameOf(g)); if (!k || !b.date) return;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(b.date);
  }));
  return m;
}
