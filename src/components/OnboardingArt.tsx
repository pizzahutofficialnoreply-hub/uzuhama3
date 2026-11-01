import React from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, Heart, Play, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '../utils';
import type { KeyboardLayout } from '../utils/userPrefs';

/**
 * 처음 시작 화면의 단계별 그림 (발표 자료처럼 하나씩 등장하는 작은 인포그래픽)
 * 사이트 색(흰색·짙은 회색 + 보라 포인트)에 맞춤
 */
const card = 'rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/70 dark:border-white/10 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]';
const pop = (delay: number) => ({
  initial: { opacity: 0, y: 14, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay },
});
const float = (d: number, amp = 6) => ({
  animate: { y: [0, -amp, 0] },
  transition: { duration: d, repeat: Infinity, ease: 'easeInOut' as const },
});

function Welcome() {
  const chips = [
    { icon: TrendingUp, label: '방송 확률 72%', cls: 'left-0 top-6', d: 0.35 },
    { icon: CalendarDays, label: '11월 방송 12회', cls: 'right-0 top-0', d: 0.5 },
    { icon: Play, label: '추천 영상', cls: 'left-4 bottom-2', d: 0.65 },
    { icon: Sparkles, label: '유력 시간 21시', cls: 'right-2 bottom-8', d: 0.8 },
  ];
  return (
    <div className="relative h-full w-full max-w-[300px] mx-auto">
      <motion.div {...pop(0.1)} className="absolute inset-0 m-auto w-24 h-24 rounded-[30px] bg-purple-600 text-white shadow-xl shadow-purple-600/25 flex items-center justify-center text-4xl font-black">
        <motion.span {...float(3.2, 4)}>우</motion.span>
      </motion.div>
      {chips.map(({ icon: Icon, label, cls, d }) => (
        <motion.div key={label} {...pop(d)} className={cn('absolute', cls)}>
          <motion.div {...float(3 + d * 2, 5)} className={cn(card, 'flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200')}>
            <Icon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            {label}
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

function Terms() {
  return (
    <div className="relative h-full w-full max-w-[260px] mx-auto flex items-center justify-center">
      <motion.div {...pop(0.1)} className={cn(card, 'w-52 p-4 space-y-2.5')}>
        <div className="h-2.5 w-24 rounded-full bg-zinc-800 dark:bg-zinc-200" />
        {[0.9, 0.75, 0.85, 0.6].map((w, i) => (
          <motion.div key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }} style={{ width: `${w * 100}%`, originX: 0 }} className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        ))}
        <div className="pt-2 space-y-2">
          {['이용약관', '개인정보'].map((t, i) => (
            <motion.div key={t} {...pop(0.9 + i * 0.25)} className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 + i * 0.25, type: 'spring', stiffness: 400 }} className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
              </motion.span>
              {t} 동의
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function Notice() {
  const tags = ['비공식 팬 사이트', '예측은 참고용', '권리는 원작자에게'];
  return (
    <div className="relative h-full w-full max-w-[280px] mx-auto flex flex-col items-center justify-center gap-4">
      <motion.div {...pop(0.1)} className="relative">
        <motion.div {...float(2.6, 5)} className="w-20 h-20 rounded-full bg-purple-600/10 dark:bg-purple-400/15 flex items-center justify-center">
          <Heart className="w-10 h-10 text-purple-600 dark:text-purple-400 fill-current" />
        </motion.div>
        <motion.span animate={{ scale: [1, 1.6], opacity: [0.35, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-full border-2 border-purple-500" />
      </motion.div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {tags.map((t, i) => (
          <motion.span key={t} {...pop(0.4 + i * 0.15)} className={cn(card, 'px-3 py-1.5 text-[11px] font-bold text-zinc-700 dark:text-zinc-200 rounded-full')}>{t}</motion.span>
        ))}
      </div>
    </div>
  );
}

function KeyboardArt({ layout }: { layout: KeyboardLayout }) {
  const key = 'h-7 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-[11px] font-bold flex items-center justify-center text-zinc-700 dark:text-zinc-200 shadow-[0_1px_0_rgba(0,0,0,0.08)]';
  const cj = layout === 'cheonjiin' || layout === 'naratgeul';
  const grid = layout === 'naratgeul'
    ? ['ㄱ', 'ㄴ', 'ㅏㅓ', 'ㄹ', 'ㅁ', 'ㅗㅜ', 'ㅅ', 'ㅇ', 'ㅣ', '획', 'ㅡ', '쌍']
    : ['ㅣ', 'ㆍ', 'ㅡ', 'ㄱㅋ', 'ㄴㄹ', 'ㄷㅌ', 'ㅂㅍ', 'ㅅㅎ', 'ㅈㅊ', '', 'ㅇㅁ', ''];
  const rows = [['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'], ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'], ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']];
  return (
    <div className="h-full w-full max-w-[300px] mx-auto flex flex-col items-center justify-center gap-3">
      <motion.div {...pop(0.1)} className={cn(card, 'px-3 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2')}>
        <span className="line-through decoration-red-400 text-zinc-400">현강</span>
        <span className="text-zinc-400">→</span>
        <span className="text-purple-600 dark:text-purple-400">현상</span>
      </motion.div>
      <motion.div key={cj ? 'grid' : 'rows'} {...pop(0.25)} className="w-full rounded-2xl bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200/70 dark:border-white/10 p-2">
        {cj ? (
          <div className="grid grid-cols-3 gap-1.5">
            {grid.map((k, i) => <div key={i} className={cn(key, !k && 'opacity-0')}>{k}</div>)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex justify-center gap-1">
                {r.map((k) => (
                  <motion.div
                    key={k}
                    animate={k === 'ㅅ' || k === 'ㄱ' ? { backgroundColor: ['rgba(147,51,234,0)', 'rgba(147,51,234,0.25)', 'rgba(147,51,234,0)'] } : undefined}
                    transition={{ duration: 1.6, repeat: Infinity, delay: k === 'ㄱ' ? 0 : 0.8 }}
                    className={cn(key, 'w-[9%]')}
                  >
                    {k}
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Intro() {
  return (
    <div className="h-full w-full max-w-[320px] mx-auto grid grid-cols-2 gap-2.5 content-center">
      {/* 확률 */}
      <motion.div {...pop(0.1)} className={cn(card, 'p-3 flex flex-col items-center')}>
        <svg viewBox="0 0 44 44" className="w-14 h-14 -rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-zinc-200 dark:stroke-zinc-700" />
          <motion.circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-purple-600 dark:stroke-purple-400"
            strokeDasharray={113} initial={{ strokeDashoffset: 113 }} animate={{ strokeDashoffset: 113 * 0.28 }} transition={{ delay: 0.4, duration: 1.2, ease: 'easeOut' }} />
        </svg>
        <span className="mt-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">방송 확률</span>
      </motion.div>
      {/* 달력 */}
      <motion.div {...pop(0.25)} className={cn(card, 'p-3')}>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 28 }, (_, i) => (
            <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.02 }}
              className={cn('aspect-square rounded-[3px]', [2, 5, 9, 11, 16, 19, 23, 26].includes(i) ? 'bg-purple-500/80' : 'bg-zinc-200 dark:bg-zinc-700')} />
          ))}
        </div>
        <span className="mt-2 block text-center text-[11px] font-bold text-zinc-600 dark:text-zinc-300">방송 기록</span>
      </motion.div>
      {/* 분석 */}
      <motion.div {...pop(0.4)} className={cn(card, 'p-3')}>
        <div className="h-14 flex items-end gap-1">
          {[0.75, 0.7, 0.8, 0.85, 1, 0.3, 0.6].map((h, i) => (
            <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.7 + i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
              style={{ height: `${h * 100}%`, originY: 1 }} className="flex-1 rounded-t-[3px] bg-blue-500/80" />
          ))}
        </div>
        <span className="mt-2 block text-center text-[11px] font-bold text-zinc-600 dark:text-zinc-300">상세 분석</span>
      </motion.div>
      {/* 영상 */}
      <motion.div {...pop(0.55)} className={cn(card, 'p-3')}>
        <div className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <motion.div key={i} {...float(2.4 + i * 0.3, 2)} className="aspect-video rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
              <Play className="w-3 h-3 text-zinc-500 fill-current" />
            </motion.div>
          ))}
        </div>
        <span className="mt-2 block text-center text-[11px] font-bold text-zinc-600 dark:text-zinc-300">추천 영상</span>
      </motion.div>
    </div>
  );
}

export function OnboardingArt({ type, image, keyboard }: { type: string; image?: string; keyboard: KeyboardLayout }) {
  if (image) {
    return (
      <motion.img {...pop(0.1)} src={image} alt="" className="max-h-full max-w-full mx-auto rounded-2xl object-contain shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]" />
    );
  }
  switch (type) {
    case 'welcome': return <Welcome />;
    case 'terms': return <Terms />;
    case 'keyboard': return <KeyboardArt layout={keyboard} />;
    case 'intro': return <Intro />;
    default: return <Notice />;
  }
}
