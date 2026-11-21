import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, ChevronRight } from 'lucide-react';

/**
 * 공지·점검·안내 글 공통 마크다운 (보기 좋게)
 *  - 링크: 보라색 굵은 글씨 + 밑줄 + 화살표 (사이트 안 링크 app://·/… 는 같은 창, 바깥 링크는 새 창)
 *  - 글머리 기호·번호·굵게·구분선·인용을 눈에 띄게
 * (tailwind 'prose' 를 안 써서 예전에는 목록 점·링크 색이 안 보였음)
 */
const safeUrl = (u: string) => (/^(https?:\/\/|app:\/\/|redirect:\/\/|\/)/i.test(u || '') ? u : '');
const isInternal = (u: string) => /^(app:\/\/|redirect:\/\/|\/(?!\/))/i.test(u || '');

export const NICE_MD: Record<string, any> = {
  h1: ({ node, ...p }: any) => <h2 className="text-[16px] font-black text-zinc-900 dark:text-white mt-4 mb-2 break-keep" {...p} />,
  h2: ({ node, ...p }: any) => <h2 className="text-[15px] font-black text-zinc-900 dark:text-white mt-4 mb-2 break-keep" {...p} />,
  h3: ({ node, ...p }: any) => <h3 className="text-[13.5px] font-black text-purple-600 dark:text-purple-400 mt-3 mb-1.5 break-keep" {...p} />,
  p: ({ node, ...p }: any) => <p className="my-1.5 leading-relaxed text-zinc-700 dark:text-zinc-200 break-keep" {...p} />,
  ul: ({ node, ...p }: any) => <ul className="my-2 pl-5 space-y-1.5 list-disc marker:text-purple-500" {...p} />,
  ol: ({ node, ...p }: any) => <ol className="my-2 pl-5 space-y-1.5 list-decimal marker:text-purple-500 marker:font-bold" {...p} />,
  li: ({ node, ...p }: any) => <li className="pl-0.5 leading-relaxed text-zinc-700 dark:text-zinc-200 break-keep" {...p} />,
  strong: ({ node, ...p }: any) => <strong className="font-black text-zinc-900 dark:text-white" {...p} />,
  hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />,
  blockquote: ({ node, ...p }: any) => <blockquote className="my-2 pl-3 border-l-4 border-purple-500 text-zinc-600 dark:text-zinc-300" {...p} />,
  code: ({ node, ...p }: any) => <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[0.92em]" {...p} />,
  a: ({ node, href, children, ...p }: any) => {
    const u = safeUrl(String(href || ''));
    const inside = isInternal(u);
    return (
      <a href={u || undefined} {...(inside ? { 'data-app-link': '1' } : { target: '_blank', rel: 'noopener noreferrer' })} {...p}
        className="inline-flex items-center gap-0.5 font-bold text-purple-600 dark:text-purple-300 underline underline-offset-2 decoration-2 decoration-purple-400/60 hover:opacity-80 break-all">
        {children}{inside ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />}
      </a>
    );
  },
};

export function NiceMarkdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`text-[13px] sm:text-sm ${className}`}>
      <ReactMarkdown components={NICE_MD} urlTransform={(u) => safeUrl(u)}>{children}</ReactMarkdown>
    </div>
  );
}
