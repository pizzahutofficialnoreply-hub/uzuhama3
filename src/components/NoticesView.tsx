import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ChevronDown, ExternalLink, Megaphone } from 'lucide-react';
import type { NoticeItem, SystemConfig } from '../types';
import { RichTextRenderer } from './common/RichTextRenderer';
import { cn } from '../utils';

/**
 * 설정 > 공지사항: 띠 공지·팝업 공지를 한곳에서 (패치노트처럼 카드 목록, 누르면 펼쳐짐)
 * - 이미 받아 둔 사이트 설정(system)만 쓰므로 Firestore 를 새로 읽지 않음
 */
type Row = { id: string; title: string; content: string; type: NoticeItem['type']; prefix?: string; date: string; active: boolean; links: { url: string; title: string }[] };

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  big: { label: '팝업 공지', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' },
  small: { label: '띠 공지', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  both: { label: '팝업 + 띠', cls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300' },
  none: { label: '공지', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};

export function collectNotices(system?: SystemConfig): Row[] {
  if (!system) return [];
  const rows: Row[] = (system.noticeList || []).map((n) => ({
    id: n.id,
    title: n.title || '공지',
    content: n.content || '',
    type: n.type || 'none',
    prefix: n.prefix,
    date: n.date || '',
    active: Boolean(n.active) && n.type !== 'none',
    links: (n.links?.length ? n.links : n.linkUrl ? [{ url: n.linkUrl, title: n.linkText || '관련 링크' }] : []).filter((l: any) => l?.url).map((l: any) => ({ url: l.url, title: l.title || l.text || '관련 링크' })),
  }));
  // 예전 방식(목록이 아닌 단일 공지)도 함께
  if (system.noticeContent?.trim() && system.noticeType !== 'none' && !rows.some((r) => r.content.trim() === system.noticeContent.trim())) {
    rows.push({ id: 'legacy-notice', title: system.noticeTitle || '공지', content: system.noticeContent, type: system.noticeType, date: '', active: true, links: [] });
  }
  // 순서: 관리자가 정한 공지 목록 순서 그대로 (위에서부터)
  return rows;
}

export function NoticesView({ system, onClose }: { system?: SystemConfig; onClose: () => void }) {
  const notices = useMemo(() => collectNotices(system), [system]);
  const [open, setOpen] = useState<string | null>(() => notices[0]?.id || null);

  // 휴대폰 뒤로가기(밀어서 뒤로 포함)로 닫히게: 열 때 기록을 하나 쌓고, 뒤로가기가 오면 닫음
  const closedByBackRef = React.useRef(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ noticesView: true }, '');
    const onPop = () => { closedByBackRef.current = true; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.history.back(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 화면의 '뒤로' 버튼도 브라우저 뒤로가기로 (쌓아 둔 기록을 함께 정리)
  const goBack = () => {
    if (window.history.state?.noticesView) window.history.back();
    else onClose();
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] bg-[#f2f2f7] dark:bg-black overflow-y-auto"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      role="dialog"
      aria-modal="true"
      aria-label="공지사항"
    >
      <header className="sticky top-0 z-10 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl border-b border-zinc-200/70 dark:border-zinc-800/70 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-2">
          <button type="button" onClick={goBack} className="p-2 -ml-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer" aria-label="뒤로">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black tracking-tight">공지사항</h1>
          <span className="ml-auto text-xs text-zinc-500">{notices.length}개</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] space-y-3">
        {notices.length === 0 && (
          <div className="py-20 text-center text-sm text-zinc-500">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            등록된 공지가 없어요.
          </div>
        )}
        {notices.map((n) => {
          const isOpen = open === n.id;
          const t = TYPE_LABEL[n.type] || TYPE_LABEL.none;
          return (
            <div key={n.id} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : n.id)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {/* 띠 공지 앞머리 태그 그대로 ([공지], [안내], [업데이트] …) */}
                  <span className={cn('px-2.5 py-0.5 rounded-md font-bold', t.cls)}>{(n.prefix || '').trim() || ((system as any)?.defaultNoticePrefix || '').trim() || '[공지]'}</span>
                  <span className={cn('px-2 py-0.5 rounded-md font-semibold', n.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400')}>
                    {n.active ? '게시 중' : '지난 공지'}
                  </span>
                  {n.date && <span className="text-zinc-500">{n.date}</span>}
                  <ChevronDown className={cn('ml-auto w-4 h-4 text-zinc-400 transition-transform duration-200', isOpen && 'rotate-180')} />
                </div>
                <h3 className="mt-2.5 text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-snug break-keep">{n.title}</h3>
                {!isOpen && <p className="mt-1.5 text-xs text-zinc-500 line-clamp-2">{n.content.replace(/[#*_>`~-]/g, '').slice(0, 140)}</p>}
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
                        <RichTextRenderer content={n.content} />
                      </div>
                      {n.links.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {n.links.map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold">
                              {l.title} <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </main>
    </motion.div>,
    document.body
  );
}
