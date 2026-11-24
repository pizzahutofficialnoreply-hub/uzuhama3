import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { getBgm, onBgm, setBgm } from '../../utils/bgm';

/** 배경음 켜기·음량 (설정 · 처음 안내에서 같이 씀) */
export function BgmControl({ compact = false }: { compact?: boolean }) {
  const [p, setP] = useState(getBgm);
  useEffect(() => onBgm(setP), []);
  return (
    <div className={compact ? 'rounded-2xl p-4 bg-white/70 dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/10' : 'pt-3.5'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {compact && <Music className="w-5 h-5 text-purple-500 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 font-hanna font-pro">배경음</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-keep">우주하마 라이브 브금을 작게 반복 재생 · 영상을 볼 땐 멈춰요</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={p.on}
          aria-label="배경음"
          onClick={() => setBgm({ on: !p.on })}
          className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${p.on ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
        >
          <div className={`bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200 ${p.on ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
      {p.on && (
        <label className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="shrink-0">음량</span>
          <input type="range" min={0} max={100} step={5} value={Math.round(p.vol * 100)} onChange={(e) => setBgm({ vol: Number(e.target.value) / 100 })} className="flex-1 accent-purple-600" aria-label="배경음 음량" />
          <span className="w-9 text-right tabular-nums">{Math.round(p.vol * 100)}%</span>
        </label>
      )}
    </div>
  );
}
