import { ShieldAlert } from 'lucide-react';
import { HELD_TEXT } from '../../utils/held';

/** 보류된 영상 카드 위: 썸네일은 흐리게(.video-held 가 처리), 가운데 안내 */
export default function HeldCover({ compact = false }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-2 pointer-events-auto" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} role="note" aria-label={HELD_TEXT}>
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-zinc-900/75 text-white font-bold backdrop-blur-sm text-center ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>
        <ShieldAlert className={compact ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        {compact ? '신고로 잠시 이용할 수 없어요' : HELD_TEXT}
      </span>
    </div>
  );
}
