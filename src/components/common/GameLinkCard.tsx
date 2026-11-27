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

export function GameLinkCard({ name, link, category, className }: { name: string; link?: string | null; category?: string | null; className?: string }) {
  const label = gameLinkLabel(link);
  const body = (
    <>
      <GameThumb link={link} className="w-[38%] max-w-[150px] shrink-0 rounded-xl" />
      <span className="flex-1 min-w-0">
        <span className="block text-[length:calc(14px*var(--fs,1))] font-bold font-hanna font-pro text-zinc-900 dark:text-white leading-snug break-keep line-clamp-2">{name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[length:calc(12px*var(--fs,1))] text-zinc-500 dark:text-zinc-400">
          {category && <span className="truncate">{category}</span>}
          {category && label && <span aria-hidden>·</span>}
          {label && <span className="inline-flex items-center gap-0.5 shrink-0">{label}<ExternalLink className="w-3 h-3" /></span>}
        </span>
      </span>
    </>
  );
  const cls = cn('press-row flex items-center gap-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 p-2.5', className);
  return link ? <a href={link} target="_blank" rel="noreferrer" className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}
