import { useMemo, useState } from 'react';
import { CheckSquare, Loader2, Music, Square } from 'lucide-react';
import type { AppData, BroadcastLog } from '../../../types';
import { parseSongPosts, sameGame, type SongPost } from '../../../utils/songPosts';
import { loadFreshLogs } from '../../../hooks/useFirebaseData';
import { confirmSheet } from '../../../utils/ui';

/**
 * 관리자 › 기록 추가 › 생방쏭 가져오기
 * 생방쏭 글(카페 모으기 '1: 생방쏭 글만' 또는 글 화면 복사)을 붙여 넣으면 날짜·게임 이름을 뽑아
 * 그날 방송 기록과 비교 → 기록에 없는 게임만 골라 넣음 (게임 링크는 스팀에서 이름으로 찾아 채움)
 * - 그날 기록: 날짜가 같은 방송 (없으면 다음 날 새벽 6시 전에 시작한 방송 = 자정 넘어 켠 방송)
 */
const API = (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
type Row = { key: string; post: SongPost; logId: string | null; logDate: string; game: string; have: boolean; link: string; linkName: string; ai: 'seen' | 'notSeen' | 'none' };

export function AdminSongImport({ data, onUpdateLog }: { data: AppData; onUpdateLog?: (log: BroadcastLog) => Promise<void> }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [noLog, setNoLog] = useState<SongPost[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const logs = useMemo(() => Object.values(data.logs || {}) as any[], [data.logs]);

  const logFor = (date: string) => {
    const same = logs.filter((l) => l.date === date && !l.isAbsence);
    if (same.length) return same.sort((a, b) => (b.vods || []).length - (a.vods || []).length)[0];
    const next = new Date(Date.parse(date) + 864e5).toISOString().slice(0, 10);
    return logs.find((l) => l.date === next && !l.isAbsence && l.time && l.time < '06:00') || null;
  };

  const analyze = async () => {
    const posts = parseSongPosts(text);
    if (!posts.length) { setMsg('생방쏭 글을 못 찾았어요. 제목(예: 8/23 일요일 생방쏭 (게임이름- …))과 글 쓴 날짜가 같이 있어야 해요.'); return; }
    const out: Row[] = [];
    const none: SongPost[] = [];
    for (const p of posts) {
      const l = logFor(p.date);
      if (!l) { none.push(p); continue; }
      for (const g of p.games) {
        const have = (l.games || []).some((x: any) => sameGame(x?.name, g)) || sameGame(l.game || '', g);
        out.push({ key: `${l.id}|${g}`, post: p, logId: l.id, logDate: l.date, game: g, have, link: '', linkName: '', ai: 'none' });
      }
    }
    setRows(out); setNoLog(none);
    const todo = out.filter((r) => !r.have);
    setPicked(new Set(todo.map((r) => r.key)));
    setMsg(`생방쏭 ${posts.length}개 · 게임 ${out.length}개 중 기록에 없는 것 ${todo.length}개${none.length ? ` · 그날 방송 기록이 없는 글 ${none.length}개` : ''}`);
    // 그 방송의 유튜브 생방송을 AI가 본 결과로 확인 (카페에 적힌 게임이 실제로 나왔는지)
    setBusy('ai');
    try {
      const vodOf = new Map<string, string[]>();
      out.forEach((r) => { const l: any = (data.logs as any)[r.logId!]; vodOf.set(r.logId!, (l?.vods || []).map((v: any) => (String(v?.url || '').match(/(?:youtu\.be\/|v=|\/live\/)([\w-]{11})/) || [])[1]).filter(Boolean)); });
      const vids = [...new Set([...vodOf.values()].flat())];
      const ai: Record<string, { status: string; names: string[] }> = {};
      for (let i = 0; i < vids.length; i += 50) Object.assign(ai, (await (await fetch(`${API}/api/health?aigames=${vids.slice(i, i + 50).join(',')}`)).json())?.games || {});
      out.forEach((r) => {
        const seen = (vodOf.get(r.logId!) || []).map((v) => ai[v]).filter((x) => x && x.status === 'done');
        r.ai = !seen.length ? 'none' : seen.some((x) => x.names.some((n) => sameGame(n, r.game))) ? 'seen' : 'notSeen';
      });
      setRows([...out]);
    } catch { /* AI 결과 없이 */ }
    // 기록에 없는 게임은 스팀에서 이름으로 링크 찾기
    setBusy('steam');
    for (let i = 0; i < todo.length; i++) {
      try {
        const j = await (await fetch(`${API}/api/health?steam=${encodeURIComponent(todo[i].game)}`)).json();
        const hit = (j?.items || []).find((x: any) => sameGame(x.name, todo[i].game));
        if (hit) { todo[i].link = hit.link; todo[i].linkName = hit.name; setRows([...out]); }
      } catch { /* 링크 없이 */ }
    }
    setBusy('');
  };

  const apply = async () => {
    const sel = (rows || []).filter((r) => !r.have && picked.has(r.key) && r.logId);
    if (!sel.length || !onUpdateLog) return;
    if (!await confirmSheet(`기록 ${new Set(sel.map((r) => r.logId)).size}개에 게임 ${sel.length}개를 넣을까요?`)) return;
    setBusy('apply');
    try {
      const ids = [...new Set(sel.map((r) => r.logId!))];
      const fresh = await loadFreshLogs(ids.map((id) => String((data.logs as any)[id]?.date || '').slice(0, 7)), ids);
      let n = 0;
      for (const id of ids) {
        const l: any = fresh[id];
        if (!l) continue;
        const add = sel.filter((r) => r.logId === id && !(l.games || []).some((x: any) => sameGame(x?.name, r.game)));
        if (!add.length) continue;
        await onUpdateLog({ ...l, games: [...(l.games || []), ...add.map((r) => ({ name: r.game, link: r.link || '', category: '' }))] });
        n += add.length;
      }
      setMsg(`게임 ${n}개를 넣었어요`);
      setRows((rs) => (rs || []).map((r) => (sel.some((x) => x.key === r.key) ? { ...r, have: true } : r)));
    } catch (e: any) { setMsg(`못 했어요: ${String(e?.message || e).slice(0, 80)}`); }
    setBusy('');
  };

  const todo = (rows || []).filter((r) => !r.have);
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs">
      <div className="flex items-center gap-2"><Music className="w-4 h-4 text-pink-500" /><b className="text-sm text-zinc-900 dark:text-white">생방쏭 가져오기 (그날 한 게임)</b></div>
      <p className="text-zinc-500 break-keep leading-relaxed">카페에서 '생방쏭'을 검색하고 (작성자 상관없음) 카페 모으기에서 <b>1: 생방쏭 글만</b>을 골라 모은 글을 붙여 넣으세요 (글 화면을 그대로 복사해도 돼요). 제목의 날짜·게임 이름으로 그날 방송을 찾아, 연결된 유튜브 생방송을 AI가 본 게임과 맞춰 보고, 기록에 없는 게임만 넣어요 (기록에 이미 있는 다른 게임은 그대로). 같은 날 글이 여러 개면 하나로 봐요. 게임 링크는 스팀에서 이름으로 찾아요.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="===== [다시보기 링크] 8/23 일요일 생방쏭 (게임이름- …)" className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 font-mono text-[length:calc(11px*var(--fs,1))]" />
      <button type="button" disabled={!text.trim() || !!busy} onClick={() => void analyze()} className="px-3 py-2 rounded-xl font-bold bg-zinc-100 dark:bg-zinc-800 cursor-pointer disabled:opacity-50">분석</button>
      {msg && <p className="text-zinc-600 dark:text-zinc-300">{msg}{busy === 'ai' ? ' · AI가 본 게임과 맞춰 보는 중…' : busy === 'steam' ? ' · 스팀에서 링크 찾는 중…' : ''}</p>}
      {rows && rows.length > 0 && (
        <p className="text-zinc-500 break-keep">
          유튜브 생방송 AI 분석과 비교: 카페 게임이 영상에 나옴 {rows.filter((r) => r.ai === 'seen').length}개 · <b className="text-amber-600">영상에 안 보임 {rows.filter((r) => r.ai === 'notSeen').length}개</b> · 아직 분석 전 {rows.filter((r) => r.ai === 'none').length}개
        </p>
      )}
      {rows && rows.some((r) => r.ai === 'notSeen') && (
        <p className="text-amber-700 dark:text-amber-300 break-keep">카페엔 있는데 AI가 그 생방송에서 못 본 게임 (날짜·게임 이름 확인): {rows.filter((r) => r.ai === 'notSeen').map((r) => `${r.logDate} ${r.game}`).join(' · ')}</p>
      )}
      {todo.length > 0 && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-800 max-h-80 overflow-y-auto">
          {todo.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })} className="w-full text-left p-2.5 flex items-start gap-2 cursor-pointer">
                {picked.has(r.key) ? <CheckSquare className="w-4 h-4 shrink-0 text-purple-600" /> : <Square className="w-4 h-4 shrink-0 text-zinc-400" />}
                <span className="break-keep text-zinc-700 dark:text-zinc-200">{r.logDate} 기록에 「{r.game}」 넣기{r.ai === 'seen' ? <span className="text-emerald-600"> · AI도 봄</span> : r.ai === 'notSeen' ? <span className="text-amber-600"> · AI는 못 봄</span> : null}{r.link ? <span className="text-zinc-400"> · 스팀 {r.linkName}</span> : <span className="text-zinc-400"> · 링크 없이</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {noLog.length > 0 && <p className="text-amber-700 dark:text-amber-300 break-keep">그날 방송 기록이 없는 생방쏭: {noLog.map((p) => `${p.date} ${p.games.join(', ')}`).join(' · ')}</p>}
      {todo.length > 0 && (
        <button type="button" disabled={!picked.size || !!busy || !onUpdateLog} onClick={() => void apply()} className="w-full h-11 rounded-xl bg-pink-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 선택한 {todo.filter((r) => picked.has(r.key)).length}개 게임 넣기
        </button>
      )}
    </div>
  );
}
