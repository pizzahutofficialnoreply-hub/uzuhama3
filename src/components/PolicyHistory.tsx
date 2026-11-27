import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, History } from 'lucide-react';
import { LEGAL_VERSION_DATE } from '../content/legal';
import type { SystemConfig, TermsRevision } from '../types';

/**
 * 개정 이력 (이용약관·개인정보처리방침 화면 맨 아래) — 약관 부칙 "이전 약관은 … 개정 이력에서 볼 수 있습니다" 의 그 화면
 *  - 관리자가 발행한 개정 안내(공지일·시행일·바뀐 내용)와, 그 개정 전 문서
 *  - 사이트 기본 문서의 지난 판(2026. 11. 6. 시행본)
 */
type Item = { key: string; label: string; sub?: string; summary?: string; load: () => Promise<string> };
const dot = (d?: string) => String(d || '').replace(/-/g, '. ') + (d ? '.' : '');

export function PolicyHistory({ type, system, prose }: { type: 'terms' | 'privacy'; system?: Partial<SystemConfig> | null; prose?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const name = type === 'terms' ? '이용약관' : '개인정보처리방침';

  const revs = ((system?.termsHistory || []) as TermsRevision[])
    .filter((r) => !r.target || r.target === 'all' || r.target === type);
  const items: Item[] = [
    ...revs.map((r) => {
      const prev = type === 'terms' ? r.previousTerms : r.previousPrivacy;
      return {
        key: `rev-${r.version}`,
        label: `${r.title || `${r.version}차 개정`}`,
        sub: `공지 ${dot(r.noticeDate)} · 시행 ${dot(r.effectiveDate)}`,
        summary: r.changesSummary,
        load: async () => prev || '이 개정 때 이전 문서가 따로 보관되지 않았어요.',
      };
    }),
    {
      key: 'base-20261106',
      label: `${name} (2026. 11. 6. 시행본)`,
      sub: `${dot(LEGAL_VERSION_DATE)} 시행 문서로 바뀌기 전`,
      load: async () => { const m = await import('../content/legal_20261106'); return type === 'terms' ? m.TERMS : m.PRIVACY; },
    },
  ];

  const toggle = async (it: Item) => {
    if (open === it.key) { setOpen(null); return; }
    setOpen(it.key);
    if (!text[it.key]) { const t = await it.load().catch(() => '불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'); setText((x) => ({ ...x, [it.key]: t })); }
  };

  return (
    <section className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800" aria-labelledby={`hist-${type}`}>
      <h3 id={`hist-${type}`} className="flex items-center gap-2 text-base font-black text-zinc-900 dark:text-white">
        <History className="w-4 h-4 text-purple-500" /> 개정 이력
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 break-keep">지금 보는 문서는 {dot(LEGAL_VERSION_DATE)}부터 적용돼요. 지난 문서는 아래에서 그대로 볼 수 있어요.</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.key} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button type="button" onClick={() => toggle(it)} aria-expanded={open === it.key} className="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-zinc-800 dark:text-zinc-100 break-keep">{it.label}</span>
                {it.sub && <span className="block text-[length:calc(11.5px*var(--fs,1))] text-zinc-500 tabular-nums">{it.sub}</span>}
              </span>
              <span className="text-[length:calc(11px*var(--fs,1))] font-bold text-purple-600 dark:text-purple-300 shrink-0">{open === it.key ? '접기' : '이전 문서 보기'}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open === it.key ? 'rotate-180' : ''}`} />
            </button>
            {open === it.key && (
              <div className="px-3.5 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                {it.summary && <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line break-keep"><b>바뀐 내용</b> {it.summary}</p>}
                <div className={`mt-3 max-h-[60vh] overflow-y-auto rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3 ${prose || 'text-sm prose dark:prose-invert max-w-none'}`}>
                  {text[it.key] ? <Markdown remarkPlugins={[remarkGfm]}>{text[it.key]}</Markdown> : <p className="text-xs text-zinc-400">불러오는 중…</p>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
