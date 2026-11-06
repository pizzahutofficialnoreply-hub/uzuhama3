import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { db } from '../../../../lib/firebase';

/** 관리자 > 자동화: 방문자 화면에서 난 오류 (같은 오류끼리 묶어서) */
export function ClientErrorsCard() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => getDocs(query(collection(db, 'feedbacks'), where('type', '==', 'client_error'), limit(300)))
    .then((s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    .catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const groups = useMemo(() => {
    const m = new Map<string, { msg: string; n: number; last: number; ids: string[]; sample: any; vids: Set<string> }>();
    (items || []).forEach((x) => {
      const k = String(x.content || '').slice(0, 120);
      const g = m.get(k) || { msg: k, n: 0, last: 0, ids: [], sample: x, vids: new Set<string>() };
      g.n++; g.ids.push(x.id); if (x.vid) g.vids.add(x.vid);
      const t = x.createdAt?.toMillis?.() || 0;
      if (t > g.last) { g.last = t; g.sample = x; }
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [items]);
  const remove = async (ids: string[]) => { await Promise.all(ids.map((id) => deleteDoc(doc(db, 'feedbacks', id)).catch(() => {}))); load(); };
  const recent = groups.filter((g) => Date.now() - g.last < 86400000).length;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5"><AlertTriangle className={`w-4 h-4 ${recent ? 'text-amber-500' : 'text-zinc-400'}`} /> 사이트 오류 {groups.length}종 {recent > 0 && <span className="text-[11px] text-amber-600">(최근 하루 {recent}종)</span>}</h3>
        {groups.length > 0 && <button type="button" onClick={() => window.confirm('오류 기록을 모두 지울까요?') && remove(groups.flatMap((g) => g.ids))} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">모두 지우기</button>}
      </div>
      <p className="text-[11px] text-zinc-500">방문자 화면에서 오류가 나면 자동으로 쌓여요 (같은 오류는 기기마다 하루 한 번). 확장 프로그램·네트워크 끊김은 빼요.</p>
      {items === null ? <p className="text-xs text-zinc-400">불러오는 중…</p> : groups.length === 0 ? <p className="text-xs text-emerald-600 font-bold">오류 기록이 없어요.</p> : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto">
          {groups.map((g) => (
            <li key={g.msg} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-800 dark:text-zinc-100 break-all">{g.msg}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{g.n}번 · 기기 {g.vids.size}대 · 마지막 {g.last ? new Date(g.last).toLocaleString('ko-KR') : '-'} · {g.sample.path}{g.sample.standalone ? ' · 앱' : ''}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{g.sample.ua}</p>
                  {g.sample.stack && <details><summary className="cursor-pointer text-[11px] text-zinc-500">자세히</summary><pre className="mt-1 text-[10px] whitespace-pre-wrap break-all text-zinc-500">{g.sample.stack}</pre></details>}
                </div>
                <button type="button" onClick={() => remove(g.ids)} className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer" aria-label="이 오류 지우기"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
