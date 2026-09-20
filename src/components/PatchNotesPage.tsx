import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Tag, 
  Sparkles, 
  Zap, 
  Megaphone, 
  Code2, 
  Calendar, 
  Share2, 
  Check, 
  Search, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  FileCode2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { usePatchNotes } from '../hooks/usePatchNotes';
import { useAuth } from '../hooks/useAuth';
import { PatchCategory, PatchNote } from '../types';
import { cn } from '../utils';

const CATEGORY_MAP: Record<PatchCategory | 'all', { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  all: {
    label: '전체',
    color: 'text-zinc-700 dark:text-zinc-200',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    border: 'border-zinc-300 dark:border-zinc-700',
    icon: FileCode2
  },
  patch: {
    label: '패치노트',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    border: 'border-purple-200 dark:border-purple-800/60',
    icon: Sparkles
  },
  hotfix: {
    label: '핫픽스 노트',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-200 dark:border-amber-800/60',
    icon: Zap
  },
  update: {
    label: '업데이트 공지',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-200 dark:border-blue-800/60',
    icon: Megaphone
  },
  dev: {
    label: '개발자 노트',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    icon: Code2
  }
};

export function PatchNotesPage() {
  const { version: paramVersion } = useParams<{ version?: string }>();
  const navigate = useNavigate();
  const { patchNotes, loading } = usePatchNotes();
  const { user } = useAuth();
  const isAdmin = user?.email === 'saramoriyo@gmail.com';

  const [selectedCategory, setSelectedCategory] = useState<PatchCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // URL에서 버전 파라미터가 있는 경우 (예: /patch-1.0.0 또는 /patch-0.0.1)
  const targetVersion = useMemo(() => {
    if (!paramVersion) return null;
    return paramVersion.replace(/^v/, '').trim();
  }, [paramVersion]);

  // 특정 버전으로 접근 시 자동 확장 및 스크롤
  useEffect(() => {
    if (targetVersion && patchNotes.length > 0) {
      const match = patchNotes.find(p => p.version === targetVersion);
      if (match) {
        setExpandedIds(prev => ({ ...prev, [match.id]: true }));
        // 해당 카드로 스크롤
        setTimeout(() => {
          const el = document.getElementById(`patch-card-${match.version}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    } else if (patchNotes.length > 0) {
      // 기본적으로 최신 첫 번째 패치노트는 펼쳐둠
      setExpandedIds(prev => ({ ...prev, [patchNotes[0].id]: true }));
    }
  }, [targetVersion, patchNotes]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyLink = (version: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/patch-${version}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      prompt('패치노트 링크 복사:', url);
    });
  };

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 selection:bg-purple-500 selection:text-white pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="p-2 -ml-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title="메인 페이지로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                <FileCode2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span>패치노트 & 업데이트</span>
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                우주하마 방송 통계 시스템 릴리즈 아카이브
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 hover:bg-purple-100 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>관리자 패치 등록</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              메인으로
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Intro banner */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  RELEASE NOTES
                </span>
                <span className="text-xs text-zinc-400">
                  직접 접속 주소: <code className="text-purple-600 dark:text-purple-400 font-mono">/patch-0.0.0</code>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                우주하마 시스템 변경 내역
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                기능 추가, 긴급 핫픽스, 통계 엔진 업데이트 및 개발 비하인드 노트를 확인하실 수 있습니다.
              </p>
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="버전 (0.0.0) 또는 내용 검색..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Category Filter Pills (패치노트, 핫픽스 노트, 업데이트 공지, 개발자 노트) */}
          <div className="flex items-center gap-2 mt-6 overflow-x-auto custom-scrollbar pb-1">
            {(['all', 'patch', 'hotfix', 'update', 'dev'] as const).map(catKey => {
              const info = CATEGORY_MAP[catKey];
              const Icon = info.icon;
              const isSelected = selectedCategory === catKey;

              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(catKey)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                    isSelected
                      ? "bg-purple-600 text-white shadow-sm ring-2 ring-purple-600/30"
                      : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-700/60"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{info.label}</span>
                  <span className={cn(
                    "ml-1 text-[10px] px-1.5 py-0.2 rounded-full",
                    isSelected 
                      ? "bg-white/25 text-white" 
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                  )}>
                    {catKey === 'all' 
                      ? patchNotes.length 
                      : patchNotes.filter(n => n.category === catKey).length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Patch Notes Card List */}
        {loading ? (
          <div className="py-20 text-center text-zinc-400">
            <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold">패치노트를 불러오는 중입니다...</p>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-12 text-center text-zinc-500">
            <p className="text-sm font-semibold">해당 조건의 패치노트가 없습니다.</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 px-3 py-1.5 text-xs text-purple-600 dark:text-purple-400 hover:underline"
              >
                검색어 초기화
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotes.map((note) => {
              const catInfo = CATEGORY_MAP[note.category] || CATEGORY_MAP.patch;
              const Icon = catInfo.icon;
              const isExpanded = !!expandedIds[note.id];
              const isTargetHighlight = targetVersion === note.version;

              return (
                <div
                  key={note.id}
                  id={`patch-card-${note.version}`}
                  className={cn(
                    "bg-white dark:bg-zinc-900 border rounded-[24px] overflow-hidden shadow-sm transition-all duration-200",
                    isTargetHighlight
                      ? "border-purple-500 dark:border-purple-400 ring-2 ring-purple-500/20 shadow-md"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  )}
                >
                  {/* Card Header */}
                  <div 
                    onClick={() => toggleExpand(note.id)}
                    className="p-5 sm:p-6 cursor-pointer select-none hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center flex-wrap gap-2">
                        {/* 버전 표시 (예: v1.0.0 / 0.0.0) */}
                        <div className="flex items-center gap-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-mono font-bold text-xs sm:text-sm px-3 py-1 rounded-xl shadow-xs">
                          <Tag className="w-3.5 h-3.5" />
                          <span>v{note.version}</span>
                        </div>

                        {/* 카테고리 뱃지 */}
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border",
                          catInfo.bg,
                          catInfo.color,
                          catInfo.border
                        )}>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{catInfo.label}</span>
                        </span>

                        {/* 날짜 */}
                        <span className="flex items-center gap-1 text-xs text-zinc-400 ml-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{note.date}</span>
                        </span>

                        {note.author && (
                          <span className="text-xs text-zinc-400 hidden sm:inline">
                            · {note.author}
                          </span>
                        )}
                      </div>

                      {/* 링크 복사 버튼 & 펼치기 토글 */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={(e) => handleCopyLink(note.version, note.id, e)}
                          title={`/patch-${note.version} 주소 복사`}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                            copiedId === note.id
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                          )}
                        >
                          {copiedId === note.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[11px]">링크 복사됨</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                              <span className="text-[11px] font-mono">/patch-{note.version}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(note.id);
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          aria-label={isExpanded ? '접기' : '펼치기'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* 제목 */}
                    <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white mt-1">
                      {note.title}
                    </h3>

                    {/* 주요 하이라이트 요약 칩 */}
                    {note.highlights && note.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {note.highlights.map((item, idx) => (
                          <span 
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-700/50"
                          >
                            <span className="w-1 h-1 rounded-full bg-purple-500" />
                            <span>{item}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Expanded Content */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key={`content-${note.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                        className="overflow-hidden border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40"
                      >
                        <div className="p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          <div className="markdown-body prose prose-zinc dark:prose-invert max-w-none text-xs sm:text-sm">
                            <Markdown>{note.content}</Markdown>
                          </div>

                          <div className="pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                            <span className="font-mono">
                              영구 링크: {window.location.origin}/patch-{note.version}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyLink(note.version, note.id, e)}
                              className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>공유 링크 복사</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
