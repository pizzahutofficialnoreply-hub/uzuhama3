/** 바탕 (예전엔 보랏빛 흐린 덩어리가 떠다녔는데, 흔한 'AI가 만든 사이트' 느낌이라 단색으로) */
export function FluidBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-950" />
    </div>
  );
}
