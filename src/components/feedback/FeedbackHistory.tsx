import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Copy, Loader2, MessageCircleReply, RefreshCw, XCircle } from 'lucide-react';
import { MY_FEEDBACK_EVENT, STATUS_LABEL, answerText, markAnswersSeen, myFeedbacks, refreshAnswers, type MyFeedback } from '../../utils/myFeedback';
import { toast } from '../../utils/ui';

/** 의견 보내기 › 내 의견 내역: 이 기기에서 보낸 의견·신고와 답변 · 하나씩/전체 복사 */
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const textOf = (x: MyFeedback) => [
  `[${x.kind}] ${x.title || '(제목 없음)'}`,
  `보낸 때: ${fmt(x.at)} · 상태: ${STATUS_LABEL[x.status || 'pending'] || '확인 중'}`,
  x.text ? `내용:\n${x.text}` : '',
  answerText(x) ? `답변:\n${answerText(x)}` : '',
].filter(Boolean).join('\n');
const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => toast(`${what} 복사했어요`, 'success')).catch(() => window.prompt('복사', t));

export function FeedbackHistory({ onWriteAgain }: { onWriteAgain: () => void }) {
  const [list, setList] = useState<MyFeedback[]>(myFeedbacks);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setList(myFeedbacks());
    window.addEventListener(MY_FEEDBACK_EVENT, on);
    setBusy(true);
    refreshAnswers(true).finally(() => { setBusy(false); markAnswersSeen(); });
    return () => window.removeEventListener(MY_FEEDBACK_EVENT, on);
  }, []);
  if (!list.length) return (
    <div className="py-12 text-center text-sm text-zinc-500 break-keep">
      이 기기에서 보낸 의견이 아직 없어요.<br />
      <span className="text-[length:calc(12px*var(--fs,1))]">보낸 의견·신고와 답변이 여기에 모여요 (이 기기에만 저장).</span>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[length:calc(12px*var(--fs,1))] text-zinc-500 flex-1">이 기기에서 보낸 의견 {list.length}개</p>
        <button type="button" onClick={() => { setBusy(true); refreshAnswers(true).finally(() => setBusy(false)); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[length:calc(12px*var(--fs,1))] font-bold cursor-pointer">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 답변 확인
        </button>
        <button type="button" onClick={() => copy(list.map(textOf).join('\n\n────────\n\n'), '내역 전체를')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 text-white text-[length:calc(12px*var(--fs,1))] font-bold cursor-pointer"><Copy className="w-3.5 h-3.5" /> 전체 복사</button>
      </div>
      {list.map((x) => {
        const st = x.status || 'pending';
        const ans = answerText(x);
        return (
          <div key={x.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[length:calc(11px*var(--fs,1))] text-zinc-400 tabular-nums">{x.kind} · {fmt(x.at)}</p>
                <p className="text-[length:calc(14px*var(--fs,1))] font-bold text-zinc-900 dark:text-white break-keep">{x.title || '(제목 없음)'}</p>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:calc(11px*var(--fs,1))] font-bold ${st === 'approved' ? 'bg-emerald-500/10 text-emerald-600' : st === 'rejected' ? 'bg-zinc-500/10 text-zinc-500' : 'bg-amber-500/10 text-amber-600'}`}>
                {st === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : st === 'rejected' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{STATUS_LABEL[st] || '확인 중'}
              </span>
            </div>
            {x.text && <p className="text-[length:calc(12.5px*var(--fs,1))] text-zinc-600 dark:text-zinc-300 whitespace-pre-line break-keep line-clamp-4">{x.text}</p>}
            {ans && (
              <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 p-3">
                <p className="text-[length:calc(11px*var(--fs,1))] font-black text-purple-600 dark:text-purple-300 inline-flex items-center gap-1"><MessageCircleReply className="w-3.5 h-3.5" /> 답변</p>
                <p className="mt-1 text-[length:calc(13px*var(--fs,1))] text-zinc-800 dark:text-zinc-100 whitespace-pre-line break-keep">{ans}</p>
                {st === 'approved' && <button type="button" onClick={onWriteAgain} className="mt-2 text-[length:calc(12px*var(--fs,1))] font-bold text-purple-600 underline cursor-pointer">아직 안 되면 다시 알려 주기</button>}
              </div>
            )}
            <button type="button" onClick={() => copy(textOf(x), '이 의견을')} className="inline-flex items-center gap-1 text-[length:calc(12px*var(--fs,1))] font-bold text-zinc-500 cursor-pointer"><Copy className="w-3.5 h-3.5" /> 복사</button>
          </div>
        );
      })}
    </div>
  );
}
