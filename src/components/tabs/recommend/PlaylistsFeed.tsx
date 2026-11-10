import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ListVideo, Loader2, X } from 'lucide-react';
import { cn, fuzzyKoreanMatch } from '../../../utils';
import { extractYoutubeId } from '../../../utils/urlUtils';
import { GlassPlayButton } from '../../common/MediaIcons';
import { Pagination } from '../../common/Pagination';
import { VideoListRow } from '../../common/VideoListRow';
import { CollectionPanel } from '../../common/CollectionPanel';
import { useViewStyle } from '../../../hooks/useViewStyle';
import { ShareButton } from '../../common/ShareButton';
import { formatPlaylistShareText, formatRecommendShareText } from '../../../utils/shareUtils';
import { VideoCard } from '../RecommendTab';

/**
 * 추천 영상 > 재생목록 탭: 우주하마 유튜브 채널의 공개 재생목록
 * - 목록: 몰아보기와 같은 보라색 카드
 * - 펼치면: 유튜브 앱의 재생목록 화면처럼 (흐린 배경 위 큰 썸네일·제목·게시자·모두 재생 + 아래 영상 목록)
 *   영상 목록은 '목록'(줄 누르면 영상, 오른쪽 생방송·쇼츠 버튼) / '카드'(사이트 안에서 미리보기) 중 선택
 * - 서버는 유튜브를 처음 한 번만 부르고 저장해 둔 것을 돌려줌. 브라우저에도 하루 보관
 */

import { usePlaylists, type Playlist } from '../../../hooks/usePlaylists';
import { buildGameCatalog, inferPlaylistGame } from '../../../utils/playlistGames';
import { usePrefs } from '../../../utils/userPrefs';
export type { Playlist, PlaylistItem } from '../../../hooks/usePlaylists';
const CARDS_PER_PAGE = 9;
// iOS 처럼 살짝 감기며 멈추는 스프링
const IOS_SPRING = { type: 'spring' as const, stiffness: 340, damping: 32, mass: 1 };

/** 유튜브 영상 ID → 그 영상이 등록된 방송 기록 (생방송·쇼츠 버튼, 카드 미리보기용) */
export function useLogIndex(logs: any) {
  // 편집본 + 생방(다시보기)도: 내 재생목록에는 생방이 담길 수도 있음
  return useMemo(() => {
    const map = new Map<string, { log: any; edit: any }>();
    const list = Array.isArray(logs) ? logs : Object.values(logs || {});
    list.forEach((log: any) => {
      (Array.isArray(log?.edited) ? log.edited : []).forEach((edit: any) => {
        const id = extractYoutubeId(edit?.url || '');
        if (id && !map.has(id)) map.set(id, { log, edit });
      });
      (Array.isArray(log?.vods) ? log.vods : []).forEach((v: any) => {
        const id = extractYoutubeId(typeof v === 'string' ? v : v?.url || '');
        if (id && !map.has(id)) map.set(id, { log, edit: null });
      });
    });
    return map;
  }, [logs]);
}

function PlaylistCard({ playlist, onOpen, shareText }: { playlist: Playlist; onOpen: () => void; shareText: () => string }) {
  const count = playlist.items.length;
  return (
    <div className="group relative isolate flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1">
      <button type="button" onClick={onOpen} className="group/thumb relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer" title="재생목록 열기">
        <img src={playlist.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        <span className="absolute inset-0 bg-black/10 flex items-center justify-center">
          <GlassPlayButton />
        </span>
        <span className="absolute bottom-2 left-2 text-xs px-2.5 py-1 font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow-md bg-purple-900/90 text-purple-100 border border-purple-400/50">
          <ListVideo className="w-3.5 h-3.5 text-purple-300" />
          재생목록 ({count}개 영상)
        </span>
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="flex-1 text-left font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-sm sm:text-base cursor-pointer">
            {playlist.title}
          </button>
          <ShareButton className="-mr-1 -mt-0.5" title={`${playlist.title} 재생목록`} getText={shareText} />
        </div>
        {playlist.description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{playlist.description}</p>}
        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01] bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90"
          >
            <span className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="font-bold text-purple-900 dark:text-purple-200">재생목록 영상 펼치기</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200">{count}개 영상</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** 유튜브 앱의 재생목록 화면 (저장·공유 버튼 제외) */
function PlaylistDetail({ playlist, channelTitle, channelThumbnail, matchedIds, logIndex, logs, onClose, onNavigateToCalendar }: {
  playlist: Playlist;
  channelTitle: string;
  channelThumbnail: string;
  matchedIds: Set<string> | null;
  logIndex: Map<string, { log: any; edit: any }>;
  logs: any;
  onClose: () => void;
  onNavigateToCalendar?: (date: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [viewStyle, setViewStyle] = useViewStyle('playlist');
  const basePerPage = usePrefs().collectionPageSize; // 설정에서 조절
  const ITEMS_PER_PAGE = viewStyle === 'list' ? basePerPage * 2 : basePerPage; // 목록 보기는 카드의 2배
  const total = playlist.items.length;
  // 게임 기록이 없는 영상은 재생목록 이름의 게임을 기본으로 표시
  const playlistGame = useMemo(() => inferPlaylistGame(playlist.title, buildGameCatalog(logs)), [playlist.title, logs]);
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const pageItems = playlist.items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <CollectionPanel
      ariaLabel={`${playlist.title} 재생목록`}
      thumbnail={playlist.thumbnail}
      title={playlist.title}
      channelTitle={channelTitle}
      channelThumbnail={channelThumbnail}
      metaLine={`재생목록 · 동영상 ${total}개`}
      description={playlist.description}
      embedSrc={`https://www.youtube.com/embed/videoseries?list=${playlist.id}&autoplay=1&rel=0`}
      playLabel="모두 재생"
      onClose={onClose}
      countLabel={`${total}개 영상`}
      viewStyle={viewStyle}
      onViewStyleChange={setViewStyle}
    >
          {viewStyle === 'list' ? (
            <div className="flex flex-col gap-1.5">
              {pageItems.map((it, i) => {
                const hit = logIndex.get(it.videoId);
                return (
                  <VideoListRow
                    key={`${it.videoId}-${i}`}
                    dense
                    index={(page - 1) * ITEMS_PER_PAGE + i + 1}
                    videoId={it.videoId}
                    title={it.title}
                    href={`https://www.youtube.com/watch?v=${it.videoId}&list=${playlist.id}`}
                    liveUrl={hit?.log?.vods?.find((v: any) => v?.url)?.url}
                    shorts={hit?.log?.shorts || []}
                    badge={!hit && playlistGame ? playlistGame.name : undefined}
                    highlighted={matchedIds?.has(it.videoId)}
                    shareText={() => formatRecommendShareText({ id: it.videoId, videoTitle: it.title, videoUrl: `https://www.youtube.com/watch?v=${it.videoId}`, parentLog: hit?.log, allBroadcastDates: hit?.log?.date ? [hit.log.date] : [] }, logs)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 px-1.5">
              {pageItems.map((it, i) => {
                const hit = logIndex.get(it.videoId);
                return (
                  <VideoCard
                    key={`${it.videoId}-${i}`}
                    video={{
                      id: it.videoId,
                      videoTitle: it.title,
                      videoUrl: `https://www.youtube.com/watch?v=${it.videoId}`,
                      category: hit?.edit?.category || '',
                      parentLog: hit?.log,
                      allBroadcastDates: hit?.log?.date ? [hit.log.date] : [],
                      games: Array.isArray(hit?.edit?.games) && hit.edit.games.length
                        ? hit.edit.games
                        : (hit?.log?.games?.length || hit?.log?.game) ? [] : (playlistGame ? [playlistGame] : []),
                    }}
                    allLogs={logs}
                    onNavigateToCalendar={onNavigateToCalendar}
                  />
                );
              })}
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} className="flex justify-center items-center gap-1 sm:gap-2 mt-5" />
          {/* 아래쪽 접기 (몰아보기 펼치기와 같은 모양) */}
          <div className="mt-4 -mx-1.5 sm:-mx-3 -mb-3 px-4 sm:px-6 py-3.5 bg-zinc-50/50 dark:bg-black border-t border-zinc-200/60 dark:border-zinc-800 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-2xs active:scale-95 font-hanna font-pro"
            >
              <X className="w-4 h-4" />
              <span>재생목록 접기</span>
            </button>
          </div>
    </CollectionPanel>
  );
}

export function PlaylistsFeed({ searchTerm, logs, onNavigateToCalendar }: { searchTerm: string; logs: any; onNavigateToCalendar?: (date: string) => void }) {
  const { data, loading, error } = usePlaylists();
  const logIndex = useLogIndex(logs);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const playlists = data?.playlists || [];

  const results = useMemo(() => {
    const term = searchTerm.trim();
    return playlists
      .map((p) => {
        if (!term) return { p, matched: null as Set<string> | null };
        const matched = new Set(p.items.filter((it) => fuzzyKoreanMatch(term, it.title)).map((it) => it.videoId));
        const titleHit = fuzzyKoreanMatch(term, p.title) || fuzzyKoreanMatch(term, p.description);
        return titleHit || matched.size > 0 ? { p, matched } : null;
      })
      .filter(Boolean) as { p: Playlist; matched: Set<string> | null }[];
  }, [playlists, searchTerm]);

  useEffect(() => { setPage(1); }, [searchTerm]);

  if (loading && playlists.length === 0) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" /> 재생목록을 불러오는 중이에요
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px]">
        {playlists.length === 0 ? (error ? '재생목록을 가져오지 못했어요. 잠시 후 다시 열어 주세요.' : '공개된 재생목록이 없어요.') : '검색어와 맞는 재생목록이 없어요.'}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(results.length / CARDS_PER_PAGE));
  const pageResults = results.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);

  return (
    <div>
      <p className="px-1 mb-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
        총 <strong className="text-purple-600 dark:text-purple-400 font-bold">{results.length}</strong>개 재생목록
      </p>
      {/* 몰아보기처럼 누른 카드 자리에서 그대로 펼쳐짐 (닫기 전까지 원래 카드는 숨김, 자동 스크롤 없음) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pageResults.map(({ p, matched }) => {
          const isOpen = openId === p.id;
          return (
            <div
              key={p.id}
              className={cn(isOpen && 'col-span-full')}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isOpen ? (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={IOS_SPRING}
                  >
                    <PlaylistDetail
                      playlist={p}
                      channelTitle={data?.channelTitle || '우주하마'}
                      channelThumbnail={data?.channelThumbnail || ''}
                      matchedIds={matched}
                      logIndex={logIndex}
                      logs={logs}
                      onClose={() => setOpenId(null)}
                      onNavigateToCalendar={onNavigateToCalendar}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="card"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={IOS_SPRING}
                  >
                    <PlaylistCard playlist={p} onOpen={() => setOpenId(p.id)} shareText={() => formatPlaylistShareText(p, (id) => logIndex.get(id)?.log, logs)} />
                    {matched && matched.size > 0 && (
                      <p className="mt-1.5 px-2 text-xs text-purple-600 dark:text-purple-400 font-semibold">검색어와 맞는 영상 {matched.size}개</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onChange={(n) => { setOpenId(null); setPage(n); }} />
    </div>
  );
}
