import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  Search, 
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
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

export function PatchNotesPage() {
  const { version: paramVersion } = useParams<{ version?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { patchNotes, loading } = usePatchNotes();
  const { user } = useAuth();
  const isAdmin = user?.email === 'saramoriyo@gmail.com';

  const [selectedCategory, setSelectedCategory] = useState<PatchCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
    return patchNotes.filter(note => {
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
  }, [patchNotes, selectedCategory, searchQuery]);

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
              className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm"
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

              {/* 블로그 헤더 섹션 */}
              <div className="space-y-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-md font-semibold text-[11px]",
                    CATEGORY_MAP[activeNote.category]?.bg || 'bg-zinc-100 dark:bg-zinc-800',
                    CATEGORY_MAP[activeNote.category]?.color || 'text-zinc-700 dark:text-zinc-300'
                  )}>
                    {CATEGORY_MAP[activeNote.category]?.label || activeNote.category}
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
              <div className="prose prose-zinc dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 leading-relaxed text-sm sm:text-base prose-headings:font-bold prose-headings:text-zinc-900 dark:prose-headings:text-white prose-h2:text-xl sm:prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-lg sm:prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:my-3 prose-ul:my-3 prose-li:my-1 prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:text-purple-600 dark:prose-code:text-purple-400 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs sm:prose-code:text-sm prose-pre:bg-zinc-900 dark:prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-xl">
                <Markdown>{activeNote.content || '등록된 상세 내용이 없습니다.'}</Markdown>
              </div>

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
                    우주하마 방송 통계 시스템의 신규 기능 및 업데이트 내역입니다. 카드를 클릭하면 블로그 형식의 상세 내용을 확인할 수 있습니다.
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
              </div>

              {loading ? (
                <div className="py-20 text-center text-zinc-400 space-y-2">
                  <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-medium">패치노트를 불러오는 중입니다...</p>
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
                  <p className="text-sm font-medium">등록된 패치노트가 없습니다.</p>
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
                <div className="grid grid-cols-1 gap-4">
                  {filteredNotes.map(note => {
                    const catInfo = CATEGORY_MAP[note.category] || CATEGORY_MAP.patch;
                    const isTargetHighlight = targetVersion === note.version;

                    return (
                      <div
                        key={note.id}
                        id={`patch-card-${note.version}`}
                        onClick={() => handleOpenBlog(note)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleOpenBlog(note);
                          }
                        }}
                        className={cn(
                          "group p-5 sm:p-6 rounded-2xl border transition-all duration-200 cursor-pointer text-left",
                          "bg-white dark:bg-zinc-900 hover:shadow-lg hover:-translate-y-0.5",
                          isTargetHighlight
                            ? "border-purple-500 dark:border-purple-400 ring-2 ring-purple-500/20 shadow-xs"
                            : "border-zinc-200/90 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700"
                        )}
                      >
                        <div className="space-y-3">
                          {/* 메타 배지 라인 (아이콘 제외, 깔끔한 태그와 텍스트) */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-md font-semibold text-[11px]",
                                catInfo.bg,
                                catInfo.color
                              )}>
                                {catInfo.label}
                              </span>

                              <span className="px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono font-bold text-[11px]">
                                v{note.version}
                              </span>

                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {note.date}
                              </span>
                            </div>

                            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                              상세 보기
                            </span>
                          </div>

                          {/* 카드 제목 */}
                          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-snug group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            {note.title}
                          </h3>

                          {/* 주요 요약 (미리보기) */}
                          {note.highlights && note.highlights.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800/80 space-y-1">
                              <ul className="space-y-1 pl-4 list-disc text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                {note.highlights.slice(0, 3).map((h, i) => (
                                  <li key={i}>{h}</li>
                                ))}
                                {note.highlights.length > 3 && (
                                  <li className="text-zinc-400 dark:text-zinc-500 list-none -ml-4 pl-0 text-[11px] font-medium">
                                    외 {note.highlights.length - 3}개 항목 더보기...
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
