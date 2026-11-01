import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Check, ChevronDown, ChevronLeft, Keyboard } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../utils';
import { KEYBOARD_OPTIONS, getPrefs, setPref, type KeyboardLayout } from '../utils/userPrefs';
import { TUTORIAL_DONE_KEY, TUTORIAL_START_EVENT } from './Tutorial';

/**
 * 처음 시작 화면 (휴대폰을 처음 켰을 때 하는 초기 설정처럼)
 * 환영 → 약관 동의(펼쳐 보기) → 안내 확인 → 자판 선택 → 사이트 소개 → '시작해볼까요?' 누르면 사이트 둘러보기
 * - 단계는 관리자가 추가·삭제·수정 (Firestore config/onboarding). 문서가 없으면 아래 기본값
 * - 관리자가 버전을 올리면(약관 변경 등) 모든 사람에게 다시 보임 (system.onboardingVersion)
 */

export type OnboardingStepType = 'welcome' | 'terms' | 'notice' | 'keyboard' | 'intro';
export type OnboardingSection = { id: string; title: string; body: string; required: boolean };
export type OnboardingStep = { id: string; type: OnboardingStepType; title: string; body?: string; button?: string; sections?: OnboardingSection[] };
export type OnboardingConfig = { version: number; steps: OnboardingStep[] };

export const ONBOARDING_DONE_KEY = 'uzuhama_onboarding_version';
export const ONBOARDING_START_EVENT = 'uzuhama-start-onboarding';

export const STEP_TYPE_LABEL: Record<OnboardingStepType, string> = {
  welcome: '환영 (첫 화면)',
  terms: '약관 동의 (펼쳐 보기 + 체크)',
  notice: '안내 확인 (확인 버튼)',
  keyboard: '자판 선택',
  intro: '사이트 소개 (마지막, 둘러보기 시작)',
};

export const DEFAULT_ONBOARDING: OnboardingConfig = {
  version: 1,
  steps: [
    { id: 'welcome', type: 'welcome', title: '환영해요', body: '우주하마 방송 예측에 오신 걸 환영해요.\n몇 가지만 확인하고 바로 시작할게요.', button: '시작하기' },
    {
      id: 'terms', type: 'terms', title: '약관에 동의해 주세요', body: '사이트를 쓰려면 아래 내용에 동의가 필요해요. 제목을 누르면 내용을 볼 수 있어요.', button: '동의하고 계속',
      sections: [
        { id: 'tos', title: '서비스 이용약관', body: '{{termsOfService}}', required: true },
        { id: 'privacy', title: '개인정보처리방침', body: '{{privacyPolicy}}', required: true },
      ],
    },
    {
      id: 'fanmade', type: 'notice', title: '팬이 만든 사이트예요',
      body: '이 사이트는 우주하마님을 응원하는 팬이 만든 **비공식** 사이트예요.\n\n- 우주하마님, 치지직, 유튜브와는 관계가 없어요.\n- 방송 예측은 지난 방송 기록으로 계산한 **참고용**이에요.\n- 영상과 링크의 권리는 각 원작자에게 있어요.',
      button: '확인했어요',
    },
    { id: 'keyboard', type: 'keyboard', title: '어떤 자판을 쓰세요?', body: '검색할 때 오타를 자판 배열에 맞춰 고쳐 드려요. 설정에서 언제든 바꿀 수 있어요.', button: '다음' },
    {
      id: 'intro', type: 'intro', title: '이런 사이트예요',
      body: '- **방송 켜질 확률**: 지난 기록으로 오늘 방송 가능성과 유력 시간을 알려 줘요.\n- **방송 기록**: 날짜별 방송과 게임, 다시보기를 달력으로 봐요.\n- **상세 분석**: 요일·시간대·방송 길이 통계를 봐요.\n- **추천 영상**: 편집본·쇼츠·재생목록을 검색하고 골라 봐요.',
      button: '시작해볼까요?',
    },
  ],
};

const fillPlaceholders = (text: string, system: any) =>
  String(text || '')
    .replace(/\{\{\s*termsOfService\s*\}\}/g, system?.termsOfService || '이용약관 내용이 아직 등록되지 않았어요.')
    .replace(/\{\{\s*privacyPolicy\s*\}\}/g, system?.privacyPolicy || '개인정보처리방침 내용이 아직 등록되지 않았어요.');

function guessKeyboard(): KeyboardLayout {
  if (typeof navigator === 'undefined') return 'unknown';
  if (/iPhone|iPad|Macintosh|Windows/.test(navigator.userAgent)) return 'qwerty';
  return 'unknown';
}

/** 은은하게 움직이는 흐린 배경 */
function FluidBackdrop() {
  const blobs = [
    { c: 'bg-purple-500/45 dark:bg-purple-600/40', s: 'w-[70vmax] h-[70vmax]', x: ['-20%', '10%', '-10%'], y: ['-25%', '-5%', '-20%'], d: 18 },
    { c: 'bg-fuchsia-400/35 dark:bg-fuchsia-600/30', s: 'w-[60vmax] h-[60vmax]', x: ['40%', '15%', '35%'], y: ['30%', '50%', '20%'], d: 22 },
    { c: 'bg-sky-400/35 dark:bg-indigo-600/35', s: 'w-[55vmax] h-[55vmax]', x: ['-15%', '20%', '0%'], y: ['55%', '35%', '60%'], d: 26 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-white/70 dark:bg-zinc-950/75 backdrop-blur-2xl" />
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn('absolute rounded-full blur-3xl', b.c, b.s)}
          initial={{ x: b.x[0], y: b.y[0], scale: 1 }}
          animate={{ x: b.x, y: b.y, scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

const IOS_SPRING = { type: 'spring' as const, stiffness: 320, damping: 34 };

export function Onboarding({ enabled, version, system, tutorialEnabled, preview = false }: { enabled: boolean; version: number; system: any; tutorialEnabled: boolean; /** 관리자 미리보기: 기록을 남기지 않음 */ preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState<KeyboardLayout>(() => (getPrefs().keyboard !== 'unknown' ? getPrefs().keyboard : guessKeyboard()));

  // 처음이거나 관리자가 버전을 올렸으면 열기 (그때만 단계 문서를 읽음)
  useEffect(() => {
    if (!enabled) return;
    let done = 0;
    try { done = Number(localStorage.getItem(ONBOARDING_DONE_KEY) || 0); } catch { /* 무시 */ }
    if (done >= version) return;
    let cancelled = false;
    getDoc(doc(db, 'config', 'onboarding'))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as OnboardingConfig) : null;
        if (!cancelled) setConfig(d?.steps?.length ? d : DEFAULT_ONBOARDING);
      })
      .catch(() => !cancelled && setConfig(DEFAULT_ONBOARDING))
      .finally(() => !cancelled && setOpen(true));
    return () => { cancelled = true; };
  }, [enabled, version]);

  // 관리자 미리보기
  useEffect(() => {
    const start = (e: Event) => {
      const preview = (e as CustomEvent).detail as OnboardingConfig | undefined;
      setConfig(preview?.steps?.length ? preview : DEFAULT_ONBOARDING);
      setIndex(0);
      setAgreed({});
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

  const steps = config?.steps || [];
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const requiredOk = useMemo(() => {
    if (step?.type !== 'terms') return true;
    return (step.sections || []).every((s) => !s.required || agreed[s.id]);
  }, [step, agreed]);

  const finish = (startTour: boolean) => {
    if (preview) { setOpen(false); return; }
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, String(version));
      localStorage.setItem('uzuhama_terms_agreed_at', new Date().toISOString());
    } catch { /* 무시 */ }
    setOpen(false);
    if (startTour && tutorialEnabled) {
      window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_START_EVENT)), 500);
    } else {
      try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { /* 무시 */ }
    }
  };

  const next = () => {
    if (!step || !requiredOk) return;
    if (step.type === 'keyboard' && !preview) setPref('keyboard', keyboard);
    if (isLast) { finish(true); return; }
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
            <div className={cn('mx-auto w-full max-w-md pb-8', step.type === 'welcome' ? 'min-h-full flex flex-col justify-center text-center' : 'pt-6 sm:pt-12')}>
              {step.type === 'welcome' && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...IOS_SPRING, delay: 0.1 }} className="mx-auto mb-6 w-20 h-20 rounded-[28px] bg-gradient-to-br from-purple-500 to-fuchsia-500 shadow-xl shadow-purple-500/30 flex items-center justify-center text-white text-3xl font-black">
                  우
                </motion.div>
              )}
              {step.type === 'keyboard' && (
                <div className="mb-4 w-14 h-14 rounded-2xl bg-purple-600/10 dark:bg-purple-400/15 flex items-center justify-center text-purple-600 dark:text-purple-300">
                  <Keyboard className="w-7 h-7" />
                </div>
              )}
              <h2 className={cn('font-black tracking-tight break-keep', step.type === 'welcome' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>{step.title}</h2>
              {step.body && (
                <div className={cn('mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 break-keep prose-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mt-2 [&_p]:mt-2 [&_strong]:text-zinc-900 dark:[&_strong]:text-white', step.type === 'welcome' && 'whitespace-pre-line')}>
                  {step.type === 'welcome' ? step.body : <Markdown>{fillPlaceholders(step.body, system)}</Markdown>}
                </div>
              )}

              {/* 약관: 모두 동의 + 항목마다 펼쳐 보기 */}
              {step.type === 'terms' && (
                <div className="mt-6 space-y-2">
                  <button
                    type="button"
                    onClick={() => setAgreed(Object.fromEntries(allSections.map((s) => [s.id, !allChecked])))}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-white/10 backdrop-blur-md border border-zinc-200/70 dark:border-white/10 text-left font-bold cursor-pointer"
                  >
                    <CheckCircle on={allChecked} />
                    모두 동의해요
                  </button>
                  <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-md border border-zinc-200/70 dark:border-white/10 divide-y divide-zinc-200/70 dark:divide-white/10 overflow-hidden">
                    {allSections.map((s) => (
                      <div key={s.id}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <button type="button" onClick={() => setAgreed((a) => ({ ...a, [s.id]: !a[s.id] }))} className="cursor-pointer" aria-label={`${s.title} 동의`} aria-pressed={!!agreed[s.id]}>
                            <CheckCircle on={!!agreed[s.id]} small />
                          </button>
                          <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="flex-1 flex items-center justify-between gap-2 text-left text-sm font-semibold cursor-pointer" aria-expanded={expanded === s.id}>
                            <span>
                              <span className={cn('mr-1.5 text-xs font-bold', s.required ? 'text-purple-600 dark:text-purple-300' : 'text-zinc-400')}>{s.required ? '[필수]' : '[선택]'}</span>
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
                              <div className="mx-4 mb-4 max-h-64 overflow-y-auto rounded-xl bg-zinc-50/90 dark:bg-black/30 p-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
                                <Markdown>{fillPlaceholders(s.body, system)}</Markdown>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
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
          {isLast && tutorialEnabled && (
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
