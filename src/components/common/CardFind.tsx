import { useState } from 'react';
import { Search, Loader2, X, Sparkles } from 'lucide-react';
import { aiSearch, fmtTime, type AiResult } from '../../utils/aiSearch';
import { loadScript } from './ScriptView';
import { politeKo as pk } from '../../utils/politeKo';
import { getPrefs } from '../../utils/userPrefs';

const API = (import.meta.env.VITE_VERCEL_API_URL || (typeof window !== 'undefined' && /vercel\.app$/.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app'));

type Pick = { id: string; title: string; kind?: string; t: number; why: string; sure?: boolean };

/**
 * 펼친 영상 화면의 찾기: 이 영상 대사 + 모든 AI 요약 + 상황으로 찾기(AI 가 상황 기록에서 고름)
 * 누르면 같은 영상이면 그 시간으로, 다른 영상이면 그 영상으로 바뀌어 그 시간부터
 */
export function CardFind({ id, onSeek, onOpen }: { id: string; onSeek: (t: number) => void; onOpen: (id: string, title: string, t: number) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ q: string; mine: { t: number; s: string }[]; all: AiResult[]; picks: Pick[] | null } | null>(null);

  const run = async () => {
    const s = q.trim();
    if (s.length < 2) return;
    setBusy(true);
    const words = s.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    try {
      const [scr, all] = await Promise.all([
        loadScript(id).catch(() => ({ lines: [] } as any)),
        aiSearch(s).catch(() => [] as AiResult[]),
      ]);
      const mine = ((scr?.lines || []) as { t: number; s: string }[]).filter((l) => { const t = l.s.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 8);
      setRes({ q: s, mine, all: all.filter((x) => x.hasSummary !== false).slice(0, 6), picks: null });
      setBusy(false);
      // 상황으로 찾기는 조금 걸려서 뒤에 (긴 문장일 때만)
      // 설정에서 'AI 검색'을 끄면 입력한 문장을 AI 로 보내지 않음 (개인정보처리방침 제7항)
      if (s.length >= 8 && getPrefs().searchAI !== false) {
        try {
          const j = await (await fetch(`${API}/api/videos/search-index?ai=find&q=${encodeURIComponent(s)}`)).json();
          setRes((p) => (p && p.q === s ? { ...p, picks: j?.picks || [] } : p));
        } catch { setRes((p) => (p && p.q === s ? { ...p, picks: [] } : p)); }
      } else setRes((p) => (p ? { ...p, picks: [] } : p));
    } finally { setBusy(false); }
  };
  const go = (vid: string, title: string, t: number) => (vid === id ? onSeek(Math.max(0, t - 3)) : onOpen(vid, title, Math.max(0, t - 3)));

  return (
    <div className="mt-4">
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex items-center gap-2 h-10 px-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Search className="w-4 h-4 text-zinc-400 shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" placeholder="대사·AI 요약에서 찾기 (상황으로 말해도 돼요)" className="flex-1 min-w-0 bg-transparent text-[length:calc(14px*var(--fs,1))] outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400" />
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> : q && <button type="button" onClick={() => { setQ(''); setRes(null); }} className="text-zinc-400 cursor-pointer" aria-label="지우기"><X className="w-4 h-4" /></button>}
      </form>
      {res && (
        <div className="mt-2 space-y-3">
          {res.picks === null && res.q.length >= 8 && <p className="px-1 text-[length:calc(11.5px*var(--fs,1))] text-zinc-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 상황으로도 찾는 중…</p>}
          {res.picks && res.picks.length > 0 && (
            <div>
              <p className="px-1 mb-1 text-[length:calc(11.5px*var(--fs,1))] font-black text-purple-600 dark:text-purple-400 inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> 상황에 맞는 장면</p>
              {res.picks.map((p, i) => (
                <button key={i} type="button" onClick={() => go(p.id, p.title, p.t)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left cursor-pointer">
                  <img src={`https://i.ytimg.com/vi/${p.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-24 aspect-video rounded-lg object-cover shrink-0 bg-zinc-800" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(12.5px*var(--fs,1))] font-bold text-zinc-900 dark:text-white line-clamp-1">{p.title}</span>
                    <span className="block text-[length:calc(11.5px*var(--fs,1))] text-zinc-500 line-clamp-2"><b className="text-purple-600 tabular-nums">{fmtTime(p.t)}</b> {pk(p.why)}{p.sure === false && ' (일부만 맞아요)'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {res.mine.length > 0 && (
            <div>
              <p className="px-1 mb-1 text-[length:calc(11.5px*var(--fs,1))] font-black text-zinc-500">이 영상 대사</p>
              {res.mine.map((l, i) => (
                <button key={i} type="button" onClick={() => onSeek(Math.max(0, l.t - 2))} className="w-full flex gap-3 px-2 py-1.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left cursor-pointer">
                  <b className="text-[length:calc(12px*var(--fs,1))] text-purple-600 tabular-nums shrink-0">{fmtTime(l.t)}</b><span className="text-[length:calc(12.5px*var(--fs,1))] text-zinc-700 dark:text-zinc-200 line-clamp-2">{l.s}</span>
                </button>
              ))}
            </div>
          )}
          {res.all.length > 0 && (
            <div>
              <p className="px-1 mb-1 text-[length:calc(11.5px*var(--fs,1))] font-black text-zinc-500">AI 요약에서</p>
              {res.all.map((r) => (
                <button key={r.id} type="button" onClick={() => go(r.id, r.title, r.scenes[0]?.t ?? 0)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left cursor-pointer">
                  <img src={`https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-24 aspect-video rounded-lg object-cover shrink-0 bg-zinc-800" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(12.5px*var(--fs,1))] font-bold text-zinc-900 dark:text-white line-clamp-2">{r.title}</span>
                    {r.scenes[0] && <span className="block text-[length:calc(11px*var(--fs,1))] text-zinc-500 line-clamp-1"><b className="text-purple-600 tabular-nums">{fmtTime(r.scenes[0].t)}</b> {pk(r.scenes[0].d)}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!res.mine.length && !res.all.length && res.picks !== null && !res.picks.length && <p className="px-1 text-[length:calc(12px*var(--fs,1))] text-zinc-500">'{res.q}'에 맞는 걸 아직 못 찾았어요.</p>}
        </div>
      )}
    </div>
  );
}
