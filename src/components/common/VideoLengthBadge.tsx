import { useVideoMeta, formatDuration, toKstDate, formatRelativeTime } from '../../hooks/useVideoDuration';
import { cn } from '../../utils';

/** 썸네일 오른쪽 아래 재생 시간 (홈·동영상 영상 카드와 같은 모양·표기) */
export function VideoLengthBadge({ id, className }: { id?: string | null; className?: string }) {
  const meta = useVideoMeta(id);
  if (!meta?.durationSec) return null;
  return (
    <span className={cn('absolute bottom-2 right-2 z-20 bg-black/80 text-white text-xs font-bold px-1.5 py-1 rounded backdrop-blur-sm shadow-sm select-none tabular-nums pointer-events-none', className)}>
      {formatDuration(meta.durationSec)}
    </span>
  );
}

/** 제목 아래 '업로드일 · 경과 시간' (영상 카드와 같은 표기) */
export function VideoUploadLine({ id, className }: { id?: string | null; className?: string }) {
  const meta = useVideoMeta(id);
  if (!meta?.publishedAt) return null;
  return (
    <p className={cn('mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums', className)}>
      <span>{toKstDate(meta.publishedAt)}</span>
      <span aria-hidden="true" className="mx-1">·</span>
      <span>{formatRelativeTime(meta.publishedAt)}</span>
    </p>
  );
}
