import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, Loader2, SearchCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { extractYoutubeId } from '../utils/urlUtils';
import { checkSubmit, noteSubmit, visitorId } from '../utils/submitGuard';
import { parseTime, timeFromUrl } from '../utils/aiSearch';

/**
 * 검색 결과 추가하기
 * - 방문자(의견 보내기): "이렇게 검색하면 이 영상이 나와야 해요" 제보 → 관리자가 확인하고 추가
 * - 관리자: 바로 추가 (카페 등에서 본 실제 사례를 옮겨 넣을 때)
 */
export function SearchAddForm({ mode, onDone, submitAdmin }: {
  mode: 'user' | 'admin';
  onDone?: (msg: string) => void;
  submitAdmin?: (p: { query: string; videoId: string; t: number | null; sourceUrl: string; note: string }) => Promise<string>;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [time, setTime] = useState('');
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  const videoId = extractYoutubeId(url.trim()) || '';
  const t = parseTime(time) ?? timeFromUrl(url);
  const timeBad = Boolean(time.trim()) && parseTime(time) === null;

  const submit = async () => {
    setErr('');
    if (!query.trim()) return setErr('검색어를 적어 주세요.');
    if (!videoId) return setErr('유튜브 영상·쇼츠 링크를 넣어 주세요.');
    if (timeBad) return setErr("시간은 '12:34' 나 '1시간 2분 3초' 처럼 적어 주세요.");
    setBusy(true);
    try {
      if (mode === 'admin' && submitAdmin) {
        const msg = await submitAdmin({ query: query.trim(), videoId, t, sourceUrl: source.trim(), note: note.trim() });
        setDone(msg || '추가했어요');
        onDone?.(msg);
      } else {
        const guard = `search_add|${query.trim()}|${videoId}`;
        const blocked = checkSubmit('feedback', guard);
        if (blocked) { setErr(blocked); return; }
        await addDoc(collection(db, 'feedbacks'), {
          type: 'search_add',
          title: `[검색 결과 추가] ${query.trim().slice(0, 40)}`,
          content: [`검색어: ${query.trim()}`, `영상: https://youtu.be/${videoId}${t ? `?t=${t}` : ''}`, t ? `장면: ${time || `${t}초`}` : '', source.trim() ? `참고: ${source.trim()}` : '', note.trim() ? `설명: ${note.trim()}` : ''].filter(Boolean).join('\n'),
          query: query.trim().slice(0, 60), videoId, t: t ?? null, sourceUrl: source.trim().slice(0, 300), note: note.trim().slice(0, 300),
          status: 'pending', uid: user?.uid || null, vid: visitorId(), createdAt: serverTimestamp(),
        });
        noteSubmit('feedback', guard);
        setDone('보냈어요. 확인하고 검색에 넣을게요.');
        onDone?.('sent');
      }
      setQuery(''); setUrl(''); setTime(''); setSource(''); setNote('');
    } catch (e: any) {
      setErr('보내지 못했어요: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500';
  const label = 'block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5';
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed break-keep">
        {mode === 'admin'
          ? '카페 등에서 본 실제 사례("그 귀신 나오는 영상 뭐였죠?" → 답글의 영상)를 넣으면, 같은 검색어로 찾을 때 맨 위에 보여요.'
          : '"이렇게 검색했는데 이 영상이 안 나와요" 하는 걸 알려 주세요. 확인하고 같은 검색어로 찾으면 맨 위에 나오게 할게요.'}
      </p>
      <div>
        <label className={label}>검색어 <span className="text-purple-500">*</span></label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 귀신 점프스케어 나오는 영상" className={input} maxLength={60} />
      </div>
      <div>
        <label className={label}>나와야 하는 영상·쇼츠 링크 <span className="text-purple-500">*</span></label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/..." className={input} inputMode="url" />
        {url && !videoId && <p className="mt-1 text-[11px] text-red-500">유튜브 링크가 아니에요.</p>}
        {videoId && <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="mt-2 w-40 rounded-lg" />}
      </div>
      <div>
        <label className={label}>장면 시간 (선택)</label>
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={t && !time ? `링크의 ${t}초` : '예: 12:34'} className={input} />
        {timeBad && <p className="mt-1 text-[11px] text-red-500">'12:34' 처럼 적어 주세요.</p>}
      </div>
      <div>
        <label className={label}>{mode === 'admin' ? '출처 (카페 글 링크 등, 선택)' : '참고 링크 (카페 글 등, 선택)'}</label>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://cafe.naver.com/..." className={input} inputMode="url" />
      </div>
      <div>
        <label className={label}>설명 (선택)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="어떤 장면인지 짧게" className={`${input} min-h-[70px] resize-none`} maxLength={300} />
      </div>
      {err && <p className="text-xs font-bold text-red-500">{err}</p>}
      {done && <p className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {done}</p>}
      <button type="button" onClick={submit} disabled={busy}
        className="w-full py-3.5 px-4 text-sm font-bold text-white rounded-2xl bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchCheck className="w-4 h-4" />}
        {mode === 'admin' ? '검색 결과에 추가' : '검색 결과 추가 요청 보내기'}
      </button>
    </div>
  );
}
