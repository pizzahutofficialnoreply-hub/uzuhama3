import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Bookmark, EyeOff, Flag, Share } from 'lucide-react';
import { SwipeRow, type SwipeAction } from './SwipeRow';
import { requestReport } from './ItemMenu';
import { requestSave, type MyItemKind } from '../../utils/myPlaylists';
import { shareTextOrClipboard } from '../../utils/shareUtils';
import { chooseSheet, toast } from '../../utils/ui';
import { hideVideo, unhideVideo, useHidden, HIDE_DELAY } from '../../utils/hiddenVideos';
import { cn } from '../../utils';

/** 신고 버튼 → 고르기: 이 영상 가리기 / 신고하기 */
export async function reportOrHide(t: { id: string; kind: MyItemKind; title: string }) {
  const v = await chooseSheet({
    title: t.title || '이 영상',
    options: [
      { value: 'hide', label: '이 영상 가리기', desc: '이 기기에서 목록에 안 보여요. 설정 › 시청 기록 › 숨긴 영상에서 다시 볼 수 있어요.', icon: 'hide' },
      { value: 'report', label: '신고하기', desc: '잘못된 정보나 문제가 있는 영상을 알려 주세요.', icon: 'flag', danger: true },
    ],
  });
  if (v === 'hide') hideVideo(t);
  if (v === 'report') requestReport({ id: t.id, kind: t.kind, title: t.title, search: { query: '', concepts: [], understood: '' } });
}

/**
 * 영상 카드·목록 줄 감싸기
 *  ← 밀기: 신고 · 공유 (끝까지 = 공유)   → 밀기: 저장 (끝까지 = 저장)
 *  가리면 10초 동안 흐리게 + 되돌리기, 그 뒤 흐려지며 접히고 아래 영상이 올라옴
 */
export function VideoSwipe({ id, kind = 'video', title, shareText, radius = 24, className, children, onEngage, cell = false }: {
  id?: string;
  kind?: MyItemKind;
  title: string;
  shareText?: () => string;
  radius?: number;
  className?: string;
  children: ReactNode;
  onEngage?: () => void;
  /** 목록의 한 칸 자체 (가리면 칸째로 빠짐) */
  cell?: boolean;
}) {
  const h = useHidden(id);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (h.state !== 'pending') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((h.until - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [h.state, h.until]);

  if (!id || !/^[\w-]{6,}$/.test(id)) return <div className={className}>{children}</div>;
  if (h.state === 'hidden') return <div data-gone aria-hidden />;

  const share = () => {
    onEngage?.();
    const text = shareText ? shareText() : `${title}\nhttps://uzuhama.vercel.app/${kind === 'short' ? 's' : 'v'}/${id}`;
    shareTextOrClipboard(text, `${title} 정보`).catch(() => {});
  };
  const right: SwipeAction[] = [
    { key: 'report', label: '신고', icon: <Flag />, tone: 'bg-zinc-500 text-white dark:bg-zinc-600', onRun: () => { void reportOrHide({ id, kind, title }); } },
    { key: 'share', label: '공유', icon: <Share />, tone: 'bg-blue-500 text-white', onRun: share },
  ];
  const leftActs: SwipeAction[] = [
    { key: 'save', label: '저장', icon: <Bookmark />, tone: 'bg-purple-600 text-white', onRun: () => { onEngage?.(); requestSave({ id, kind, title }); } },
  ];
  const pending = h.state === 'pending';
  const leaving = h.state === 'leaving';

  return (
    <motion.div
      data-swipe-cell={cell ? '' : undefined}
      className={cn('relative', className)}
      initial={false}
      animate={leaving ? { opacity: 0, height: 0, scale: 0.94 } : { opacity: 1, height: 'auto', scale: 1 }}
      transition={leaving ? { opacity: { duration: 0.25 }, scale: { duration: 0.3 }, height: { duration: 0.42, delay: 0.18, ease: [0.4, 0, 0.2, 1] } } : { duration: 0.25 }}
      style={{ overflow: leaving ? 'hidden' : undefined }}
    >
      <SwipeRow left={leftActs} right={right} radius={radius} disabled={pending || leaving} label="영상" className="h-full">
        <div className={cn('h-full transition-[filter] duration-300', (pending || leaving) && 'video-hiding')}>{children}</div>
      </SwipeRow>
      {(pending || leaving) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-3" style={{ borderRadius: radius }} role="status">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="relative w-11 h-11">
              <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
                <circle cx="22" cy="22" r="19" fill="rgba(24,24,27,.75)" stroke="rgba(255,255,255,.18)" strokeWidth="3" />
                <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={119.4} strokeDashoffset={119.4 * (1 - left / (HIDE_DELAY / 1000))} style={{ transition: 'stroke-dashoffset .3s linear' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-white"><EyeOff className="w-4.5 h-4.5" /></span>
            </span>
            <p className="px-3 py-1 rounded-full bg-zinc-900/80 text-white text-[12px] font-bold">가렸어요 · {left}초 뒤 사라져요</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); unhideVideo(id); toast('다시 보이게 했어요'); }} className="px-4 py-1.5 rounded-full bg-white text-zinc-900 text-[12.5px] font-black shadow-md cursor-pointer">되돌리기</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
