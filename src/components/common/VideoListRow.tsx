import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../../utils';
import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { ShortsIcon, PlaySquare } from './MediaIcons';

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
}

export function VideoListRow({
  videoId, title, href, index, badge, isCompilation, liveUrl, onLiveClick, liveActive, shorts = [], highlighted, dense,
}: VideoListRowProps) {
  const meta = useVideoMeta(videoId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const link = href || `https://www.youtube.com/watch?v=${videoId}`;
  const upload = meta?.publishedAt ? `${toKstDate(meta.publishedAt)} · ${formatRelativeTime(meta.publishedAt)}` : '';
  const validShorts = shorts.filter((s) => s?.url);
  const iconBtn = 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer';

  return (
    <div className={cn('group relative flex items-center gap-3 rounded-2xl transition-colors', dense ? 'p-1.5' : 'p-2', highlighted ? 'bg-purple-50 dark:bg-purple-950/40' : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60')}>
      {/* 줄 전체를 덮는 링크 (버튼들은 그 위에 따로) */}
      <a href={link} target="_blank" rel="noreferrer" className="absolute inset-0 rounded-2xl" aria-label={`${title} 유튜브에서 보기`} />

      {typeof index === 'number' && (
        <span className="w-5 text-right text-[11px] text-zinc-400 tabular-nums shrink-0 pointer-events-none">{index}</span>
      )}

      <div className="relative w-[42%] max-w-[176px] sm:max-w-[200px] aspect-video rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0 pointer-events-none">
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover" />
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
        {upload && <p className="mt-0.5 text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{upload}</p>}
      </div>

      {(liveUrl || onLiveClick || validShorts.length > 0) && (
        <div className="relative z-10 flex flex-col sm:flex-row gap-1.5 shrink-0">
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

          {validShorts.length === 1 && (
            <a
              href={validShorts[0].url}
              target="_blank"
              rel="noreferrer"
              title={validShorts[0].title || '쇼츠 보기'}
              aria-label="쇼츠 보기"
              className={cn(iconBtn, 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20')}
            >
              <ShortsIcon className="w-4.5 h-4.5" />
            </a>
          )}
          {validShorts.length > 1 && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                title={`쇼츠 ${validShorts.length}개`}
                aria-label={`쇼츠 ${validShorts.length}개 보기`}
                className={cn(iconBtn, 'relative bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20')}
              >
                <ShortsIcon className="w-4.5 h-4.5" />
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">{validShorts.length}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-[0_14px_36px_-6px_rgba(0,0,0,0.28),0_3px_8px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_44px_-6px_rgba(0,0,0,0.85),0_3px_10px_rgba(0,0,0,0.5)] overflow-hidden z-30 flex flex-col">
                  <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-700">쇼츠 선택</div>
                  {validShorts.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer" className="px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-b border-zinc-100 dark:border-zinc-700 last:border-0 truncate">
                      {s.title || `쇼츠 ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
