import { useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { mutate } from './SearchTuningCard';
import { HeaderTitle, themesFor, type TitleDecor } from '../../../common/HeaderTitle';

/**
 * 관리자 › 시스템 › 공지: 헤더 제목 꾸미기
 *  - 기념일(빼빼로데이·크리스마스·설·추석 등)은 그날 자동으로 바뀜 → 날짜를 골라 미리 볼 수 있음
 *  - 직접 넣은 그림·GIF(기간)는 그 기간 동안 제목 앞에 나옴 (자동 꾸미기보다 먼저)
 *  - 그림은 그림 저장소에 바이너리로 올리고 주소만 저장 (GIF 움직임 그대로, 최대 약 900KB)
 *  저장은 아래 '저장' 버튼
 */
export function TitleDecorCard({ value, onChange }: { value: TitleDecor[]; onChange: (v: TitleDecor[]) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const input = 'px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm';

  const upload = async (f: File | undefined) => {
    setErr('');
    if (!f) return;
    if (!/^image\/(jpeg|png|gif|webp)$/.test(f.type)) { setErr('jpg·png·gif·webp 그림만 올릴 수 있어요'); return; }
    if (f.size > 900_000) { setErr('그림이 너무 커요 (최대 약 900KB). GIF 는 크기를 줄여서 올려 주세요.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { setErr('보여 줄 첫날을 골라 주세요'); return; }
    setBusy(true);
    try {
      const data: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('그림을 읽지 못했어요')); r.readAsDataURL(f); });
      const j = await mutate('uploadImage', { data });
      onChange([...value, { id: `td-${Date.now().toString(36)}`, from, to: to || from, image: j.url, label: label.trim().slice(0, 30), enabled: true }]);
      setLabel('');
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };

  const auto = themesFor(preview);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> 헤더 제목 꾸미기</h3>
        <p className="text-xs text-zinc-500 mt-1 break-keep">빼빼로데이·가래떡데이, 크리스마스, 설날·추석, 할로윈 같은 날에는 '우주하마 방송 예측' 글씨가 그날에 맞게 자동으로 바뀌어요. 직접 그림·GIF 를 넣으면 그 기간에는 그게 먼저 나와요. 고친 뒤 아래 저장을 눌러 주세요.</p>
      </div>

      <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-zinc-500">미리 보기 날짜</span>
          <input type="date" value={preview} onChange={(e) => setPreview(e.target.value)} className={`${input} py-1.5`} />
          <span className="text-[11px] text-zinc-500">{auto.length ? `자동: ${auto.map((t) => t.label).join(' · ')}` : '이날은 자동 꾸미기 없음'}</span>
        </div>
        <div className="px-1"><HeaderTitle decor={value} previewDay={preview} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-2 items-end">
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">첫날</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">마지막 날</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} w-full`} /></label>
        <label className="space-y-1"><span className="text-[11px] font-bold text-zinc-500">설명 (눌렀을 때)</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="예: 10주년" className={`${input} w-full`} /></label>
        <label className={`h-[38px] px-4 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center gap-1 cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} 그림·GIF 올리기
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}

      {value.length === 0 ? <p className="text-xs text-zinc-400">직접 넣은 그림이 없어요.</p> : (
        <ul className="space-y-2">
          {[...value].sort((a, b) => a.from.localeCompare(b.from)).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
              <img src={d.image} alt="" className="h-8 w-auto max-w-16 object-contain rounded" />
              <input type="date" value={d.from} onChange={(e) => onChange(value.map((x) => (x.id === d.id ? { ...x, from: e.target.value } : x)))} className={`${input} py-1.5`} />
              <span className="text-xs text-zinc-400">~</span>
              <input type="date" value={d.to} onChange={(e) => onChange(value.map((x) => (x.id === d.id ? { ...x, to: e.target.value } : x)))} className={`${input} py-1.5`} />
              <input value={d.label || ''} onChange={(e) => onChange(value.map((x) => (x.id === d.id ? { ...x, label: e.target.value.slice(0, 30) } : x)))} placeholder="설명" className={`${input} py-1.5 flex-1 min-w-[6rem]`} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.enabled !== false} onChange={(e) => onChange(value.map((x) => (x.id === d.id ? { ...x, enabled: e.target.checked } : x)))} /> 켜기</label>
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== d.id))} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer" aria-label="지우기"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
