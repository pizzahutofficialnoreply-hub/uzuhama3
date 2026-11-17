import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { mutate } from '../tabs/admin/system/SearchTuningCard';

/**
 * 관리자: AI 요약 내용 직접 고치기
 * 요약 · 노가리 · 흐름(제목·내용) · 장면(시간·설명·한 말, 지우기) · 게임 줄거리
 */
const fmt = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const parse = (v: string) => { const p = v.trim().split(':').map((x) => Number(x)); if (p.some((x) => !Number.isFinite(x))) return null; return p.reduce((a, b) => a * 60 + b, 0); };

const field = 'w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-[13px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-400';
const label = 'block text-[11px] font-bold text-zinc-500 mb-1';

export default function AiSummaryEditor({ d, onSaved, onCancel }: { d: any; onSaved: (next: any) => void; onCancel: () => void }) {
  const [summary, setSummary] = useState<string>(d.summary || '');
  const [nogari, setNogari] = useState<string>(d.nogari || '');
  const [chapters, setChapters] = useState<any[]>(() => (d.chapters || []).map((c: any) => ({ ...c })));
  const [scenes, setScenes] = useState<any[]>(() => (d.scenes || []).map((s: any, i: number) => ({ ...s, i, tt: fmt(s.t) })));
  const [stories, setStories] = useState<any[]>(() => (d.gameStories || []).map((g: any) => ({ ...g })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showScenes, setShowScenes] = useState(false);

  const save = async () => {
    const bad = scenes.find((s) => parse(s.tt) == null);
    if (bad) { setMsg(`장면 시간 "${bad.tt}" 을 못 읽었어요 (예: 1:23:45)`); return; }
    setBusy(true); setMsg('');
    try {
      const patch = {
        summary, nogari,
        chapters: chapters.map((c) => ({ from: c.from, to: c.to, title: c.title || '', summary: c.summary || '', game: c.game || '' })),
        scenes: scenes.map((s) => ({ i: s.i, t: parse(s.tt), d: s.d || '', q: s.q || '' })).sort((a, b) => (a.t as number) - (b.t as number)),
        gameStories: stories.map((g) => ({ name: g.name, story: g.story || '', result: g.result })),
      };
      const r = await mutate('aiVideo', { op: 'editSummary', id: d.id, patch });
      onSaved(r.detail || { ...d, ...patch });
    } catch (e: any) { setMsg(`저장 못 했어요: ${String(e?.message || e).slice(0, 80)}`); }
    setBusy(false);
  };
  const setAt = <T,>(set: (f: (x: T[]) => T[]) => void, i: number, k: string, v: any) => set((xs) => xs.map((x: any, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <div className="space-y-4" data-testid="ai-summary-editor">
      <p className="text-[11px] text-zinc-500 break-keep">관리자만 보여요. 저장하면 여기엔 바로 바뀌고, 다른 사람 화면엔 15분 안에 바뀌어요. 말투는 보여 줄 때 해요체로 맞춰요.</p>
      <div><span className={label}>요약</span><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className={field} /></div>
      <div><span className={label}>노가리</span><textarea value={nogari} onChange={(e) => setNogari(e.target.value)} rows={3} className={field} /></div>
      {chapters.length > 0 && (
        <div className="space-y-2">
          <span className={label}>흐름</span>
          {chapters.map((c, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-2.5 space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-400 tabular-nums">{fmt(c.from)} ~ {fmt(c.to)}</div>
              <input value={c.title || ''} onChange={(e) => setAt(setChapters, i, 'title', e.target.value)} placeholder="제목" className={field} />
              <textarea value={c.summary || ''} onChange={(e) => setAt(setChapters, i, 'summary', e.target.value)} rows={2} placeholder="내용" className={field} />
            </div>
          ))}
        </div>
      )}
      {stories.length > 0 && (
        <div className="space-y-2">
          <span className={label}>게임 줄거리</span>
          {stories.map((g, i) => (
            <div key={i} className="space-y-1">
              <div className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">{g.name}</div>
              <textarea value={g.story || ''} onChange={(e) => setAt(setStories, i, 'story', e.target.value)} rows={3} className={field} />
            </div>
          ))}
        </div>
      )}
      {scenes.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowScenes((v) => !v)} className="text-[12px] font-bold text-zinc-600 dark:text-zinc-300 underline cursor-pointer">장면 {scenes.length}개 {showScenes ? '접기' : '고치기'}</button>
          {showScenes && scenes.map((s, i) => (
            <div key={s.i ?? `n${i}`} className="flex items-start gap-1.5">
              <input value={s.tt} onChange={(e) => setAt(setScenes, i, 'tt', e.target.value)} className={`${field} !w-[78px] shrink-0 tabular-nums !px-2`} aria-label="시간" />
              <div className="flex-1 min-w-0 space-y-1">
                <input value={s.d || ''} onChange={(e) => setAt(setScenes, i, 'd', e.target.value)} className={field} aria-label="설명" />
                <input value={s.q || ''} onChange={(e) => setAt(setScenes, i, 'q', e.target.value)} placeholder="한 말 (없으면 비움)" className={`${field} !text-[12px]`} aria-label="한 말" />
              </div>
              <button type="button" onClick={() => setScenes((xs) => xs.filter((_, j) => j !== i))} className="shrink-0 w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer" aria-label="이 장면 지우기"><Trash2 className="w-4 h-4 text-zinc-500" /></button>
            </div>
          ))}
          {showScenes && <button type="button" onClick={() => setScenes((xs) => [...xs, { t: 0, tt: '0:00', d: '', q: '' }])} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer">+ 장면 더하기</button>}
        </div>
      )}
      {msg && <p className="text-[12px] text-red-500">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="flex-1 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer">취소</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="flex-1 h-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}저장</button>
      </div>
    </div>
  );
}
