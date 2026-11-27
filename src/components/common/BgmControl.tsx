import { useEffect, useState } from 'react';
import { Music, SkipBack, SkipForward } from 'lucide-react';
import { bgmState, onBgm, setBgm, skip } from '../../utils/bgm';

/** 배경음 켜기·음량·지금 곡 (설정 · 처음 안내에서 같이 씀) */
export function BgmControl({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState(bgmState);
  useEffect(() => onBgm(setS), []);
  const sw = (on: boolean, onClick: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${on ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
      <div className={`bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-200 ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
  return (
    <div className={compact ? 'rounded-2xl p-4 bg-white/70 dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/10' : 'pt-3.5'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {compact && <Music className="w-5 h-5 text-purple-500 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 font-hanna font-pro">배경음</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-keep">
              {compact ? '지금 나오는 노래는 우주하마 생방송에서 나오는 브금이에요 · 여기서나 설정에서 끌 수 있어요' : '우주하마 생방송 브금을 작게 반복 재생 · 영상을 볼 땐 멈춰요'}
            </p>
          </div>
        </div>
        {sw(s.on, () => setBgm({ on: !s.on }), '배경음')}
      </div>
      {s.on && (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-100/80 dark:bg-white/[0.05] px-3 py-2">
            <button type="button" onClick={() => skip(-1)} aria-label="이전 곡" className="p-1 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-white cursor-pointer"><SkipBack className="w-4 h-4" /></button>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[length:calc(12.5px*var(--fs,1))] font-bold text-zinc-800 dark:text-zinc-100 truncate">{s.track.index + 1}. {s.track.title}</p>
              <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 truncate">{s.track.artist}{s.playing ? '' : ' · 화면을 누르면 재생돼요'}</p>
            </div>
            <button type="button" onClick={() => skip(1)} aria-label="다음 곡" className="p-1 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-white cursor-pointer"><SkipForward className="w-4 h-4" /></button>
          </div>
          <label className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="shrink-0">음량</span>
            <input type="range" min={0} max={100} step={5} value={Math.round(s.vol * 100)} onChange={(e) => setBgm({ vol: Number(e.target.value) / 100 })} className="flex-1 accent-purple-600" aria-label="배경음 음량" />
            <span className="w-9 text-right tabular-nums">{Math.round(s.vol * 100)}%</span>
          </label>
          {!compact && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[length:calc(13px*var(--fs,1))] font-medium text-zinc-800 dark:text-zinc-200">앱을 내려도 계속 듣기</p>
                <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-500 dark:text-zinc-400 break-keep">다른 앱을 쓰거나 화면을 꺼도 재생 · 아이폰은 이걸 켜면 음량 조절이 안 돼서 기기 볼륨으로 맞춰야 해요</p>
              </div>
              {sw(s.bg, () => setBgm({ bg: !s.bg }), '앱을 내려도 계속 듣기')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
