import React, { useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import type { DdayEvent } from '../../../../types';
import { daysUntil, ddayLabel, nextDate, BOOST_DEFAULT } from '../../../../utils/dday';
import { EventArt, artFor, ART_KINDS, bannerText } from '../../../common/EventArt';
import { mutate } from './SearchTuningCard';

/** 관리자 › 시스템 › 공지: 일정 (헤더 제목 옆 D-day). 저장은 아래 '저장' 버튼 */
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
  const [upErr, setUpErr] = useState('');
  // 그림 올리기: 그림 저장소에 올리고 주소만 일정에 (공식 이모티콘처럼 쓸 수 있는 그림)
  const upload = async (id: string, f: File | undefined) => {
    setUpErr('');
    if (!f) return;
    if (!/^image\/(png|gif|webp|jpeg)$/.test(f.type)) { setUpErr('png·gif·webp·jpg 그림만 올릴 수 있어요'); return; }
    if (f.size > 900_000) { setUpErr('그림이 너무 커요 (최대 약 900KB)'); return; }
    try {
      const data: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('그림을 읽지 못했어요')); r.readAsDataURL(f); });
      const j = await mutate('uploadImage', { data });
      set(id, { image: j.url });
    } catch (e: any) { setUpErr(String(e?.message || e)); }
  };
  const input = 'px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm';
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarClock className="w-4 h-4 text-purple-500" /> 일정 · D-day</h3>
        <p className="text-xs text-zinc-500 mt-1 break-keep">정한 날짜 며칠 전부터 맨 위 '우주하마 방송 예측' 옆에 회색 캡슐로 'D-12 10주년'처럼 보여요. 당일은 D-DAY, 지나면 자동으로 사라져요. 당일에는 제목 앞에 하마 그림이 나와요 (주년: 플래카드 + 제목 둘레 불꽃, 생일: 고깔모자 + 색종이, 시험: 필승 머리띠 · 시험은 전날부터). 이름에 '주년'·'생일'·'수능' 등이 있으면 자동으로 골라요. 생일처럼 매년 하는 일정은 '매년'을 켜 주세요. 고친 뒤 아래 저장을 눌러 주세요.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <label className="space-y-1"><span className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500">이름 (짧게)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 10주년" maxLength={20} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500">날짜</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[length:calc(11px*var(--fs,1))] font-bold text-zinc-500">며칠 전부터</span><input type="number" min={0} max={365} value={before} onChange={(e) => setBefore(Number(e.target.value))} className={`${input} w-24`} /></label>
        <button type="button" onClick={add} disabled={!title.trim() || !date} className="h-[38px] px-4 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"><Plus className="w-4 h-4" /> 추가</button>
      </div>
      {upErr && <p className="text-xs text-red-500">{upErr}</p>}
      {list.length === 0 ? <p className="text-xs text-zinc-400">아직 일정이 없어요.</p> : (
        <ul className="space-y-2">
          {list.map((e) => {
            const left = daysUntil(nextDate(e));
            const shown = e.active !== false && left >= 0 && left <= Number(e.daysBefore ?? 14);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                <span className={`px-2 py-1 rounded-lg text-xs font-black tabular-nums ${shown ? 'bg-purple-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'}`}>{left < 0 ? '지남' : ddayLabel(left)}</span>
                <input value={e.title} onChange={(ev) => set(e.id, { title: ev.target.value.slice(0, 20) })} className={`${input} flex-1 min-w-[8rem] py-1.5`} />
                <input type="date" value={e.date} onChange={(ev) => set(e.id, { date: ev.target.value })} className={`${input} py-1.5`} />
                <label className="flex items-center gap-1 text-xs text-zinc-500"><input type="number" min={0} max={365} value={e.daysBefore ?? 14} onChange={(ev) => set(e.id, { daysBefore: Math.max(0, Math.min(365, Number(ev.target.value) || 0)) })} className={`${input} w-16 py-1.5`} />일 전부터</label>
                <label className="flex items-center gap-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer"><input type="checkbox" checked={e.active !== false} onChange={(ev) => set(e.id, { active: ev.target.checked })} /> 표시</label>
                <button type="button" onClick={() => onChange(value.filter((x) => x.id !== e.id))} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500">당일 그림
                  <select value={e.art || 'auto'} onChange={(ev) => set(e.id, { art: ev.target.value as any })} className={`${input} py-1.5`}>
                    <option value="auto">이름 보고 자동</option>{ART_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}<option value="none">없음</option>
                  </select>
                  {(() => { const k = artFor(e.title, e.art); return k ? <span className="text-xl"><EventArt kind={k} label={e.title} text={e.banner} image={e.image} /></span> : <span className="text-[length:calc(11px*var(--fs,1))] text-zinc-400">그림 없음</span>; })()}
                </label>
                {artFor(e.title, e.art) && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <label className="px-2.5 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 font-bold cursor-pointer">{e.image ? '그림 바꾸기' : '그림 올리기'}
                      <input type="file" accept="image/png,image/gif,image/webp,image/jpeg" className="hidden" onChange={(ev) => { void upload(e.id, ev.target.files?.[0]); ev.target.value = ''; }} />
                    </label>
                    {e.image && <button type="button" onClick={() => set(e.id, { image: '' })} className="underline cursor-pointer">그린 하마로</button>}
                  </span>
                )}
                {artFor(e.title, e.art) === 'banner' && !e.image && (
                  <label className="flex items-center gap-1 text-xs text-zinc-500">플래카드 글
                    <input value={e.banner || ''} onChange={(ev) => set(e.id, { banner: ev.target.value.slice(0, 6) })} placeholder={bannerText(e.title)} maxLength={6} className={`${input} w-24 py-1.5`} />
                  </label>
                )}
                {artFor(e.title, e.art) && (
                  <label className="flex items-center gap-1 text-xs text-zinc-500 w-full sm:w-auto">세 번 누르면 나오는 말
                    <input value={e.message || ''} onChange={(ev) => set(e.id, { message: ev.target.value.slice(0, 30) })} placeholder={['cheer', 'exam'].includes(artFor(e.title, e.art) || '') ? '수능 화이팅!!' : `${bannerText(e.title)} 축하해요!`} maxLength={30} className={`${input} flex-1 sm:w-44 py-1.5`} />
                  </label>
                )}
                {/* 기념일 방송 확률: 이름에 '주년'이 있으면 기본 켜짐 (당일 40 · 전날 12), 0 이면 끔 */}
                {(() => {
                  const anniv = /주년/.test(e.title || '');
                  const dv = e.boost ?? (anniv ? BOOST_DEFAULT.day : 0);
                  const bv = e.boostBefore ?? (anniv ? BOOST_DEFAULT.before : 0);
                  const num = (v: string) => Math.max(0, Math.min(95, Math.round(Number(v) || 0)));
                  return (
                    <span className="w-full flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className="font-bold text-zinc-600 dark:text-zinc-300">방송 확률 최소</span>
                      당일 <input type="number" min={0} max={95} value={dv} onChange={(ev) => set(e.id, { boost: num(ev.target.value) })} className={`${input} w-14 py-1`} />%
                      · 전날 <input type="number" min={0} max={95} value={bv} onChange={(ev) => set(e.id, { boostBefore: num(ev.target.value) })} className={`${input} w-14 py-1`} />%
                      <span className="text-[length:calc(10.5px*var(--fs,1))] text-zinc-400">(0이면 안 올림 · 원래 계산이 더 높으면 그대로)</span>
                    </span>
                  );
                })()}
                <label className="flex items-center gap-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer"><input type="checkbox" checked={e.repeat === 'yearly'} onChange={(ev) => set(e.id, { repeat: ev.target.checked ? 'yearly' : undefined })} /> 매년 (생일 등)</label>
                <span className="w-full text-[length:calc(10.5px*var(--fs,1))] text-zinc-400">{e.repeat === 'yearly' ? `다음: ${nextDate(e)} · ` : ''}{shown ? '지금 보이는 중' : left < 0 ? '지난 일정 (안 보임)' : e.active === false ? '꺼 둠' : `${left - Number(e.daysBefore ?? 14)}일 뒤부터 보여요`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
