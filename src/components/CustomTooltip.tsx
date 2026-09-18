import { useState, useEffect, useRef } from 'react';

export function CustomTooltip({ active, payload, label, formatter }: any) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<any>(null);
  const currentKeyRef = useRef<string>('');

  const dataKey = (active && payload && payload.length)
    ? `${label || ''}_${payload.map((p: any) => `${p.dataKey || p.name}:${p.value}`).join('|')}`
    : '';

  useEffect(() => {
    if (active && payload && payload.length) {
      // 새로운 데이터 포인트에 도달했을 때만 새로 타이머 가동
      if (currentKeyRef.current !== dataKey) {
        currentKeyRef.current = dataKey;
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 2200);
      }
    } else {
      if (currentKeyRef.current !== '') {
        currentKeyRef.current = '';
        setVisible(false);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [active, dataKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (visible && active && payload && payload.length) {
    return (
      <div className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 shadow-xl pointer-events-none transition-opacity duration-300">
        <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">{label}</p>
        {payload.map((p: any, i: number) => {
          const value = formatter ? formatter(p.value as number, p.name as string, p, i, payload) : p.value;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }}></span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                {Array.isArray(value) ? value[0] : value}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}
