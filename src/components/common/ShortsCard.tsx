import { useHidden } from '../../utils/hiddenVideos';
import { useIsHeld } from '../../utils/held';
import HeldCover from './HeldCover';
import React, { useState } from 'react';
import { embedSrc, trackYoutubeFrame } from '../../utils/watchHistory';
import { X } from 'lucide-react';
import { cn } from '../../utils';
import { extractYoutubeId } from '../../utils/urlUtils';
import { cleanShortsTitle } from '../../utils/videoSearch';
import { GlassPlayButton, PlaySquare, YoutubeLogo } from './MediaIcons';
import { ShortsPlayer } from './ShortsPlayer';
import { ItemMenu } from './ItemMenu';
import { useInterestTracker, noteInterest } from '../../hooks/useInterestTracker';
import type { InterestItem } from '../../utils/interest';
import { formatShortsShareText } from '../../utils/shareUtils';

/**
 * 유튜브 쇼츠 카드 (세로 9:16, 유튜브 앱의 쇼츠 선반과 같은 모양)
 * - 제목은 썸네일 아래에 가로로 2줄까지 (좁은 칸에서 글자가 세로로 쪼개지지 않게 카드 폭을 고정)
 * - 썸네일을 누르면 그 자리에서 바로 재생
 */
export interface ShortsCardProps {
  url: string;
  title?: string;
  /** 제목 아래 작은 글씨 (방송일 등) */
  caption?: string;
  onCaptionClick?: () => void;
  /** 같은 방송의 생방송 다시보기 / 유튜브 편집본 링크 (있으면 아이콘으로 표시) */
  liveUrl?: string;
  editUrl?: string;
  className?: string;
  /** 있으면 썸네일을 눌렀을 때 그 자리 재생 대신 전체 화면 쇼츠로 */
  onPlay?: () => void;
  /** 공유 글 (없으면 쇼츠 제목·링크와 생방송·편집본 링크로) */
  shareText?: () => string;
  /** 맞춤 추천용 관심 기록 */
  interest?: InterestItem;
}

export function ShortsCard({ url, title, caption, onCaptionClick, liveUrl, editUrl, className, onPlay, shareText, interest }: ShortsCardProps) {
  const trackRef = useInterestTracker<HTMLDivElement>(interest || null);
  const ytId = extractYoutubeId(url);
  const [playing, setPlaying] = useState(false);
  const label = cleanShortsTitle(title) || '유튜브 쇼츠';
  const held = useIsHeld(ytId);
  const hid = useHidden(ytId);
  if (hid.state === 'hidden') return <div data-gone aria-hidden />;

  return (
    <div ref={trackRef} className={cn('flex flex-col min-w-0', held && 'video-held', className)}>
      <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 shadow-sm">
        {held && <HeldCover compact />}
        {playing && ytId && !held ? (
          <>
            <iframe
              ref={trackYoutubeFrame}
              src={embedSrc(ytId)}
              title={label}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <button
              type="button"
              onClick={() => setPlaying(false)}
              className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center cursor-pointer"
              aria-label="플레이어 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : ytId ? (
          <button
            type="button"
            onClick={() => { noteInterest(interest, 'play'); if (onPlay) onPlay(); else setPlaying(true); }}
            className="group/short absolute inset-0 w-full h-full cursor-pointer"
            aria-label={`${label} 재생`}
          >
            {/* 쇼츠의 hqdefault(4:3) 가운데 9:16 부분이 실제 세로 화면과 같음 → object-cover 로 꽉 채움 */}
            <img
              src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover/short:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
            <span className="absolute inset-0 flex items-center justify-center">
              <GlassPlayButton size="sm" />
            </span>
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs"
          >
            쇼츠 열기
          </a>
        )}
      </div>
      <div className="mt-2 flex items-start gap-0.5">
        <a
          href={ytId ? `https://www.youtube.com/shorts/${ytId}` : url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-w-0 px-0.5 text-[13px] font-bold leading-snug text-zinc-900 dark:text-white line-clamp-2 break-keep hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          title={label}
        >
          {label}
        </a>
        <ItemMenu compact id={ytId || ''} kind="short" title={label} className="-mr-1 -mt-0.5" onSave={() => noteInterest(interest, 'engage')} onShare={() => noteInterest(interest, 'engage')}
          shareText={shareText || (() => formatShortsShareText({ title: label, url: ytId ? `https://www.youtube.com/shorts/${ytId}` : url, liveUrl, editUrl }))} />
      </div>
      {(caption || liveUrl || editUrl) && (
        <div className="mt-1 px-0.5 flex items-center justify-between gap-1.5">
          {caption ? (
            onCaptionClick ? (
              <button
                type="button"
                onClick={onCaptionClick}
                className="min-w-0 truncate text-left text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 tabular-nums cursor-pointer"
              >
                {caption}
              </button>
            ) : (
              <span className="min-w-0 truncate text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{caption}</span>
            )
          ) : <span />}
          <span className="flex items-center gap-1 shrink-0">
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noreferrer" title="생방송 (풀영상)" aria-label="생방송 (풀영상) 보기"
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-colors">
                <PlaySquare className="w-3.5 h-3.5" />
              </a>
            )}
            {editUrl && (
              <a href={editUrl} target="_blank" rel="noreferrer" title="유튜브 편집본" aria-label="유튜브 편집본 보기"
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                <YoutubeLogo className="w-3.5 h-3.5" />
              </a>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/** 가로로 넘겨 보는 쇼츠 선반 (좁은 패널에서도 카드 폭을 일정하게 유지) */
export function ShortsShelf({ items }: { items: { url: string; title?: string; caption?: string; liveUrl?: string; editUrl?: string; interest?: InterestItem }[] }) {
  const [playerAt, setPlayerAt] = useState<number | null>(null);
  return (
    <div className="-mx-1 px-1 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 no-scrollbar">
      {items.map((s, i) => (
        <ShortsCard key={`${s.url}-${i}`} url={s.url} title={s.title} caption={s.caption} liveUrl={s.liveUrl} editUrl={s.editUrl} interest={s.interest} onPlay={() => setPlayerAt(i)} className="w-[136px] sm:w-[150px] shrink-0 snap-start" />
      ))}
      {playerAt !== null && <ShortsPlayer items={items} startIndex={playerAt} onClose={() => setPlayerAt(null)} />}
    </div>
  );
}
