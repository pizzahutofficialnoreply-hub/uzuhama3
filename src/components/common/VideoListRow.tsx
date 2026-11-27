import { VideoSwipe } from './VideoSwipe';
import { useIsHeld, HELD_TEXT } from '../../utils/held';
import { ShieldAlert } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useProgress, withResume } from '../../utils/watchHistory';
import { ProgressBar } from './ProgressBar';
import { Layers } from 'lucide-react';
import { cn } from '../../utils';
import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { ShortsIcon, PlaySquare, YoutubeLogo } from './MediaIcons';
import { LinkMenu, type MenuLink } from './LinkMenu';
import { useInterestTracker, noteInterest } from '../../hooks/useInterestTracker';
import type { InterestItem } from '../../utils/interest';
import { ItemMenu } from './ItemMenu';
import { usePrefs } from '../../utils/userPrefs';
import { openAiCard } from './AiCardExpand';

/**
 * 유튜브 '동영상' 탭 같은 한 줄 목록 (왼쪽 썸네일 + 오른쪽 제목·업로드 정보)
 * - 줄 자체를 누르면 유튜브 영상으로 이동
 * - 오른쪽 끝: 생방송 버튼(보라), 쇼츠가 있으면 쇼츠 버튼(빨강)
 */
export interface VideoListRowProps {
  /** 누르면 이 함수로 (펼친 카드 안에서: 그 카드를 이 영상으로 바꿈) */
  onPick?: (videoId: string, title: string, sub?: string) => void;
  /** 사이트 안 재생이어도 오른쪽 생방송·쇼츠 버튼을 보여 줌 (몰아보기 안 목록) */
  actions?: boolean;
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
  /** 생방송 링크들 (하나면 바로, 여러 개면 골라 보기) */
  lives?: MenuLink[];
  /** 저장 버튼에 쓸 종류 (기본: 관심 기록의 종류 또는 영상) */
  saveKind?: 'video' | 'live' | 'short';
}

export function VideoListRow({
  actions, onPick, videoId, title, href, index, badge, isCompilation, liveUrl, onLiveClick, liveActive, shorts = [], highlighted, dense, placeholder, subline, shareText, edits = [], interest, saveKind, lives = [],
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

  // 사이트에서 보던 곳이 있으면 거기부터
  const rawLink = href || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
  const link = rawLink ? withResume(rawLink, videoId) : undefined;
  const progress = useProgress(videoId || '');
  const upload = meta?.publishedAt ? `${toKstDate(meta.publishedAt)} · ${formatRelativeTime(meta.publishedAt)}` : '';
  const validShorts = shorts.filter((s) => s?.url);
  const held = useIsHeld(videoId);
  const prefs = usePrefs();
  const thumbRef = useRef<HTMLDivElement>(null);
  // 사이트 안에서 재생: 유튜브 영상(그 영상 주소)일 때만 — 다른 주소(치지직 등)는 링크로
  const sitePlay = prefs.listPlay !== 'link' && Boolean(videoId) && (!href || (href.includes(videoId) && /youtu/.test(href)));
  const iconBtn = 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer';

  return (
    <VideoSwipe id={videoId} kind={(saveKind || interest?.kind || 'video') as any} title={title} shareText={shareText} radius={16} cell onEngage={() => noteInterest(interest, 'engage')}>
    <div ref={trackRef} data-ai-card={onLiveClick && isCompilation ? videoId : undefined} className={cn('press-row group relative flex gap-3.5 rounded-[18px]', dense ? 'items-center' : 'items-start', held && 'video-held', dense ? 'p-2' : 'px-2.5 py-2', highlighted && 'bg-purple-50 dark:bg-purple-950/40')}>
      {/* 줄 전체를 덮는 링크 (버튼들은 그 위에 따로) */}
      <a href={link} target="_blank" rel="noreferrer" onClick={(e) => {
        noteInterest(interest, 'play');
        if (onPick && videoId) { e.preventDefault(); onPick(videoId, title, subline || upload || badge); return; }
        if (!sitePlay) return;
        e.preventDefault();
        openAiCard(videoId, title, thumbRef.current, subline || upload || badge);
      }} className="absolute inset-0 rounded-[18px]" aria-label={sitePlay ? `${title} 펼쳐서 보기` : `${title} 유튜브에서 보기`} />

      {typeof index === 'number' && (
        <span className="w-5 text-right text-[length:calc(11px*var(--fs,1))] text-zinc-400 tabular-nums shrink-0 pointer-events-none">{index}</span>
      )}

      <div ref={thumbRef} data-thumb data-ai-card={onLiveClick && isCompilation ? undefined : videoId || undefined} className={cn("relative aspect-video rounded-[14px] overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 pointer-events-none", dense ? 'w-[40%] max-w-[168px] sm:max-w-[196px]' : 'w-[44%] max-w-[240px] sm:max-w-[260px]')}>
        {videoId ? (
          <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-bold tabular-nums">{placeholder}</span>
        )}
        {typeof meta?.durationSec === 'number' && meta.durationSec > 0 && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[length:calc(11px*var(--fs,1))] font-bold tabular-nums">
            {formatDuration(meta.durationSec)}
          </span>
        )}
        {progress > 0.02 && <ProgressBar value={progress} />}
      </div>

      <div className={cn("min-w-0 flex-1 pointer-events-none", !dense && 'pt-0.5')}>
        {held && <p className="mb-0.5 text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{HELD_TEXT}</p>}
        <p className={cn("font-bold font-hanna font-pro leading-snug text-zinc-900 dark:text-zinc-100 line-clamp-2 break-keep", dense ? 'text-[length:calc(14px*var(--fs,1))] sm:text-[length:calc(15px*var(--fs,1))]' : 'text-[length:calc(14.5px*var(--fs,1))] sm:text-[length:calc(15.5px*var(--fs,1))]')}>{title}</p>
        {(badge || isCompilation) && (
          <p className="mt-1 text-[length:calc(12px*var(--fs,1))] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
            {isCompilation && <Layers className="w-3 h-3" />}
            {badge}
          </p>
        )}
        {(subline || upload) && <p className="mt-0.5 text-[length:calc(12.5px*var(--fs,1))] sm:text-[length:calc(13px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 tabular-nums">{subline || upload}</p>}
      </div>

      {sitePlay && !onLiveClick && !actions ? (
        <div className={cn("relative z-10 shrink-0 -mr-1.5", !dense && '-mt-1')}>
          <ItemMenu id={videoId} kind={saveKind || interest?.kind || 'video'} title={title} className="w-9 h-9 rounded-full" shareText={shareText} onShare={() => noteInterest(interest, 'engage')} />
        </div>
      ) : (videoId || liveUrl || lives.length > 0 || onLiveClick || validShorts.length > 0 || shareText || edits.length > 0) && (
        <div className={cn('relative z-10 gap-1.5 shrink-0 items-center',
          // 휴대폰: 버튼이 많으면 두 줄로 (줄이 너무 길어지지 않게)
          [Boolean(liveUrl || onLiveClick || lives.length), edits.length > 0, validShorts.length > 0, Boolean(videoId)].filter(Boolean).length > 3
            ? 'grid grid-cols-2 sm:flex sm:flex-row' : 'flex flex-col sm:flex-row')}>
          {onLiveClick ? (
            <button
              type="button"
              onClick={onLiveClick}
              title={isCompilation ? '자세히 보기' : liveActive ? '연동 생방 접기' : '연동 생방 펼치기'}
              aria-label={isCompilation ? '자세히 보기' : liveActive ? '연동 생방 접기' : '연동 생방 펼치기'}
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
          ) : lives.length > 0 ? (
            <LinkMenu variant="icon" items={lives} label="생방송 보기" menuTitle="생방송" tone="purple" icon={<PlaySquare className="w-4.5 h-4.5" />} onOpen={() => noteInterest(interest, 'play')} />
          ) : null}

          {edits.length > 0 && (
            <LinkMenu variant="icon" items={edits} label="편집본 보기" menuTitle="편집본" tone="zinc" icon={<YoutubeLogo className="w-4.5 h-4.5" />} onOpen={() => noteInterest(interest, 'engage')} />
          )}
          <LinkMenu variant="icon" items={validShorts} label="쇼츠 보기" menuTitle="쇼츠" tone="red" icon={<ShortsIcon className="w-4.5 h-4.5" />} onOpen={() => noteInterest(interest, 'engage')} />
          <ItemMenu id={videoId} kind={saveKind || interest?.kind || 'video'} title={title} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl" shareText={shareText} onShare={() => noteInterest(interest, 'engage')} />
        </div>
      )}
    </div>
    </VideoSwipe>
  );
}
