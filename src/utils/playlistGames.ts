import type { Playlist } from '../hooks/usePlaylists';

/**
 * 재생목록 이름으로 게임 채우기
 * "우주하마 배틀그라운드" 재생목록에 들어 있는데 게임이 안 붙은 영상 → 배틀그라운드 하나를 기본으로 붙임
 * - 방송 기록에 있는 게임 이름과 맞으면 그 게임(링크·장르 포함)을 그대로 사용
 * - 기록에 없으면, 묶음 이름(병맛게임·모음·하이라이트 등)이 아닐 때만 재생목록 이름을 게임 이름으로 사용
 */

export type GameInfo = { name: string; link?: string; category?: string };

const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s\-_:·.,!?'"()[\]{}~]/g, '');

// 게임 하나가 아니라 여러 게임을 묶은 재생목록 이름에 들어가는 말
const GENERIC = [
  '게임', '병맛', '모음', '하이라이트', '몰아보기', '쇼츠', 'shorts', '클립', '레전드', '풀영상', '생방', '다시보기',
  '합방', '노래', '먹방', '공포', '인디', '추천', 'best', '베스트', '편집', '영상', '짤', '공지', 'vlog', '브이로그',
  '시리즈', '스토리', '정주행', '컨텐츠', '콘텐츠', '모바일', '스팀', '플래시', '시참', '종합', '기타', '기념', '이벤트',
];

/** 방송 기록 전체에서 게임 이름 사전 */
export function buildGameCatalog(logs: any): Map<string, GameInfo> {
  const map = new Map<string, GameInfo>();
  const list = Array.isArray(logs) ? logs : Object.values(logs || {});
  const add = (g: any) => {
    const name = String((typeof g === 'string' ? g : g?.name) || '').trim();
    if (!name) return;
    const k = norm(name);
    if (k.length < 2) return;
    const prev = map.get(k);
    if (!prev || (!prev.link && g?.link) || (!prev.category && g?.category)) {
      map.set(k, { name, link: g?.link || prev?.link || '', category: g?.category || prev?.category || '' });
    }
  };
  list.forEach((log: any) => {
    if (log?.game) add(log.game);
    (Array.isArray(log?.games) ? log.games : []).forEach(add);
  });
  return map;
}

/** 재생목록 이름 → 게임 (없으면 null) */
export function inferPlaylistGame(title: string, catalog: Map<string, GameInfo>): GameInfo | null {
  const rest = String(title || '')
    .replace(/우주하마(의)?/g, ' ')
    .replace(/[\[\]()【】「」|/]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const k = norm(rest);
  if (k.length < 2) return null;
  // 1) 기록에 있는 게임과 정확히 같음
  const exact = catalog.get(k);
  if (exact) return exact;
  // 2) 기록의 게임 이름이 재생목록 이름에 들어 있거나 그 반대 (가장 긴 것)
  let best: GameInfo | null = null;
  let bestLen = 0;
  for (const [gk, g] of catalog) {
    if (gk.length < 3) continue;
    if ((k.includes(gk) || gk.includes(k)) && gk.length > bestLen) { best = g; bestLen = gk.length; }
  }
  if (best) return best;
  // 3) 기록에 없으면 묶음 이름이 아닐 때만 이름 그대로
  if (GENERIC.some((w) => k.includes(norm(w)))) return null;
  if (rest.length > 30) return null;
  return { name: rest, link: '', category: '' };
}

/** 영상 ID → 재생목록에서 추론한 게임 */
export function buildPlaylistGameMap(playlists: Playlist[] | undefined, catalog: Map<string, GameInfo>): Map<string, GameInfo> {
  const out = new Map<string, GameInfo>();
  (playlists || []).forEach((p) => {
    const g = inferPlaylistGame(p.title, catalog);
    if (!g) return;
    p.items.forEach((it) => { if (!out.has(it.videoId)) out.set(it.videoId, g); });
  });
  return out;
}
