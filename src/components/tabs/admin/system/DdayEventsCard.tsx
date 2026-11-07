import React, { useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import type { DdayEvent } from '../../../../types';
import { daysUntil, ddayLabel } from '../../../../utils/dday';

/** 관리자 › 시스템 › 공지: 일정 (띠 공지 옆 D-day). 저장은 아래 '저장' 버튼 */
export function DdayEventsCard({ value, onChange }: { value: DdayEvent[]; onChange: (v: DdayEvent[]) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [before, setBefore] = useState(14);
  const list = [...value].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const set = (id: string, patch: Partial<DdayEvent>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const add = () => {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onChange([...value, { id: `ev-${Date.now().toString(36)}`, title: title.trim().slice(0, 20), date, daysBefore: Math.max(0, Math.min(365, Number(before) || 14)), active: true }]);
    setTitle(''); setDate('');
  };
  const input = 'px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm';
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarClock className="w-4 h-4 text-purple-500" /> 일정 · D-day</h3>
        <p className="text-xs text-zinc-500 mt-1 break-keep">정한 날짜 며칠 전부터 띠 공지 옆에 'D-12 · 10주년'처럼 작게 보여요. 당일은 D-DAY, 지나면 자동으로 사라져요. 공지가 없을 때는 D-day만 작게 한 줄로 보여요. 고친 뒤 아래 저장을 눌러 주세요.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">이름 (짧게)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 10주년" maxLength={20} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">날짜</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">며칠 전부터</span><input type="number" min={0} max={365} value={before} onChange={(e) => setBefore(Number(e.target.value))} className={`${input} w-24`} /></label>
        <button type="button" onClick={add} disabled={!title.trim() || !date} className="h-[38px] px-4 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"><Plus className="w-4 h-4" /> 추가</button>
      </div>
      {list.length === 0 ? <p className="text-xs text-zinc-400">아직 일정이 없어요.</p> : (
        <ul className="space-y-2">
          {list.map((e) => {
            const left = daysUntil(e.date);
            const shown = e.active !== false && left >= 0 && left <= Number(e.daysBefore ?? 14);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                <span className={`px-2 py-1 rounded-lg text-xs font-black tabular-nums ${shown ? 'bg-purple-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'}`}>{left < 0 ? '지남' : ddayLabel(left)}</span>
                <input value={e.title} onChange={(ev) => set(e.id, { title: ev.target.value.slice(0, 20) })} className={`${input} flex-1 min-w-[8rem] py-1.5`} />
                <input type="date" value={e.date} onChange={(ev) => set(e.id, { date: ev.target.value })} className={`${input} py-1.5`} />
                <label className="flex items-center gap-1 text-xs text-zinc-500"><input type="number" min={0} max={365} value={e.daysBefore ?? 14} onChange={(ev) => set(e.id, { daysBefore: Math.max(0, Math.min(365, Number(ev.target.value) || 0)) })} className={`${input} w-16 py-1.5`} />일 전부터</label>
                <label className="flex items-center gap-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer"><input type="checkbox" checked={e.active !== false} onChange={(ev) => set(e.id, { active: ev.target.checked })} /> 표시</label>
                <button type="button" onClick={() => onChange(value.filter((x) => x.id !== e.id))} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>
                <span className="w-full text-[10.5px] text-zinc-400">{shown ? '지금 보이는 중' : left < 0 ? '지난 일정 (안 보임)' : e.active === false ? '꺼 둠' : `${left - Number(e.daysBefore ?? 14)}일 뒤부터 보여요`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
