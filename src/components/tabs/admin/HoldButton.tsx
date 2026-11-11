import { useState } from 'react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useIsHeld } from '../../../utils/held';
import { toast } from '../../../utils/ui';

/** 신고된 영상을 확인 전까지 잠시 보류 / 풀기 (목록에서는 회색으로 남음) */
export default function HoldButton({ videoId, reason }: { videoId?: string; reason?: string }) {
  const held = useIsHeld(videoId);
  const [busy, setBusy] = useState(false);
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
  const run = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'config', 'system'), { [`heldVideos.${videoId}`]: held ? deleteField() : { at: Date.now(), reason: reason || null } });
      toast(held ? '보류를 풀었어요' : '확인 전까지 보류했어요', 'success');
    } catch (e: any) { toast(`바꾸지 못했어요: ${e?.message || e}`, 'error'); } finally { setBusy(false); }
  };
  return (
    <button type="button" disabled={busy} onClick={run}
      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${held ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-950/60 dark:text-orange-300'}`}>
      {held ? '보류 풀기' : '확인 전까지 보류'}
    </button>
  );
}
