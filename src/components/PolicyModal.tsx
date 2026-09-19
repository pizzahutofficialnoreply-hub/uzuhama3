import { X } from 'lucide-react';
import { SystemConfig } from '../types';
import Markdown from 'react-markdown';
import { useBodyScrollLock } from '../utils';

export function PolicyModal({ 
  type, 
  system, 
  onClose 
}: { 
  type: 'terms' | 'privacy'; 
  system?: SystemConfig; 
  onClose: () => void; 
}) {
  useBodyScrollLock(true);
  let content = type === 'terms' ? system?.termsOfService : system?.privacyPolicy;
  const title = type === 'terms' ? '서비스 이용약관' : '개인정보처리방침';

  if (content) {
    content = content.replace(/(?<!\*\*)이용약관(?!\*\*)/g, '**이용약관**');
    content = content.replace(/(?<!\*\*)개인정보처리방침(?!\*\*)/g, '**개인정보처리방침**');
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[85vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 font-title">{title}</h2>
        <div className="flex-1 overflow-y-auto pr-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed prose dark:prose-invert max-w-none">
            <Markdown>{content || '등록된 내용이 없습니다.'}</Markdown>
          </div>
        </div>
        <div className="mt-4 flex justify-end shrink-0">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-sm"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
