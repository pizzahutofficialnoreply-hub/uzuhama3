import React, { useState } from 'react';
import { History, PauseCircle, RotateCcw } from 'lucide-react';
import { cn } from '../../utils';
import { useWatchHistory } from '../../utils/watchHistory';
import { openWatchHistory } from '../WatchHistoryPage';
import { clearInterest, clearWatchHistory, interestSummary, isInterestPaused, setInterestPaused } from '../../utils/interest';
import { confirmSheet } from '../../utils/ui';

export const INTEREST_CLEARED_EVENT = 'uzuhama-interest-cleared';

/**
 * 설정 > 맞춤 추천·시청 기록
 * - 기록 일시 중지: 새로 보는 것·관심 행동을 기록하지 않음 (지금까지 기록으로 추천은 계속)
 * - 시청 기록 삭제: '본 영상' 표시만 지움
 * - 맞춤 추천 초기화: 관심 게임·장르와 시청 기록을 모두 지움
 * 모두 이 기기에만 있는 기록이에요
 */
export function RecommendPrefsPanel() {
  const [paused, setPaused] = useState(isInterestPaused);
  const history = useWatchHistory();
  const [summary, setSummary] = useState(() => interestSummary());
  const [done, setDone] = useState('');
  const refresh = (msg: string) => {
    setSummary(interestSummary());
    setDone(msg);
    window.dispatchEvent(new Event(INTEREST_CLEARED_EVENT));
    window.setTimeout(() => setDone(''), 2500);
  };
  const row = 'flex items-center justify-between gap-3 py-3';
  const btn = 'shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors';

  return (
    <div className="px-4 pb-4 pt-1 text-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        추천 탭은 이 기기에서 오래 들여다보거나 눌러 본 게임·장르를 바탕으로 골라요. 기록은 이 기기에만 있고 서버로 보내지 않아요.
      </p>

      <div className="mt-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 px-3.5 py-3 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p>본 영상 <b className="text-zinc-900 dark:text-white">{Math.max(summary.watched, history.length)}</b>개</p>
          <button type="button" onClick={openWatchHistory} className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-bold cursor-pointer">기록 전체 보기</button>
        </div>
        <p>관심 장르: {summary.genres.length ? summary.genres.join(', ') : <span className="text-zinc-400">아직 없음</span>}</p>
        <p className="truncate">관심 게임: {summary.games.length ? summary.games.join(', ') : <span className="text-zinc-400">아직 없음</span>}</p>
      </div>

      <div className="mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
        <div className={row}>
          <div className="flex items-start gap-2.5 min-w-0">
            <PauseCircle className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">기록 일시 중지</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">켜 두면 새로 보는 영상·관심 행동을 기록하지 않아요. 지금까지 기록으로 추천은 계속돼요.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={paused}
            onClick={() => { const next = !paused; setInterestPaused(next); setPaused(next); }}
            className={cn('relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer', paused ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700')}
          >
            <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', paused ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </div>

        <div className={row}>
          <div className="flex items-start gap-2.5 min-w-0">
            <History className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">시청 기록 삭제</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">본 영상 표시를 지워요. 본 영상도 다시 추천될 수 있어요.</p>
            </div>
          </div>
          <button type="button" onClick={async () => { if (await confirmSheet('시청 기록을 지울까요?')) { clearWatchHistory(); refresh('시청 기록을 지웠어요.'); } }} className={cn(btn, 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700')}>
            지우기
          </button>
        </div>

        <div className={row}>
          <div className="flex items-start gap-2.5 min-w-0">
            <RotateCcw className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">맞춤 추천 초기화</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">관심 게임·장르와 시청 기록을 모두 지우고 처음부터 다시 맞춰요.</p>
            </div>
          </div>
          <button type="button" onClick={async () => { if (await confirmSheet('맞춤 추천 기록을 모두 지울까요?')) { clearInterest(); refresh('맞춤 추천을 초기화했어요.'); } }} className={cn(btn, 'text-red-600 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30')}>
            초기화
          </button>
        </div>
      </div>
      {done && <p className="mt-1 text-xs font-bold text-purple-700 dark:text-purple-300">{done}</p>}
    </div>
  );
}
