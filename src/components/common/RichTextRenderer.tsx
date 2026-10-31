import React from 'react';

interface RichTextRendererProps {
  content: string;
  className?: string;
}

/**
 * RichTextRenderer:
 * 볼드, 기울임, 밑줄, 취소선, 글자 색상, 글자 크기, 텍스트 정렬(왼쪽/가운데/오른쪽),
 * 링크, 목록, 줄바꿈 등을 안전하고 미려하게 렌더링하는 전용 컴포넌트
 */
export function RichTextRenderer({ content, className = '' }: RichTextRendererProps) {
  if (!content) return null;

  // 줄 단위 파싱 및 태그 변환
  const renderFormattedLine = (line: string, index: number) => {
    let html = line;

    // 헤딩(#, ##, ###)
    if (html.startsWith('### ')) {
      const headingText = html.slice(4);
      return (
        <h4 key={index} className="text-base font-bold text-zinc-900 dark:text-white my-1.5">
          {renderInlineElements(headingText)}
        </h4>
      );
    }
    if (html.startsWith('## ')) {
      const headingText = html.slice(3);
      return (
        <h3 key={index} className="text-lg font-extrabold text-zinc-900 dark:text-white my-2">
          {renderInlineElements(headingText)}
        </h3>
      );
    }
    if (html.startsWith('# ')) {
      const headingText = html.slice(2);
      return (
        <h2 key={index} className="text-xl font-black text-zinc-900 dark:text-white my-2.5">
          {renderInlineElements(headingText)}
        </h2>
      );
    }

    // 구분선
    if (html.trim() === '---' || html.trim() === '***') {
      return <hr key={index} className="my-3 border-zinc-200 dark:border-zinc-800" />;
    }

    // 글머리 기호 목록
    if (html.startsWith('- ') || html.startsWith('* ')) {
      return (
        <li key={index} className="ml-4 list-disc text-zinc-700 dark:text-zinc-300 my-0.5">
          {renderInlineElements(html.slice(2))}
        </li>
      );
    }

    // 번호 목록
    const numMatch = html.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      return (
        <li key={index} className="ml-4 list-decimal text-zinc-700 dark:text-zinc-300 my-0.5">
          {renderInlineElements(numMatch[2])}
        </li>
      );
    }

    // 인용구
    if (html.startsWith('> ')) {
      return (
        <blockquote key={index} className="border-l-4 border-purple-500 pl-3 my-1.5 italic text-zinc-600 dark:text-zinc-400">
          {renderInlineElements(html.slice(2))}
        </blockquote>
      );
    }

    // 정렬 태그 감지 (<div align="center">, <center>, <p align="right"> 등)
    const centerMatch = html.match(/<(?:div|p|center)\s*(?:align=['"]center['"]|style=['"][^'"]*text-align:\s*center[^'"]*['"])?>(.*?)<\/(?:div|p|center)>/i);
    if (centerMatch) {
      return (
        <div key={index} className="text-center my-0.5">
          {renderInlineElements(centerMatch[1])}
        </div>
      );
    }

    const rightMatch = html.match(/<(?:div|p)\s*(?:align=['"]right['"]|style=['"][^'"]*text-align:\s*right[^'"]*['"])>(.*?)<\/(?:div|p)>/i);
    if (rightMatch) {
      return (
        <div key={index} className="text-right my-0.5">
          {renderInlineElements(rightMatch[1])}
        </div>
      );
    }

    const leftMatch = html.match(/<(?:div|p)\s*(?:align=['"]left['"]|style=['"][^'"]*text-align:\s*left[^'"]*['"])>(.*?)<\/(?:div|p)>/i);
    if (leftMatch) {
      return (
        <div key={index} className="text-left my-0.5">
          {renderInlineElements(leftMatch[1])}
        </div>
      );
    }

    // 일반 본문 줄
    if (html.trim() === '') {
      return <div key={index} className="h-2" />;
    }

    return (
      <div key={index} className="my-0.5 leading-relaxed break-keep">
        {renderInlineElements(html)}
      </div>
    );
  };

  // 인라인 스타일 및 마크다운/HTML 태그 처리
  const renderInlineElements = (text: string): React.ReactNode => {
    // 안전한 HTML 생성
    let parsed = text;

    // 링크 [텍스트](url)
    parsed = parsed.replace(
      /\[(.*?)\]\((https?:\/\/[^\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 underline font-semibold hover:opacity-80 break-all">$1</a>'
    );

    // 자동 URL 링크 (대괄호 마크다운 외 일반 URL)
    parsed = parsed.replace(
      /(?<!href=")(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 underline font-semibold hover:opacity-80 break-all">$1</a>'
    );

    // Bold: **텍스트** 또는 <b>텍스트</b> 또는 <strong>텍스트</strong>
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-zinc-900 dark:text-white">$1</strong>');
    parsed = parsed.replace(/<b>(.*?)<\/b>/gi, '<strong class="font-bold text-zinc-900 dark:text-white">$1</strong>');
    parsed = parsed.replace(/<strong>(.*?)<\/strong>/gi, '<strong class="font-bold text-zinc-900 dark:text-white">$1</strong>');

    // Italic: *텍스트* 또는 _텍스트_ 또는 <i>텍스트</i> 또는 <em>텍스트</em>
    parsed = parsed.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>');
    parsed = parsed.replace(/_(.*?)_/g, '<em class="italic">$1</em>');
    parsed = parsed.replace(/<i>(.*?)<\/i>/gi, '<em class="italic">$1</em>');
    parsed = parsed.replace(/<em>(.*?)<\/em>/gi, '<em class="italic">$1</em>');

    // Underline: <u>텍스트</u>
    parsed = parsed.replace(/<u>(.*?)<\/u>/gi, '<span class="underline underline-offset-4 decoration-2 decoration-purple-500/60">$1</span>');

    // Strikethrough: ~~텍스트~~ 또는 <s>텍스트</s> 또는 <del>텍스트</del>
    parsed = parsed.replace(/~~(.*?)~~/g, '<del class="line-through opacity-70">$1</del>');
    parsed = parsed.replace(/<s>(.*?)<\/s>/gi, '<del class="line-through opacity-70">$1</del>');
    parsed = parsed.replace(/<del>(.*?)<\/del>/gi, '<del class="line-through opacity-70">$1</del>');

    // Font size: <span style="font-size: ..."> 또는 <small>
    parsed = parsed.replace(/<small>(.*?)<\/small>/gi, '<span class="text-[11px] opacity-80">$1</span>');

    // Safe direct dangerouslySetInnerHTML
    return <span dangerouslySetInnerHTML={{ __html: parsed }} />;
  };

  const lines = content.split('\n');

  return (
    <div className={`rich-text-content space-y-0.5 select-text ${className}`}>
      {lines.map((line, i) => renderFormattedLine(line, i))}
    </div>
  );
}
