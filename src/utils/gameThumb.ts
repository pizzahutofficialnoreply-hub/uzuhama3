/**
 * 게임 썸네일: 스팀 상점 링크면 스팀 앱 번호로 대표 그림(가로 460×215)을 씀
 * 스팀이 아니거나 링크가 없으면 null → 썸네일 칸 없이 이름만 있는 상자로
 */
import type { GameItem } from '../types';

export function steamAppId(link?: string | null): string | null {
  const m = String(link || '').match(/store\.steampowered\.com\/app\/(\d+)/i) || String(link || '').match(/steamcommunity\.com\/app\/(\d+)/i);
  return m ? m[1] : null;
}

export function gameThumbUrl(link?: string | null): string | null {
  const id = steamAppId(link);
  return id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` : null;
}

/** 링크 주소로 '어디서 보기' 이름 */
export function gameLinkLabel(link?: string | null): string {
  const u = String(link || '');
  if (/steampowered|steamcommunity/i.test(u)) return '스팀에서 보기';
  if (/apps\.apple\.com/i.test(u)) return '앱 스토어에서 보기';
  if (/play\.google\.com/i.test(u)) return '구글 플레이에서 보기';
  if (/roblox\.com/i.test(u)) return '로블록스에서 보기';
  if (/itch\.io/i.test(u)) return 'itch.io에서 보기';
  return u ? '게임 페이지 보기' : '';
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣ぁ-ヿ一-鿿]/g, '');

/** AI 가 적은 게임 이름을 방송 기록의 게임(링크 있음)과 맞춤 */
export function matchGameItem(name: string, items: GameItem[] | undefined | null): GameItem | null {
  const n = norm(name);
  if (!n || !items?.length) return null;
  return items.find((g) => norm(g.name) === n)
    || items.find((g) => { const x = norm(g.name); return x.length >= 3 && n.length >= 3 && (x.startsWith(n) || n.startsWith(x)); })
    || null;
}
