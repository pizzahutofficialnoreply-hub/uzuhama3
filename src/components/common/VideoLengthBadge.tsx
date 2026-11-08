import { useVideoMeta } from '../../hooks/useVideoDuration';
import { cn } from '../../utils';

/** 영상 길이를 'N시간 M분' 으로 (유튜브에서 한 번 받아 온 길이는 서버·기기에 저장해 두고 다시 씀) */
export function lengthLabel(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return m > 0 ? `${m}분` : `${sec}초`;
}

/** 썸네일 오른쪽 아래 길이 표시 */
export function VideoLengthBadge({ id, className }: { id?: string | null; className?: string }) {
  const meta = useVideoMeta(id);
  if (!meta?.durationSec) return null;
  return (
    <span className={cn('absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/80 text-white text-[11px] font-semibold tabular-nums pointer-events-none', className)}>
      {lengthLabel(meta.durationSec)}
    </span>
  );
}

/** 글 옆에 붙이는 길이 */
export function VideoLengthText({ id, className }: { id?: string | null; className?: string }) {
  const meta = useVideoMeta(id);
  if (!meta?.durationSec) return null;
  return <span className={cn('text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0', className)}>{lengthLabel(meta.durationSec)}</span>;
}
