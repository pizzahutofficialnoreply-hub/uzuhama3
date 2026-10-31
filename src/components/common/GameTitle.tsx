import React from 'react';
import { cn } from '../../utils';

// CJK 한자(Unified Ideographs), 확장 한자, 일본어 히라가나/가타카나 등 BM한나체에 글리프가 없거나 깨지는 문자 패턴
const CJK_UNSUPPORTED_REGEX = /([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff]+)/g;

export const SteamIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Steam">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0zM7.54 18.216l-1.467-.606c.264.578.781 1.016 1.411 1.164.868.204 1.743-.332 1.95-1.2.146-.615-.121-1.229-.624-1.564l-.063.023c-.76.287-1.165 1.134-.878 1.894l-.329.289zm8.4-9.308c0-1.42 1.155-2.574 2.574-2.574 1.42 0 2.574 1.154 2.574 2.574 0 1.419-1.154 2.574-2.574 2.574-1.419 0-2.574-1.155-2.574-2.574zm-2.574 0c0 .486.136.94.373 1.328l-.001.002 4.145-2.96-.002-.002c-.417-.257-.91-.41-1.442-.41-1.42 0-2.574 1.154-2.574 2.574z"/>
  </svg>
);

export const AppStoreIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="App Store">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.88c.67-.82 1.12-1.97.99-3.13-1 .04-2.17.67-2.86 1.48-.61.71-1.14 1.88-1 3.01 1.11.09 2.22-.57 2.87-1.36z"/>
  </svg>
);

export const WebGlobeIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-label="Web">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export function getGamePlatformType(url?: string): { type: 'steam' | 'appstore' | 'web'; label: string } | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const clean = url.trim().toLowerCase();
  if (clean.includes('steampowered.com') || clean.includes('steamcommunity.com') || clean.includes('store.steam')) {
    return { type: 'steam', label: '스팀' };
  }
  if (
    clean.includes('apps.apple.com') ||
    clean.includes('itunes.apple.com') ||
    clean.includes('play.google.com') ||
    clean.includes('onestore.co.kr') ||
    clean.includes('appstore') ||
    clean.includes('app-store')
  ) {
    return { type: 'appstore', label: '앱스토어' };
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return { type: 'web', label: '웹' };
  }
  return null;
}

export const GamePlatformIcon: React.FC<{ url?: string; className?: string }> = ({ url, className = "w-3.5 h-3.5 shrink-0" }) => {
  const info = getGamePlatformType(url);
  if (!info) return null;

  if (info.type === 'steam') {
    return (
      <span title="스팀 링크" className="inline-flex items-center shrink-0">
        <SteamIcon className={cn(className, "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors")} />
      </span>
    );
  }

  if (info.type === 'appstore') {
    return (
      <span title="앱스토어 링크" className="inline-flex items-center shrink-0">
        <AppStoreIcon className={cn(className, "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors")} />
      </span>
    );
  }

  return (
    <span title="웹 링크" className="inline-flex items-center shrink-0">
      <WebGlobeIcon className={cn(className, "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors")} />
    </span>
  );
};

interface GameTitleProps {
  text: string;
  link?: string;
  className?: string;
  showIcon?: boolean;
}

export const GameTitle: React.FC<GameTitleProps> = ({ text, link, className, showIcon = true }) => {
  if (!text) return null;

  const hasUnsupported = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff]/.test(text);

  let textNode: React.ReactNode;
  if (!hasUnsupported) {
    textNode = <span className={cn("font-hanna font-pro", className)}>{text}</span>;
  } else {
    const parts = text.split(CJK_UNSUPPORTED_REGEX);
    textNode = (
      <span className={cn("font-hanna font-pro", className)}>
        {parts.map((part, index) => {
          if (!part) return null;
          const isUnsupported = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff]/.test(part);
          if (isUnsupported) {
            return (
              <span
                key={index}
                className="font-system inline-block font-normal"
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Pretendard", sans-serif',
                  letterSpacing: 'normal'
                }}
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </span>
    );
  }

  if (link && showIcon) {
    // flex 로 묶으면 제목이 줄바꿈될 때 글자 상자가 전체 폭으로 늘어나 아이콘이 오른쪽 끝으로 밀려남.
    // 글자 흐름 안에 아이콘을 넣어 항상 마지막 글자 바로 옆에 붙도록 처리 (U+2060: 아이콘만 다음 줄로 떨어지지 않게)
    return (
      <span className="inline">
        {textNode}
        {'⁠'}
        <span className="inline-block align-[-0.125em] ml-1">
          <GamePlatformIcon url={link} />
        </span>
      </span>
    );
  }

  return <>{textNode}</>;
};

export default GameTitle;
