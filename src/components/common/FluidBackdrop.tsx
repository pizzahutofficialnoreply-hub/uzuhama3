import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../utils';

/** 은은하게 움직이는 흐린 배경 */
export function FluidBackdrop() {
  // 사이트 바탕색(흰색 / 짙은 회색) 위에 아주 연한 보라빛이 천천히 흘러다님
  const blobs = [
    { c: 'bg-purple-200/[0.14] dark:bg-purple-500/[0.06]', s: 'w-[60vmax] h-[60vmax]', x: ['-25%', '5%', '-15%'], y: ['-30%', '-10%', '-25%'], d: 24 },
    { c: 'bg-violet-100/[0.18] dark:bg-violet-500/[0.05]', s: 'w-[50vmax] h-[50vmax]', x: ['45%', '20%', '40%'], y: ['35%', '55%', '25%'], d: 30 },
    { c: 'bg-sky-100/[0.14] dark:bg-indigo-500/[0.04]', s: 'w-[45vmax] h-[45vmax]', x: ['-10%', '25%', '5%'], y: ['60%', '40%', '65%'], d: 36 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-950" />
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn('absolute rounded-full blur-3xl', b.c, b.s)}
          initial={{ x: b.x[0], y: b.y[0], scale: 1 }}
          animate={{ x: b.x, y: b.y, scale: [1, 1.12, 0.96, 1] }}
          transition={{ duration: b.d, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

