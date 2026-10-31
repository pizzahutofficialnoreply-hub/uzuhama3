import React, { useState, useRef } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  Link as LinkIcon, 
  Minus, 
  Palette, 
  Eye, 
  Edit3,
  Quote
} from 'lucide-react';
import { RichTextRenderer } from './RichTextRenderer';

interface RichTextEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  rows?: number;
  minHeight?: string;
  className?: string;
  label?: string;
}

const COLOR_PRESETS = [
  { label: '기본 텍스트', color: '', hex: '' },
  { label: '사이트 보라', color: '#9333ea', hex: '#9333ea' },
  { label: '밝은 보라', color: '#a855f7', hex: '#a855f7' },
  { label: '레드 (강조)', color: '#dc2626', hex: '#dc2626' },
  { label: '블루 (안내)', color: '#2563eb', hex: '#2563eb' },
  { label: '에메랄드 (완료)', color: '#059669', hex: '#059669' },
  { label: '오렌지 (주의)', color: '#ea580c', hex: '#ea580c' },
  { label: '앰버 (대기)', color: '#d97706', hex: '#d97706' },
  { label: '회색 (설명)', color: '#71717a', hex: '#71717a' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요...',
  rows = 8,
  minHeight = '180px',
  className = '',
  label
}: RichTextEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'split'>('edit');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 선택 영역 앞뒤로 태그 감싸기
  const wrapSelection = (before: string, after: string, defaultText = '텍스트') => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + before + defaultText + after);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    const nextValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(nextValue);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 10);
  };

  // 줄 시작 부분에 접두사 추가 (헤딩, 리스트 등)
  const prefixLine = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + '\n' + prefix);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    
    // 현재 커서가 속한 줄의 시작점 찾기
    const lastNewline = value.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    
    const nextValue = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(nextValue);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  };

  // 정렬 적용 (<div align="center">...</div>)
  const applyAlignment = (align: 'left' | 'center' | 'right') => {
    wrapSelection(`<div align="${align}">\n`, '\n</div>', '정렬할 텍스트');
  };

  // 글씨 색상 적용
  const applyColor = (hex: string) => {
    setShowColorPicker(false);
    if (!hex) {
      wrapSelection('', '', '텍스트');
      return;
    }
    wrapSelection(`<span style="color: ${hex}">`, '</span>', '색상 텍스트');
  };

  // 글씨 크기 (small)
  const applySmallText = () => {
    wrapSelection('<small>', '</small>', '작은 글씨');
  };

  // 링크 삽입
  const applyLink = () => {
    const url = prompt('연결할 URL 링크를 입력하세요:', 'https://');
    if (!url) return;
    wrapSelection('[', `](${url})`, '링크 이름');
  };

  // 구분선 삽입
  const insertDivider = () => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + '\n---\n');
      return;
    }
    const start = el.selectionStart;
    const nextValue = value.substring(0, start) + '\n---\n' + value.substring(start);
    onChange(nextValue);
  };

  // 단축키 (Ctrl+B / Cmd+B, Ctrl+I, Ctrl+U)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        wrapSelection('**', '**', '굵은 텍스트');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        wrapSelection('*', '*', '기울임 텍스트');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        wrapSelection('<u>', '</u>', '밑줄 텍스트');
      }
    }
  };

  return (
    <div className={`border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-xs ${className}`}>
      {/* 툴바 상단: 편집 모드 탭 & 라벨 */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/60 gap-2">
        <div className="flex items-center gap-2">
          {label && (
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mr-2">
              {label}
            </span>
          )}
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium hidden sm:inline">
            서식 편집기 (마크다운 & HTML 지원)
          </span>
        </div>

        {/* 편집기 탭: 편집 / 미리보기 / 분할 */}
        <div className="flex items-center bg-zinc-200/60 dark:bg-zinc-800/80 rounded-xl p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'edit'
                ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>편집</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>미리보기</span>
          </button>
        </div>
      </div>

      {/* 툴바 버튼 그룹 (편집 모드 시 노출) */}
      {activeTab !== 'preview' && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
          {/* 글씨 스타일: 볼드, 기울임, 밑줄, 취소선 */}
          <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => wrapSelection('**', '**', '굵은 텍스트')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="굵게 (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('*', '*', '기울임 텍스트')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="기울임 (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('<u>', '</u>', '밑줄 텍스트')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="밑줄 (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('~~', '~~', '취소선 텍스트')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="취소선"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:border-zinc-800 mx-0.5" />

          {/* 글씨 크기 & 헤딩 */}
          <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => prefixLine('# ')}
              className="px-1.5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-[11px] font-black transition-colors cursor-pointer"
              title="제목 1 (아주 크게)"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => prefixLine('## ')}
              className="px-1.5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-[11px] font-extrabold transition-colors cursor-pointer"
              title="제목 2 (크게)"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => prefixLine('### ')}
              className="px-1.5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
              title="제목 3 (중간)"
            >
              H3
            </button>
            <button
              type="button"
              onClick={applySmallText}
              className="px-1.5 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md text-[10px] font-semibold text-zinc-500 transition-colors cursor-pointer"
              title="작은 글씨"
            >
              Small
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:border-zinc-800 mx-0.5" />

          {/* 텍스트 색상 선택기 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="글씨 색상 선택"
            >
              <Palette className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>색상</span>
            </button>

            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1.5 z-30 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl min-w-[170px] space-y-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-bold text-zinc-400 px-1 mb-1">글자 색상 지정</div>
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyColor(p.hex)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
                  >
                    <span 
                      className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0" 
                      style={{ backgroundColor: p.hex || 'currentColor' }} 
                    />
                    <span style={{ color: p.hex || undefined }}>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:border-zinc-800 mx-0.5" />

          {/* 정렬: 좌 / 중 / 우 */}
          <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => applyAlignment('left')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="왼쪽 정렬"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyAlignment('center')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="가운데 정렬"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyAlignment('right')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="오른쪽 정렬"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:border-zinc-800 mx-0.5" />

          {/* 목록 & 기타 */}
          <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => prefixLine('- ')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="글머리 기호 목록"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => prefixLine('1. ')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="번호 매기기 목록"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => prefixLine('> ')}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="인용구"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={applyLink}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="링크 추가"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={insertDivider}
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer"
              title="구분선 삽입"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 에디터 본문 영역 */}
      <div className="relative">
        {activeTab === 'edit' ? (
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full p-4 bg-transparent text-xs sm:text-sm font-sans leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-y selection:bg-purple-500/30"
          />
        ) : (
          <div 
            style={{ minHeight }}
            className="w-full p-4 bg-zinc-50/50 dark:bg-zinc-950/40 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 overflow-y-auto leading-relaxed border-t border-zinc-100 dark:border-zinc-800/40"
          >
            {value.trim() ? (
              <RichTextRenderer content={value} />
            ) : (
              <span className="text-zinc-400 italic">미리 볼 내용이 없습니다.</span>
            )}
          </div>
        )}
      </div>

      {/* 하단 글자 수 및 단축키 안내 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/40 text-[11px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span>단축키: <b>Ctrl+B</b>(굵게), <b>Ctrl+I</b>(기울임), <b>Ctrl+U</b>(밑줄)</span>
        </div>
        <div>
          <span>{value.length} 글자</span>
        </div>
      </div>
    </div>
  );
}
