import { videoGames } from '../../utils/videoGames';
import { useMemo, useState } from 'react';
import { ItemMenu } from './ItemMenu';
import { GameTitle } from './GameTitle';
import { YoutubeLogo, PlaySquare } from './MediaIcons';
import { useVideoMeta, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { withResume } from '../../utils/watchHistory';

/**
 * 펼친 영상 화면의 제목 칸: 검색 탭 영상 카드와 같은 모양
 * (제목 · ⋯ 메뉴 / 업로드일 · 경과 / 게임 태그(링크·분류) / 유튜브로 보기)
 * 생방송·쇼츠 버튼은 아래 '이 영상의 생방송'·'연결된 쇼츠'에 있으니 여기서는 뺌
 */
const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const key = (s: string) => String(s || '').trim().toLowerCase();

/** 영상 id 로 방송 기록에서 찾기 (어느 날 · 생방송/편집/쇼츠) */
export function findVideo(id: string, logs?: Record<string, any>) {
  if (!logs) return null;
  for (const l of Object.values(logs)) {
    if (!l || l.isAbsence) continue;
    for (const [kind, list] of [['live', l.vods], ['video', l.edited], ['short', l.shorts]] as const) {
      const it = (list || []).find((v: any) => ytId(v?.url) === id);
      if (it) return { log: l, it, kind };
    }
  }
  return null;
}

export function VideoCardInfo({ id, title, sub, logs, card, onTitle, hideGames }: { id: string; title: string; sub?: string; logs?: Record<string, any>; card?: boolean; onTitle?: (el: Element | null) => void; /** 카드 확장: 아래 게임 카드와 겹쳐서 알약 숨김 */ hideGames?: boolean }) {
  const meta = useVideoMeta(id);
  const [all, setAll] = useState(false);
  const found = useMemo(() => findVideo(id, logs), [id, logs]);

  // 게임: 영상에 따로 적힌 게임이 있으면 그것, 없으면 그 방송 게임 · 링크는 그 방송 → 다른 방송 순으로 찾음
  const games = useMemo(() => {
    if (!found) return [] as any[];
    // 편집 영상은 그 영상 게임만 (게임 이름 카테고리 → 설명창 → 제목), 생방송은 그날 게임 전부
    const base = found.kind === 'video' ? videoGames(found.it, found.log).games : (found.it.games?.length ? found.it.games : found.log.games || []).filter((g: any) => g?.name);
    const lists = Object.values(logs || {});
    return base.map((g: any) => {
      let link = g.link || (found.log.games || []).find((x: any) => key(x.name) === key(g.name))?.link;
      if (!link) for (const l of lists) { const x = (l?.games || []).find((y: any) => key(y.name) === key(g.name) && y.link); if (x) { link = x.link; break; } }
      return { ...g, link };
    });
  }, [found, logs]);

  const url = found?.it?.url || `https://www.youtube.com/watch?v=${id}`;
  const isLive = found?.kind === 'live';
  const shown = games.length > 2 && !all ? games.slice(0, 2) : games;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        {card ? (
          <button type="button" onClick={(e) => onTitle?.(e.currentTarget)} className="flex-1 min-w-0 text-left font-bold text-sm sm:text-base text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer">{title}</button>
        ) : (
          <h2 className="flex-1 min-w-0 text-[length:calc(16px*var(--fs,1))] font-black leading-snug text-zinc-900 dark:text-white break-keep">{title}</h2>
        )}
        <ItemMenu id={id} kind={isLive ? 'live' : 'video'} title={title} className="-mr-1.5 -mt-0.5" />
      </div>
      {meta?.publishedAt ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          <span>{toKstDate(meta.publishedAt)}</span><span aria-hidden className="mx-1">·</span><span>{formatRelativeTime(meta.publishedAt)}</span>
          {found?.log?.date && !isLive && !card && <><span aria-hidden className="mx-1">·</span><span>생방일 {found.log.date}</span></>}
        </p>
      ) : sub ? <p className="mt-1 text-[length:calc(12px*var(--fs,1))] text-zinc-500 tabular-nums">{sub}</p> : null}

      {games.length > 0 && !hideGames && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {shown.map((g: any, i: number) => {
            const cat = g.category && key(g.category) !== key(g.name) && g.category !== '종합' ? g.category : '';
            const chip = (
              <span className={`px-2 py-0.5 text-[length:calc(10px*var(--fs,1))] rounded-full select-none inline-flex items-center gap-1 font-hanna font-pro ${g.link ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                <span><GameTitle text={g.name} link={g.link} /></span>
                {cat && <span className="opacity-60 font-normal border-l border-current pl-1 font-hanna font-pro">{cat}</span>}
              </span>
            );
            return g.link ? <a key={i} href={g.link} target="_blank" rel="noopener noreferrer">{chip}</a> : <div key={i}>{chip}</div>;
          })}
          {games.length > 2 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="px-2 py-0.5 text-[length:calc(10px*var(--fs,1))] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer font-hanna font-pro">
              {all ? '접기' : `+${games.length - 2}개 더보기`}
            </button>
          )}
        </div>
      )}

      <a href={withResume(url, id)} target="_blank" rel="noreferrer"
        className="mt-4 w-full flex justify-center items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all font-hanna font-pro bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs">
        {isLive ? <PlaySquare className="w-4 h-4 text-purple-600 dark:text-purple-400" /> : <YoutubeLogo className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />} <span className="font-hanna font-pro">유튜브로 보기</span>
      </a>
    </div>
  );
}
