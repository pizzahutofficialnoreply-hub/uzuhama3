/**
 * 영상 하나가 그 방송의 어느 게임 영상인지 (한 방송에 게임이 여럿이어도 그 영상 게임만)
 *  1) 영상에 따로 적어 둔 게임(edit.games)
 *  2) 영상에 건 게임 이름 카테고리 (2026년 영상: categories / category / game 이 게임 이름)
 *  3) 유튜브 설명창에 적힌 게임 (검색 색인의 설명 앞부분: 보통 맨 윗줄 '게임 이름 / 우주하마')
 *  4) 영상 제목에 들어 있는 게임
 *  5) 못 가리면 그날 게임 전부
 */
import { sameGame, normGame, fixGameName } from './compilationPick';
import { searchEntryOf } from '../hooks/useSearchIndex';
import { extractYoutubeId } from './urlUtils';

export type GameItem = { name: string; link?: string; category?: string };

const asGame = (g: any, log?: any): GameItem | null => {
  const name = fixGameName(typeof g === 'string' ? g : g?.name || g?.game || '');
  if (!name) return null;
  return {
    name,
    link: typeof g === 'string' ? '' : g?.link || g?.url || g?.gameUrl || g?.steamUrl || log?.gameLink || '',
    category: typeof g === 'string' ? '' : g?.category || '',
  };
};

/** 글 안에 게임 이름이 있는지 (대소문자·띄어쓰기·기호 무시, 4글자 이상이거나 통째로 같을 때) */
function mentions(text: string, name: string): boolean {
  const t = normGame(text);
  const n = normGame(name);
  if (!t || !n) return false;
  return n.length >= 4 ? t.includes(n) : t === n;
}

export function videoGames(edit: any, log: any, opts?: { desc?: string }): { games: GameItem[]; by: 'own' | 'tag' | 'desc' | 'title' | 'all' } {
  const logGames = ((Array.isArray(log?.games) && log.games.length ? log.games : log?.game ? [{ name: log.game, category: log.category }] : []) as any[])
    .map((g) => asGame(g, log)).filter(Boolean) as GameItem[];
  const own = (Array.isArray(edit?.games) ? edit.games : []).map((g: any) => asGame(g, log)).filter(Boolean) as GameItem[];
  if (own.length) {
    // 링크·장르는 그날 기록에서 채움
    return { games: own.map((g) => { const m = logGames.find((x) => sameGame(x.name, g.name)); return { ...m, ...g, link: g.link || m?.link, category: g.category || m?.category }; }), by: 'own' };
  }
  if (logGames.length <= 1) return { games: logGames, by: 'all' };

  const tags = [...(Array.isArray(edit?.categories) ? edit.categories : []), edit?.category, edit?.game].filter((x) => typeof x === 'string' && x.trim());
  const tagged = logGames.filter((g) => tags.some((t: string) => t.split(/\s*[,/]\s*/).some((p) => sameGame(p, g.name)) || sameGame(t, g.name)));
  if (tagged.length) return { games: tagged, by: 'tag' };

  const id = extractYoutubeId(edit?.url || '');
  const desc = opts?.desc ?? searchEntryOf(id)?.d ?? '';
  if (desc) {
    const hit = logGames.filter((g) => mentions(desc, g.name));
    if (hit.length) return { games: hit, by: 'desc' };
  }
  const title = String(edit?.title || '');
  const byTitle = logGames.filter((g) => mentions(title, g.name));
  if (byTitle.length) return { games: byTitle, by: 'title' };
  return { games: logGames, by: 'all' };
}
