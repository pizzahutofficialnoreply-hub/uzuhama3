import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { shareElementAsImage } from '../../utils/shareUtils';
import { cn } from '../../utils';
import { ShareBoxArrowIcon } from './ShareIcon';

interface WidgetShareButtonProps {
  targetId?: string;
  targetRef?: React.RefObject<HTMLElement | null>;
  title: string;
  className?: string;
  iconClassName?: string;
}

export const WidgetShareButton: React.FC<WidgetShareButtonProps> = ({
  targetId,
  targetRef,
  title,
  className,
  iconClassName,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('uzuhama_setting_enable_widget_share');
    return val === null ? true : val === 'true';
  });

  useEffect(() => {
    const handleStorage = () => {
      const val = localStorage.getItem('uzuhama_setting_enable_widget_share');
      setIsEnabled(val === null ? true : val === 'true');
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('uzuhama_settings_changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('uzuhama_settings_changed', handleStorage);
    };
  }, []);

  if (!isEnabled) return null;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSharing) return;

    const target = targetRef?.current || (targetId ? document.getElementById(targetId) : null);
    if (!target) {
      console.warn('Share target not found', targetId);
      return;
    }

    setIsSharing(true);
    try {
      await shareElementAsImage(target, title);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <button
      type="button"
      data-no-share="true"
      onClick={handleShare}
      disabled={isSharing}
      className={cn(
        "p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-150 cursor-pointer active:scale-90 outline-none focus:outline-none focus:ring-0 select-none",
        isSharing && "opacity-60 cursor-wait",
        className
      )}
      title={`${title} 이미지 공유`}
      aria-label={`${title} 이미지 공유`}
    >
      {isSharing ? (
        <Loader2 className={cn("w-4 h-4 animate-spin text-purple-600 dark:text-purple-400", iconClassName)} />
      ) : (
        <ShareBoxArrowIcon className={cn("w-4 h-4", iconClassName)} />
      )}
    </button>
  );
};
