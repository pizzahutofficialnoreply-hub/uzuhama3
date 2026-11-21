import { formatShortsShareText } from '../../utils/shareUtils';
import { findVideo } from './VideoCardInfo';
import { appLogs } from './AiCardExpand';

/**
 * 쇼츠 공유 글: 방송 기록에서 이 쇼츠가 들어 있는 날을 찾아
 * • 방송일 / • 영상(편집본) / • 게임 / • 생방 / • 쇼츠 를 모두 채움
 */
export function shortsShareText(id: string, title: string, o: { liveUrl?: string; editUrl?: string; logs?: Record<string, any> } = {}) {
  const logs = o.logs || appLogs;
  const log: any = findVideo(id, logs)?.log;
  const edit = (log?.edited || []).find((e: any) => !e?.isCompilation && !e?.compilationId) as any;
  const live = (log?.vods || [])[0] as any;
  return formatShortsShareText({
    title,
    url: `https://youtu.be/${id}`,
    date: log?.date,
    liveUrl: o.liveUrl || (typeof live === 'string' ? live : live?.url),
    editUrl: o.editUrl || edit?.url,
    relatedTitle: edit?.title,
  }, logs);
}
