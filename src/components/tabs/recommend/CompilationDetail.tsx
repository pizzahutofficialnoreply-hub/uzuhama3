import React, { useMemo, useState } from 'react';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { CollectionPanel } from '../../common/CollectionPanel';
import { VideoListRow } from '../../common/VideoListRow';
import { Pagination } from '../../common/Pagination';
import { useViewStyle } from '../../../hooks/useViewStyle';
import { BroadcastDetailModal, getBroadcastDates } from '../BroadcastDetailModal';
import { usePrefs } from '../../../utils/userPrefs';
import { X } from 'lucide-react';

/**
 * 몰아보기(또는 여러 생방송이 연결된 영상)를 펼친 화면 — 재생목록 펼치기와 같은 모양
 * 위/왼쪽: 흐린 배경 + 큰 썸네일 + 제목 + '재생' (몰아보기 영상 자체를 그 자리에서 재생)
 * 아래/오른쪽: 연결된 생방송 목록 (목록: 줄 누르면 그날 영상, 오른쪽 생방송·쇼츠 버튼 / 카드: 사이트 안 미리보기)
 */

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  if (!y || !m || !dd) return d;
  return `${m}월 ${dd}일 (${DAYS[new Date(y, m - 1, dd).getDay()]})`;
};

export function CompilationDetail({ video, allLogs, onClose, onNavigateToCalendar, listOnly = false }: {
  video: any;
  allLogs: any;
  onClose: () => void;
  onNavigateToCalendar?: (date: string) => void;
  /** 위쪽 큰 영상 부분 없이 목록만 */
  listOnly?: boolean;
}) {
  const [viewStyle, setViewStyle] = useViewStyle('compilation');
  const [page, setPage] = useState(1);
  const PER_PAGE = usePrefs().collectionPageSize; // 설정에서 조절
  const logsList = useMemo(() => (allLogs ? (Array.isArray(allLogs) ? allLogs : Object.values(allLogs)) : []), [allLogs]);
  const dates = useMemo(() => getBroadcastDates(video, logsList), [video, logsList]);
  const isCompilation = !!(video?.isCompilation || video?.compilationId);
  const ytId = extractYoutubeId(video?.videoUrl || '') || video?.id;
  const gameCount = isCompilation && Array.isArray(video?.games) && video.games.length > 0 ? video.games.length : dates.length;

  const rows = useMemo(() => dates.map((date) => {
    const log: any = logsList.find((l: any) => l?.date === date) || (video?.parentLog?.date === date ? video.parentLog : null);
    const edits = (Array.isArray(log?.edited) ? log.edited : []).filter((e: any) => e?.url && !e.isCompilation && !e.compilationId && e.url !== video?.videoUrl && !String(e.title || '').includes('몰아보기'));
    const primary = edits[0];
    const games: string[] = isCompilation && Array.isArray(video?.games)
      ? video.games.filter((g: any) => !g?.date || g.date === date).map((g: any) => (typeof g === 'string' ? g : g?.name)).filter(Boolean)
      : (Array.isArray(log?.games) && log.games.length ? log.games.map((g: any) => g?.name).filter(Boolean) : log?.game ? [log.game] : []);
    const liveUrl = (Array.isArray(log?.vods) ? log.vods : []).map((v: any) => (typeof v === 'string' ? v : v?.url)).find(Boolean) || log?.vodUrl || '';
    return {
      date,
      videoId: primary ? extractYoutubeId(primary.url) || '' : '',
      href: primary?.url || liveUrl || undefined,
      title: primary?.title || (games.length ? `${games.join(', ')} 방송` : `${date} 생방송`),
      games,
      liveUrl,
      shorts: (Array.isArray(log?.shorts) ? log.shorts : []).map((s: any) => (typeof s === 'string' ? { url: s } : s)).filter((s: any) => s?.url),
    };
  }), [dates, logsList, video, isCompilation]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <CollectionPanel
      ariaLabel={`${video?.videoTitle || '몰아보기'} 연동 생방송`}
      thumbnail={ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''}
      title={video?.videoTitle || '몰아보기'}
      metaLine={isCompilation ? `몰아보기 · 게임 ${gameCount}개 · 생방송 ${dates.length}개` : `영상 연동 · 생방송 ${dates.length}개`}
      embedSrc={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
      playLabel="재생"
      showPublisher={false}
      listOnly={listOnly}
      onClose={onClose}
      countLabel={`${dates.length}개 생방송`}
      viewStyle={viewStyle}
      onViewStyleChange={setViewStyle}
    >
      {viewStyle === 'list' ? (
        <div className="flex flex-col">
          {pageRows.map((r, i) => (
            <VideoListRow
              key={r.date}
              dense
              index={(page - 1) * PER_PAGE + i + 1}
              videoId={r.videoId}
              placeholder={r.date.replace(/-/g, '.')}
              title={r.title}
              href={r.href}
              badge={`${dayLabel(r.date)} 방송${r.games.length ? ` · ${r.games.slice(0, 3).join(', ')}${r.games.length > 3 ? ` 외 ${r.games.length - 3}개` : ''}` : ''}`}
              liveUrl={r.liveUrl || undefined}
              shorts={r.shorts}
            />
          ))}
        </div>
      ) : (
        <BroadcastDetailModal video={video} allLogs={allLogs} onClose={onClose} onNavigateToCalendar={onNavigateToCalendar} hideMainVideoBanner bare />
      )}
      {viewStyle === 'list' && (
        <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} className="flex justify-center items-center gap-1 sm:gap-2 mt-5" />
      )}
      {/* 목록 보기에서도 카드 보기와 같은 아래쪽 접기 (쇼츠 뷰어 안에서는 판 자체를 닫으므로 생략) */}
      {viewStyle === 'list' && !listOnly && (
          <div className="mt-4 -mx-1.5 sm:-mx-3 -mb-3 px-4 sm:px-6 py-3.5 bg-zinc-50/50 dark:bg-black border-t border-zinc-200/60 dark:border-zinc-800 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-2xs active:scale-95 font-hanna font-pro"
            >
              <X className="w-4 h-4" />
              <span>연동 생방 목록 접기</span>
            </button>
          </div>
      )}
    </CollectionPanel>
  );
}
