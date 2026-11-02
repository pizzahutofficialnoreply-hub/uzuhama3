import { motion } from 'motion/react';

interface LoadingScreenProps {
  progress?: number; // 0 to 100
  statusText?: string;
  isFirstRun?: boolean;
}

/**
 * 들어올 때 잠깐 보이는 화면: 앱 아이콘 + 이름 + 얇은 진행 막대만
 * (index.html 의 첫 화면과 같은 모양이라 바뀌는 티가 나지 않음)
 */
export function LoadingScreen({ progress = 25, statusText = '불러오는 중', isFirstRun = false }: LoadingScreenProps) {
  const p = Math.max(4, Math.min(100, Math.round(progress)));
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-black select-none" role="status" aria-live="polite">
      <motion.img
        src="/icon-192.png"
        alt=""
        width={84}
        height={84}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-[84px] h-[84px] rounded-[22px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10"
      />
      <h1 className="mt-5 text-[17px] font-bold tracking-tight text-zinc-900 dark:text-white">우주하마 방송 예측</h1>

      <div className="mt-6 w-36 h-[3px] rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-purple-600 dark:bg-purple-400"
          initial={{ width: '4%' }}
          animate={{ width: `${p}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <p className="mt-3 h-4 text-[11px] text-zinc-400 dark:text-zinc-500">
        {isFirstRun ? '처음 한 번만 기록을 받아 와요' : statusText}
      </p>
    </div>
  );
}
