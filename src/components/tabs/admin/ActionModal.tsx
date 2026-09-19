import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '../../../utils';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (status: 'approved' | 'rejected', comment: string) => void;
  title?: string;
}

export function ActionModal({ isOpen, onClose, onSubmit, title = '상태 변경' }: ActionModalProps) {
  const [status, setStatus] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">{title}</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">처리 상태</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStatus('approved')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${status === 'approved' ? 'bg-green-100 text-green-700 border-2 border-green-500' : 'bg-zinc-100 text-zinc-500 border-2 border-transparent hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                승인
              </button>
              <button
                onClick={() => setStatus('rejected')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${status === 'rejected' ? 'bg-red-100 text-red-700 border-2 border-red-500' : 'bg-zinc-100 text-zinc-500 border-2 border-transparent hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'}`}
              >
                거절
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">코멘트 / 사유</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="제안자에게 보낼 피드백 코멘트를 작성해주세요."
              className="w-full p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-24 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </div>
          
          <button
            onClick={() => { onSubmit(status, comment); onClose(); setComment(''); }}
            className="w-full py-3 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors"
          >
            처리 완료 및 알림 발송
          </button>
        </div>
      </motion.div>
    </div>
  );
}
