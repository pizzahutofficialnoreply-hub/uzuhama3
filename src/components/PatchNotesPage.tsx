import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  Search, 
  PlusCircle
, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePatchNotes } from '../hooks/usePatchNotes';
import { useAuth } from '../hooks/useAuth';
import { PatchCategory, PatchNote } from '../types';
import { cn } from '../utils';

const CATEGORY_MAP: Record<PatchCategory | 'all', { label: string; color: string; bg: string; border: string }> = {
  all: {
    label: '전체',
    color: 'text-zinc-700 dark:text-zinc-300',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    border: 'border-zinc-300 dark:border-zinc-700'
  },
  patch: {
    label: '패치노트',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    border: 'border-purple-200 dark:border-purple-800/60'
  },
  hotfix: {
    label: '핫픽스',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-800/60'
  },
  update: {
    label: '업데이트 공지',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800/60'
  },
  dev: {
    label: '개발자 노트',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    border: 'border-emerald-200 dark:border-emerald-800/60'
  }
};

// 노션처럼 읽히는 본문: 문단 사이 여백, 목록 점, 제목 크기, 구분선, 이미지 (typography 플러그인 없이 직접)
const PATCH_PROSE = [
  'text-[15px] leading-[1.8] tracking-[-0.01em] text-zinc-800 dark:text-zinc-200 break-keep select-text',
  '[&>*:first-child]:mt-0',
  '[&_h1]:text-2xl [&_h1]:font-black [&_h1]:text-zinc-900 dark:[&_h1]:text-white [&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:leading-snug',
  '[&_h2]:text-[22px] [&_h2]:font-black [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:leading-snug',
  '[&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-zinc-900 dark:[&_h3]:text-white [&_h3]:mt-7 [&_h3]:mb-2',
  '[&_h4]:text-base [&_h4]:font-bold [&_h4]:mt-5 [&_h4]:mb-1.5',
  '[&_p]:my-3 [&_strong]:font-bold [&_strong]:text-zinc-900 dark:[&_strong]:text-white [&_em]:italic [&_del]:opacity-60',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1.5 [&_li]:pl-0.5 [&_li>ul]:my-1 [&_li>ol]:my-1 [&_li]:marker:text-zinc-400',
  '[&_a]:text-purple-600 dark:[&_a]:text-purple-300 [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-all',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-[3px] [&_blockquote]:border-zinc-300 dark:[&_blockquote]:border-zinc-600 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:text-zinc-300',
  '[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-zinc-100 dark:[&_code]:bg-white/10 [&_code]:text-[13px] [&_code]:text-rose-600 dark:[&_code]:text-rose-300',
  '[&_pre]:my-4 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:bg-zinc-100 dark:[&_pre]:bg-white/[0.06] [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_hr]:my-8 [&_hr]:border-zinc-200 dark:[&_hr]:border-white/10',
  '[&_img]:my-4 [&_img]:rounded-xl [&_img]:w-full [&_img]:h-auto',
  '[&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_th]:border [&_td]:border [&_th]:border-zinc-200 [&_td]:border-zinc-200 dark:[&_th]:border-white/10 dark:[&_td]:border-white/10 [&_th]:px-2 [&_td]:px-2 [&_th]:py-1.5 [&_td]:py-1.5 [&_th]:bg-zinc-50 dark:[&_th]:bg-white/5',
].join(' ');

/**
 * 본문 링크: 노션의 다른 글(예: '이 포스트도 함께 살펴보세요')이면
 *  - 누르면 사이트 안의 그 패치노트로, 길게 누르면 노션 원문으로
 *  - 제목이 '노션 글' 이면 사이트에 있는 그 글 제목으로 바꿔서 보여 줌
 */
const notionIdOf = (href: string) => (href.match(/notion\.(?:so|site)\/(?:[^?#]*?-)?([0-9a-f]{32})(?:[?#]|$)/i) || href.match(/notion\.(?:so|site)\/([0-9a-f]{32})/i))?.[1]?.toLowerCase() || '';
function NotionAwareLink({ href, notes, onOpen, children }: { href: string; notes: PatchNote[]; onOpen: (n: PatchNote) => void; children: React.ReactNode }) {
  const id = notionIdOf(href);
  const target = id ? notes.find((n) => n.notionId === id) : undefined;
  const timer = React.useRef<number | null>(null);
  const long = React.useRef(false);
  if (!target) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  const notionUrl = target.url || href;
  const label = (() => { const t = React.Children.toArray(children).join(''); return !t || t === '노션 글' ? `${target.version && target.version !== '0.0.0' ? `v${target.version} ` : ''}${target.title}` : children; })();
  const start = () => { long.current = false; timer.current = window.setTimeout(() => { long.current = true; try { navigator.vibrate?.(15); } catch {} window.open(notionUrl, '_blank', 'noopener,noreferrer'); }, 550); };
  const stop = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  return (
    <a
      href={notionUrl}
      title="누르면 사이트에서, 길게 누르면 노션에서 열어요"
      onClick={(e) => { e.preventDefault(); if (long.current) return; onOpen(target); }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
      className="select-none"
    >
      {label}
    </a>
  );
}

type SortMode = 'new' | 'old' | 'version';
const SORT_LABEL: Record<SortMode, string> = { new: '최신순', old: '과거순', version: '버전순' };
const cmpVer = (a: string, b: string) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
const sortNotes = (list: PatchNote[], mode: SortMode) => [...list].sort((a, b) => {
  if (mode === 'version') return cmpVer(b.version, a.version) || (b.date || '').localeCompare(a.date || '');
  const d = (b.date || '').localeCompare(a.date || '') || cmpVer(b.version, a.version);
  return mode === 'old' ? -d : d;
});
/** 버전별로 묶기 (개발자 노트) — 묶음 순서는 정렬 방식을 따름 */
const groupByVersion = (list: PatchNote[], mode: SortMode) => {
  const map = new Map<string, PatchNote[]>();
  list.forEach((n) => { const v = n.version && n.version !== '0.0.0' ? n.version : '기타'; map.set(v, [...(map.get(v) || []), n]); });
  const keys = [...map.keys()].sort((a, b) => (a === '기타' ? 1 : b === '기타' ? -1 : mode === 'old' ? cmpVer(a, b) : cmpVer(b, a)));
  return keys.map((k) => ({ version: k, notes: map.get(k)! }));
};

const SECTION_ORDER: PatchCategory[] = ['update', 'patch', 'hotfix', 'dev'];
const SECTION_LABEL: Record<PatchCategory, string> = { update: '업데이트', patch: '패치노트', hotfix: '핫픽스', dev: '개발자 노트' };

/** 노션 갤러리처럼: 표지 이미지 + 종류·제목·날짜 */
function NoteCard({ note, highlight, onOpen }: { note: PatchNote; highlight: boolean; onOpen: () => void }) {
  const cat = CATEGORY_MAP[note.category] || CATEGORY_MAP.patch;
  const [imgOk, setImgOk] = useState(true);
  return (
    <button
      type="button"
      id={`patch-card-${note.version}`}
      onClick={onOpen}
      className={cn(
        'group text-left rounded-2xl overflow-hidden border bg-white dark:bg-zinc-900 transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 flex flex-col',
        highlight ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-zinc-200/90 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700'
      )}
    >
      <div className={cn('relative aspect-[16/10] w-full overflow-hidden', cat.bg)}>
        {note.cover && imgOk ? (
          <img src={note.cover} alt="" loading="lazy" onError={() => setImgOk(false)} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
        ) : (
          <div className={cn('absolute inset-0 flex items-center justify-center font-black text-2xl sm:text-3xl opacity-70', cat.color)}>
            {note.version && note.version !== '0.0.0' ? `v${note.version}` : cat.label}
          </div>
        )}
      </div>
      <div className="p-3 sm:p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn('px-1.5 py-0.5 rounded-md font-bold text-[10px]', cat.bg, cat.color)}>{note.kind || cat.label}</span>
          {note.version && note.version !== '0.0.0' && (
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono font-bold text-[10px]">v{note.version}</span>
          )}
        </div>
        <h3 className="text-[13px] sm:text-sm font-bold text-zinc-900 dark:text-white leading-snug line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{note.title}</h3>
        <p className="mt-auto text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{note.date}</p>
      </div>
    </button>
  );
}

export function PatchNotesPage({ version: propVersion }: { version?: string } = {}) {
  const { version: routeVersion } = useParams<{ version?: string }>();
  const paramVersion = propVersion ?? routeVersion;
  const location = useLocation();
  const navigate = useNavigate();
  const { patchNotes, loading } = usePatchNotes();
  const { user } = useAuth();
  const isAdmin = user?.email === 'saramoriyo@gmail.com';

  const [selectedCategory, setSelectedCategory] = useState<PatchCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    try { const v = localStorage.getItem('uzuhama_patch_sort'); if (v === 'new' || v === 'old' || v === 'version') return v; } catch {}
    return 'new';
  });
  useEffect(() => { try { localStorage.setItem('uzuhama_patch_sort', sortMode); } catch {} }, [sortMode]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const targetVersion = useMemo(() => {
    if (!paramVersion) return null;
    return paramVersion.replace(/^v/, '').trim();
  }, [paramVersion]);

  useEffect(() => {
    if (targetVersion && patchNotes.length > 0) {
      const match = patchNotes.find(p => p.version === targetVersion);
      if (match) {
        setActiveNoteId(match.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [targetVersion, patchNotes]);

  const filteredNotes = useMemo(() => {
    return sortNotes(patchNotes, sortMode).filter(note => {
      if (selectedCategory !== 'all' && note.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = note.title.toLowerCase().includes(query);
        const matchVersion = note.version.toLowerCase().includes(query);
        const matchContent = note.content.toLowerCase().includes(query);
        const matchHighlights = note.highlights?.some(h => h.toLowerCase().includes(query));
        return matchTitle || matchVersion || matchContent || matchHighlights;
      }
      return true;
    });
  }, [patchNotes, selectedCategory, searchQuery, sortMode]);

  const activeNote = useMemo(() => {
    if (!activeNoteId) return null;
    return patchNotes.find(n => n.id === activeNoteId) || null;
  }, [activeNoteId, patchNotes]);

  const handleOpenBlog = (note: PatchNote) => {
    setActiveNoteId(note.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToList = () => {
    setActiveNoteId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (location.state?.fromSettings) {
      const handlePop = () => {
        navigate('/?settings=true', { replace: true });
      };
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, [location.state?.fromSettings, navigate]);

  const handleBack = () => {
    if (activeNote) {
      handleBackToList();
      return;
    }
    if (location.state?.fromSettings) {
      navigate('/?settings=true', { replace: true });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  const grid = (list: PatchNote[], cols: string) => (
    <div className={cn('grid grid-cols-2 gap-3', cols)}>
      {list.map((note) => (
        <NoteCard key={note.id} note={note} highlight={targetVersion === note.version} onOpen={() => handleOpenBlog(note)} />
      ))}
    </div>
  );
  /** 개발자 노트는 버전별로 묶어서, 나머지는 그대로 */
  const renderCards = (list: PatchNote[], cat: PatchCategory | null, cols: string) => (cat === 'dev'
    ? (
      <div className="space-y-4">
        {groupByVersion(list, sortMode).map((g) => (
          <div key={g.version} className="space-y-2">
            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">{g.version === '기타' ? '기타' : `v${g.version}`}</p>
            {grid(g.notes, cols)}
          </div>
        ))}
      </div>
    )
    : grid(list, cols));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 selection:bg-purple-500 selection:text-white pb-24">
      {/* Top Header: 메인 헤더와 동일한 Safe Area 패딩 및 높이 적용 */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-1.5 sm:pt-3.5 sm:pb-1.5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title={activeNote ? "목록으로" : "돌아가기"}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                {activeNote ? '패치노트 상세' : '패치노트 & 업데이트'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>관리자 패치 등록</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-zinc-200/70 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
            >
              메인으로
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          {activeNote ? (
            /* 1. 블로그 형태 상세 읽기 뷰 (Blog Post Detail View) */
            <motion.article
              key={`blog-${activeNote.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl p-5 sm:p-8 space-y-6 shadow-sm"
            >
              <div>
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer py-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>패치노트 목록으로 돌아가기</span>
                </button>
              </div>

              {activeNote.cover && (
                <img src={activeNote.cover} alt="" className="w-full max-h-80 object-cover rounded-2xl -mt-2" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}

              {/* 블로그 헤더 섹션 */}
              <div className="space-y-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-md font-semibold text-[11px]",
                    CATEGORY_MAP[activeNote.category]?.bg || 'bg-zinc-100 dark:bg-zinc-800',
                    CATEGORY_MAP[activeNote.category]?.color || 'text-zinc-700 dark:text-zinc-300'
                  )}>
                    {activeNote.kind || CATEGORY_MAP[activeNote.category]?.label || activeNote.category}
                  </span>

                  <span className="px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono font-bold text-[11px]">
                    v{activeNote.version}
                  </span>

                  <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {activeNote.date}
                  </span>

                  {activeNote.author && (
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      작성자: {activeNote.author}
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-white leading-tight tracking-tight">
                  {activeNote.title}
                </h1>

                {activeNote.highlights && activeNote.highlights.length > 0 && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 space-y-2 mt-4">
                    <div className="text-xs font-bold text-zinc-900 dark:text-white">
                      주요 업데이트 요약
                    </div>
                    <ul className="space-y-1.5 pl-4 list-disc text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      {activeNote.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 블로그 본문 (Markdown Content) */}
              <div className={PATCH_PROSE}>
                <Markdown remarkPlugins={[remarkGfm]} components={{
                  img: ({ node: _n, ...p }) => <img {...p} loading="lazy" alt={p.alt === '이미지' ? '' : p.alt} />,
                  a: ({ node: _n, href, children }) => <NotionAwareLink href={String(href || '')} notes={patchNotes} onOpen={handleOpenBlog}>{children}</NotionAwareLink>,
                }}>{activeNote.content || '등록된 상세 내용이 없어요.'}</Markdown>
              </div>

              {/* 원문 보기 (노션) */}
              {activeNote.url && (
                <a href={activeNote.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-bold transition-colors">
                  원문 보기 <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  목록으로 돌아가기
                </button>
              </div>
            </motion.article>
          ) : (
            /* 2. 카드 형태 목록 뷰 (Card Grid List View) - 카드 내부 아이콘 제거 */
            <motion.div
              key="list-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="space-y-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                    시스템 릴리즈 노트
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                    우주하마 방송 통계 시스템의 신규 기능 및 업데이트 내역이에요. 카드를 클릭하면 블로그 형식의 상세 내용을 확인할 수 있어요.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {(['all', 'patch', 'hotfix', 'update', 'dev'] as const).map(catKey => {
                      const info = CATEGORY_MAP[catKey];
                      const isSelected = selectedCategory === catKey;

                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setSelectedCategory(catKey)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer select-none",
                            isSelected
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                              : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          )}
                        >
                          <span>{info.label}</span>
                          <span className="text-[10px] opacity-75 ml-1">
                            ({catKey === 'all' ? patchNotes.length : patchNotes.filter(n => n.category === catKey).length})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative w-full sm:w-56 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="버전 또는 내용 검색..."
                      className="w-full pl-8.5 pr-3.5 py-1.5 text-xs rounded-lg bg-zinc-100/90 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-1.5 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="정렬">
                  {(['new', 'old', 'version'] as SortMode[]).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={sortMode === m} onClick={() => setSortMode(m)}
                      className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors', sortMode === m ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
                      {SORT_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="py-20 text-center text-zinc-400 space-y-2">
                  <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-medium">패치노트를 불러오는 중이에요...</p>
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
                  <p className="text-sm font-medium">등록된 패치노트가 없어요.</p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 cursor-pointer"
                    >
                      검색 초기화
                    </button>
                  )}
                </div>
              ) : (
                selectedCategory === 'all' && !searchQuery.trim() ? (
                  <div className="space-y-8">
                    {SECTION_ORDER.map((cat) => {
                      const list = filteredNotes.filter((n) => n.category === cat);
                      if (!list.length) return null;
                      return (
                        <section key={cat} className="space-y-3">
                          <div className="flex items-baseline justify-between">
                            <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white">
                              {SECTION_LABEL[cat]} <span className="text-xs font-bold text-zinc-400 ml-0.5">{list.length}</span>
                            </h3>
                            {list.length > 4 && (
                              <button type="button" onClick={() => setSelectedCategory(cat)} className="text-xs font-bold text-purple-600 dark:text-purple-400 cursor-pointer">전체 보기</button>
                            )}
                          </div>
                          {renderCards(list.slice(0, 4), cat, 'sm:grid-cols-4')}
                          {list.length > 4 && (
                            <button type="button" onClick={() => { setSelectedCategory(cat); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                              className="w-full py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-bold cursor-pointer transition-colors">
                              {SECTION_LABEL[cat]} 전체 보기 <span className="text-zinc-400 font-semibold">({list.length})</span>
                            </button>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  renderCards(filteredNotes, selectedCategory === 'dev' && !searchQuery.trim() ? 'dev' : null, 'sm:grid-cols-3')
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
