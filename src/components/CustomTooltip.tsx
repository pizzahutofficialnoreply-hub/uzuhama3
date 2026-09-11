import { TooltipProps } from 'recharts';

export function CustomTooltip({ active, payload, label, formatter }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 shadow-lg">
        <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">{label}</p>
        {payload.map((p, i) => {
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
