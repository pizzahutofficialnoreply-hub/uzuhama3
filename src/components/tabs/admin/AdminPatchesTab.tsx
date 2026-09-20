import React, { useState } from 'react';
import { 
  PlusCircle, 
  Tag, 
  Sparkles, 
  Zap, 
  Megaphone, 
  Code2, 
  Calendar, 
  FileText, 
  ExternalLink, 
  Share2, 
  Check, 
  Edit3, 
  Trash2, 
  X,
  FileCode2,
  Eye
} from 'lucide-react';
import { usePatchNotes } from '../../../hooks/usePatchNotes';
import { PatchCategory, PatchNote } from '../../../types';
import { cn } from '../../../utils';
import Markdown from 'react-markdown';

const TEMPLATES: Record<PatchCategory, { title: string; highlights: string[]; content: string }> = {
  patch: {
    title: '시스템 개선 및 성능 최적화',
    highlights: ['통계 알고리즘 가중치 계산 고도화', '화면 렌더링 성능 최적화'],
    content: `## 🛠️ 패치 세부 내역

### 1. 주요 변경점
- 방송 기록 집계 및 분석 알고리즘이 개선되었습니다.
- UI 터치 반응 속도를 최적화하였습니다.

### 2. 버그 수정
- 특정 모바일 기기에서의 레이아웃 밀림 현상을 수정하였습니다.`
  },
  hotfix: {
    title: '긴급 오류 수정 및 데이터 보정 핫픽스',
    highlights: ['표시 오류 긴급 수정', '서버 데이터 연동 안정화'],
    content: `## ⚡ 긴급 핫픽스 안내

### 1. 조치 사항
- 방송 일정 집계 데이터에서 발생한 간헐적 지연 문제를 긴급 패치하였습니다.
- 즉시 적용되었으며 별도의 재접속 없이 정상 반영됩니다.`
  },
  update: {
    title: '정기 대규모 기능 업데이트',
    highlights: ['신규 분석 위젯 추가', '데이터 내보내기 기능 신설'],
    content: `## 🌟 새로운 기능 업데이트

우주하마 방송 통계 시스템에 새로운 기능이 추가되었습니다.

### 📌 주요 신규 기능
1. **신규 분석 뷰 도입**: 요일별/시간대별 통계를 더욱 입체적으로 분석할 수 있습니다.
2. **공유 카드 고도화**: 그래프와 표를 한 장의 고화질 이미지로 저장할 수 있습니다.`
  },
  dev: {
    title: '개발자 노트: 시스템 아키텍처 비하인드',
    highlights: ['기술 스택 개선기', '실시간 데이터베이스 설계'],
    content: `## 👨‍💻 개발자 노트: 비하인드 스토리

이번 릴리즈를 준비하며 겪었던 기술적 고민과 개선 과정을 공유합니다.

- **실시간 데이터 동기화**: Firestore 오프라인 캐시 및 실시간 스냅샷 리스너를 결합하여 데이터 사용량을 절감했습니다.
- **클라이언트 최적화**: Recharts 렌더링 사이클을 최적화하여 저사양 기기에서도 부드러운 스크롤을 유지하도록 개선했습니다.`
  }
};

export function AdminPatchesTab() {
  const { patchNotes, loading, addPatchNote, updatePatchNote, deletePatchNote } = usePatchNotes();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [version, setVersion] = useState('1.0.1');
  const [category, setCategory] = useState<PatchCategory>('patch');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [author, setAuthor] = useState('우주하마 통계팀');
  const [highlightInput, setHighlightInput] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [content, setContent] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [filterCategory, setFilterCategory] = useState<PatchCategory | 'all'>('all');

  // 템플릿 적용
  const applyTemplate = (cat: PatchCategory) => {
    const tpl = TEMPLATES[cat];
    setCategory(cat);
    if (!title) setTitle(tpl.title);
    if (highlights.length === 0) setHighlights(tpl.highlights);
    if (!content) setContent(tpl.content);
  };

  const resetForm = () => {
    setEditingId(null);
    setVersion('1.0.1');
    setCategory('patch');
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setAuthor('우주하마 통계팀');
    setHighlights([]);
    setHighlightInput('');
    setContent('');
    setPreviewMode(false);
  };

  const handleEditClick = (note: PatchNote) => {
    setEditingId(note.id);
    setVersion(note.version);
    setCategory(note.category);
    setTitle(note.title);
    setDate(note.date);
    setAuthor(note.author || '우주하마 통계팀');
    setHighlights(note.highlights || []);
    setContent(note.content || '');
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleAddHighlight = () => {
    const trimmed = highlightInput.trim();
    if (trimmed && !highlights.includes(trimmed)) {
      setHighlights([...highlights, trimmed]);
      setHighlightInput('');
    }
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights(highlights.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVersion = version.replace(/^v/, '').trim();
    if (!cleanVersion) {
      alert('버전(0.0.0 양식)을 입력해주세요.');
      return;
    }
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updatePatchNote({
          id: editingId,
          version: cleanVersion,
          category,
          title: title.trim(),
          date,
          author: author.trim(),
          highlights,
          content: content.trim()
        });
        alert(`v${cleanVersion} 패치노트가 성공적으로 수정되었습니다.`);
      } else {
        await addPatchNote({
          version: cleanVersion,
          category,
          title: title.trim(),
          date,
          author: author.trim(),
          highlights,
          content: content.trim()
        });
        alert(`v${cleanVersion} 패치노트가 성공적으로 등록되었습니다. /patch-${cleanVersion} 경로로 확인 가능합니다.`);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, ver: string) => {
    if (window.confirm(`v${ver} 패치노트를 정말 삭제하시겠습니까?`)) {
      await deletePatchNote(id);
      if (editingId === id) resetForm();
    }
  };

  const handleCopyLink = (ver: string, id: string) => {
    const url = `${window.location.origin}/patch-${ver}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const filteredNotes = patchNotes.filter(n => {
    if (filterCategory === 'all') return true;
    return n.category === filterCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <FileCode2 className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
              패치노트 등록 및 관리 시스템
            </h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            등록 시 <code className="text-purple-600 dark:text-purple-400 font-bold font-mono">/patch-0.0.0</code> 형식으로 영구 링크가 자동 생성되며, 설정 메뉴의 패치노트 아카이브에 노출됩니다.
          </p>
        </div>

        <a
          href="/patch"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
        >
          <span>사용자 패치 아카이브 열기</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Register/Edit Form Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h4 className="font-bold text-zinc-900 dark:text-white">
              {editingId ? `v${version} 패치노트 수정` : '신규 패치노트 등록'}
            </h4>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
              <span>수정 취소</span>
            </button>
          )}
        </div>

        {/* Template Quick Select */}
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-2">
            빠른 템플릿 불러오기
          </label>
          <div className="flex flex-wrap gap-2">
            {(['patch', 'hotfix', 'update', 'dev'] as const).map(catKey => (
              <button
                key={catKey}
                type="button"
                onClick={() => applyTemplate(catKey)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                {catKey === 'patch' && '🔧 패치노트 템플릿'}
                {catKey === 'hotfix' && '⚡ 핫픽스 템플릿'}
                {catKey === 'update' && '📢 업데이트 공지 템플릿'}
                {catKey === 'dev' && '👨‍💻 개발자 노트 템플릿'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Category & Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                카테고리 구분 *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PatchCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="patch">패치노트 (Patch)</option>
                <option value="hotfix">핫픽스 노트 (Hotfix)</option>
                <option value="update">업데이트 공지 (Update)</option>
                <option value="dev">개발자 노트 (Dev Notes)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                버전 넘버 (/patch-0.0.0 양식) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-zinc-400 font-bold text-xs">
                  v
                </span>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="0.0.0 (예: 1.0.1, 0.9.5)"
                  required
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                생성될 경로: <code className="text-purple-600 dark:text-purple-400 font-mono">/patch-{version.replace(/^v/, '').trim() || '0.0.0'}</code>
              </p>
            </div>
          </div>

          {/* Row 2: Title & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                공지 제목 *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2026년 3월 시스템 기능 및 통계 분석 업데이트"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                배포 일자 *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Author */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              작성자 / 부서
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="우주하마 통계팀, 총괄 개발자, 운영팀 등"
              className="w-full sm:w-1/2 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Highlights Tag System */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              핵심 요약 키워드 태그 (카드 상단 표시)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddHighlight();
                  }
                }}
                placeholder="엔터키 또는 추가 버튼으로 추가 (예: 막대 차트 점선 커서 추가)"
                className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={handleAddHighlight}
                className="px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-xs font-bold transition-colors"
              >
                태그 추가
              </button>
            </div>
            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {highlights.map((h, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-medium"
                  >
                    <span>{h}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHighlight(i)}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Markdown Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                상세 본문 (마크다운 지원) *
              </label>
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-semibold"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{previewMode ? '편집기로 돌아가기' : '미리보기 토글'}</span>
              </button>
            </div>

            {previewMode ? (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 min-h-[160px] max-h-[360px] overflow-y-auto markdown-body prose prose-zinc dark:prose-invert max-w-none text-xs">
                <Markdown>{content || '내용이 없습니다.'}</Markdown>
              </div>
            ) : (
              <textarea
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="마크다운 문법 지원 (## 제목, - 목록, **굵게** 등)"
                required
                className="w-full p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? '저장 중...' : editingId ? '패치노트 수정 완료' : '패치노트 등록하기'}</span>
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List of Registered Patch Notes */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <span>등록된 패치노트 아카이브</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {filteredNotes.length}개
            </span>
          </h4>

          {/* Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(['all', 'patch', 'hotfix', 'update', 'dev'] as const).map(catKey => (
              <button
                key={catKey}
                type="button"
                onClick={() => setFilterCategory(catKey)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0",
                  filterCategory === catKey
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                )}
              >
                {catKey === 'all' && '전체'}
                {catKey === 'patch' && '패치노트'}
                {catKey === 'hotfix' && '핫픽스'}
                {catKey === 'update' && '업데이트'}
                {catKey === 'dev' && '개발자 노트'}
              </button>
            ))}
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-8 text-center text-zinc-400 text-xs">
            등록된 패치노트가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-mono font-bold text-xs bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2.5 py-0.5 rounded-lg">
                      v{note.version}
                    </span>
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                      {note.category === 'patch' && '패치노트'}
                      {note.category === 'hotfix' && '핫픽스 노트'}
                      {note.category === 'update' && '업데이트 공지'}
                      {note.category === 'dev' && '개발자 노트'}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {note.date}
                    </span>
                    {note.author && (
                      <span className="text-xs text-zinc-400">
                        · {note.author}
                      </span>
                    )}
                  </div>
                  <h5 className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                    {note.title}
                  </h5>
                  {note.highlights && note.highlights.length > 0 && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {note.highlights.join(' · ')}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <a
                    href={`/patch-${note.version}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 hover:bg-purple-100 text-xs font-semibold transition-colors"
                  >
                    <span>/patch-{note.version}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyLink(note.version, note.id)}
                    className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 transition-colors"
                    title="링크 복사"
                  >
                    {copiedId === note.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEditClick(note)}
                    className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 transition-colors"
                    title="수정"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(note.id, note.version)}
                    className="p-2 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
