import React, { useEffect, useState } from 'react';
import { NiceMarkdown } from './common/NiceMarkdown';
import { FeatureGrid } from './common/FeatureGrid';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MaintenancePager } from './MaintenancePager';
import { FluidBackdrop } from './common/FluidBackdrop';
import type { SystemConfig } from '../types';

/**
 * 서비스 단계 화면 (관리자 › 시스템 › 처음 시작 화면 › 서비스 단계)
 *  - 런칭 준비: 앱 아이콘 + 문 여는 시각까지 카운트다운 · 아래로 넘기면 사이트 소개 미리 보기 (시각이 지나면 저절로 열림)
 *  - 잠시 중지: 앱 아이콘 + '잠시 멈췄어요' · 아래로 넘기면 안내 글
 *  - 종료: 앱 아이콘 + '그동안 고마웠어요' · 아래로 넘기면 편지
 * 점검 화면과 같은 두 장짜리 모양
 */
/** dbcheck: DB 하루 한도가 다 차서 자동으로 거는 점검 (한도 초기화 시각까지 카운트다운) */
export type GateMode = 'prelaunch' | 'paused' | 'ended' | 'dbcheck';

export function serviceGateOf(system: Partial<SystemConfig> | null | undefined, now: number): GateMode | null {
  const m = system?.serviceMode;
  if (m === 'paused' || m === 'ended') return m;
  if (m === 'prelaunch') {
    const at = Date.parse(String(system?.launchAt || ''));
    // 여는 시각이 없거나 아직이면 막음 · 지났으면 열림
    return Number.isFinite(at) && at <= now ? null : 'prelaunch';
  }
  return null;
}

export const DEFAULT_GATE: Record<GateMode, { title: string; message: string; letter: string }> = {
  dbcheck: {
    title: '잠시 점검 중이에요',
    message: '서버를 잠시 정리하고 있어요. 아래 시각이 되면 저절로 다시 열려요.',
    letter: '지금은 방송 기록·알림 같은 정보를 새로 불러올 수 없어서 잠시 점검 화면을 띄웠어요.\n\n- 아래 시각이 지나면 따로 아무것도 하지 않아도 다시 열려요.\n- 이 기기에 저장된 시청 기록·내 재생목록·설정은 그대로 있어요.\n\n불편을 드려 죄송해요. 오류가 계속되면 다시 열린 뒤 [의견 보내기](/feedback)로 알려 주세요.',
  },
  prelaunch: {
    title: '곧 문을 열어요',
    message: '우주하마 방송 예측이 준비 중이에요. 조금만 기다려 주세요!',
    letter: '우주하마님을 좋아하는 팬이 만든 **비공식** 사이트예요. 우주하마님·치지직·유튜브와는 관련이 없어요.\n\n- 로그인 없이 모든 기능을 쓸 수 있어요.\n- 시청 기록·내 재생목록·설정은 이 기기에만 저장돼요.\n- 앱처럼 설치하면 방송 알림을 받을 수 있어요.',
  },
  paused: {
    title: '잠시 서비스를 멈췄어요',
    message: '더 나은 모습으로 돌아올게요. 조금만 기다려 주세요.',
    letter: '안녕하세요.\n\n사정이 있어 우주하마 방송 예측을 잠시 멈추게 됐어요. 다시 열게 되면 이 화면과 공지로 알려 드릴게요.\n\n기다려 주셔서 고마워요.',
  },
  ended: {
    title: '서비스를 종료합니다',
    message: '그동안 우주하마 방송 예측을 써 주셔서 정말 감사했어요.',
    letter: '안녕하세요.\n\n우주하마 방송 예측 서비스를 종료하게 됐어요. 그동안 함께해 주신 모든 분께 진심으로 감사드려요.\n\n- 기기에 저장된 시청 기록·설정은 이 기기 안에만 있고, 서버에 따로 남지 않아요.\n- 알림을 켜 두셨다면 더 이상 보내지 않아요.\n\n고마웠어요. 🦛',
  },
};

const pad = (n: number) => String(n).padStart(2, '0');
function useNow(on: boolean) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { if (!on) return; const i = window.setInterval(() => setT(Date.now()), 1000); return () => window.clearInterval(i); }, [on]);
  return t;
}


export function ServiceGateScreen({ mode, system, onOpen }: { mode: GateMode; system?: Partial<SystemConfig> | null; onOpen?: () => void }) {
  const d = DEFAULT_GATE[mode];
  const title = system?.serviceTitle?.trim() || d.title;
  const message = system?.serviceMessage?.trim() || d.message;
  const letter = system?.serviceLetter?.trim() || d.letter;
  const now = useNow(mode === 'prelaunch' || mode === 'dbcheck');
  const at = Date.parse(String(system?.launchAt || ''));
  const left = Number.isFinite(at) ? Math.max(0, Math.floor((at - now) / 1000)) : null;
  useEffect(() => { if ((mode === 'prelaunch' || mode === 'dbcheck') && left === 0) onOpen?.(); }, [mode, left, onOpen]);
  const kst = (ms: number) => { const x = new Date(ms + 9 * 3600000); const w = ['일', '월', '화', '수', '목', '금', '토'][x.getUTCDay()]; return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일 (${w}) ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`; };

  return (
    <MaintenancePager
      first={(goDetail) => (
        <div className="relative h-full flex flex-col items-center justify-center px-6 text-center">
          <FluidBackdrop />
          <div className="relative flex flex-col items-center">
            <img src="/icon-192.png" alt="우주하마 방송 예측" className={`w-24 h-24 sm:w-28 sm:h-28 rounded-[26px] shadow-lg ${mode === 'ended' ? 'grayscale-[30%]' : ''}`} />
            <h1 className="mt-6 text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight break-keep">{title}</h1>
            <p className="mt-3 max-w-sm text-sm sm:text-base text-zinc-600 dark:text-zinc-300 break-keep">{message}</p>
            {(mode === 'prelaunch' || mode === 'dbcheck') && left !== null && (
              <div className="mt-6 space-y-1.5">
                <p className="text-sm font-bold text-zinc-600 dark:text-zinc-300">{kst(at)} {mode === 'dbcheck' ? '다시 열림' : '오픈'}</p>
                <div className="flex items-end justify-center gap-2 tabular-nums" aria-label="오픈까지 남은 시간">
                  {([[Math.floor(left / 86400), '일'], [Math.floor(left / 3600) % 24, '시간'], [Math.floor(left / 60) % 60, '분'], [left % 60, '초']] as const)
                    .filter(([v, u], i) => i > 0 || v > 0 || u !== '일')
                    .map(([v, u]) => (
                      <div key={u} className="min-w-[60px] px-2 py-2 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800">
                        <FlipNumber text={pad(v)} />
                        <p className="text-[11px] font-bold text-zinc-500">{u}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={goDetail} className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-500 dark:text-zinc-400 text-sm font-bold cursor-pointer">
            {mode === 'prelaunch' ? '미리 보기' : mode === 'ended' ? '편지 읽기' : '자세히 보기'}
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>
      )}
      detail={(
        <div className="w-full max-w-2xl mx-auto px-3 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-20 space-y-5 text-left">
          <p className="text-center text-[11px] text-zinc-400">맨 위에서 아래로 끌면 처음 화면으로 돌아가요</p>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
              <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
              <div>
                <p className="text-sm font-black text-zinc-900 dark:text-white">우주하마 방송 예측</p>
                <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400">{mode === 'prelaunch' ? '사이트 소개 미리 보기' : mode === 'ended' ? '서비스 종료 안내' : mode === 'dbcheck' ? '점검 안내' : '서비스 중지 안내'}</p>
              </div>
            </div>
            {mode === 'prelaunch' && <div className="mb-4"><p className="text-[13px] font-black text-zinc-900 dark:text-white mb-2">이런 걸 할 수 있어요</p><FeatureGrid /></div>}
            <NiceMarkdown>{letter}</NiceMarkdown>
          </div>
        </div>
      )}
    />
  );
}

/** 다음에 열 때 앱 화면보다 먼저 막을 수 있게 마지막 상태를 기기에 적어 둠 */
export const GATE_CACHE_KEY = 'uzuhama_gate_v1';
export function rememberGate(system: Partial<SystemConfig> | null | undefined, maintenanceOn: boolean) {
  try {
    localStorage.setItem(GATE_CACHE_KEY, JSON.stringify({ serviceMode: system?.serviceMode || 'normal', launchAt: system?.launchAt || '', serviceTitle: system?.serviceTitle || '', serviceMessage: system?.serviceMessage || '', serviceLetter: system?.serviceLetter || '', maintenance: maintenanceOn }));
  } catch { /* */ }
}
export function cachedGate(): (Partial<SystemConfig> & { maintenance?: boolean }) | null {
  try { return JSON.parse(localStorage.getItem(GATE_CACHE_KEY) || 'null'); } catch { return null; }
}

export default React.memo(ServiceGateScreen);

/** 숫자가 바뀔 때 위로 넘어가는 시계 (넘김판처럼 위로 접히며 새 숫자가 아래에서 올라옴) */
function FlipNumber({ text }: { text: string }) {
  return (
    <div className="relative h-9 sm:h-10 overflow-hidden flex justify-center" style={{ perspective: 300 }}>
      {text.split('').map((ch, i) => (
        <span key={i} className="relative inline-block w-[0.62em] text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 tabular-nums">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={ch} className="absolute inset-0 flex items-center justify-center"
              initial={{ y: '70%', rotateX: -80, opacity: 0 }} animate={{ y: 0, rotateX: 0, opacity: 1 }} exit={{ y: '-70%', rotateX: 80, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}>{ch}</motion.span>
          </AnimatePresence>
          <span className="invisible">0</span>
        </span>
      ))}
    </div>
  );
}
