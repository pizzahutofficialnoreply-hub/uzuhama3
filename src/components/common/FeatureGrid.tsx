import { motion } from 'motion/react';
import { Bell, Clapperboard, ListVideo, Play, Search, Sparkles } from 'lucide-react';

/**
 * '이렇게 쓰면 돼요' (처음 소개 · 런칭 준비 화면 아래 장)
 * 핵심 기능 네 가지를 카드로, 카드마다 작은 움직이는 그림 (차례로 톡톡 나타남)
 * 나머지 기능은 아래에 한 줄로
 */
const pop = (delay: number) => ({
  initial: { opacity: 0, y: 14, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay },
});
const card = 'rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/70 dark:border-white/10 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] p-3 flex flex-col';

function Prob() {
  return (
    <svg viewBox="0 0 44 44" className="w-14 h-14 -rotate-90 mx-auto" aria-hidden>
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-zinc-200 dark:stroke-zinc-700" />
      <motion.circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-purple-600 dark:stroke-purple-400"
        strokeDasharray={113} initial={{ strokeDashoffset: 113 }} animate={{ strokeDashoffset: 113 * 0.28 }} transition={{ delay: 0.4, duration: 1.2, ease: 'easeOut' }} />
    </svg>
  );
}
function Cal() {
  return (
    <div className="grid grid-cols-7 gap-0.5 w-full max-w-[112px] mx-auto" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.02 }}
          className={`aspect-square rounded-[3px] ${[2, 5, 9, 11, 16, 19, 23, 26].includes(i) ? 'bg-purple-500/80' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
      ))}
    </div>
  );
}
function Bars() {
  return (
    <div className="h-14 flex items-end gap-1 w-full max-w-[112px] mx-auto" aria-hidden>
      {[0.75, 0.7, 0.8, 0.85, 1, 0.3, 0.6].map((h, i) => (
        <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.7 + i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
          style={{ height: `${h * 100}%`, originY: 1 }} className="flex-1 rounded-t-[3px] bg-blue-500/80" />
      ))}
    </div>
  );
}
function Vids() {
  return (
    <div className="grid grid-cols-2 gap-1 w-full max-w-[112px] mx-auto" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.div key={i} animate={{ y: [0, -2, 0] }} transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
          className="aspect-video rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
          <Play className="w-3 h-3 text-zinc-500 fill-current" />
        </motion.div>
      ))}
    </div>
  );
}

const CORE = [
  { art: Prob, title: '오늘 방송 확률', desc: '요일·시간대·최근 흐름으로 켜질 확률과 유력한 시간' },
  { art: Cal, title: '방송 기록 달력', desc: '날짜마다 한 게임·다시보기·편집본을 한눈에' },
  { art: Bars, title: '통계·결산', desc: '요일·시간대·방송 길이·게임별 통계' },
  { art: Vids, title: '영상 찾기', desc: '편집본·쇼츠·라이브를 오타·초성으로도, 장면·대사로도' },
];
const MORE = [
  { icon: Bell, t: '방송·새 영상 알림' },
  { icon: Sparkles, t: 'AI 영상 요약' },
  { icon: Clapperboard, t: '쇼츠 넘겨 보기' },
  { icon: ListVideo, t: '내 재생목록' },
  { icon: Search, t: '시청 기록·이어 보기' },
];
/** 다른 곳에서 목록으로 쓸 때 */
export const SITE_FEATURES = CORE.map(({ title, desc }) => ({ title, desc }));

export function FeatureGrid({ dense = false }: { dense?: boolean }) {
  return (
    <div>
      <div className={`grid grid-cols-2 ${dense ? 'gap-2' : 'gap-2.5'}`}>
        {CORE.map(({ art: Art, title, desc }, i) => (
          <motion.div key={title} {...pop(0.1 + i * 0.15)} className={card}>
            <div className="h-14 flex items-center">{<Art />}</div>
            <p className={`mt-2 font-black text-zinc-900 dark:text-white break-keep ${dense ? 'text-[12.5px]' : 'text-[13px]'}`}>{title}</p>
            <p className={`mt-0.5 text-zinc-500 dark:text-zinc-400 leading-snug break-keep ${dense ? 'text-[11px]' : 'text-[11.5px]'}`}>{desc}</p>
          </motion.div>
        ))}
      </div>
      <motion.div {...pop(0.8)} className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="text-[11.5px] font-bold text-zinc-500 dark:text-zinc-400 self-center mr-0.5">그 밖에도</span>
        {MORE.map(({ icon: Icon, t }) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[11.5px] font-bold">
            <Icon className="w-3.5 h-3.5" />{t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
