/**
 * 게임 하나: 썸네일(있으면) + 이름 + 분류 + '스팀에서 보기'
 * 썸네일이 없거나 못 불러오면 썸네일 칸을 없앤 상자로
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { gameLinkLabel, gameThumbUrl } from '../../utils/gameThumb';
import { cn } from '../../utils';

export function GameThumb({ link, className }: { link?: string | null; className?: string }) {
  const src = gameThumbUrl(link);
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={cn('object-cover bg-zinc-200 dark:bg-zinc-800 aspect-[460/215]', className)} />;
}

/** 기록 탭 '진행한 게임' 카드와 같은 모양: 큰 게임 화면 썸네일 + 분류 칩 + 밑줄 친 게임 이름 (썸네일 없으면 썸네일 칸만 없앤 상자) */
export function GameLinkCard({ name, link, category, className }: { name: string; link?: string | null; category?: string | null; className?: string }) {
  const label = gameLinkLabel(link);
  const body = (
    <>
      <GameThumb link={link} className="w-[42%] max-w-[180px] shrink-0 rounded-xl" />
      <span className="flex-1 min-w-0 flex flex-col items-start gap-1.5">
        {category && <span className="inline-block px-2 py-0.5 rounded-md text-[length:calc(11px*var(--fs,1))] font-medium bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 font-hanna font-pro">{category}</span>}
        <span className={cn('block text-[length:calc(16px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white leading-snug break-keep line-clamp-2', link && 'underline decoration-purple-500/50 underline-offset-4')}>{name}</span>
        {label && <span className="inline-flex items-center gap-0.5 text-[length:calc(12px*var(--fs,1))] text-zinc-500 dark:text-zinc-400">{label}<ExternalLink className="w-3 h-3" /></span>}
      </span>
    </>
  );
  const cls = cn('press-row flex items-center gap-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-3', className);
  return link ? <a href={link} target="_blank" rel="noreferrer" className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}
