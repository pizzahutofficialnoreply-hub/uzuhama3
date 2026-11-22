import { BarChart3, Bell, CalendarDays, Clapperboard, ListVideo, Percent, Search, Sparkles } from 'lucide-react';

/** '이런 걸 할 수 있어요' (처음 소개 · 런칭 준비 화면 아래 장) */
export const SITE_FEATURES = [
  { icon: Percent, title: '오늘 방송 확률', desc: '요일·시간대·최근 흐름으로 켜질 확률과 유력한 시간' },
  { icon: Bell, title: '방송 알림', desc: '방송 시작·유력 시간·새 영상 알림, 내 캘린더에 일정 구독' },
  { icon: CalendarDays, title: '방송 기록 달력', desc: '날짜마다 한 게임·다시보기·편집본·쇼츠를 한눈에' },
  { icon: BarChart3, title: '통계·결산', desc: '요일·시간대·방송 길이·게임별 통계와 한 해 결산' },
  { icon: Search, title: '똑똑한 검색', desc: '편집본·쇼츠·라이브·재생목록을 오타·초성·줄임말로도' },
  { icon: Sparkles, title: 'AI 요약·장면 찾기', desc: '방송 흐름 요약과 대사, "귀신 나오는 장면"처럼 상황으로 찾기' },
  { icon: Clapperboard, title: '쇼츠 넘겨 보기', desc: '위아래로 밀어 넘기는 쇼츠 화면, 연결된 생방송까지' },
  { icon: ListVideo, title: '내 재생목록·이어 보기', desc: '저장·시청 기록·보던 곳부터, 유튜브 재생목록으로 보내기' },
];

export function FeatureGrid({ dense = false }: { dense?: boolean }) {
  return (
    <div className={`grid grid-cols-2 ${dense ? 'gap-1.5' : 'gap-2'}`}>
      {SITE_FEATURES.map(({ icon: Icon, title, desc }) => (
        <div key={title} className={`rounded-2xl bg-white/80 dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/10 ${dense ? 'p-2.5' : 'p-3'}`}>
          <span className="inline-flex w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-300 items-center justify-center"><Icon className="w-4 h-4" /></span>
          <p className={`mt-1.5 font-black text-zinc-900 dark:text-white break-keep ${dense ? 'text-[12px]' : 'text-[13px]'}`}>{title}</p>
          <p className={`mt-0.5 text-zinc-500 dark:text-zinc-400 leading-snug break-keep ${dense ? 'text-[10.5px]' : 'text-[11.5px]'}`}>{desc}</p>
        </div>
      ))}
    </div>
  );
}
