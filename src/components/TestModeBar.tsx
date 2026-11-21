import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { endTestMode, useTestMode } from '../utils/testMode';

/** 테스트 모드가 켜져 있으면 화면 위에 작게: 남은 시간 · 끝내기 (이 기기에서만) */
export function TestModeBar() {
  const t = useTestMode();
  const [, tick] = useState(0);
  useEffect(() => { if (!t) return; const i = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(i); }, [t]);
  if (!t) return null;
  const left = Math.max(0, Math.round((t.until - Date.now()) / 1000));
  const what = [t.live && '생방송 켜짐', typeof t.prob === 'number' && `확률 ${t.prob}%`, t.log && '오늘 기록'].filter(Boolean).join(' · ');
  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+6px)] z-[450] w-max max-w-[94vw] flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-amber-500 text-black text-[12px] font-bold shadow-lg" role="status">
      <FlaskConical className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate whitespace-nowrap">테스트 · {what || '가정 없음'} · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      <button type="button" onClick={endTestMode} className="shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-black/80 text-white cursor-pointer" aria-label="테스트 끝내기"><X className="w-3 h-3" /> 끝내기</button>
    </div>
  );
}
