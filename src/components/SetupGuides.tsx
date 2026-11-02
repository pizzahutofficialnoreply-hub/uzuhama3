import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Bell, BellRing, CalendarPlus, Check, ChevronDown, ChevronRight, Copy, Download, ExternalLink, Smartphone, X,
} from 'lucide-react';
import { cn } from '../utils';
import { usePushNotification } from '../hooks/usePushNotification';
import {
  AFTER_INSTALL_KEY, CALENDAR_SUBSCRIBED_KEY, DEVICE_LABEL, calendarSubscribed, deferredInstallPrompt, detectDevice, isIOSDevice,
  isStandaloneMode, notificationPermission, detectedSummary, needsIOSInstall, INSTALL_SEEN_KEY, type DeviceKey, type GuideKind, type SetupMode,
} from '../utils/setupStatus';

/**
 * 앱 설치 · 방송 알림 · 캘린더 등록 안내
 * - 기기를 고르면(처음엔 자동으로 골라 둠) 그 기기 화면을 본뜬 그림에서 어디를 누르는지 한 단계씩 보여 줌
 * - 그림의 휴대폰 비율은 지금 보고 있는 화면 비율에 맞춤
 * - 실제로 할 수 있는 건 버튼으로 바로 실행 (설치 창 띄우기, 알림 허용 요청, 캘린더 앱 열기)
 * - 다른 앱(캘린더 등)으로 넘어갔다 돌아오면 다음 단계로 이어짐
 */

// ───────────────────────── 기기 그림 ─────────────────────────

/** 지금 보고 있는 주소 (그림 속 주소창에 그대로 표시) */
const HOST = typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/.test(window.location.host) ? window.location.host : 'uzuhama.web.app';

function useScreenRatio() {
  const [r, setR] = useState(() => calcRatio());
  useEffect(() => {
    const on = () => setR(calcRatio());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return r;
}
function calcRatio() {
  if (typeof window === 'undefined') return 2.16;
  const w = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  const h = Math.max(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  const r = h / Math.max(1, w);
  // PC 에서 볼 땐 요즘 휴대폰 비율로
  if (w > 900) return 2.16;
  return Math.min(2.3, Math.max(1.6, r));
}

/** 눌러야 할 곳: 보라 테두리 + 퍼지는 원 */
function Hot({ on = true, children, className, round }: { on?: boolean; children: React.ReactNode; className?: string; round?: boolean }) {
  if (!on) return <span className={className}>{children}</span>;
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('absolute -inset-[3px] ring-2 ring-purple-500 dark:ring-purple-400 z-10 pointer-events-none', round ? 'rounded-full' : 'rounded-[6px]')} />
      <motion.span
        className={cn('absolute -inset-[3px] bg-purple-500/30 z-0 pointer-events-none', round ? 'rounded-full' : 'rounded-[6px]')}
        animate={{ scale: round ? [1, 1.5] : [1, 1.08], opacity: [0.7, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className="relative z-[1] w-full">{children}</span>
    </span>
  );
}

/** 사이트 화면을 흉내 낸 배경 */
function SitePage({ dim }: { dim?: boolean }) {
  return (
    <div className={cn('absolute inset-0 bg-[#f2f2f7] dark:bg-black transition-opacity', dim && 'opacity-60')}>
      <div className="px-[6cqw] pt-[3cqw] space-y-[3cqw]">
        <div className="flex items-center justify-between">
          <span className="text-[5cqw] font-black text-zinc-800 dark:text-zinc-100">우주하마 방송 예측</span>
          <span className="w-[6cqw] h-[6cqw] rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>
        <div className="rounded-[4cqw] bg-white dark:bg-zinc-900 p-[4cqw] text-center">
          <div className="text-[3.6cqw] text-zinc-400">현재 방송 켜질 확률</div>
          <div className="text-[13cqw] leading-none font-black text-zinc-900 dark:text-white mt-[1.5cqw]">42<span className="text-[7cqw]">%</span></div>
          <div className="mx-auto mt-[2.5cqw] h-[5cqw] w-[60%] rounded-full bg-purple-100 dark:bg-purple-500/20" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-[4cqw] bg-white dark:bg-zinc-900 p-[4cqw] space-y-[2cqw]">
            <div className="h-[3cqw] w-1/2 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-[3cqw] w-4/5 rounded-full bg-zinc-100 dark:bg-zinc-800/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Phone({ os, children }: { os: 'ios' | 'android'; children: React.ReactNode }) {
  const ratio = useScreenRatio();
  return (
    <div
      className="relative h-full max-h-[400px] max-w-full rounded-[11%/5.2%] bg-zinc-900 dark:bg-zinc-700 p-[2.4%] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.45)]"
      style={{ aspectRatio: `1 / ${ratio}` }}
      aria-hidden="true"
    >
      <div className="relative w-full h-full overflow-hidden rounded-[9.5%/4.4%] bg-[#f2f2f7] dark:bg-black" style={{ containerType: 'inline-size' }}>
        {/* 상태 표시줄 */}
        <div className="absolute top-0 inset-x-0 h-[10cqw] z-30 flex items-center justify-between px-[7cqw] text-[3.6cqw] font-bold text-zinc-800 dark:text-zinc-100 pointer-events-none">
          <span>9:41</span>
          {os === 'ios'
            ? <span className="absolute left-1/2 -translate-x-1/2 top-[2.2cqw] w-[26cqw] h-[6.5cqw] rounded-full bg-black" />
            : <span className="absolute left-1/2 -translate-x-1/2 top-[3cqw] w-[3.5cqw] h-[3.5cqw] rounded-full bg-black" />}
          <span className="flex items-center gap-[1cqw]"><span className="w-[5cqw] h-[2.6cqw] rounded-[0.8cqw] border border-current" /></span>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-[10cqw]">{children}</div>
        {os === 'ios' && <span className="absolute bottom-[1.6cqw] left-1/2 -translate-x-1/2 w-[34cqw] h-[1.2cqw] rounded-full bg-zinc-900/80 dark:bg-white/80 z-40" />}
      </div>
    </div>
  );
}

function Desktop({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[340px] aspect-[16/10] rounded-xl bg-zinc-200 dark:bg-zinc-800 p-[1.5%] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.45)]" aria-hidden="true">
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-[#f2f2f7] dark:bg-black" style={{ containerType: 'inline-size' }}>{children}</div>
    </div>
  );
}

type BarHot = 'more' | 'share' | 'menu' | 'install' | 'page' | null;

/** 브라우저 주소창·도구 막대 */
function BrowserBar({ device, hot }: { device: DeviceKey; hot: BarHot }) {
  const url = <span className="truncate text-[3.6cqw] text-zinc-600 dark:text-zinc-300">{HOST}</span>;
  const btn = 'w-[8.5cqw] h-[8.5cqw] rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center justify-center text-[4.4cqw] font-black text-zinc-700 dark:text-zinc-200';
  if (device === 'ios-safari') {
    // iOS 26: 아래쪽 떠 있는 주소창, 주소 왼쪽 아이콘이 페이지 메뉴
    return (
      <div className="absolute bottom-[6cqw] inset-x-[5cqw] z-20 flex items-center gap-[2cqw]">
        <span className={btn}>‹</span>
        <span className="flex-1 min-w-0 h-[8.5cqw] rounded-full bg-white/90 dark:bg-zinc-800/90 shadow flex items-center gap-[1.5cqw] pl-[1.5cqw] pr-[2.5cqw]">
          <Hot on={hot === 'page' || hot === 'more'} round>
            <span className="w-[6cqw] h-[6cqw] flex flex-col items-center justify-center gap-[0.7cqw]">
              {[3.4, 2.6, 3.4].map((w, i) => <span key={i} className="h-[0.5cqw] rounded-full bg-zinc-600 dark:bg-zinc-200" style={{ width: `${w}cqw` }} />)}
            </span>
          </Hot>
          <span className="flex-1 min-w-0 text-center">{url}</span>
          <span className="text-[3.6cqw] text-zinc-500">↻</span>
        </span>
        <span className={btn}><span className="w-[3.6cqw] h-[3.6cqw] rounded-[0.8cqw] border-[0.5cqw] border-current" /></span>
      </div>
    );
  }
  if (device === 'ios-safari-18') {
    // iOS 18 이하: 주소창 아래 도구 막대, 가운데가 공유
    return (
      <div className="absolute bottom-0 inset-x-0 z-20 bg-white/95 dark:bg-zinc-900/95 pt-[2cqw] pb-[5cqw]">
        <div className="mx-[4cqw] h-[8cqw] rounded-[2.5cqw] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">{url}</div>
        <div className="mt-[2cqw] flex items-center justify-around text-[4.4cqw] text-blue-500">
          <span>‹</span><span>›</span>
          <Hot on={hot === 'share'} round><span className="w-[6cqw] h-[6cqw] flex items-center justify-center">⇪</span></Hot>
          <span>▢</span><span>⧉</span>
        </div>
      </div>
    );
  }
  if (device === 'ios-chrome') {
    return (
      <>
        <div className="absolute top-0 inset-x-0 z-20 px-[3cqw] py-[2cqw] bg-white dark:bg-zinc-900">
          <div className="h-[8cqw] rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center px-[3cqw] gap-[2cqw]">
            <span className="flex-1 min-w-0">{url}</span>
            <Hot on={hot === 'share'} round><span className="w-[6cqw] h-[6cqw] flex items-center justify-center text-[4cqw]">⇪</span></Hot>
          </div>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-[12cqw] z-20 bg-white dark:bg-zinc-900 flex items-center justify-around text-[4.4cqw] text-zinc-500 pb-[2cqw]">
          <span>‹</span><span>›</span><span>＋</span><span className="w-[4.5cqw] h-[4.5cqw] rounded-[1cqw] border border-current text-[2.6cqw] flex items-center justify-center">2</span><span>⋯</span>
        </div>
      </>
    );
  }
  if (device === 'android-chrome' || device === 'android-inapp') {
    return (
      <div className="absolute top-0 inset-x-0 z-20 px-[3cqw] py-[2cqw] bg-white dark:bg-zinc-900 flex items-center gap-[2cqw]">
        <div className="flex-1 h-[8cqw] rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center px-[3cqw]">{url}</div>
        <span className="w-[4.5cqw] h-[4.5cqw] rounded-[1cqw] border border-zinc-500 text-[2.6cqw] flex items-center justify-center text-zinc-500">2</span>
        <Hot on={hot === 'menu' || hot === 'more'} round><span className="w-[6cqw] h-[7cqw] flex items-center justify-center text-[5cqw] font-black text-zinc-600 dark:text-zinc-300">⋮</span></Hot>
      </div>
    );
  }
  if (device === 'android-samsung') {
    return (
      <>
        <div className="absolute top-0 inset-x-0 z-20 px-[3cqw] py-[2cqw] bg-white dark:bg-zinc-900">
          <div className="h-[8cqw] rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center px-[3cqw]">{url}</div>
        </div>
        <div className="absolute bottom-0 inset-x-0 h-[11cqw] z-20 bg-white dark:bg-zinc-900 flex items-center justify-around text-[4.4cqw] text-zinc-500">
          <span>‹</span><span>›</span><span>⌂</span><span>☆</span><span className="w-[4.5cqw] h-[4.5cqw] rounded-[1cqw] border border-current text-[2.6cqw] flex items-center justify-center">2</span>
          <Hot on={hot === 'menu'} round><span className="w-[6cqw] h-[6cqw] flex items-center justify-center font-black">≡</span></Hot>
        </div>
      </>
    );
  }
  if (device === 'ios-inapp') {
    return (
      <div className="absolute bottom-0 inset-x-0 h-[12cqw] z-20 bg-white dark:bg-zinc-900 flex items-center justify-around text-[4.4cqw] text-zinc-500 pb-[2cqw]">
        <span>‹</span><span>›</span><span>⇪</span>
        <Hot on={hot === 'more'} round><span className="w-[6cqw] h-[6cqw] flex items-center justify-center font-black">⋯</span></Hot>
      </div>
    );
  }
  return null;
}

/** 메뉴 (점 세 개 등을 눌렀을 때) */
function Menu({ rows, hot, at }: { rows: string[]; hot: number; at: 'top-right' | 'bottom-right' | 'bottom' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.15 }}
      className={cn(
        'absolute z-30 w-[62cqw] rounded-[4cqw] bg-white dark:bg-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.25)] py-[1.5cqw]',
        at === 'top-right' && 'top-[11cqw] right-[3cqw] origin-top-right',
        at === 'bottom-right' && 'bottom-[15cqw] right-[3cqw] origin-bottom-right',
        at === 'bottom' && 'bottom-[15cqw] inset-x-[4cqw] w-auto origin-bottom',
      )}
    >
      {rows.map((r, i) => (
        <div key={r} className="px-[3cqw] py-[0.8cqw]">
          <Hot on={i === hot} className="w-full">
            <span className={cn('block px-[1.5cqw] py-[1.2cqw] text-[3.8cqw] text-zinc-700 dark:text-zinc-100', i === hot && 'font-bold')}>{r}</span>
          </Hot>
        </div>
      ))}
    </motion.div>
  );
}

/** 아래에서 올라오는 공유 시트 */
function Sheet({ title, rows, hot }: { title?: string; rows: string[]; hot: number }) {
  return (
    <>
      <motion.div className="absolute inset-0 z-20 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.1 }}
        className="absolute bottom-0 inset-x-0 z-30 rounded-t-[5cqw] bg-zinc-100 dark:bg-zinc-900 px-[4cqw] pt-[3cqw] pb-[7cqw]"
      >
        <div className="mx-auto mb-[3cqw] w-[10cqw] h-[1.2cqw] rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {title && (
          <div className="flex items-center gap-[2.5cqw] mb-[3cqw]">
            <img src="/icon-192.png" alt="" className="w-[9cqw] h-[9cqw] rounded-[2.2cqw]" />
            <div className="min-w-0">
              <div className="text-[3.8cqw] font-bold text-zinc-800 dark:text-zinc-100 truncate">{title}</div>
              <div className="text-[3cqw] text-zinc-400 truncate">{HOST}</div>
            </div>
          </div>
        )}
        <div className="rounded-[3cqw] bg-white dark:bg-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-700">
          {rows.map((r, i) => (
            <div key={r} className="px-[2cqw] py-[1cqw]">
              <Hot on={i === hot} className="w-full">
                <span className={cn('flex items-center justify-between px-[1.5cqw] py-[1.4cqw] text-[3.8cqw] text-zinc-700 dark:text-zinc-100', i === hot && 'font-bold')}>
                  {r}
                  {r.includes('홈 화면') && <span className="w-[4.5cqw] h-[4.5cqw] rounded-[1cqw] border border-current text-[3cqw] flex items-center justify-center">＋</span>}
                </span>
              </Hot>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}

/** 가운데 뜨는 확인 창 */
function Dialog({ os, title, body, buttons, hot }: { os: 'ios' | 'android' | 'desktop'; title: string; body?: string; buttons: string[]; hot: number }) {
  return (
    <>
      <motion.div className="absolute inset-0 z-20 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className={cn(
          'absolute z-30 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[72cqw] bg-white/95 dark:bg-zinc-800/95 shadow-xl',
          os === 'ios' ? 'rounded-[5cqw] text-center' : 'rounded-[4cqw] text-left',
        )}
      >
        <div className={cn('px-[5cqw] pt-[5cqw]', os === 'ios' ? 'pb-[4cqw]' : 'pb-[2cqw]')}>
          <div className="text-[4.2cqw] font-bold text-zinc-900 dark:text-white leading-snug">{title}</div>
          {body && <div className="mt-[1.5cqw] text-[3.4cqw] text-zinc-500 dark:text-zinc-300 leading-snug">{body}</div>}
        </div>
        <div className={cn(os === 'ios' ? 'flex border-t border-zinc-200 dark:border-zinc-700' : 'flex justify-end gap-[2cqw] px-[4cqw] pb-[3.5cqw]')}>
          {buttons.map((b, i) => (
            <div key={b} className={cn(os === 'ios' ? 'flex-1 p-[1.5cqw]' : '', os === 'ios' && i > 0 && 'border-l border-zinc-200 dark:border-zinc-700')}>
              <Hot on={i === hot} className="w-full">
                <span className={cn('block py-[1.5cqw] px-[2cqw] text-[3.8cqw] text-center', os === 'ios' ? 'text-blue-500' : 'text-purple-600 dark:text-purple-300', i === hot && 'font-bold')}>{b}</span>
              </Hot>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}

/** iOS 26 사파리 공유 시트 (녹화 화면 기준): 위 앱 줄 → 복사·읽기 목록·북마크·더 보기 → 펼치면 목록 */
function IOSShareSheet26({ expanded }: { expanded: boolean }) {
  const apps = ['AirDrop', '메시지', 'Mail', '메모'];
  const acts = ['복사', '읽기 목록에 추가', '북마크에 추가', expanded ? '간략히 보기' : '더 보기'];
  const list = ['북마크를 추가할 폴더…', '즐겨찾기에 추가', '빠른 메모에 추가', '페이지에서 찾기', '홈 화면에 추가', '마크업', '프린트'];
  return (
    <>
      <motion.div className="absolute inset-0 z-20 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        initial={{ y: expanded ? 0 : '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.1 }}
        className={cn('absolute inset-x-[2cqw] bottom-[2cqw] z-30 rounded-[6cqw] bg-zinc-100/95 dark:bg-zinc-800/95 backdrop-blur px-[3.5cqw] pt-[3.5cqw] pb-[4cqw]', expanded && 'top-0')}
      >
        <div className="flex items-start gap-[2.5cqw]">
          <img src="/icon-192.png" alt="" className="w-[10cqw] h-[10cqw] rounded-[2.4cqw]" />
          <div className="min-w-0 flex-1">
            <div className="text-[3.6cqw] font-bold text-zinc-800 dark:text-zinc-100 truncate">우주하마 방송 예측</div>
            <div className="text-[2.8cqw] text-zinc-400 truncate">{HOST}</div>
            <span className="inline-block mt-[1cqw] px-[2cqw] py-[0.4cqw] rounded-full bg-zinc-200 dark:bg-zinc-700 text-[2.6cqw] text-zinc-600 dark:text-zinc-300">옵션 ›</span>
          </div>
          {expanded && <span className="w-[6cqw] h-[6cqw] rounded-full bg-zinc-200 dark:bg-zinc-700 text-[3cqw] flex items-center justify-center text-zinc-500">✕</span>}
        </div>
        <div className="mt-[3cqw] grid grid-cols-4 gap-[2cqw]">
          {apps.map((a) => (
            <div key={a} className="flex flex-col items-center gap-[0.8cqw]">
              <span className="w-[11cqw] h-[11cqw] rounded-full bg-white dark:bg-zinc-700" />
              <span className="text-[2.4cqw] text-zinc-500 dark:text-zinc-300 truncate">{a}</span>
            </div>
          ))}
        </div>
        <div className="mt-[3cqw] grid grid-cols-4 gap-[2cqw]">
          {acts.map((a, i) => (
            <div key={a} className="flex flex-col items-center gap-[0.8cqw]">
              <Hot on={!expanded && i === 3} round>
                <span className="w-[11cqw] h-[11cqw] rounded-full bg-white dark:bg-zinc-700 flex items-center justify-center text-[4cqw] text-zinc-600 dark:text-zinc-200">{i === 3 ? (expanded ? '︿' : '﹀') : ''}</span>
              </Hot>
              <span className={cn('text-[2.3cqw] text-center leading-tight text-zinc-500 dark:text-zinc-300', !expanded && i === 3 && 'font-bold text-zinc-800 dark:text-white')}>{a}</span>
            </div>
          ))}
        </div>
        {expanded && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-[3cqw] rounded-[3.5cqw] bg-white dark:bg-zinc-700/70 py-[1cqw]">
            {list.map((r, i) => (
              <div key={r} className="px-[2cqw] py-[0.6cqw]">
                <Hot on={i === 4} className="w-full">
                  <span className={cn('block px-[1.5cqw] py-[1cqw] text-[3.3cqw] text-zinc-700 dark:text-zinc-100', i === 4 && 'font-bold')}>{r}</span>
                </Hot>
              </div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </>
  );
}

/** 아이폰 '홈 화면에 추가' 화면 (modern: iOS 26 모양 X · 추가 버튼 · 웹 앱으로 열기) */
function IOSAddScreen({ modern = true }: { modern?: boolean }) {
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="absolute inset-0 top-[2cqw] z-30 bg-zinc-100 dark:bg-zinc-900 rounded-t-[5cqw]">
      {modern ? (
        <div className="flex items-center justify-between px-[4cqw] py-[3cqw] text-[3.8cqw]">
          <span className="w-[8cqw] h-[8cqw] rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 text-[3.4cqw]">✕</span>
          <span className="font-bold text-zinc-800 dark:text-zinc-100">홈 화면에 추가</span>
          <Hot round><span className="block px-[3cqw] py-[1.4cqw] rounded-full bg-blue-500 text-white font-bold">추가</span></Hot>
        </div>
      ) : (
        <div className="flex items-center justify-between px-[4cqw] py-[3.5cqw] text-[3.8cqw]">
          <span className="text-blue-500">취소</span>
          <span className="font-bold text-zinc-800 dark:text-zinc-100">홈 화면에 추가</span>
          <Hot><span className="text-blue-500 font-bold px-[1cqw]">추가</span></Hot>
        </div>
      )}
      <div className="mx-[4cqw] rounded-[3cqw] bg-white dark:bg-zinc-800 p-[3cqw] flex items-center gap-[3cqw]">
        <img src="/icon-192.png" alt="" className="w-[12cqw] h-[12cqw] rounded-[3cqw]" />
        <div className="min-w-0 flex-1">
          <div className="text-[3.8cqw] text-zinc-800 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700 pb-[1cqw] truncate">우주하마 방송 예측</div>
          <div className="text-[3cqw] text-zinc-400 pt-[1cqw] truncate">{HOST}</div>
        </div>
      </div>
      {modern && (
        <>
          <div className="mx-[4cqw] mt-[3cqw] rounded-[3cqw] bg-white dark:bg-zinc-800 px-[3cqw] py-[2.5cqw] flex items-center justify-between">
            <span className="text-[3.6cqw] text-zinc-700 dark:text-zinc-100">웹 앱으로 열기</span>
            <span className="w-[9cqw] h-[5.4cqw] rounded-full bg-green-500 relative"><span className="absolute right-[0.5cqw] top-[0.5cqw] w-[4.4cqw] h-[4.4cqw] rounded-full bg-white" /></span>
          </div>
          <p className="mx-[5cqw] mt-[1.5cqw] text-[2.6cqw] text-zinc-400 leading-snug">이 웹사이트에 빨리 접근할 수 있도록 홈 화면에 아이콘이 추가됩니다.</p>
        </>
      )}
    </motion.div>
  );
}

/** 홈 화면 (설치 끝, 아이콘으로 열기) */
function HomeScreen({ banner }: { banner?: string }) {
  const colors = ['bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-indigo-400', 'bg-teal-400', 'bg-orange-400', 'bg-lime-400', 'bg-fuchsia-400', 'bg-cyan-400', 'bg-red-400'];
  return (
    <div className="absolute inset-0 -top-[10cqw] pt-[10cqw] bg-gradient-to-b from-indigo-300 via-purple-300 to-pink-200 dark:from-indigo-900 dark:via-purple-900 dark:to-zinc-900">
      {banner && (
        <motion.div initial={{ y: '-120%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.6 }}
          className="absolute top-[11cqw] inset-x-[3cqw] z-20 rounded-[4cqw] bg-white/90 dark:bg-zinc-800/90 backdrop-blur p-[2.5cqw] flex items-center gap-[2.5cqw] shadow-lg">
          <img src="/icon-192.png" alt="" className="w-[8cqw] h-[8cqw] rounded-[2cqw]" />
          <div className="min-w-0">
            <div className="text-[3.4cqw] font-bold text-zinc-900 dark:text-white truncate">우주하마 방송 예측</div>
            <div className="text-[3.2cqw] text-zinc-600 dark:text-zinc-300 truncate">{banner}</div>
          </div>
        </motion.div>
      )}
      <div className="grid grid-cols-4 gap-x-[4cqw] gap-y-[5cqw] px-[6cqw] pt-[16cqw]">
        {Array.from({ length: 12 }, (_, i) => (
          i === 6 ? (
            <div key={i} className="flex flex-col items-center gap-[1cqw]">
              <Hot>
                <img src="/icon-192.png" alt="" className="w-full aspect-square rounded-[22%]" />
              </Hot>
              <span className="text-[2.6cqw] text-white font-semibold truncate max-w-full drop-shadow">우주하마</span>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-center gap-[1cqw]">
              <span className={cn('w-full aspect-square rounded-[22%] opacity-80', colors[i % colors.length])} />
              <span className="h-[2cqw] w-3/4 rounded-full bg-white/50" />
            </div>
          )
        ))}
      </div>
    </div>
  );
}

/** PC 브라우저 */
function DesktopBrowser({ hot, safari }: { hot: 'install' | 'file' | null; safari?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {safari && (
        <div className="h-[5cqw] bg-zinc-100 dark:bg-zinc-900 flex items-center gap-[3cqw] px-[3cqw] text-[2.4cqw] text-zinc-600 dark:text-zinc-300">
          <span></span><span className="font-bold">Safari</span>
          <Hot on={hot === 'file'}><span className="px-[0.5cqw]">파일</span></Hot>
          <span>편집</span><span>보기</span>
        </div>
      )}
      <div className="h-[7cqw] bg-zinc-200 dark:bg-zinc-800 flex items-center gap-[1.5cqw] px-[2cqw]">
        <span className="flex gap-[0.8cqw]">{['bg-red-400', 'bg-amber-400', 'bg-green-400'].map((c) => <span key={c} className={cn('w-[1.5cqw] h-[1.5cqw] rounded-full', c)} />)}</span>
        <div className="flex-1 h-[4.5cqw] rounded-full bg-white dark:bg-zinc-700 flex items-center justify-between px-[2cqw]">
          <span className="text-[2.4cqw] text-zinc-500">{HOST}</span>
          {!safari && (
            <Hot on={hot === 'install'} round>
              <span className="w-[3.6cqw] h-[3.6cqw] flex items-center justify-center text-zinc-600 dark:text-zinc-200"><Download className="w-full h-full" /></span>
            </Hot>
          )}
        </div>
      </div>
      <div className="relative flex-1"><div className="absolute inset-0 scale-[0.55] origin-top"><SitePage /></div></div>
    </div>
  );
}

// ───────────────────────── 단계 데이터 ─────────────────────────

type Slide = { title: string; body: string; mock: React.ReactNode; note?: string };

function phoneOs(d: DeviceKey): 'ios' | 'android' { return d.startsWith('ios') ? 'ios' : 'android'; }

function installSlides(d: DeviceKey): Slide[] {
  const os = phoneOs(d);
  const P = (children: React.ReactNode) => <Phone os={os}>{children}</Phone>;
  const homeBody = os === 'ios'
    ? '이제 이 브라우저 화면은 닫아도 돼요. 홈 화면에 생긴 아이콘으로 열면 주소창 없이 앱처럼 열려요.\n아이폰은 이렇게 연 앱에서만 방송 알림이 와요. 처음 열면 알림 켜는 화면이 바로 나와요.'
    : '홈 화면이나 앱 목록에 생긴 아이콘으로 열어요. 앱으로 처음 열면 방송 알림 켜기를 이어서 안내해 드려요.';
  const done: Slide = { title: '아이콘으로 열어요', body: homeBody, mock: P(<HomeScreen />) };

  switch (d) {
    case 'ios-safari':
      return [
        { title: '주소창 왼쪽 아이콘을 눌러요', body: "아래쪽 주소창에서 주소 바로 왼쪽의 줄 모양 아이콘이에요.", mock: P(<><SitePage /><BrowserBar device={d} hot="page" /></>) },
        { title: "'공유'를 눌러요", body: '메뉴 위쪽, 번역 바로 아래에 있어요.', mock: P(<><SitePage dim /><BrowserBar device={d} hot={null} /><Menu at="bottom" rows={['영어로 번역', '공유', '북마크에 추가', '페이지에서 찾기', '페이지 확대/축소', '방해 요소 가리기']} hot={1} /></>) },
        { title: "'더 보기'를 눌러요", body: "공유 창 둘째 줄 맨 오른쪽, 아래 화살표 버튼이에요.", mock: P(<><SitePage /><IOSShareSheet26 expanded={false} /></>) },
        { title: "'홈 화면에 추가'", body: '펼쳐진 목록에서 골라요.', mock: P(<><SitePage /><IOSShareSheet26 expanded /></>) },
        { title: "오른쪽 위 '추가'", body: "'웹 앱으로 열기'가 켜져 있는지 보고 파란 '추가'를 눌러요. 이름은 바꿔도 돼요.", mock: P(<><SitePage /><IOSAddScreen /></>) },
        done,
      ];
    case 'ios-safari-18':
      return [
        { title: '아래 가운데 공유 버튼', body: '네모에 위쪽 화살표 모양이에요. 도구 막대가 안 보이면 화면을 살짝 위로 올려요.', mock: P(<><SitePage /><BrowserBar device={d} hot="share" /></>) },
        { title: "'홈 화면에 추가'", body: '목록을 조금 내리면 보여요.', mock: P(<><SitePage /><Sheet title="우주하마 방송 예측" rows={['복사', '읽기 목록에 추가', '책갈피 추가', '즐겨찾기에 추가', '홈 화면에 추가']} hot={4} /></>) },
        { title: "오른쪽 위 '추가'", body: "이름을 확인하고 '추가'를 눌러요.", note: 'iOS 16.4 미만은 설치해도 알림을 받을 수 없어요. 설정 → 일반 → 소프트웨어 업데이트로 올려 주세요.', mock: P(<><SitePage /><IOSAddScreen modern={false} /></>) },
        done,
      ];
    case 'ios-chrome':
      return [
        { title: '주소창 오른쪽 공유 버튼', body: '크롬 위쪽 주소창 끝에 있는 공유 버튼(네모에 위쪽 화살표)을 눌러요.', note: '버튼이 안 보이면 아래 ⋯ 버튼 → \'공유\'로 들어가도 돼요.', mock: P(<><div className="absolute inset-0 top-[12cqw]"><SitePage /></div><BrowserBar device={d} hot="share" /></>) },
        { title: "'홈 화면에 추가'를 눌러요", body: '목록을 조금 내리면 보여요.', mock: P(<><SitePage /><Sheet title="우주하마 방송 예측" rows={['복사', '책갈피에 추가', '읽기 목록에 추가', '홈 화면에 추가', '페이지에서 찾기']} hot={3} /></>) },
        { title: "오른쪽 위 '추가'", body: "'웹 앱으로 열기'가 보이면 켜 둔 채로 '추가'를 눌러요.", note: 'iOS 16.3 이하의 크롬에서는 이 메뉴가 없어요. 그럴 땐 사파리로 열어서 해 주세요.', mock: P(<><SitePage /><IOSAddScreen /></>) },
        done,
      ];
    case 'ios-inapp':
    case 'android-inapp':
      return [
        { title: '먼저 브라우저로 열어요', body: os === 'ios' ? '카톡·네이버 같은 앱 안에서 연 화면에서는 설치가 안 돼요. 오른쪽 아래 ⋯ 를 눌러요.' : '카톡·네이버 같은 앱 안에서 연 화면에서는 설치가 안 돼요. 오른쪽 위 ⋮ 를 눌러요.', mock: P(<><SitePage /><BrowserBar device={d} hot="more" /></>) },
        { title: os === 'ios' ? "'Safari로 열기'" : "'다른 브라우저로 열기'", body: `메뉴에 없으면 아래 '주소 복사'를 누르고 ${os === 'ios' ? '사파리' : '크롬'} 주소창에 붙여 넣어요. 연 다음 설정에서 이 안내를 다시 열어 주세요.`, mock: P(<><SitePage dim /><BrowserBar device={d} hot={null} /><Menu at={os === 'ios' ? 'bottom-right' : 'top-right'} rows={[os === 'ios' ? 'Safari로 열기' : '다른 브라우저로 열기', '링크 복사', '공유하기', '새로고침']} hot={0} /></>) },
      ];
    case 'android-chrome':
      return [
        { title: '오른쪽 위 ⋮ 버튼', body: '크롬 주소창 오른쪽 끝의 점 세 개를 눌러요.', mock: P(<><div className="absolute inset-0 top-[12cqw]"><SitePage /></div><BrowserBar device={d} hot="menu" /></>) },
        { title: "'홈 화면에 추가'", body: "크롬 버전에 따라 '앱 설치'로 보일 수도 있어요. 둘 다 같아요.", mock: P(<><div className="absolute inset-0 top-[12cqw]"><SitePage dim /></div><BrowserBar device={d} hot={null} /><Menu at="top-right" rows={['새 탭', '기록', '다운로드', '공유', '홈 화면에 추가', '데스크톱 사이트']} hot={4} /></>) },
        { title: "'설치'를 눌러요", body: "'바로가기 만들기'가 아니라 '설치'를 골라야 앱처럼 열려요.", mock: P(<><SitePage /><Dialog os="android" title="앱 설치" body={`우주하마 방송 예측 · ${HOST}`} buttons={['취소', '설치']} hot={1} /></>) },
        done,
      ];
    case 'android-samsung':
      return [
        { title: '아래 ≡ 버튼', body: '삼성 인터넷 오른쪽 아래 줄 세 개를 눌러요.', mock: P(<><div className="absolute inset-0 top-[12cqw]"><SitePage /></div><BrowserBar device={d} hot="menu" /></>) },
        { title: "'현재 페이지 추가'", body: "'페이지 추가' 또는 '+ 추가'로 보일 수도 있어요.", mock: P(<><div className="absolute inset-0 top-[12cqw]"><SitePage dim /></div><BrowserBar device={d} hot={null} /><Menu at="bottom" rows={['북마크', '현재 페이지 추가', '방문 기록', '다운로드', '설정']} hot={1} /></>) },
        { title: "'홈 화면'을 골라요", body: '이어서 나오는 창에서 \'추가\'를 눌러요.', mock: P(<><SitePage /><Sheet rows={['북마크', '빠른 실행', '홈 화면', '저장된 페이지']} hot={2} /></>) },
        done,
      ];
    case 'desktop-safari':
      return [
        { title: "메뉴 막대 '파일' → 'Dock에 추가'", body: 'macOS 소노마(14) 이상에서 돼요. 그러면 Dock 에 앱처럼 들어가요.', mock: <Desktop><DesktopBrowser safari hot="file" /></Desktop> },
        { title: 'Dock 아이콘으로 열어요', body: '다음부터 Dock 의 우주하마 아이콘을 누르면 따로 창이 열려요.', mock: <Desktop><DesktopBrowser safari hot={null} /></Desktop> },
      ];
    default:
      return [
        { title: '주소창 오른쪽 설치 버튼', body: '주소창 끝의 모니터에 화살표 모양 버튼을 눌러요.', note: "버튼이 없으면 ⋮ 메뉴 → '전송, 저장, 공유' → '페이지를 앱으로 설치'(엣지는 '앱' → '이 사이트를 앱으로 설치')로 들어가요.", mock: <Desktop><DesktopBrowser hot="install" /></Desktop> },
        { title: "'설치'를 눌러요", body: '설치하면 바탕 화면·시작 메뉴에 아이콘이 생기고 따로 창으로 열려요. 작업 표시줄에 고정해 두면 편해요.', mock: <Desktop><DesktopBrowser hot={null} /></Desktop> },
      ];
  }
}

// ───────────────────────── 공통 화면 틀 ─────────────────────────

function DevicePicker({ value, onChange, options }: { value: DeviceKey; onChange: (d: DeviceKey) => void; options: DeviceKey[] }) {
  const [open, setOpen] = useState(false);
  const here = useMemo(() => detectDevice(), []);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white dark:bg-zinc-800 shadow-sm text-xs font-bold cursor-pointer" aria-expanded={open}>
        <Smartphone className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        {value === here ? detectedSummary() : DEVICE_LABEL[value]}
        <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {value === here && <span className="block mt-1.5 ml-1 text-[11px] text-zinc-400">자동으로 확인했어요 · 다르면 눌러서 바꿔요</span>}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute z-50 left-0 mt-2 w-64 rounded-2xl bg-white dark:bg-zinc-800 shadow-xl p-1.5">
            {options.map((d) => (
              <button key={d} type="button" onClick={() => { onChange(d); setOpen(false); }} className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left cursor-pointer', d === value ? 'bg-purple-50 dark:bg-purple-500/15 font-bold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/50')}>
                <span>{DEVICE_LABEL[d]}{d === here && <span className="ml-1.5 text-[10px] font-bold text-purple-600 dark:text-purple-300">지금 기기</span>}</span>
                {d === value && <Check className="w-4 h-4 text-purple-600" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SlideView({ slides, index, setIndex }: { slides: Slide[]; index: number; setIndex: (i: number) => void }) {
  const s = slides[Math.min(index, slides.length - 1)];
  const touch = useRef<number | null>(null);
  if (!s) return null;
  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx < -50 && index < slides.length - 1) setIndex(index + 1);
        if (dx > 50 && index > 0) setIndex(index - 1);
      }}
    >
      <div className="shrink-0 h-[clamp(170px,42dvh,410px)] flex items-center justify-center py-3">
        <AnimatePresence mode="wait">
          <motion.div key={index + s.title} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="h-full w-full flex items-center justify-center">
            {s.mock}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-center gap-2 text-[11px] font-bold text-purple-600 dark:text-purple-300">
          {slides.length > 1 && <span>{index + 1} / {slides.length}</span>}
        </div>
        <h3 className="mt-1 text-xl font-black tracking-tight break-keep">{s.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 break-keep whitespace-pre-line">{s.body}</p>
        {s.note && <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/70 rounded-xl px-3 py-2 break-keep">{s.note}</p>}
      </div>
    </div>
  );
}

const primaryBtn = 'w-full h-13 min-h-[52px] rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-[15px] font-bold shadow-lg shadow-purple-600/25 active:scale-[0.98] transition cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2';
const ghostBtn = 'h-12 px-4 rounded-2xl bg-white dark:bg-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-200 shadow-sm active:scale-[0.98] transition cursor-pointer disabled:opacity-40';

function StepNav({ index, total, setIndex, last }: { index: number; total: number; setIndex: (i: number) => void; last: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={ghostBtn} disabled={index === 0} onClick={() => setIndex(index - 1)}>이전</button>
      <div className="flex-1">
        {index < total - 1
          ? <button type="button" className={primaryBtn} onClick={() => setIndex(index + 1)}>다음</button>
          : last}
      </div>
    </div>
  );
}

// ───────────────────────── 안내 1: 앱 설치 ─────────────────────────

const INSTALL_DEVICES: DeviceKey[] = ['ios-safari', 'ios-safari-18', 'ios-chrome', 'ios-inapp', 'android-chrome', 'android-samsung', 'android-inapp', 'desktop-chrome', 'desktop-safari'];

function InstallGuide({ onDone, onNotify, must }: { onDone: () => void; onNotify: () => void; /** 둘러보기 뒤 아이폰: 설치가 꼭 필요하다는 안내를 위에 */ must?: boolean }) {
  const [device, setDevice] = useState<DeviceKey>(() => (detectDevice() === 'desktop-other' ? 'desktop-chrome' : detectDevice()));
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [installMsg, setInstallMsg] = useState('');
  const slides = useMemo(() => installSlides(device), [device]);
  const standalone = isStandaloneMode();
  const bip = deferredInstallPrompt();
  useEffect(() => setIndex(0), [device]);
  useEffect(() => { try { sessionStorage.setItem(INSTALL_SEEN_KEY, '1'); } catch { /* 무시 */ } }, []);

  if (standalone) {
    return (
      <Finished
        title="이미 앱으로 열려 있어요"
        body="홈 화면 아이콘으로 연 상태예요. 방송 알림도 켜 두면 방송이 시작될 때 바로 알려 드려요."
        action={<button type="button" className={primaryBtn} onClick={onNotify}><BellRing className="w-5 h-5" /> 방송 알림 켜기</button>}
      />
    );
  }

  const quickInstall = async () => {
    const e = deferredInstallPrompt();
    if (!e) return;
    try {
      e.prompt();
      const { outcome } = await e.userChoice;
      (window as any).__uzuDeferredInstall = null;
      if (outcome === 'accepted') {
        try { localStorage.setItem(AFTER_INSTALL_KEY, '1'); } catch { /* 무시 */ }
        setInstallMsg('설치됐어요! 홈 화면(앱 목록)의 아이콘으로 열어 주세요.');
        setIndex(slides.length - 1);
      }
    } catch { setInstallMsg('설치 창을 띄우지 못했어요. 아래 순서대로 해 주세요.'); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(location.origin); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 무시 */ }
  };

  const isLast = index >= slides.length - 1;
  const inapp = device.endsWith('inapp');

  return (
    <>
      {must && (
        <div className="mb-3 rounded-2xl bg-purple-600 text-white px-4 py-2.5">
          <p className="text-[13px] font-black">아이폰은 앱 설치가 꼭 필요해요</p>
          <p className="text-[11px] leading-snug text-white/85 break-keep">홈 화면에 추가한 앱에서만 방송 알림이 와요. 1분이면 끝나요.</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <DevicePicker value={device} onChange={setDevice} options={INSTALL_DEVICES} />
      </div>
      {bip && !device.startsWith('ios') && device !== 'desktop-safari' && !inapp && (
        <div className="mt-3 rounded-2xl bg-purple-600/10 dark:bg-purple-400/15 p-3 flex items-center gap-3">
          <p className="flex-1 text-xs leading-relaxed text-purple-900 dark:text-purple-100 break-keep">이 브라우저는 바로 설치할 수 있어요. 눌러서 뜨는 창에서 '설치'만 누르면 끝이에요.</p>
          <button type="button" onClick={quickInstall} className="shrink-0 h-9 px-3 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1"><Download className="w-4 h-4" /> 바로 설치</button>
        </div>
      )}
      {installMsg && <p className="mt-2 text-xs font-bold text-purple-700 dark:text-purple-300">{installMsg}</p>}
      <SlideView slides={slides} index={index} setIndex={setIndex} />
      <div className="mt-4 space-y-2">
        {inapp && (
          <button type="button" className={cn(ghostBtn, 'w-full inline-flex items-center justify-center gap-2')} onClick={copy}>
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {copied ? '복사했어요' : '주소 복사'}
          </button>
        )}
        <StepNav
          index={index}
          total={slides.length}
          setIndex={setIndex}
          last={
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                if (!inapp) { try { localStorage.setItem(AFTER_INSTALL_KEY, '1'); } catch { /* 무시 */ } }
                onDone();
              }}
            >
              {inapp ? '알겠어요' : isLast ? '다 했어요' : '다음'}
            </button>
          }
        />
      </div>
    </>
  );
}

// ───────────────────────── 안내 2: 방송 알림 ─────────────────────────

function permissionDialog(d: DeviceKey): React.ReactNode {
  if (d.startsWith('ios')) {
    return <Phone os="ios"><SitePage /><Dialog os="ios" title={'"우주하마 방송 예측"에서 알림을 보내려고 합니다'} body="알림에는 텍스트, 사운드, 아이콘 배지가 포함될 수 있습니다." buttons={['허용 안 함', '허용']} hot={1} /></Phone>;
  }
  if (d.startsWith('android')) {
    return <Phone os="android"><SitePage /><Dialog os="android" title={`${HOST}에서 알림을 보내도록 허용하시겠습니까?`} buttons={['차단', '허용']} hot={1} /></Phone>;
  }
  return (
    <Desktop>
      <DesktopBrowser hot={null} />
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="absolute top-[8cqw] left-[4cqw] z-30 w-[46cqw] rounded-[2cqw] bg-white dark:bg-zinc-800 shadow-xl p-[2.5cqw]">
        <div className="text-[2.6cqw] font-bold text-zinc-800 dark:text-zinc-100">{HOST}에서 다음 권한을 요청합니다</div>
        <div className="mt-[1cqw] text-[2.4cqw] text-zinc-500 flex items-center gap-[1cqw]"><Bell className="w-[3cqw] h-[3cqw]" /> 알림 표시</div>
        <div className="mt-[2cqw] flex justify-end gap-[1.5cqw] text-[2.4cqw]">
          <span className="px-[2cqw] py-[0.8cqw] rounded-full border border-zinc-300 text-zinc-600">차단</span>
          <Hot><span className="px-[2cqw] py-[0.8cqw] rounded-full bg-blue-600 text-white font-bold">허용</span></Hot>
        </div>
      </motion.div>
    </Desktop>
  );
}

function deniedSlides(d: DeviceKey, standalone: boolean): Slide[] {
  if (d.startsWith('ios')) {
    return [{
      title: '설정 앱에서 다시 켜요',
      body: "아이폰 설정 → 알림 → '우주하마 방송 예측' → '알림 허용'을 켜요. 그다음 이 앱으로 돌아와 아래 버튼을 다시 눌러 주세요.",
      mock: <Phone os="ios"><div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-950 px-[4cqw] pt-[4cqw]">
        <div className="text-[6cqw] font-black text-zinc-900 dark:text-white mb-[3cqw]">알림</div>
        <div className="rounded-[3cqw] bg-white dark:bg-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-700">
          {['카카오톡', '우주하마 방송 예측', '메시지'].map((n, i) => (
            <div key={n} className="px-[3cqw] py-[2.4cqw] flex items-center gap-[2cqw]">
              {i === 1 ? <img src="/icon-192.png" alt="" className="w-[6cqw] h-[6cqw] rounded-[1.5cqw]" /> : <span className="w-[6cqw] h-[6cqw] rounded-[1.5cqw] bg-zinc-300" />}
              {i === 1 ? <Hot className="flex-1"><span className="text-[3.6cqw] font-bold text-zinc-800 dark:text-zinc-100">{n}</span></Hot> : <span className="flex-1 text-[3.6cqw] text-zinc-700 dark:text-zinc-200">{n}</span>}
              <span className="text-zinc-400 text-[3.6cqw]">›</span>
            </div>
          ))}
        </div>
      </div></Phone>,
    }];
  }
  if (d.startsWith('android')) {
    return [{
      title: '알림을 다시 허용해요',
      body: standalone
        ? "앱 아이콘을 길게 누름 → 앱 정보(ⓘ) → 알림 → '알림 허용'을 켜요. 그다음 아래 버튼을 다시 눌러 주세요."
        : "주소창 왼쪽 아이콘 → 권한(또는 사이트 설정) → 알림 → '허용'으로 바꿔요. 그다음 아래 버튼을 다시 눌러 주세요.",
      mock: <Phone os="android"><div className="absolute inset-0 top-[12cqw]"><SitePage dim /></div><BrowserBar device="android-chrome" hot={null} /><Menu at="top-right" rows={['연결이 안전함', '권한', '알림 · 차단됨', '쿠키 및 사이트 데이터']} hot={2} /></Phone>,
    }];
  }
  return [{
    title: '알림을 다시 허용해요',
    body: "주소창 왼쪽 아이콘(자물쇠나 설정 모양) → '알림'을 '허용'으로 바꾸고 새로 고침해요. 윈도우는 설정 → 시스템 → 알림에서 브라우저 알림도 켜져 있어야 해요.",
    mock: <Desktop><DesktopBrowser hot={null} /></Desktop>,
  }];
}

function NotifyGuide({ onInstall, onDone }: { onInstall: () => void; onDone: () => void }) {
  const push = usePushNotification();
  const [device, setDevice] = useState<DeviceKey>(() => detectDevice());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [perm, setPerm] = useState(() => notificationPermission());
  const standalone = isStandaloneMode();
  const ios = isIOSDevice();

  // 설정 앱 등에 다녀오면 권한 상태 다시 보기
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') { setPerm(notificationPermission()); push.checkSubscription(); } };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 아이폰 사파리(앱으로 설치 안 함): 설치부터
  if (ios && !standalone) {
    return (
      <>
        <SlideView
          index={0}
          setIndex={() => {}}
          slides={[{
            title: '아이폰은 앱으로 설치해야 알림이 와요',
            body: "애플 정책상 사파리·크롬 탭에서는 알림을 받을 수 없어요. 홈 화면에 추가한 뒤 그 아이콘으로 열면 알림을 켤 수 있어요.\n설치는 1분이면 끝나요.",
            note: 'iOS 16.4 이상에서 돼요. 설정 → 일반 → 정보에서 버전을 볼 수 있어요.',
            mock: <Phone os="ios"><HomeScreen banner="우주하마 방송 시작! 지금 들어가 보세요" /></Phone>,
          }]}
        />
        <div className="mt-4"><button type="button" className={primaryBtn} onClick={onInstall}><Smartphone className="w-5 h-5" /> 홈 화면에 추가하는 법 보기</button></div>
      </>
    );
  }

  if (perm === 'unsupported' || device.endsWith('inapp')) {
    return (
      <Finished
        title="이 화면에서는 알림을 켤 수 없어요"
        body={device.endsWith('inapp') ? '카톡·네이버 같은 앱 안의 화면은 알림을 지원하지 않아요. 크롬이나 사파리로 열어 주세요.' : '이 브라우저는 웹 알림을 지원하지 않아요. 크롬, 엣지, 삼성 인터넷, 사파리 최신 버전에서 열어 주세요.'}
        action={<button type="button" className={primaryBtn} onClick={onDone}>알겠어요</button>}
      />
    );
  }

  const enable = async () => {
    setBusy(true);
    setError('');
    const ok = await push.subscribe(undefined, { silent: true });
    const p = notificationPermission();
    setPerm(p);
    setBusy(false);
    if (!ok && p === 'granted') setError('알림 등록이 잠깐 안 됐어요. 잠시 뒤 다시 눌러 주세요.');
  };

  if (perm === 'denied') {
    return (
      <>
        <DevicePicker value={device} onChange={setDevice} options={['ios-safari', 'ios-safari-18', 'android-chrome', 'android-samsung', 'desktop-chrome', 'desktop-safari']} />
        <SlideView slides={deniedSlides(device, standalone)} index={0} setIndex={() => {}} />
        <div className="mt-4"><button type="button" className={primaryBtn} onClick={() => { setPerm(notificationPermission()); if (notificationPermission() !== 'denied') enable(); }}>다시 확인하기</button></div>
      </>
    );
  }

  if (push.isSubscribed) {
    const s = push.settings;
    const Row = ({ k, label, desc }: { k: 'notifyLive' | 'notifyAbsence' | 'notifyPeakProb'; label: string; desc: string }) => (
      <button type="button" onClick={() => push.updateSettings({ [k]: !s[k] })} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left cursor-pointer" aria-pressed={!!s[k]}>
        <span><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</span></span>
        <span className={cn('shrink-0 w-11 h-6 rounded-full relative transition-colors', s[k] ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700')}><span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', s[k] ? 'left-[22px]' : 'left-0.5')} /></span>
      </button>
    );
    return (
      <>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center text-center pt-4">
            <span className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><BellRing className="w-8 h-8" /></span>
            <h3 className="mt-3 text-xl font-black">알림이 켜졌어요</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 break-keep">받고 싶은 것만 골라 두세요. 설정에서도 바꿀 수 있어요.</p>
          </div>
          <div className="mt-5 rounded-2xl bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row k="notifyLive" label="방송 시작" desc="방송이 켜지면 바로" />
            <Row k="notifyAbsence" label="휴방 공지" desc="휴방 사유가 올라오면" />
            <Row k="notifyPeakProb" label="유력 시간 미리 알림" desc="오늘 가장 유력한 시간 전에" />
            {s.notifyPeakProb && (
              <div className="px-4 py-3 flex items-center gap-2">
                <span className="text-xs text-zinc-500 mr-auto">몇 분 전에</span>
                {[10, 30, 60].map((m) => (
                  <button key={m} type="button" onClick={() => push.updateSettings({ leadTimeMinutes: m })} className={cn('h-8 px-3 rounded-full text-xs font-bold cursor-pointer', (s.leadTimeMinutes ?? 30) === m ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800')}>{m}분</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" className={ghostBtn} onClick={() => push.triggerLocalNotification('[우주하마] 테스트 알림', '알림이 잘 와요. 방송이 켜지면 이렇게 알려 드릴게요.')}>테스트</button>
          <div className="flex-1"><button type="button" className={primaryBtn} onClick={onDone}>완료</button></div>
        </div>
      </>
    );
  }

  return (
    <>
      <DevicePicker value={device} onChange={setDevice} options={['ios-safari', 'ios-safari-18', 'android-chrome', 'android-samsung', 'desktop-chrome', 'desktop-safari']} />
      <SlideView
        index={0}
        setIndex={() => {}}
        slides={[{
          title: "아래 버튼 → 뜨는 창에서 '허용'",
          body: '방송이 켜질 때, 휴방 공지가 올라올 때, 오늘 유력한 시간 전에 알려 드려요. 로그인은 필요 없어요.',
          note: ios ? '앱(홈 화면 아이콘)으로 연 상태라 바로 켤 수 있어요.' : undefined,
          mock: permissionDialog(device),
        }]}
      />
      {error && <p className="mt-2 text-xs font-bold text-amber-600">{error}</p>}
      <div className="mt-4"><button type="button" className={primaryBtn} disabled={busy} onClick={enable}><Bell className="w-5 h-5" /> {busy ? '켜는 중…' : '알림 켜기'}</button></div>
    </>
  );
}

// ───────────────────────── 안내 3: 캘린더 ─────────────────────────

type CalKind = 'apple' | 'google' | 'samsung' | 'other';
const CAL_LABEL: Record<CalKind, string> = { apple: '아이폰·맥 기본 캘린더', google: '구글 캘린더', samsung: '삼성 캘린더', other: '그 밖의 캘린더 (아웃룩 등)' };
const CAL_NAME = '우주하마 방송 일정';

function feedUrls() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://uzuhama.web.app';
  const site = !origin || origin.includes('vercel.app') || origin.includes('localhost') ? 'https://uzuhama.web.app' : origin;
  const path = `/api/calendar.ics?siteUrl=${encodeURIComponent(site)}`;
  const https = `https://uzuhama.vercel.app${path}`;
  const webcal = `webcal://uzuhama.vercel.app${path}`;
  return { https, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}

function calendarSlides(k: CalKind): Slide[] {
  const ios = (c: React.ReactNode) => <Phone os="ios">{c}</Phone>;
  const and = (c: React.ReactNode) => <Phone os="android">{c}</Phone>;
  const googleAdd = (
    <div className="absolute inset-0 bg-white dark:bg-zinc-900">
      <div className="px-[4cqw] pt-[3cqw] flex items-center gap-[2cqw] text-[4.4cqw] font-bold text-zinc-700 dark:text-zinc-100"><span className="w-[6cqw] h-[6cqw] rounded-[1.5cqw] bg-blue-500 text-white text-[3.4cqw] flex items-center justify-center">31</span> Calendar</div>
      <Dialog os="android" title="캘린더를 추가할까요?" body={CAL_NAME} buttons={['취소', '추가']} hot={1} />
    </div>
  );
  switch (k) {
    case 'apple':
      return [
        { title: "'구독'을 눌러요", body: "아래 '캘린더 앱 열기'를 누르면 이런 창이 떠요.", mock: ios(<><SitePage /><Dialog os="ios" title={`'${CAL_NAME}'을(를) 구독하겠습니까?`} buttons={['취소', '구독']} hot={1} /></>) },
        {
          title: "오른쪽 위 '추가'",
          body: "캘린더 앱이 열리면 이름·색을 확인하고 '추가'를 눌러요. 계정을 iCloud 로 두면 아이패드·맥에서도 보여요.\n추가했으면 이 화면으로 돌아오세요.",
          mock: ios(
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="absolute inset-0 bg-zinc-100 dark:bg-zinc-900">
              <div className="flex items-center justify-between px-[4cqw] py-[3.5cqw] text-[3.8cqw]"><span className="text-red-500">취소</span><span className="font-bold text-zinc-800 dark:text-zinc-100">구독</span><Hot><span className="text-red-500 font-bold px-[1cqw]">추가</span></Hot></div>
              <div className="mx-[4cqw] rounded-[3cqw] bg-white dark:bg-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-700 text-[3.5cqw]">
                {[['이름', CAL_NAME], ['색상', '● 보라'], ['계정', 'iCloud'], ['자동 새로 고침', '켬']].map(([a, b]) => (
                  <div key={a} className="px-[3cqw] py-[2.4cqw] flex justify-between gap-[2cqw]"><span className="text-zinc-700 dark:text-zinc-200">{a}</span><span className="text-zinc-400 truncate">{b}</span></div>
                ))}
              </div>
            </motion.div>,
          ),
        },
      ];
    case 'google':
    case 'samsung':
      return [
        { title: "구글 캘린더에서 '추가'", body: "아래 버튼을 누르면 구글 캘린더가 열려요. 로그인한 다음 '추가'를 눌러요.\n추가했으면 이 화면으로 돌아오세요.", note: "휴대폰에서 '추가' 창이 안 뜨면 '주소 복사'를 누르고 PC 구글 캘린더 → 다른 캘린더 ＋ → 'URL로 추가'에 붙여 넣어도 돼요.", mock: and(googleAdd) },
        k === 'samsung'
          ? {
              title: '삼성 캘린더에 보이게 하기',
              body: "삼성 캘린더 왼쪽 위 ≡ 를 열면 구글 계정 아래 '우주하마 방송 일정'이 있어요. 체크해 두면 같이 보여요.",
              note: "목록에 없으면 휴대폰 설정 → 계정 및 백업 → 계정 관리 → 구글 계정 → 계정 동기화에서 '캘린더'를 켜요.",
              mock: and(
                <div className="absolute inset-0 bg-white dark:bg-zinc-900 px-[4cqw] pt-[3cqw]">
                  <div className="text-[4.6cqw] font-black text-zinc-800 dark:text-zinc-100 mb-[3cqw]">캘린더</div>
                  {['내 캘린더', '대한민국 공휴일', CAL_NAME, '생일'].map((n, i) => (
                    <div key={n} className="py-[2cqw] flex items-center gap-[2.5cqw]">
                      {i === 2 ? <Hot><span className="w-[5cqw] h-[5cqw] rounded-[1cqw] bg-purple-500 text-white text-[3.4cqw] flex items-center justify-center">✓</span></Hot> : <span className="w-[5cqw] h-[5cqw] rounded-[1cqw] bg-zinc-300 dark:bg-zinc-700" />}
                      <span className={cn('text-[3.8cqw] text-zinc-700 dark:text-zinc-200', i === 2 && 'font-bold')}>{n}</span>
                    </div>
                  ))}
                </div>,
              ),
            }
          : {
              title: '휴대폰 앱에서도 보이게 하기',
              body: "안드로이드 구글 캘린더 앱 → 왼쪽 위 ≡ → 설정 → '우주하마 방송 일정' → '동기화'를 켜요. (PC 에서는 바로 보여요)",
              mock: and(
                <div className="absolute inset-0 bg-white dark:bg-zinc-900 px-[4cqw] pt-[3cqw]">
                  <div className="text-[4.6cqw] font-black text-zinc-800 dark:text-zinc-100 mb-[3cqw]">{CAL_NAME}</div>
                  {['동기화', '알림 받기'].map((n, i) => (
                    <div key={n} className="py-[2.6cqw] flex items-center justify-between">
                      <span className="text-[3.8cqw] text-zinc-700 dark:text-zinc-200">{n}</span>
                      {i === 0 ? <Hot round><span className="block w-[9cqw] h-[5cqw] rounded-full bg-purple-500 relative"><span className="absolute right-[0.5cqw] top-[0.5cqw] w-[4cqw] h-[4cqw] rounded-full bg-white" /></span></Hot> : <span className="w-[9cqw] h-[5cqw] rounded-full bg-zinc-300 dark:bg-zinc-700" />}
                    </div>
                  ))}
                </div>,
              ),
            },
      ];
    default:
      return [{
        title: '주소를 복사해 구독해요',
        body: "'주소 복사'를 누르고, 쓰는 캘린더에서 'URL로 구독'(아웃룩: 캘린더 추가 → 웹에서 구독)에 붙여 넣어요.",
        mock: <Desktop><DesktopBrowser hot={null} /></Desktop>,
      }];
  }
}

function CalendarGuide({ onDone }: { onDone: () => void }) {
  const here = detectDevice();
  const [kind, setKind] = useState<CalKind>(() => (here.startsWith('ios') || here === 'desktop-safari' ? 'apple' : here === 'android-samsung' ? 'samsung' : 'google'));
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<'guide' | 'away' | 'done'>(() => (calendarSubscribed() ? 'done' : 'guide'));
  const [open, setOpen] = useState(false);
  const leftAt = useRef(0);
  const slides = useMemo(() => calendarSlides(kind), [kind]);
  const urls = useMemo(feedUrls, []);
  useEffect(() => setIndex(0), [kind]);

  // 캘린더 앱/구글 캘린더로 넘어갔다가 돌아오면 다음 단계로
  useEffect(() => {
    if (phase !== 'away') return;
    const on = () => {
      if (document.visibilityState === 'visible' && Date.now() - leftAt.current > 800) setPhase('done');
    };
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('focus', on); };
  }, [phase]);

  const mark = () => {
    try { localStorage.setItem(CALENDAR_SUBSCRIBED_KEY, 'true'); window.dispatchEvent(new Event('calendar_subscription_changed')); } catch { /* 무시 */ }
  };
  const go = () => {
    mark();
    leftAt.current = Date.now();
    if (kind === 'apple') {
      setIndex(1);
      setPhase('away');
      window.location.href = urls.webcal;
    } else {
      setPhase('away');
      window.open(urls.google, '_blank', 'noopener,noreferrer');
      if (kind !== 'google' || slides.length > 1) setIndex(Math.min(1, slides.length - 1));
    }
  };
  const copy = async () => {
    mark();
    try { await navigator.clipboard.writeText(urls.https); } catch {
      const t = document.createElement('textarea'); t.value = urls.https; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (phase === 'done') {
    return (
      <Finished
        title="캘린더에 들어갔나요?"
        body={`캘린더 목록에 '${CAL_NAME}'이 보이면 성공이에요. 새 방송이 기록될 때마다 저절로 추가돼요.\n${kind === 'apple' ? '아이폰은 보통 몇 십 분 ~ 몇 시간 간격으로 새로 받아요.' : '구글 캘린더는 새 방송이 반영되기까지 몇 시간 걸릴 수 있어요.'}`}
        action={
          <div className="flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => { setPhase('guide'); setIndex(0); }}>다시 하기</button>
            <div className="flex-1"><button type="button" className={primaryBtn} onClick={onDone}>됐어요</button></div>
          </div>
        }
      />
    );
  }

  const actionLabel = kind === 'apple' ? '캘린더 앱 열기' : kind === 'other' ? null : '구글 캘린더 열기';
  return (
    <>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white dark:bg-zinc-800 shadow-sm text-xs font-bold cursor-pointer" aria-expanded={open}>
          <CalendarPlus className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> {CAL_LABEL[kind]} <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute z-50 left-0 mt-2 w-64 rounded-2xl bg-white dark:bg-zinc-800 shadow-xl p-1.5">
              {(Object.keys(CAL_LABEL) as CalKind[]).map((c) => (
                <button key={c} type="button" onClick={() => { setKind(c); setOpen(false); }} className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left cursor-pointer', c === kind ? 'bg-purple-50 dark:bg-purple-500/15 font-bold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/50')}>
                  {CAL_LABEL[c]} {c === kind && <Check className="w-4 h-4 text-purple-600" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <SlideView slides={slides} index={index} setIndex={setIndex} />
      {phase === 'away' && (
        <p className="mt-2 text-xs font-bold text-purple-700 dark:text-purple-300">끝나면 이 화면으로 돌아오세요. 이어서 확인해 드려요.</p>
      )}
      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          {slides.length > 1 && <button type="button" className={ghostBtn} onClick={() => setIndex(index === 0 ? 1 : 0)}>{index === 0 ? '다음 단계' : '이전 단계'}</button>}
          <button type="button" className={cn(ghostBtn, 'inline-flex items-center gap-1.5', !actionLabel && 'flex-1 justify-center')} onClick={copy}>
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />} {copied ? '복사했어요' : '주소 복사'}
          </button>
        </div>
        {actionLabel && <button type="button" className={primaryBtn} onClick={go}><ExternalLink className="w-5 h-5" /> {actionLabel}</button>}
        {(phase === 'away' || kind === 'other') && <button type="button" className="w-full h-10 text-sm font-semibold text-zinc-500 cursor-pointer" onClick={() => { mark(); setPhase('done'); }}>다 했어요</button>}
      </div>
    </>
  );
}

// ───────────────────────── 완료 화면 · 모음 화면 ─────────────────────────

function Finished({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><Check className="w-8 h-8" strokeWidth={3} /></motion.span>
        <h3 className="mt-4 text-xl font-black break-keep">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 break-keep whitespace-pre-line">{body}</p>
      </div>
      <div className="mt-4">{action}</div>
    </>
  );
}

export type SetupItem = { kind: GuideKind; title: string; desc: string; done: boolean; icon: React.ComponentType<{ className?: string }> };

/** 현재 상태가 담긴 세 가지 항목 (처음 시작 화면 마지막 단계와 설정에서 같이 씀) */
export function useSetupItems(): SetupItem[] {
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force((x) => x + 1);
    window.addEventListener('calendar_subscription_changed', on);
    document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('calendar_subscription_changed', on); document.removeEventListener('visibilitychange', on); };
  }, []);
  const ios = isIOSDevice();
  const standalone = isStandaloneMode();
  const perm = notificationPermission();
  return [
    { kind: 'install', title: '앱으로 설치하기', desc: standalone ? '앱으로 열려 있어요' : '홈 화면 아이콘으로 바로 열려요', done: standalone, icon: Download },
    { kind: 'notify', title: '방송 알림 받기', desc: perm === 'granted' ? '알림이 켜져 있어요' : ios && !standalone ? '아이폰은 앱으로 설치한 뒤 켤 수 있어요' : '방송이 켜지면 바로 알려 드려요', done: perm === 'granted', icon: BellRing },
    { kind: 'calendar', title: '캘린더에 방송 기록 넣기', desc: calendarSubscribed() ? '등록했어요' : '아이폰·구글·삼성 캘린더에 자동으로', done: calendarSubscribed(), icon: CalendarPlus },
  ];
}

export function SetupItemList({ items, onOpen }: { items: SetupItem[]; onOpen: (k: GuideKind) => void }) {
  return (
    <div className="rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-md border border-zinc-200/70 dark:border-white/10 divide-y divide-zinc-200/70 dark:divide-white/10 overflow-hidden">
      {items.map((it) => (
        <button key={it.kind} type="button" onClick={() => onOpen(it.kind)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-zinc-50/60 dark:hover:bg-white/5">
          <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', it.done ? 'bg-emerald-500/15 text-emerald-600' : 'bg-purple-600/10 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300')}>
            {it.done ? <Check className="w-5 h-5" strokeWidth={3} /> : <it.icon className="w-5 h-5" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold">{it.title}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 break-keep">{it.desc}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </button>
      ))}
    </div>
  );
}

const TITLES: Record<GuideKind, string> = { install: '앱으로 설치하기', notify: '방송 알림 받기', calendar: '캘린더에 넣기' };

/** 화면 전체를 덮는 안내 (initial 이 없으면 세 가지 모음부터) */
export default function SetupGuides({ initial, mode, onClose }: { initial?: GuideKind; mode?: SetupMode; onClose: () => void }) {
  const afterTour = mode === 'after-tour';
  // 둘러보기 뒤: 아이폰(사파리 탭)이고 아직 설치 안내를 안 봤으면 설치부터, 끝나면 '더 알아볼까요?'
  const [iosFirst] = useState(() => {
    if (!afterTour || initial || !needsIOSInstall()) return false;
    try { return sessionStorage.getItem(INSTALL_SEEN_KEY) !== '1'; } catch { return true; }
  });
  const [kind, setKind] = useState<GuideKind | null>(initial || (iosFirst ? 'install' : null));
  const fromHub = useRef(!initial);
  const items = useSetupItems();

  // 휴대폰 뒤로가기로 닫힘
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ setupGuide: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => { document.body.style.overflow = prev; window.removeEventListener('popstate', onPop); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { if (window.history.state?.setupGuide) window.history.back(); else onClose(); };
  const back = () => { if (kind && fromHub.current) setKind(null); else close(); };
  const open = (k: GuideKind) => { fromHub.current = fromHub.current || kind !== null; setKind(k); };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[600] bg-[#f2f2f7] dark:bg-black text-zinc-900 dark:text-white flex flex-col"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      role="dialog"
      aria-modal="true"
      aria-label={kind ? TITLES[kind] : '앱 설치 · 알림 · 캘린더'}
    >
      <header className="shrink-0 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-2">
          <button type="button" onClick={back} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer" aria-label={kind && fromHub.current ? '뒤로' : '닫기'}>
            {kind && fromHub.current ? <ArrowLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
          <h2 className="text-base font-black tracking-tight">{kind ? TITLES[kind] : afterTour ? '더 알아볼까요?' : '앱 설치 · 알림 · 캘린더'}</h2>
        </div>
      </header>
      <div className="flex-1 min-h-0 max-w-md w-full mx-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col">
        {kind === null && (
          <div className="pt-2">
            {afterTour && <h3 className="text-2xl font-black tracking-tight mb-2">더 알아볼까요?</h3>}
            <p className="text-sm text-zinc-600 dark:text-zinc-300 break-keep">{afterTour ? '둘러보기는 끝났어요. 더 편하게 쓰고 싶다면 필요한 것만 골라 보세요. 실제 화면을 따라 한 단계씩 알려 드려요.' : '필요한 것만 골라서 해 보세요. 실제 화면을 따라 한 단계씩 알려 드려요.'}</p>
            <p className="mt-2 mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-600/10 dark:bg-purple-400/15 rounded-full px-3 py-1.5"><Smartphone className="w-3.5 h-3.5" /> 지금 기기: {detectedSummary()}</p>
            <SetupItemList items={afterTour && needsIOSInstall() ? [...items.filter((i) => i.kind === 'install'), ...items.filter((i) => i.kind !== 'install')] : items} onOpen={open} />
            {afterTour && (
              <button type="button" onClick={close} className="mt-6 w-full h-12 rounded-2xl text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">괜찮아요, 바로 쓸게요</button>
            )}
          </div>
        )}
        {kind === 'install' && <InstallGuide must={iosFirst} onDone={back} onNotify={() => open('notify')} />}
        {kind === 'notify' && <NotifyGuide onInstall={() => open('install')} onDone={back} />}
        {kind === 'calendar' && <CalendarGuide onDone={back} />}
      </div>
    </motion.div>,
    document.body,
  );
}

/** 안드로이드 등: 설치 안내를 마치고 앱으로 처음 열었을 때 알림 켜기 이어서 권하기 */
export function AfterInstallPrompt({ onOpen }: { onOpen: (k: GuideKind) => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let flag = false;
    try { flag = localStorage.getItem(AFTER_INSTALL_KEY) === '1'; } catch { /* 무시 */ }
    if (flag && isStandaloneMode() && notificationPermission() === 'default') {
      const t = window.setTimeout(() => setShow(true), 1200);
      return () => window.clearTimeout(t);
    }
    if (flag && isStandaloneMode()) { try { localStorage.removeItem(AFTER_INSTALL_KEY); } catch { /* 무시 */ } }
  }, []);
  const dismiss = () => { setShow(false); try { localStorage.removeItem(AFTER_INSTALL_KEY); } catch { /* 무시 */ } };
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed z-[450] inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] max-w-md mx-auto rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl p-4 flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">앱으로 열었어요!</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-keep">방송 알림도 켜 둘까요?</p>
          </div>
          <button type="button" onClick={dismiss} className="h-9 px-3 rounded-xl text-xs font-bold text-zinc-500 cursor-pointer">나중에</button>
          <button type="button" onClick={() => { dismiss(); onOpen('notify'); }} className="h-9 px-3 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer">켜기</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
