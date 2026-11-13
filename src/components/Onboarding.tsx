import { noteReads } from '../utils/readStats';
import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PRIVACY, DEFAULT_TERMS } from '../content/legal';
import { serviceGuideFrom } from '../content/serviceGuide';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Check, ChevronDown, ChevronLeft, Keyboard } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../utils';
import { KEYBOARD_OPTIONS, getPrefs, setPref, type KeyboardLayout } from '../utils/userPrefs';
import { TUTORIAL_DONE_KEY, TUTORIAL_START_EVENT } from './Tutorial';
import { OnboardingArt } from './OnboardingArt';
import { SetupItemList, useSetupItems } from './SetupGuides';
import { isStandaloneMode, openSetupGuide } from '../utils/setupStatus';

/**
 * 처음 시작 화면 (휴대폰을 처음 켰을 때 하는 초기 설정처럼)
 * 환영 → 약관 동의(펼쳐 보기) → 안내 확인 → 자판 선택 → 사이트 소개 → '시작해볼까요?' 누르면 사이트 둘러보기
 * - 단계는 관리자가 추가·삭제·수정 (Firestore config/onboarding). 문서가 없으면 아래 기본값
 * - 관리자가 버전을 올리면(약관 변경 등) 모든 사람에게 다시 보임 (system.onboardingVersion)
 */

export type OnboardingStepType = 'welcome' | 'terms' | 'notice' | 'keyboard' | 'intro' | 'setup';
export type OnboardingSection = { id: string; title: string; body: string; required: boolean };
export type OnboardingStep = { id: string; type: OnboardingStepType; title: string; body?: string; button?: string; sections?: OnboardingSection[]; /** 그림 대신 쓸 이미지 주소 (비우면 기본 그림) */ image?: string };
export type OnboardingConfig = { version: number; steps: OnboardingStep[] };

export const ONBOARDING_DONE_KEY = 'uzuhama_onboarding_version';
export const ONBOARDING_START_EVENT = 'uzuhama-start-onboarding';

export const STEP_TYPE_LABEL: Record<OnboardingStepType, string> = {
  welcome: '환영 (첫 화면)',
  terms: '약관 동의 (펼쳐 보기 + 체크)',
  notice: '안내 확인 (확인 버튼)',
  keyboard: '자판 선택',
  intro: '사이트 소개',
  setup: '준비하기 (앱 설치·알림·캘린더 안내, 마지막에 두기)',
};

const SETUP_STEP: OnboardingStep = {
  id: 'setup', type: 'setup', title: '거의 다 됐어요',
  body: '필요한 것만 골라서 해 보세요. 누르면 내 기기 화면에 맞춰 한 단계씩 알려 드려요. 나중에 설정에서도 할 수 있어요.',
  button: '시작하기',
};

export const DEFAULT_ONBOARDING: OnboardingConfig = {
  version: 1,
  steps: [
    { id: 'welcome', type: 'welcome', title: '우주하마 방송 예측', body: '오늘 방송이 켜질지, 지난 방송에선 뭘 했는지\n여기서 한눈에 볼 수 있어요.', button: '시작하기' },
    {
      id: 'terms', type: 'terms', title: '약관 확인', body: '쓰기 전에 아래 내용을 한 번 확인해 주세요. 제목을 누르면 펼쳐져요.', button: '동의하고 다음',
      sections: [
        { id: 'tos', title: '서비스 이용약관', body: '{{termsOfService}}', required: true },
        { id: 'privacy', title: '개인정보처리방침', body: '{{privacyPolicy}}', required: true },
      ],
    },
    {
      id: 'fanmade', type: 'notice', title: '팬이 만든 사이트예요',
      body: '우주하마님을 좋아하는 팬이 만든 **비공식** 사이트예요.\n\n- 우주하마님, 치지직, 유튜브와는 관련이 없어요.\n- 방송 확률은 지난 기록으로 계산한 거라 틀릴 때도 있어요.\n- 영상과 이미지의 권리는 원작자에게 있어요.',
      button: '알겠어요',
    },
    { id: 'keyboard', type: 'keyboard', title: '어떤 자판 쓰세요?', body: '검색어에 오타가 나면 쓰는 자판에 맞춰 고쳐 드릴게요. 나중에 설정에서 바꿀 수 있어요.', button: '다음' },
    {
      id: 'intro', type: 'intro', title: '이렇게 쓰면 돼요',
      body: '- **요약**: 오늘 방송 확률과 켜질 만한 시간\n- **기록**: 날짜별 방송·게임·다시보기 달력\n- **분석**: 요일·시간대·방송 길이 통계\n- **검색**: 편집본·쇼츠·재생목록 찾아보기',
      button: '시작해볼까요?',
    },
  ],
};

/** 앱 설치·알림·캘린더 안내는 둘러보기가 끝난 뒤 '더 알아볼까요?' 로 보여 줌 (관리자가 '준비하기' 단계를 넣었으면 그대로 씀) */
const withSetup = (c: OnboardingConfig): OnboardingConfig => c;

const fillPlaceholders = (text: string, system: any) =>
  String(text || '')
    .replace(/\{\{\s*termsOfService\s*\}\}/g, system?.termsOfService || DEFAULT_TERMS)
    .replace(/\{\{\s*privacyPolicy\s*\}\}/g, system?.privacyPolicy || DEFAULT_PRIVACY);

const krDate = (d?: string) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[1]}년 ${+m[2]}월 ${+m[3]}일` : (d || '');
};
/** '약관이 바뀌었어요' 화면 글: 바뀐 내용 + 적용일 + 동의 간주 안내 */
export function termsUpdateBody(u?: { summary?: string; effectiveDate?: string; noticeDate?: string }) {
  const when = u?.effectiveDate ? `**${krDate(u.effectiveDate)}**부터` : '곧';
  const lines = [
    `이용약관·개인정보처리방침이 바뀌어서 ${when} 바뀐 내용이 적용돼요.`,
    u?.summary?.trim() ? `**바뀐 내용**\n\n${u.summary.trim()}` : '',
    `적용일 전까지 따로 거부 의사를 밝히지 않으면 바뀐 약관에 동의한 것으로 봐요. 동의하지 않으면 적용일 전에 문의하기로 알려 주시거나 이용을 그만두실 수 있어요.`,
  ];
  return lines.filter(Boolean).join('\n\n');
}

function guessKeyboard(): KeyboardLayout {
  if (typeof navigator === 'undefined') return 'unknown';
  if (/iPhone|iPad|Macintosh|Windows/.test(navigator.userAgent)) return 'qwerty';
  return 'unknown';
}

import { FluidBackdrop } from './common/FluidBackdrop';

/** 약관 본문: 마크다운 전체(제목·목록·표·인용·코드·구분선·링크)를 문서처럼 */
export const TERMS_PROSE = [
  'text-[13px] leading-[1.75] text-zinc-700 dark:text-zinc-300 break-keep select-text',
  '[&>*:first-child]:mt-0',
  '[&_h1]:text-lg [&_h1]:font-black [&_h1]:text-zinc-900 dark:[&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-2',
  '[&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-zinc-200 dark:[&_h2]:border-white/10',
  '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-zinc-900 dark:[&_h3]:text-white [&_h3]:mt-4 [&_h3]:mb-1',
  '[&_h4]:font-bold [&_h4]:mt-3',
  '[&_p]:my-2 [&_strong]:font-bold [&_strong]:text-zinc-900 dark:[&_strong]:text-white [&_em]:italic',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1 [&_li]:marker:text-zinc-400',
  '[&_a]:text-purple-600 dark:[&_a]:text-purple-300 [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-purple-300 dark:[&_blockquote]:border-purple-500/50 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-500 dark:[&_blockquote]:text-zinc-400',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-zinc-100 dark:[&_code]:bg-white/10 [&_code]:text-[12px] [&_pre]:my-3 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-zinc-100 dark:[&_pre]:bg-white/10 [&_pre]:overflow-x-auto',
  '[&_hr]:my-5 [&_hr]:border-zinc-200 dark:[&_hr]:border-white/10',
  '[&_table]:block [&_table]:overflow-x-auto [&_table]:my-3 [&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-zinc-200 [&_td]:border-zinc-200 dark:[&_th]:border-white/10 dark:[&_td]:border-white/10 [&_th]:bg-zinc-50 dark:[&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5 [&_th]:text-left [&_th]:font-bold',
].join(' ');

const IOS_SPRING = { type: 'spring' as const, stiffness: 320, damping: 34 };

export function Onboarding({ enabled, version, system, tutorialEnabled, preview = false }: { enabled: boolean; version: number; system: any; tutorialEnabled: boolean; /** 관리자 미리보기: 기록을 남기지 않음 */ preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState<KeyboardLayout>(() => (getPrefs().keyboard !== 'unknown' ? getPrefs().keyboard : guessKeyboard()));
  // 이미 처음 화면을 본 사람 + 관리자가 '약관 변경 안내'로 올린 버전 → 약관이 바뀌었다는 한 장만
  const [seenVersion] = useState(() => { try { return Number(localStorage.getItem(ONBOARDING_DONE_KEY) || 0); } catch { return 0; } });
  type TU = { version: number; summary: string; noticeDate: string; effectiveDate: string };
  const [previewTU, setPreviewTU] = useState<TU | null>(null);
  const forceUpdatePreview = !!previewTU;
  const setForceUpdatePreview = (v: false | TU) => setPreviewTU(v || null);
  const termsUpdate = (previewTU || system?.termsUpdate) as TU | undefined;
  const updateMode = forceUpdatePreview || (!preview && seenVersion > 0 && seenVersion < version && termsUpdate?.version === version);

  // 처음이거나 관리자가 버전을 올렸으면 열기 (그때만 단계 문서를 읽음)
  useEffect(() => {
    if (!enabled) return;
    let done = 0;
    try { done = Number(localStorage.getItem(ONBOARDING_DONE_KEY) || 0); } catch { /* 무시 */ }
    if (done >= version) return;
    let cancelled = false;
    getDoc(doc(db, 'config', 'onboarding'))
      .then((snap) => {
        noteReads('config/onboarding', 1);
        const d = snap.exists() ? (snap.data() as OnboardingConfig) : null;
        if (!cancelled) setConfig(withSetup(d?.steps?.length ? d : DEFAULT_ONBOARDING));
      })
      .catch(() => !cancelled && setConfig(DEFAULT_ONBOARDING))
      .finally(() => !cancelled && setOpen(true));
    return () => { cancelled = true; };
  }, [enabled, version]);

  // 관리자 미리보기
  useEffect(() => {
    const start = (e: Event) => {
      const detail = (e as CustomEvent).detail as (OnboardingConfig & { termsUpdatePreview?: TU }) | undefined;
      setForceUpdatePreview(detail?.termsUpdatePreview || false);
      const preview = detail;
      setConfig(withSetup(preview?.steps?.length ? preview : DEFAULT_ONBOARDING));
      setIndex(0);
      setAgreed({});
      finishedRef.current = false;
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_START_EVENT, start);
    return () => window.removeEventListener(ONBOARDING_START_EVENT, start);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // 아이폰은 홈 화면 앱이 사파리와 저장 공간을 따로 써서 처음 시작 화면이 다시 뜸
  // → 앱으로 열었을 땐 약관 동의와 '준비하기'(알림 켜기)만 짧게
  const standalone = useMemo(() => isStandaloneMode(), []);
  const steps = useMemo(() => {
    const all = config?.steps || [];
    if (updateMode) {
      const terms = all.find((s) => s.type === 'terms') || DEFAULT_ONBOARDING.steps.find((s) => s.type === 'terms')!;
      return [{ ...terms, id: 'terms-update', title: '약관이 바뀌었어요', body: termsUpdateBody(termsUpdate), button: '동의해요' }];
    }
    if (!standalone || preview) return all;
    const base = all.some((s) => s.type === 'setup') ? all : [...all, SETUP_STEP];
    const short = base.filter((s) => s.type === 'terms' || s.type === 'setup')
      .map((s) => (s.type === 'setup' ? { ...s, title: '앱으로 열었어요', body: '이제 방송 알림을 켤 수 있어요. 아래에서 눌러 켜 주세요.' } : s));
    return short.length ? short : all;
  }, [config, standalone, preview, updateMode, termsUpdate]);
  const setupItems = useSetupItems();
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const requiredOk = useMemo(() => {
    if (step?.type !== 'terms' || updateMode) return true; // 바뀐 약관은 체크 없이도 진행 (기간이 지나면 동의한 것으로 봄)
    return (step.sections || []).every((s) => !s.required || agreed[s.id]);
  }, [step, agreed]);

  const finishedRef = React.useRef(false);
  const finish = (startTour: boolean, how: 'agree' | 'skip' = 'agree') => {
    if (preview || forceUpdatePreview) { setOpen(false); setForceUpdatePreview(false); return; }
    if (updateMode) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      try {
        localStorage.setItem(ONBOARDING_DONE_KEY, String(version));
        if (how === 'agree') localStorage.setItem('uzuhama_terms_agreed_at', new Date().toISOString());
        else localStorage.setItem('uzuhama_terms_skipped_v' + version, new Date().toISOString());
      } catch { /* 무시 */ }
      setOpen(false);
      return;
    }
    if (finishedRef.current) return; // 두 번 눌러도 한 번만
    finishedRef.current = true;
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, String(version));
      localStorage.setItem('uzuhama_terms_agreed_at', new Date().toISOString());
    } catch { /* 무시 */ }
    setOpen(false);
    if (startTour && tutorialEnabled) {
      window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 500);
    } else {
      try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { /* 무시 */ }
      // 둘러보기를 건너뛰어도 '더 알아볼까요?' 는 보여 줌 (앱으로 연 상태면 이미 알림 안내를 봤으니 생략)
      if (!standalone) window.setTimeout(() => openSetupGuide(undefined, 'after-tour'), 450);
    }
  };

  const next = () => {
    if (!step || !requiredOk) return;
    if (step.type === 'keyboard' && !preview) setPref('keyboard', keyboard);
    if (isLast) { finish(!standalone && !updateMode); return; }
    setDir(1);
    setExpanded(null);
    setIndex((i) => i + 1);
  };
  const back = () => { if (index > 0) { setDir(-1); setExpanded(null); setIndex((i) => i - 1); } };

  if (!open || !step) return null;

  const allSections = step.sections || [];
  const allChecked = allSections.length > 0 && allSections.every((s) => agreed[s.id]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[500] flex flex-col text-zinc-900 dark:text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="처음 시작하기"
    >
      <FluidBackdrop />

      {/* 위: 뒤로, 진행 점 */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] h-16 shrink-0">
        <button
          type="button"
          onClick={back}
          className={cn('w-10 h-10 rounded-full flex items-center justify-center bg-white/50 dark:bg-white/10 backdrop-blur-md cursor-pointer', index === 0 && 'invisible')}
          aria-label="이전"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5" aria-label={`${index + 1} / ${steps.length} 단계`}>
          {steps.map((s, i) => (
            <span key={s.id} className={cn('h-1.5 rounded-full transition-all duration-300', i === index ? 'w-6 bg-purple-600 dark:bg-purple-400' : 'w-1.5 bg-zinc-400/50 dark:bg-white/25')} />
          ))}
        </div>
        <span className="w-10" />
      </div>

      {/* 내용 */}
      <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={step.id + index}
            custom={dir}
            initial={{ x: `${dir * 40}%`, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: `${-dir * 40}%`, opacity: 0 }}
            transition={IOS_SPRING}
            className="absolute inset-0 overflow-y-auto px-6"
          >
            {/* 휴대폰: 그림 위·글 아래 / 넓은 화면: 그림 왼쪽·글 오른쪽 (발표 자료처럼) */}
            <div className="mx-auto w-full max-w-md md:max-w-4xl min-h-full flex flex-col md:flex-row md:items-center md:gap-12 pb-8">
              <div className={cn(
                'shrink-0 md:flex-1 md:h-[420px] flex items-center justify-center',
                step.type === 'terms' || step.type === 'keyboard' ? 'h-[22vh] min-h-[150px] pt-2' : 'h-[34vh] min-h-[210px] pt-4',
                step.type === 'keyboard' && 'max-md:hidden',
                step.type === 'setup' && 'hidden md:flex',
                (step.type === 'terms' || step.type === 'notice') && expanded && 'max-md:hidden'
              )}>
                <OnboardingArt type={step.type} image={step.image} keyboard={keyboard} />
              </div>
            <div className={cn('w-full md:flex-1', step.type === 'welcome' ? 'text-center md:text-left' : '', 'pt-4 md:pt-0')}>
              <h2 className={cn('font-black tracking-tight break-keep', step.type === 'welcome' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>{step.title}</h2>
              {step.body && (
                <div className={cn('mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-keep prose-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_p]:mt-2 [&_strong]:text-zinc-900 dark:[&_strong]:text-white', step.type === 'welcome' && 'whitespace-pre-line')}>
                  {step.type === 'welcome' ? step.body : <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{fillPlaceholders(step.body, system)}</Markdown>}
                </div>
              )}

              {/* 팬 사이트 안내: 자세히 보기 → 공지 '서비스 이용 전 안내' 내용 그대로 */}
              {step.type === 'notice' && (step.id === 'fanmade' || /팬이 만든|비공식/.test(step.title + step.body)) && (
                <div className="mt-5 rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-md border border-zinc-200/70 dark:border-white/10 overflow-hidden">
                  <button type="button" onClick={() => setExpanded(expanded === 'guide' ? null : 'guide')} className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left text-sm font-semibold cursor-pointer" aria-expanded={expanded === 'guide'}>
                    <span>자세히 보기 <span className="text-xs font-medium text-zinc-400 ml-1">서비스 이용 전 안내</span></span>
                    <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform duration-200', expanded === 'guide' && 'rotate-180')} />
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded === 'guide' && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
                        <div className="mx-3 mb-3 h-[min(50dvh,520px)] overflow-y-auto overscroll-contain rounded-xl bg-white dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-white/10 px-4 py-4 sm:px-5">
                          <div className={TERMS_PROSE}>
                            <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer" /> }}>{serviceGuideFrom(system)}</Markdown>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* 약관: 모두 동의 + 항목마다 펼쳐 보기 */}
              {step.type === 'terms' && (
                <div className="mt-6 space-y-2">
                  {updateMode && <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1">바뀐 약관 전문 (누르면 펼쳐져요)</p>}
                  {!updateMode && <button
                    type="button"
                    onClick={() => setAgreed(Object.fromEntries(allSections.map((s) => [s.id, !allChecked])))}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-white/10 backdrop-blur-md border border-zinc-200/70 dark:border-white/10 text-left font-bold cursor-pointer"
                  >
                    <CheckCircle on={allChecked} />
                    모두 동의해요
                  </button>}
                  <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-md border border-zinc-200/70 dark:border-white/10 divide-y divide-zinc-200/70 dark:divide-white/10 overflow-hidden">
                    {allSections.map((s) => (
                      <div key={s.id}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          {!updateMode && <button type="button" onClick={() => setAgreed((a) => ({ ...a, [s.id]: !a[s.id] }))} className="cursor-pointer" aria-label={`${s.title} 동의`} aria-pressed={!!agreed[s.id]}>
                            <CheckCircle on={!!agreed[s.id]} small />
                          </button>}
                          <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="flex-1 flex items-center justify-between gap-2 text-left text-sm font-semibold cursor-pointer" aria-expanded={expanded === s.id}>
                            <span>
                              {!updateMode && <span className={cn('mr-1.5 text-xs font-bold', s.required ? 'text-purple-600 dark:text-purple-300' : 'text-zinc-400')}>{s.required ? '[필수]' : '[선택]'}</span>}
                              {s.title}
                            </span>
                            <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform duration-200', expanded === s.id && 'rotate-180')} />
                          </button>
                        </div>
                        <AnimatePresence initial={false}>
                          {expanded === s.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="mx-3 mb-3 h-[min(58dvh,560px)] overflow-y-auto overscroll-contain rounded-xl bg-white dark:bg-zinc-950/70 border border-zinc-200/80 dark:border-white/10 px-4 py-4 sm:px-5">
                                <div className={TERMS_PROSE}>
                                  <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer" /> }}>{fillPlaceholders(s.body, system)}</Markdown>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 준비하기: 앱 설치 · 알림 · 캘린더 (누르면 안내 화면) */}
              {step.type === 'setup' && (
                <div className="mt-6">
                  <SetupItemList items={standalone ? [...setupItems.filter((i) => i.kind === 'notify'), ...setupItems.filter((i) => i.kind !== 'notify')] : setupItems} onOpen={(k) => openSetupGuide(k)} />
                </div>
              )}

              {/* 자판 선택 */}
              {step.type === 'keyboard' && (
                <div className="mt-6 space-y-2" role="radiogroup" aria-label="자판">
                  {KEYBOARD_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={keyboard === o.value}
                      onClick={() => setKeyboard(o.value)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 p-4 rounded-2xl text-left backdrop-blur-md border transition-colors cursor-pointer',
                        keyboard === o.value ? 'bg-purple-600/10 dark:bg-purple-400/15 border-purple-500/60' : 'bg-white/70 dark:bg-white/[0.06] border-zinc-200/70 dark:border-white/10'
                      )}
                    >
                      <span>
                        <span className="block text-sm font-bold">{o.label}</span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{o.desc}</span>
                      </span>
                      <CheckCircle on={keyboard === o.value} small />
                    </button>
                  ))}
                </div>
              )}
            </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 아래: 버튼 */}
      <div className="relative z-10 shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md space-y-2">
          <button
            type="button"
            onClick={next}
            disabled={!requiredOk}
            className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 text-white text-base font-bold shadow-lg shadow-purple-600/25 disabled:shadow-none active:scale-[0.98] transition cursor-pointer disabled:cursor-not-allowed"
          >
            {step.button || (isLast ? '시작해볼까요?' : '다음')}
          </button>
          {updateMode && (
            <button type="button" onClick={() => finish(false, 'skip')} className="w-full h-10 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer">
              건너뛰기
            </button>
          )}
          {isLast && tutorialEnabled && !standalone && !updateMode && (
            <button type="button" onClick={() => finish(false)} className="w-full h-10 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer">
              둘러보기 없이 바로 쓸게요
            </button>
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

function CheckCircle({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span className={cn(
      'shrink-0 rounded-full flex items-center justify-center transition-colors',
      small ? 'w-6 h-6' : 'w-7 h-7',
      on ? 'bg-purple-600 text-white' : 'bg-zinc-200 dark:bg-white/15 text-transparent'
    )}>
      <Check className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} strokeWidth={3} />
    </span>
  );
}
