import Markdown from 'react-markdown';
import React from 'react';
import { ArrowLeft, Home, FileText, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useFirebaseData } from '../hooks/useFirebaseData';

export function PolicyPage({ type }: { type: 'terms' | 'privacy' }) {
  const navigate = useNavigate();
  const { data, loading } = useFirebaseData();
  let content = type === 'terms' ? data?.system?.termsOfService : data?.system?.privacyPolicy;
  const title = type === 'terms' ? '서비스 이용약관' : '개인정보처리방침';
  const Icon = type === 'terms' ? FileText : Shield;

  if (content) {
    content = content.replace(/(?<!\*\*)이용약관(?!\*\*)/g, '**이용약관**');
    content = content.replace(/(?<!\*\*)개인정보처리방침(?!\*\*)/g, '**개인정보처리방침**');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-500">
        <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium">정책 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      {/* 상단 글로벌 헤더 (iOS Safe Area 지원) */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate('/');
              }}
              className="p-2 -ml-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title="뒤로 가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Link 
              to="/" 
              className="flex items-center gap-1.5 text-zinc-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              title="홈으로 이동"
            >
              <h1 className="text-lg sm:text-xl font-black tracking-tight font-title">
                우주하마 방송 예측
              </h1>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              <Icon className="w-3.5 h-3.5" />
              <span>{title}</span>
            </span>
            <Link
              to="/"
              className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title="홈으로"
            >
              <Home className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* 본문 콘텐츠 영역 */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 pb-16">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-[20px] p-6 sm:p-8 md:p-10 shadow-sm">
          <div className="flex items-center gap-3 pb-5 mb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white font-title">
                {title}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                우주하마 방송 예측 서비스 정책
              </p>
            </div>
          </div>

          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed prose dark:prose-invert max-w-none">
            <Markdown>{content || '등록된 내용이 없습니다.'}</Markdown>
          </div>
        </div>
      </main>
    </div>
  );
}
