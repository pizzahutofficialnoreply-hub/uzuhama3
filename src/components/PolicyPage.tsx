import Markdown from 'react-markdown';
import React from 'react';
import { useFirebaseData } from '../hooks/useFirebaseData';

export function PolicyPage({ type }: { type: 'terms' | 'privacy' }) {
  const { data, loading } = useFirebaseData();
  let content = type === 'terms' ? data?.system?.termsOfService : data?.system?.privacyPolicy;
  const title = type === 'terms' ? '서비스 이용약관' : '개인정보처리방침';

  if (content) {
    content = content.replace(/(?<!\*\*)이용약관(?!\*\*)/g, '**이용약관**');
    content = content.replace(/(?<!\*\*)개인정보처리방침(?!\*\*)/g, '**개인정보처리방침**');
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center text-zinc-500">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-10 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-8 pb-4 border-b border-zinc-200 dark:border-zinc-800">{title}</h1>
        <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed prose dark:prose-invert max-w-none">
          <Markdown>{content || '등록된 내용이 없습니다.'}</Markdown>
        </div>
      </div>
    </div>
  );
}
