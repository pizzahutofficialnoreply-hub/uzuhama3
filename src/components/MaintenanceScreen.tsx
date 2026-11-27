import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Lock, ExternalLink, CheckCircle2, ChevronDown } from 'lucide-react';
import { MaintenancePager } from './MaintenancePager';
import { FluidBackdrop } from './common/FluidBackdrop';
import { NICE_MD } from './common/NiceMarkdown';
import { FlipCountdown } from './common/FlipClock';
import { generateMaintenanceNoticeMarkdown, formatMaintenanceRange, parseDateSafe } from '../utils/maintenanceUtils';
import type { NoticeLink, SystemConfig } from '../types';

/** 점검 화면 (관리자가 건 점검 · 정해 둔 자동 점검 모두 이 모양) */
export function MaintenanceScreen({ system, maintSystem, onEnd }: { system?: Partial<SystemConfig> | null; maintSystem?: Partial<SystemConfig> | null; onEnd?: () => void }) {
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => { const i = window.setInterval(() => setNowTime(Date.now()), 1000); return () => window.clearInterval(i); }, []);
  const endMs = maintSystem?.maintenanceEnd ? parseDateSafe(maintSystem.maintenanceEnd) : 0;
  useEffect(() => { if (onEnd && endMs && nowTime >= endMs) onEnd(); }, [onEnd, endMs, nowTime]);
  const endTimeMs = maintSystem?.maintenanceEnd ? parseDateSafe(maintSystem.maintenanceEnd) : null;
  const remainingSeconds = endTimeMs && !isNaN(endTimeMs) ? Math.max(0, Math.floor((endTimeMs - nowTime) / 1000)) : null;


  const startStr = maintSystem?.maintenanceStart || '';
  const endStr = maintSystem?.maintenanceEnd || '';
  const { fullText: scheduleFullText } = formatMaintenanceRange(startStr, endStr);

  const changes = system?.maintenanceChanges && system.maintenanceChanges.length > 0
    ? system.maintenanceChanges
    : ['데이터베이스 점검 및 최적화', '서버 연동 점검', '서비스 코드 안정화 및 테스트'];

  const fallbackNoticeMarkdown = generateMaintenanceNoticeMarkdown({
    startStr: startStr || '2026-09-12T10:00',
    endStr: endStr || '2026-09-12T16:00',
    scope: system?.maintenanceScope,
    impact: system?.maintenanceImpact,
    noticeGuide: system?.maintenanceNoticeGuide,
    durationNote: system?.maintenanceDurationNote,
    status: system?.maintenanceStatusText || '점검 진행 중',
    note: system?.maintenanceNote || '없음',
    history: system?.maintenanceHistory
  });

  const links: NoticeLink[] = (system?.maintenanceLinks && system.maintenanceLinks.length > 0)
    ? system.maintenanceLinks.filter(l => Boolean(l.url))
    : (system?.maintenanceLinkUrl ? [{ url: system.maintenanceLinkUrl, title: system.maintenanceLinkText || '관련 링크 바로가기' }] : []);

  // 점검 중에는 '예정' 문구 대신 진행 중으로
  const inProgressText = (md: string) => md.replace(/점검 예정/g, '점검 진행 중').replace(/시작 예정/g, '시작').replace(/하겠어요\./g, '할 거예요.').replace(/하시겠어요\?/g, '할까요?');
  const history = system?.maintenanceHistory || [];
  const extended = history.some((h) => /연장/.test(h.event || ''));
  const originalEnd = history.find((h) => /종료 예정/.test(h.event || ''))?.time || '';
  const fmtDay = (v: string) => {
    const ms = parseDateSafe(v);
    if (!ms) return '';
    const d = new Date(ms + 9 * 3600000);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
  };
  const fmtHm = (v: string) => {
    const ms = parseDateSafe(v);
    if (!ms) return '';
    const d = new Date(ms + 9 * 3600000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };
  const sameDay = fmtDay(startStr) === fmtDay(endStr);
  const mdComponents = {
    h2: ({ node, ...props }: any) => <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400 mt-2.5 mb-1" {...props} />,
    p: ({ node, ...props }: any) => <p className="mb-2 text-zinc-600 dark:text-zinc-300 leading-relaxed" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 space-y-1 mb-2 text-zinc-600 dark:text-zinc-300" {...props} />,
    li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
    strong: ({ node, ...props }: any) => <strong className="font-bold text-zinc-900 dark:text-white" {...props} />,
    hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />,
  };

  return (
    <MaintenancePager
      first={(goDetail) => (
        <div className="relative h-full flex flex-col items-center justify-center px-6 text-center">
        <FluidBackdrop />
        <div className="relative flex flex-col items-center">
        <div className="inline-flex p-5 rounded-[28px] bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shadow-sm">
          <Lock className="w-12 h-12 sm:w-14 sm:h-14" />
        </div>
        <h1 className="mt-6 text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
          {extended ? '점검이 연장됐어요' : '점검 중이에요'}
        </h1>
        {(startStr || endStr) && (
          <div className="mt-4 space-y-1">
            <p className="text-base sm:text-lg font-bold text-zinc-700 dark:text-zinc-200">
              {fmtDay(startStr || endStr)}{!sameDay && endStr ? ` ~ ${fmtDay(endStr)}` : ''}
            </p>
            <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 tabular-nums">
              {startStr ? fmtHm(startStr) : ''}{endStr ? ` ~ ${fmtHm(endStr)}` : ''}
            </p>
            {remainingSeconds !== null && remainingSeconds > 0 && (
              <div className="pt-3"><FlipCountdown seconds={remainingSeconds} /><p className="mt-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">남았어요</p></div>
            )}
          </div>
        )}
        </div>
        <button
          type="button"
          onClick={goDetail}
          className="absolute bottom-[calc(100lvh-100svh+env(safe-area-inset-bottom,0px)+24px)] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-500 dark:text-zinc-400 text-sm font-bold cursor-pointer"
        >
          자세히 보기
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>
      )}
      detail={(
        <>
      {/* 아래로 내리면: 연장 공지 · 점검 공지 · 바뀌는 것 · 링크 */}
      <div id="maint-detail" className="w-full max-w-2xl mx-auto px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-[calc(100lvh-100svh+env(safe-area-inset-bottom,0px)+64px)] space-y-5 text-left">
        <p className="text-center text-[length:calc(11px*var(--fs,1))] text-zinc-400">맨 위에서 아래로 끌면 처음 화면으로 돌아가요</p>
        {extended && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-1.5">
            <h2 className="text-base font-extrabold text-amber-800 dark:text-amber-200">⏰ 점검 연장 안내</h2>
            <p className="text-sm text-amber-800 dark:text-amber-200 break-keep">
              점검이 예정보다 길어지고 있어요. 끝나는 시간이 {originalEnd ? <b>{fmtHm(originalEnd.replace(' ', 'T'))}</b> : '예정 시간'}에서 <b>{fmtHm(endStr)}</b>(으)로 바뀌었어요. 기다리게 해서 미안해요.
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 pt-1">
              {history.filter((h) => /연장/.test(h.event || '')).map((h, i) => <li key={i}>• {h.time} {h.event}</li>)}
            </ul>
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center justify-between gap-2">
            <span>{system?.maintenanceTitle?.trim() || '서비스 안정화를 위한 정기 점검 안내'}</span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-lg shrink-0">점검 공지</span>
          </h2>
          <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs sm:text-sm">
            <ReactMarkdown components={NICE_MD} urlTransform={(u) => u}>
              {inProgressText(system?.maintenanceContent?.trim() || fallbackNoticeMarkdown)}
            </ReactMarkdown>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 sm:p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">이번 점검에서 하는 것</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">점검이 끝나면 바로 반영돼요.</p>
            </div>
          </div>
          <div className="space-y-2 pt-1">
            {changes.map((item, idx) => (
              <div key={idx} className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 flex items-start gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">•</span>
                <span className="flex-1 break-keep">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {scheduleFullText && (
          <p className="text-center text-[length:calc(11px*var(--fs,1))] text-zinc-500 dark:text-zinc-400">점검 시간: {scheduleFullText}</p>
        )}

        {links.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {links.map((link, idx) => (
              <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer">
                <span>{link.title || link.url}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    />
  );
}

const kstIso = (ms: number) => { const d = new Date(ms + 9 * 3600000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+09:00`; };
/** DB 하루 한도가 다 찼을 때 자동으로 거는 점검 (관리자 점검과 같은 화면) */
export function autoDbMaintenance(startMs: number, endMs: number): Partial<SystemConfig> {
  return {
    maintenance: true,
    maintenanceStart: kstIso(startMs),
    maintenanceEnd: kstIso(endMs),
    maintenanceTitle: '서버 사용량 초과로 인한 임시 점검 안내',
    maintenanceContent: [
      '오늘 서버가 하루에 쓸 수 있는 양을 다 써서, **AI 요약·정렬·관리 기능 등 일부 기능이 제대로 동작하지 않아요.**',
      '',
      '잘못된 화면을 보여 드리지 않도록, 사용량이 초기화되는 시각까지 잠시 점검 화면을 띄웠어요.',
      '',
      '- 끝나는 시각이 되면 **따로 아무것도 하지 않아도 저절로 다시 열려요.**',
      '- 이 기기에 저장된 **시청 기록·내 재생목록·설정은 그대로** 있어요.',
      '',
      '불편을 드려 죄송해요. 다시 열린 뒤에도 문제가 있으면 [의견 보내기](/feedback)로 알려 주세요.',
    ].join('\n'),
    maintenanceChanges: ['서버 사용량 초기화 대기', '서버 호출 줄이기 (AI 작업 주기 조정)', '데이터 다시 불러오는 방식 개선'],
  } as Partial<SystemConfig>;
}
