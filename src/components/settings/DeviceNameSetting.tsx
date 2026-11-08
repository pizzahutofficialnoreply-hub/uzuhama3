import { useState } from 'react';
import { Check } from 'lucide-react';
import { deviceInfo, getDeviceName, iphoneCandidates, setDeviceName } from '../../utils/diagnose';
import { cn } from '../../utils';

/** 설정 › 이 기기 정보: 의견 보낼 때 붙는 기기 이름을 직접 정함 (아이폰은 기종을 알려 주지 않아 짐작이라서) */
export function DeviceNameSetting() {
  const [name, setName] = useState(getDeviceName());
  const [saved, setSaved] = useState(false);
  const guess = (() => { const d = deviceInfo(); return d.guessed || d.device; })();
  const cands = iphoneCandidates();
  const save = (v: string) => { setDeviceName(v); setName(v); setSaved(true); window.setTimeout(() => setSaved(false), 1500); };
  const d = deviceInfo();
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 leading-relaxed break-keep">의견을 보낼 때 붙는 기기 정보예요. 아이폰은 정확한 기종을 알려 주지 않아서 화면 크기로 짐작해요. 맞는 기종을 골라 두면 그걸로 보내요.</p>
      <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 text-xs space-y-0.5">
        <p><span className="text-zinc-400">자동으로 찾은 기기</span> <span className="font-semibold text-zinc-800 dark:text-zinc-100">{guess}</span></p>
        <p><span className="text-zinc-400">OS · 브라우저</span> <span className="text-zinc-700 dark:text-zinc-300">{d.os} · {d.browser}</span></p>
        <p><span className="text-zinc-400">앱</span> <span className="text-zinc-700 dark:text-zinc-300">{d.app}</span></p>
      </div>
      {cands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {cands.map((c) => (
            <button key={c} type="button" onClick={() => save(c)} className={cn('px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border', name === c ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300')}>{c}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="기기 이름 직접 입력 (예: iPhone 17 Pro)" className="flex-1 min-w-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500" />
        <button type="button" onClick={() => save(name)} className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1">{saved ? <><Check className="w-3.5 h-3.5" /> 저장됨</> : '저장'}</button>
      </div>
      {getDeviceName() && <button type="button" onClick={() => save('')} className="text-xs text-zinc-500 underline cursor-pointer">직접 정한 이름 지우고 자동으로</button>}
    </div>
  );
}
