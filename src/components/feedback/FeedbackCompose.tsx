import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Bug, ChevronRight, FileText, ImagePlus, Lightbulb, Loader2, Paperclip, Smartphone, Stethoscope, TriangleAlert, X, MessageCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { checkSubmit, noteSubmit, visitorId } from '../../utils/submitGuard';
import { collectDiagnose, deviceInfo, deviceInfoFull, shrinkImage } from '../../utils/diagnose';
import { cn } from '../../utils';

/**
 * 의견 보내기 (의견 + 버그 제보 합침) — 아이폰 '피드백 지원' 앱처럼
 * 제목 · 어디서 · 무슨 종류 · 설명 + 첨부 파일(기기 정보, 앱 진단은 자동으로 모으고, 앱 점검 결과·사진은 골라서)
 */
const KINDS = [
  { key: 'bug', label: '버그 · 오류', icon: Bug, hint: '어떤 화면에서 무엇을 눌렀을 때 어떻게 됐는지 순서대로 적어 주세요.' },
  { key: 'suggestion', label: '기능 제안', icon: Lightbulb, hint: '있었으면 하는 기능과 이유를 자유롭게 적어 주세요.' },
  { key: 'wrong', label: '내용이 틀려요', icon: TriangleAlert, hint: '틀린 날짜·게임·링크 등을 적어 주세요. 영상 하나는 ⋮ › 신고가 더 빨라요.' },
  { key: 'etc', label: '기타 의견', icon: MessageCircle, hint: '하고 싶은 말을 자유롭게 적어 주세요.' },
] as const;
type Kind = typeof KINDS[number]['key'];

export function FeedbackCompose({ areas, selftest, onDone, onOpenCheck }: { areas: string[]; selftest?: string; onDone: () => void; onOpenCheck?: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(areas[0] || '');
  const [customArea, setCustomArea] = useState('');
  const [kind, setKind] = useState<Kind>('bug');
  const [content, setContent] = useState('');
  const [diag, setDiag] = useState<string | null>(null);
  const [useDiag, setUseDiag] = useState(true);
  const [useTest, setUseTest] = useState(true);
  const [images, setImages] = useState<{ name: string; data: string }[]>([]);
  const [peek, setPeek] = useState<'diag' | 'test' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [dev, setDev] = useState(() => deviceInfo());
  useEffect(() => { deviceInfoFull().then(setDev).catch(() => {}); }, []);

  // 앱 진단은 열자마자 조용히 모음 (몇 초)
  useEffect(() => { let alive = true; collectDiagnose().then((t) => { if (alive) setDiag(t); }).catch(() => { if (alive) setDiag('진단을 모으지 못했어요'); }); return () => { alive = false; }; }, []);

  const addImages = async (list: FileList | null) => {
    if (!list) return;
    const room = 3 - images.length;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    for (const f of picked) {
      try { const data = await shrinkImage(f); setImages((p) => [...p, { name: f.name || '사진', data }].slice(0, 3)); } catch (e: any) { setErr(String(e?.message || e)); }
    }
  };

  const send = async () => {
    setErr('');
    if (!title.trim()) { setErr('제목을 적어 주세요.'); return; }
    if (!content.trim()) { setErr('설명을 적어 주세요.'); return; }
    const guardKey = `fb|${title.trim().slice(0, 40)}|${content.trim().slice(0, 80)}`;
    const blocked = checkSubmit('feedback', guardKey);
    if (blocked) { setErr(blocked); return; }
    setBusy(true);
    try {
      const where = area === '직접 입력' ? customArea.trim() : area;
      await addDoc(collection(db, 'feedbacks'), {
        type: kind === 'suggestion' ? 'suggestion' : 'bug',
        feedbackKind: KINDS.find((k) => k.key === kind)?.label || kind,
        title: title.trim().slice(0, 120),
        content: content.trim().slice(0, 4000),
        problemArea: where || null,
        os: `${dev.device} · ${dev.os} · ${dev.browser}`,
        attachments: {
          // 값이 없는 칸(undefined)이 있으면 Firestore 가 거절해서 지움 (아이폰은 모델 번호가 없음)
          device: JSON.parse(JSON.stringify(dev)),
          diagnose: useDiag && diag ? diag.slice(0, 8000) : null,
          selftest: useTest && selftest ? selftest.slice(0, 8000) : null,
          images: images.map((i) => i.data),
        },
        uid: user?.uid || null,
        email: user?.email || null,
        vid: visitorId(),
        createdAt: serverTimestamp(),
      });
      noteSubmit('feedback', guardKey);
      onDone();
    } catch (e: any) {
      setErr(/size|too large|exceeds/i.test(String(e?.message)) ? '첨부한 사진이 너무 커요. 사진을 줄이거나 빼고 다시 보내 주세요.' : `보내지 못했어요. 잠시 뒤에 다시 해 주세요. (${String(e?.code || e?.message || e).slice(0, 60)})`);
    } finally { setBusy(false); }
  };

  const group = 'rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800';
  const label = 'px-1 pb-1.5 text-[11.5px] font-bold text-zinc-500 dark:text-zinc-400';
  const field = 'w-full bg-transparent px-4 py-3 text-[14px] text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none';
  const kindNow = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="space-y-5">
      <section>
        <p className={label}>기본 정보</p>
        <div className={group}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="한 줄로 요약해 주세요 (예: 달력에서 날짜를 눌러도 안 열려요)" maxLength={120} className={field} />
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[14px] text-zinc-900 dark:text-white shrink-0">어디에서 생겼나요?</span>
            <span className="relative flex items-center min-w-0">
              <select value={area} onChange={(e) => setArea(e.target.value)} className="appearance-none bg-transparent text-right text-[14px] text-zinc-500 pr-5 outline-none max-w-[12rem] truncate">
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronRight className="w-4 h-4 text-zinc-400 absolute right-0 pointer-events-none" />
            </span>
          </label>
          {area === '직접 입력' && <input value={customArea} onChange={(e) => setCustomArea(e.target.value)} placeholder="화면이나 기능 이름" className={field} />}
        </div>
      </section>

      <section>
        <p className={label}>어떤 의견인가요?</p>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const on = kind === k.key;
            return (
              <button key={k.key} type="button" aria-pressed={on} onClick={() => setKind(k.key)} className={cn('flex items-center gap-2 px-3.5 py-3 rounded-2xl border text-[13px] font-bold cursor-pointer active:scale-[0.98] transition-colors', on ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200')}>
                <Icon className="w-4 h-4 shrink-0" /> {k.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className={label}>설명</p>
        <div className={group}>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={kindNow.hint} rows={6} maxLength={4000} className={cn(field, 'resize-none leading-relaxed min-h-[140px]')} />
        </div>
      </section>

      <section>
        <p className={label}>첨부 파일</p>
        <div className={group}>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0"><Smartphone className="w-4.5 h-4.5 text-zinc-500" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">{dev.device}</span>{/iPhone/.test(dev.device) && <span className="block text-[10.5px] text-zinc-400">아이폰은 정확한 기종을 알려 주지 않아 화면 크기로 짐작했어요</span>}
              <span className="block text-[11.5px] text-zinc-500 truncate">{dev.os} · {dev.browser} · {dev.app}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => diag && setPeek(peek === 'diag' ? null : 'diag')} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
              <span className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0"><FileText className="w-4.5 h-4.5 text-zinc-500" /></span>
              <span className="min-w-0">
                <span className={cn('block text-[14px] font-semibold', useDiag ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 line-through')}>앱 진단</span>
                <span className="block text-[11.5px] text-zinc-500">{diag ? `${(new Blob([diag]).size / 1024).toFixed(1)}KB · 눌러서 내용 보기` : '수집 중…'}</span>
              </span>
            </button>
            {!diag ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <button type="button" onClick={() => setUseDiag(!useDiag)} className="text-[12px] font-bold text-zinc-500 cursor-pointer">{useDiag ? '빼기' : '넣기'}</button>}
          </div>
          {peek === 'diag' && diag && <pre className="px-4 py-3 text-[10.5px] leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-all max-h-56 overflow-auto bg-zinc-50 dark:bg-zinc-950">{diag}</pre>}
          {selftest ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setPeek(peek === 'test' ? null : 'test')} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
                  <span className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Stethoscope className="w-4.5 h-4.5 text-emerald-600" /></span>
                  <span className="min-w-0">
                    <span className={cn('block text-[14px] font-semibold', useTest ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 line-through')}>앱 점검 결과</span>
                    <span className="block text-[11.5px] text-zinc-500 truncate">{selftest.split('\n')[0]}</span>
                  </span>
                </button>
                <button type="button" onClick={() => setUseTest(!useTest)} className="text-[12px] font-bold text-zinc-500 cursor-pointer">{useTest ? '빼기' : '넣기'}</button>
              </div>
              {peek === 'test' && <pre className="px-4 py-3 text-[10.5px] leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-all max-h-56 overflow-auto bg-zinc-50 dark:bg-zinc-950">{selftest}</pre>}
            </>
          ) : onOpenCheck ? (
            <button type="button" onClick={onOpenCheck} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
              <span className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0"><Stethoscope className="w-4.5 h-4.5 text-zinc-400" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] text-zinc-700 dark:text-zinc-200">앱 점검 결과 넣기</span><span className="block text-[11.5px] text-zinc-500">'앱 점검' 탭에서 점검하고 오면 여기 붙어요 (선택)</span></span>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          ) : null}
          {images.map((im, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <img src={im.data} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-zinc-900 dark:text-white truncate">{im.name}</span><span className="block text-[11.5px] text-zinc-500">{Math.round(im.data.length * 0.75 / 1024)}KB</span></span>
              <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="p-1 text-zinc-400 cursor-pointer" aria-label="사진 빼기"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {images.length < 3 && (
            <button type="button" onClick={() => file.current?.click()} className="w-full flex items-center gap-2 px-4 py-3 text-[14px] font-semibold text-purple-600 dark:text-purple-400 cursor-pointer">
              <Paperclip className="w-4 h-4" /> 첨부 파일 추가 <span className="text-[11.5px] font-normal text-zinc-400">(사진·스크린샷 최대 3장)</span>
            </button>
          )}
          <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
        </div>
        <p className="px-1 pt-2 text-[10.5px] text-zinc-400 leading-relaxed break-keep">앱 진단에는 기기·브라우저·앱 버전·설정 켜짐 여부·최근 오류만 들어가요. 시청 기록이나 검색어 같은 내용은 안 들어가요. 각 항목을 눌러 미리 볼 수 있어요.</p>
      </section>

      {err && <p className="text-xs font-bold text-red-500 px-1">{err}</p>}
      <button type="button" onClick={send} disabled={busy || !title.trim() || !content.trim()} className="w-full py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4 hidden" />} 보내기
      </button>
    </div>
  );
}
