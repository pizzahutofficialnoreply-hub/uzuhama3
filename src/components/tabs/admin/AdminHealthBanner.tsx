import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';
import { db } from '../../../lib/firebase';

/**
 * 관리자 화면 맨 위: 손볼 게 있으면 한 줄로
 * - 알림 점검(크론)이 30분 넘게 멈춤 / 최근 하루 사이트 오류 / 사라진 영상 / 고쳐 달라는 제보
 */
export function AdminHealthBanner({ onGo }: { onGo: (mode: string) => void }) {
  const [alerts, setAlerts] = useState<{ text: string; go: string }[]>([]);
  useEffect(() => {
    (async () => {
      const out: { text: string; go: string }[] = [];
      try {
        const st = (await getDoc(doc(db, 'notification_state', 'main'))).data();
        const last = Number(st?.lastRunAt || 0);
        if (last && Date.now() - last > 30 * 60000) out.push({ text: `알림 점검이 ${Math.round((Date.now() - last) / 60000)}분째 멈춰 있어요`, go: 'system' });
      } catch { /* 무시 */ }
      try {
        const errs = await getDocs(query(collection(db, 'feedbacks'), where('type', '==', 'client_error'), limit(200)));
        const n = errs.docs.filter((d) => Date.now() - (d.data().createdAt?.toMillis?.() || 0) < 86400000).length;
        if (n) out.push({ text: `최근 하루 사이트 오류 ${n}건`, go: 'system' });
      } catch { /* 무시 */ }
      try {
        const dead = (await getDoc(doc(db, 'config', 'deadVideos'))).data();
        if (dead?.count) out.push({ text: `사라진 영상 ${dead.count}개`, go: 'link' });
      } catch { /* 무시 */ }
      try {
        const rep = await getDocs(query(collection(db, 'feedbacks'), where('route', 'in', ['link', 'game']), limit(100)));
        const n = rep.docs.filter((d) => !d.data().resolved).length;
        if (n) out.push({ text: `고쳐 달라는 제보 ${n}건`, go: 'link' });
      } catch { /* 무시 */ }
      setAlerts(out);
    })();
  }, []);
  if (!alerts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      {alerts.map((a) => (
        <button key={a.text} type="button" onClick={() => onGo(a.go)} className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/50 font-bold text-amber-800 dark:text-amber-200 cursor-pointer">{a.text}</button>
      ))}
    </div>
  );
}
