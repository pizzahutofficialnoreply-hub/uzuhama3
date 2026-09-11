import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock } from '../utils';

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const [tab, setTab] = useState<'suggestion' | 'bug'>('suggestion');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [os, setOs] = useState('iOS 및 iPadOS');
  const [problemArea, setProblemArea] = useState('요약 탭');
  const [customProblemArea, setCustomProblemArea] = useState('');
  const [consoleLog, setConsoleLog] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const area = problemArea === '직접 입력' ? customProblemArea : problemArea;
      const finalContent = tab === 'bug' && consoleLog ? `${content}\n\n[Console Log]\n${consoleLog}` : content;

      await addDoc(collection(db, 'feedbacks'), {
        type: tab,
        title,
        content: finalContent,
        os: tab === 'bug' ? os : null,
        problemArea: tab === 'bug' ? area : null,
        uid: user?.uid || null,
        email: user?.email || null,
        createdAt: serverTimestamp()
      });

      alert('성공적으로 접수되었습니다. 감사합니다!');
      onClose();
    } catch (e: any) {
      console.error(e);
      alert('전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">피드백 남기기</h2>
        
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-4 shrink-0">
          <button 
            onClick={() => setTab('suggestion')} 
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'suggestion' ? 'bg-white dark:bg-zinc-900 shadow-sm text-purple-600 font-bold' : 'text-zinc-500'}`}
          >
            제안
          </button>
          <button 
            onClick={() => setTab('bug')} 
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'bug' ? 'bg-white dark:bg-zinc-900 shadow-sm text-purple-600 font-bold' : 'text-zinc-500'}`}
          >
            버그 제보
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">제목</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {tab === 'bug' && (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">OS 선택</label>
                <select 
                  value={os}
                  onChange={e => setOs(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option>iOS 및 iPadOS</option>
                  <option>Android</option>
                  <option>Windows</option>
                  <option>MacOS</option>
                  <option>기타</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">문제 영역</label>
                <select 
                  value={problemArea}
                  onChange={e => setProblemArea(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                >
                  <option>요약 탭</option>
                  <option>캘린더 탭</option>
                  <option>상세 분석 탭</option>
                  <option>추천 영상 탭</option>
                  <option>유저 참여(데이터 입력)</option>
                  <option>기타</option>
                  <option>직접 입력</option>
                </select>
                {problemArea === '직접 입력' && (
                  <input 
                    type="text" 
                    value={customProblemArea}
                    onChange={e => setCustomProblemArea(e.target.value)}
                    placeholder="문제 영역을 직접 입력하세요"
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center justify-between">
                  <span>콘솔 로그 (선택)</span>
                  <span className="text-[10px] text-zinc-400 font-normal">PC: F12를 눌러 Console 탭의 붉은 글씨 복사</span>
                </label>
                <textarea 
                  placeholder="발생한 에러 메시지나 로그를 붙여넣어주시면 문제 해결에 큰 도움이 됩니다."
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-xs min-h-[60px] text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono resize-y"
                  value={consoleLog}
                  onChange={e => setConsoleLog(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">설명</label>
            <textarea 
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="상세한 내용을 입력해주세요"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-sm min-h-[120px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end shrink-0">
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 전송 중...</>
            ) : '전송하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
