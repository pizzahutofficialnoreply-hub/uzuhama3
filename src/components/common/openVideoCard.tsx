import { openAiCard, appLogs } from './AiCardExpand';
import { CompilationDetail } from '../tabs/recommend/CompilationDetail';

const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';

/**
 * 영상 id 만 알 때 검색 탭과 똑같이 펼치기 (시청 기록 등)
 *  - 몰아보기·여러 생방송이 연결된 영상: 아래에 들어 있는 방송 목록까지 (검색 탭 몰아보기와 같음)
 *  - 그 밖: 보통 카드 펼치기
 */
export function openVideoCard(id: string, title: string, el: Element | null, sub?: string) {
  const logs: any[] = Object.values(appLogs || {});
  let log: any = null; let it: any = null;
  for (const l of logs) {
    const e = (l?.edited || []).find((x: any) => ytId(x?.url) === id);
    if (e) { log = l; it = e; break; }
  }
  const dates: string[] = it ? [...new Set<string>((Array.isArray(it.allBroadcastDates) && it.allBroadcastDates.length ? it.allBroadcastDates : [log?.date]).filter(Boolean))] : [];
  const isComp = Boolean(it?.isCompilation || it?.compilationId);
  if (it && (isComp || dates.length > 1)) {
    const video = { id, videoUrl: it.url, videoTitle: it.title || title, isCompilation: isComp, compilationId: it.compilationId, games: it.games || [], allBroadcastDates: dates, parentLog: log };
    openAiCard(id, it.title || title, el, isComp ? `몰아보기 · ${video.games.length || dates.length}개 게임` : `영상 연동 · 생방송 ${dates.length}개`, {
      compilation: isComp,
      extra: (close) => <CompilationDetail video={video} allLogs={appLogs} onClose={close} listOnly />,
    });
    return;
  }
  openAiCard(id, title, el, sub);
}
