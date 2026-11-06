import React from 'react';

/** 썸네일 아래 빨간 '본 만큼' 막대 (유튜브처럼) */
export function ProgressBar({ value }: { value: number }) {
  return (
    <span className="absolute left-0 right-0 bottom-0 h-1 bg-white/40 pointer-events-none" aria-label={`${Math.round(value * 100)}% 봤어요`}>
      <span className="block h-full bg-red-600" style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} />
    </span>
  );
}
