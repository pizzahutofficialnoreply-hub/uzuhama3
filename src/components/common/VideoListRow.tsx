import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../../utils';
import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { ShortsIcon, PlaySquare, YoutubeLogo } from './MediaIcons';
import { LinkMenu, type MenuLink } from './LinkMenu';
import { useInterestTracker, noteInterest } from '../../hooks/useInterestTracker';
import type { InterestItem } from '../../utils/interest';
import { ShareButton } from './ShareButton';

/**
 * 유튜브 '동영상' 탭 같은 한 줄 목록 (왼쪽 썸네일 + 오른쪽 제목·업로드 정보)
 * - 줄 자체를 누르면 유튜브 영상으로 이동
 * - 오른쪽 끝: 생방송 버튼(보라), 쇼츠가 있으면 쇼츠 버튼(빨강)
 */
export interface VideoListRowProps {
  videoId: string;
  title: string;
  /** 줄을 눌렀을 때 열 주소 (기본: 유튜브 영상) */
  href?: string;
  /** 앞에 붙는 순번 (재생목록) */
  index?: number;
  /** 업로드 정보 앞에 붙는 보조 문구 (예: 몰아보기 · 12개 게임) */
  badge?: string;
  isCompilation?: boolean;
  liveUrl?: string;
  /** 몰아보기처럼 생방송이 여러 개인 경우: 버튼을 누르면 아래로 펼침 */
  onLiveClick?: () => void;
  liveActive?: boolean;
  shorts?: { url: string; title?: string }[];
  highlighted?: boolean;
  dense?: boolean;
  /** 유튜브 영상이 없을 때 썸네일 자리에 보여 줄 글자 (예: 날짜) */
  placeholder?: string;
  /** 업로드 정보 대신 보여 줄 문구 */
  subline?: string;
  /** 공유 글 (있으면 오른쪽에 공유 버튼) */
  shareText?: () => string;
  /** 편집본 링크 (라이브 줄: 줄을 누르면 생방송이라 편집본은 따로 버튼으로) */
  edits?: MenuLink[];
  /** 맞춤 추천용 관심 기록 */
  interest?: InterestItem;
}

export function VideoListRow({
  videoId, title, href, index, badge, isCompilation, liveUrl, onLiveClick, liveActive, shorts = [], highlighted, dense, placeholder, subline, shareText, edits = [], interest,
}: VideoListRowProps) {
  const trackRef = useInterestTracker<HTMLDivElement>(interest || null);
  const meta = useVideoMeta(videoId || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const link = href || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#');
  const upload = meta?.publishedAt ? `${toKstDate(meta.publishedAt)} · ${formatRelativeTime(meta.publishedAt)}` : '';
  const validShorts = shorts.filter((s) => s?.url);
  const iconBtn = 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer';

  return (
    <div ref={trackRef} className={cn('group relative flex items-center gap-3 rounded-2xl transition-colors', dense ? 'p-1.5' : 'p-2', highlighted ? 'bg-purple-50 dark:bg-purple-950/40' : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60')}>
      {/* 줄 전체를 덮는 링크 (버튼들은 그 위에 따로) */}
      <a href={link} target="_blank" rel="noreferrer" onClick={() => noteInterest(interest, 'play')} className="absolute inset-0 rounded-2xl" aria-label={`${title} 유튜브에서 보기`} />

      {typeof index === 'number' && (
        <span className="w-5 text-right text-[11px] text-zinc-400 tabular-nums shrink-0 pointer-events-none">{index}</span>
      )}

      <div className="relative w-[42%] max-w-[176px] sm:max-w-[200px] aspect-video rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0 pointer-events-none">
        {videoId ? (
          <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-zinc-100 dark:from-purple-950/60 dark:to-zinc-900 text-purple-700 dark:text-purple-300 text-xs font-bold tabular-nums">{placeholder}</span>
        )}
        {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold tabular-nums">
            {formatDuration(meta.durationSec)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="text-[13px] sm:text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100 line-clamp-2 break-keep">{title}</p>
        {(badge || isCompilation) && (
          <p className="mt-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
            {isCompilation && <Layers className="w-3 h-3" />}
            {badge}
          </p>
        )}
        {(subline || upload) && <p className="mt-0.5 text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{subline || upload}</p>}
      </div>

      {(liveUrl || onLiveClick || validShorts.length > 0 || shareText || edits.length > 0) && (
        <div className="relative z-10 flex flex-col sm:flex-row gap-1.5 shrink-0 items-center">
          {onLiveClick ? (
            <button
              type="button"
              onClick={onLiveClick}
              title={liveActive ? '연동 생방 접기' : '연동 생방 펼치기'}
              aria-label={liveActive ? '연동 생방 접기' : '연동 생방 펼치기'}
              aria-expanded={liveActive}
              className={cn(iconBtn, liveActive
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20')}
            >
              <PlaySquare className="w-4.5 h-4.5" />
            </button>
          ) : liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              title="생방송 (풀영상)"
              aria-label="생방송 (풀영상) 보기"
              className={cn(iconBtn, 'bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20')}
            >
              <PlaySquare className="w-4.5 h-4.5" />
            </a>
          ) : null}

          {edits.length > 0 && (
            <LinkMenu variant="icon" items={edits} label="편집본 보기" menuTitle="편집본" tone="zinc" icon={<YoutubeLogo className="w-4.5 h-4.5" />} onOpen={() => noteInterest(interest, 'engage')} />
          )}
          <LinkMenu variant="icon" items={validShorts} label="쇼츠 보기" menuTitle="쇼츠" tone="red" icon={<ShortsIcon className="w-4.5 h-4.5" />} onOpen={() => noteInterest(interest, 'engage')} />
          {shareText && (
            <ShareButton getText={shareText} title={`${title} 정보`} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl" />
          )}
        </div>
      )}
    </div>
  );
}
