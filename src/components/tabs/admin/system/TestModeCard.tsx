import { useState } from 'react';
import { Bell, FlaskConical, Play, Square } from 'lucide-react';
import { endTestMode, startTestMode, useTestMode } from '../../../../utils/testMode';
import { toast } from '../../../../utils/ui';

/**
 * 관리자 › 시스템 › 자동 시스템 › 테스트 모드
 * 생방송이 켜졌다고 가정하거나, 확률·오늘 기록(게임·영상·쇼츠)을 바꿔서 화면이 어떻게 보이는지 이 기기에서만 확인
 * 서버 DB 는 안 바꿈 (모든 방문자 화면·실제 알림에 영향 없음) · 정한 시간이 지나면 저절로 끝나고 아무것도 안 남음
 */
const input = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white';
export function TestModeCard() {
  const cur = useTestMode();
  const [live, setLive] = useState(true);
  const [title, setTitle] = useState('우주하마 생방송!');
  const [category, setCategory] = useState('테스트 게임');
  const [minAgo, setMinAgo] = useState(5);
  const [useProb, setUseProb] = useState(false);
  const [prob, setProb] = useState(80);
  const [useLog, setUseLog] = useState(false);
  const [game, setGame] = useState('테스트 게임');
  const [videoUrl, setVideoUrl] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [mins, setMins] = useState(30);

  const start = () => {
    if (!live && !useProb && !useLog) { toast('가정할 것을 하나 이상 골라 주세요', 'error'); return; }
    startTestMode({
      until: Date.now() + mins * 60000,
      live: live ? { title, category, minAgo } : null,
      prob: useProb ? prob : null,
      log: useLog ? { game, videoUrl: videoUrl.trim(), videoTitle: '테스트 영상', shortUrl: shortUrl.trim() } : null,
    });
    toast(`테스트 모드를 켰어요 (${mins}분 · 이 기기에서만). 사이트 첫 화면에서 확인해 보세요`, 'success', { action: { label: '사이트 열기', onClick: () => window.open('/', '_blank') } });
  };
  const notify = async (kind: 'live' | 'video' | 'peak') => {
    try {
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') { toast('알림 권한을 허용해 주세요', 'error'); return; }
      const reg = await navigator.serviceWorker?.ready;
      const msg = kind === 'live' ? { t: '우주하마 방송 시작!', b: `${title} · ${category}`, u: '/' }
        : kind === 'video' ? { t: '[테스트 영상 제목]', b: '우주하마 방송 예측에서 확인해 보세요! 연결된 생방송·게임도 같이 볼 수 있어요.', u: '/' }
        : { t: '우주하마 방송 예측', b: `오늘 방송 유력 시간까지 약 30분 남았어요. 오늘 방송 확률 ${useProb ? prob : 60}%`, u: '/' };
      if (reg?.showNotification) await reg.showNotification(`[테스트] ${msg.t}`, { body: msg.b, icon: '/icon.png', badge: '/icon.png', data: { url: msg.u } } as any);
      else new Notification(`[테스트] ${msg.t}`, { body: msg.b, icon: '/icon.png' });
    } catch (e: any) { toast(`알림을 못 띄웠어요: ${e?.message || e}`, 'error'); }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-500" /> 테스트 모드 (이 기기에서만)</h3>
        <p className="text-[11px] text-zinc-500 mt-0.5 break-keep">생방송이 켜졌다고 가정하거나 확률·오늘 기록을 바꿔서 사이트가 어떻게 보이는지 확인해요. 서버 DB 는 바꾸지 않아서 다른 방문자 화면이나 실제 알림에는 영향이 없고, 정한 시간이 지나거나 '끝내기'를 누르면 아무것도 안 남아요.</p>
      </div>
      {cur ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-[12px] text-amber-800 dark:text-amber-200">
          <span className="flex-1">테스트 중 · {Math.max(0, Math.ceil((cur.until - Date.now()) / 60000))}분 남음</span>
          <button type="button" onClick={endTestMode} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-bold cursor-pointer"><Square className="w-3.5 h-3.5" /> 끝내기</button>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> 생방송 켜짐</label>
      {live && (
        <div className="grid grid-cols-2 gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="방송 제목" className={input} />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="카테고리(게임)" className={input} />
          <label className="col-span-2 text-[11px] text-zinc-500">시작한 지 {minAgo}분 <input type="range" min={0} max={300} value={minAgo} onChange={(e) => setMinAgo(+e.target.value)} className="w-full" /></label>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={useProb} onChange={(e) => setUseProb(e.target.checked)} /> 방송 확률 바꾸기</label>
      {useProb && <label className="block text-[11px] text-zinc-500">{prob}% <input type="range" min={0} max={100} value={prob} onChange={(e) => setProb(+e.target.value)} className="w-full" /></label>}
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={useLog} onChange={(e) => setUseLog(e.target.checked)} /> 오늘 방송 기록 추가 (게임·편집 영상·쇼츠)</label>
      {useLog && (
        <div className="space-y-2">
          <input value={game} onChange={(e) => setGame(e.target.value)} placeholder="게임 이름" className={input} />
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="편집 영상 유튜브 주소 (선택)" className={input} />
          <input value={shortUrl} onChange={(e) => setShortUrl(e.target.value)} placeholder="쇼츠 주소 (선택)" className={input} />
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <span>유지 시간</span>
        {[10, 30, 60].map((m) => <button key={m} type="button" aria-pressed={mins === m} onClick={() => setMins(m)} className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${mins === m ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{m}분</button>)}
      </div>
      <button type="button" onClick={start} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-black text-xs font-black cursor-pointer"><Play className="w-4 h-4" /> {cur ? '이 값으로 다시 시작' : '테스트 시작'}</button>
      <div className="pt-1">
        <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 mb-1.5 inline-flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> 알림 미리 보기 (이 기기에만 뜸)</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([['live', '방송 시작'], ['peak', '유력 시간'], ['video', '새 영상']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => notify(k)} className="py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11.5px] font-bold cursor-pointer">{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
