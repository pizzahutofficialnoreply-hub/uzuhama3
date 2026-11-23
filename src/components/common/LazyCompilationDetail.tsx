import { lazy, Suspense, type ComponentProps } from 'react';

/**
 * 몰아보기 목록 (검색 탭의 CompilationDetail) 을 처음 펼칠 때 불러옴
 * 바로 import 하면 검색 탭 전체(RecommendTab)가 첫 화면 코드에 딸려 와서 첫 로딩이 무거워짐
 */
const Inner = lazy(() => import('../tabs/recommend/CompilationDetail').then((m) => ({ default: m.CompilationDetail })));
type Props = ComponentProps<typeof Inner>;
export function CompilationDetail(props: Props) {
  return (
    <Suspense fallback={<div className="py-6 text-center text-xs text-zinc-400">불러오는 중…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
