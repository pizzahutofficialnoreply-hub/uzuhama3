/**
 * 검색 탭 카드 공통 모양 — 영상(홈·동영상·라이브·추천) · 재생목록 · 내 재생목록 카드가 모두 이걸 씀
 * 카드 모양을 바꿀 땐 여기만 고치면 전부 같이 바뀜
 */
export const CARD_SURFACE = 'group relative isolate flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all';
export const CARD_CLOSED = 'rounded-[24px] overflow-hidden hover:shadow-xl hover:-translate-y-1';
export const CARD = `${CARD_SURFACE} ${CARD_CLOSED}`;
export const CARD_THUMB = 'relative aspect-video overflow-hidden thumb-skel';
export const CARD_THUMB_IMG = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-500';
/** 썸네일 왼쪽 아래 표시 (몰아보기 · 재생목록 n개 등) */
export const CARD_THUMB_TAG = 'absolute bottom-2 left-2 text-xs px-2.5 py-1 font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow-md';
export const CARD_BODY = 'p-4 flex-1 flex flex-col';
export const CARD_HEAD = 'flex items-start justify-between gap-1.5 sm:gap-2';
export const CARD_TITLE = 'flex-1 min-w-0 text-left font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-sm sm:text-base cursor-pointer';
/** 제목 오른쪽 ⋯ 메뉴 자리 */
export const CARD_MENU = '-mr-1.5 -mt-0.5';
export const CARD_SUB = 'mt-1 text-xs text-zinc-500 dark:text-zinc-400';
/** 카드 아래 큰 버튼 (자세히 보기 · 펼치기) */
export const CARD_ACTION = 'tap w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold font-hanna font-pro transition-all cursor-pointer shadow-xs hover:scale-[1.01] bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90';
