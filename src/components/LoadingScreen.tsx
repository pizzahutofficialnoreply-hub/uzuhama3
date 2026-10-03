import { motion } from 'motion/react';
import { Tv, Sparkles } from 'lucide-react';

interface LoadingScreenProps {
  progress?: number; // 0 to 100
  statusText?: string;
  isFirstRun?: boolean;
}

export function LoadingScreen({
  progress = 25,
  statusText = '데이터를 불러오는 중입니다...',
  isFirstRun = false
}: LoadingScreenProps) {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 p-6 select-none">
      <div className="w-full max-w-xs sm:max-w-sm flex flex-col items-center text-center">
        {/* Animated App Icon: sleek, minimalist, no emoticons */}
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-purple-600/10 dark:bg-purple-500/15 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 shadow-xl relative"
        >
          <Tv className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.2]" />
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-purple-600 animate-ping opacity-60" />
        </motion.div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2 font-display text-zinc-900 dark:text-white">
          우주하마 방송 예측
        </h2>

        {/* Dynamic Status Text */}
        <p className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 min-h-[20px] mb-6 transition-all duration-200">
          {statusText}
        </p>

        {/* Progress Bar Container */}
        <div className="w-full bg-zinc-100 dark:bg-zinc-800/80 rounded-full h-3 p-0.5 overflow-hidden border border-zinc-200/80 dark:border-zinc-700/80 shadow-inner mb-2.5">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-500 rounded-full relative"
            style={{ width: `${clampedProgress}%` }}
            initial={{ width: '5%' }}
            animate={{ width: `${clampedProgress}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          </motion.div>
        </div>

        {/* Progress Percentage Badge */}
        <div className="flex items-center justify-between w-full text-xs text-zinc-400 dark:text-zinc-500 font-semibold mb-6 px-1">
          <span>진행 상황</span>
          <span className="text-purple-600 dark:text-purple-400 text-sm font-extrabold font-mono">
            {clampedProgress}%
          </span>
        </div>

        {/* First Run Notice Guide */}
        {isFirstRun && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full text-left p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1"
          >
            <div className="flex items-center gap-1.5 font-bold text-zinc-700 dark:text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>첫 실행 안내</span>
            </div>
            <p>• 첫 실행 시 필요한 데이터를 다운로드하므로 잠시 시간이 소요될 수 있습니다.</p>
            <p>• 네트워크 연결 상태에 따라 로딩 속도가 달라질 수 있습니다.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
