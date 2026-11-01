import React, { useState } from 'react';
import { X } from 'lucide-react';
import { GlassPlayButton } from './MediaIcons';
import { ViewStyleToggle } from './ViewStyleToggle';
import type { ViewStyle } from '../../hooks/useViewStyle';

/**
 * 유튜브 앱의 재생목록 화면 모양 (재생목록과 몰아보기가 함께 사용)
 * 왼쪽(모바일은 위): 썸네일을 크게 흐린 배경 + 큰 썸네일(누르면 그 자리 재생) + 제목 + 게시자 + 정보 + 재생 버튼
 * 오른쪽(모바일은 아래): 목록 / 카드 전환과 내용
 */
export function CollectionPanel({
  thumbnail, title, metaLine, description, channelTitle = '우주하마', channelThumbnail, embedSrc, playLabel, onClose, countLabel,
  viewStyle, onViewStyleChange, children, ariaLabel, showPublisher = true,
}: {
  thumbnail: string;
  title: string;
  metaLine: string;
  description?: string;
  channelTitle?: string;
  channelThumbnail?: string;
  /** 재생 버튼을 눌렀을 때 썸네일 자리에 띄울 유튜브 embed 주소 (autoplay 포함) */
  embedSrc: string;
  playLabel: string;
  onClose: () => void;
  countLabel: string;
  viewStyle: ViewStyle;
  onViewStyleChange: (v: ViewStyle) => void;
  children: React.ReactNode;
  ariaLabel: string;
  /** '게시자: 우주하마' 줄 표시 (몰아보기는 숨김) */
  showPublisher?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <section
      className="overflow-hidden rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.30)]"
      aria-label={ariaLabel}
    >
      <div className="md:flex">
        <div className="relative isolate overflow-hidden text-white md:w-[360px] md:shrink-0">
          <img src={thumbnail} alt="" aria-hidden="true" className="absolute inset-0 -z-10 w-full h-full object-cover scale-150 blur-3xl saturate-150" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/45 to-black/75" />
          <div className="p-4 sm:p-5 md:sticky md:top-20">
            <div className="flex justify-end -mt-1 -mr-1 mb-2">
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md flex items-center justify-center cursor-pointer" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/40 shadow-xl">
              {playing ? (
                <iframe
                  src={embedSrc}
                  title={title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button type="button" onClick={() => setPlaying(true)} className="group/thumb absolute inset-0 cursor-pointer" aria-label={playLabel}>
                  <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center"><GlassPlayButton size="lg" /></span>
                </button>
              )}
            </div>
            <h3 className="mt-4 text-xl sm:text-2xl font-extrabold leading-tight break-keep">{title}</h3>
            {showPublisher && <div className="mt-3 flex items-center gap-2 text-sm text-white/85">
              {channelThumbnail ? (
                <img src={channelThumbnail} alt="" className="w-7 h-7 rounded-full object-cover bg-white/20" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">우</span>
              )}
              <span>게시자: <b className="font-semibold text-white">{channelTitle}</b></span>
            </div>}
            <p className="mt-2 text-xs sm:text-[13px] text-white/70">{metaLine}</p>
            {description && <p className="mt-2 text-xs text-white/70 line-clamp-3 whitespace-pre-line">{description}</p>}
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="mt-4 w-full h-11 rounded-full bg-white text-zinc-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><path d="M9.6 5.9c-.7-.42-1.6.08-1.6.9v10.4c0 .82.9 1.32 1.6.9l8.66-5.2a1.05 1.05 0 0 0 0-1.8L9.6 5.9z" /></svg>
              {playLabel}
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 px-1.5 sm:px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-1.5 mb-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{countLabel}</span>
            <ViewStyleToggle value={viewStyle} onChange={onViewStyleChange} />
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
