import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { SheetHandle } from './SheetHandle';
import { YT_CONSENT_EVENT, markYoutubeConsent } from '../../utils/youtubeAccount';

/**
 * 유튜브 재생목록 저장 기능을 처음 쓸 때: 무엇을 하고 무엇을 안 하는지 안내 + 동의 + 만 14세 이상 확인
 * '동의하고 구글 로그인'을 누르는 그 순간 구글 로그인 창을 띄움 (팝업이 막히지 않게)
 */
type Req = { onAgree: () => void; onCancel: () => void };
const box = 'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0';

export function YoutubeConsentHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [age, setAge] = useState(false);
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { setAge(false); setAgree(false); setReq((e as CustomEvent<Req>).detail); };
    window.addEventListener(YT_CONSENT_EVENT, on);
    return () => window.removeEventListener(YT_CONSENT_EVENT, on);
  }, []);
  const close = () => { req?.onCancel(); setReq(null); };
  const ok = age && agree;
  const Check = ({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) => (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => set(!on)} className="w-full flex items-start gap-2.5 py-2 text-left cursor-pointer">
      <span className={`${box} ${on ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>{on && <svg viewBox="0 0 12 12" className="w-3 h-3"><path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}</span>
      <span className="text-[length:calc(13px*var(--fs,1))] font-bold text-zinc-800 dark:text-zinc-100 break-keep">{children}</span>
    </button>
  );
  return createPortal(
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[420] flex items-end sm:items-center justify-center">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div role="dialog" aria-label="유튜브 재생목록 저장 기능 이용 안내"
            className="sheet-fill relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-5 shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <SheetHandle onClose={close} />
            <h2 className="text-[length:calc(17px*var(--fs,1))] font-black text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-600" /> 유튜브 재생목록 저장 안내</h2>
            <p className="mt-1 text-[length:calc(12.5px*var(--fs,1))] text-zinc-500 break-keep">구글 계정으로 로그인하면 고른 영상을 내 유튜브 재생목록에 바로 담을 수 있어요.</p>
            <div className="mt-3 space-y-2 text-[length:calc(12.5px*var(--fs,1))] leading-relaxed text-zinc-700 dark:text-zinc-200">
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/70 p-3">
                <p className="font-black text-zinc-900 dark:text-white mb-1">하는 일 (이것만 해요)</p>
                <ul className="list-disc pl-4 space-y-0.5 marker:text-purple-500">
                  <li>내 유튜브 재생목록 이름·개수 보기</li>
                  <li>새 재생목록 만들기 (기본은 비공개)</li>
                  <li>내가 고른 영상을 그 재생목록에 담기</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/70 p-3">
                <p className="font-black text-zinc-900 dark:text-white mb-1">하지 않는 일</p>
                <ul className="list-disc pl-4 space-y-0.5 marker:text-purple-500">
                  <li>이름·이메일·프로필·시청 기록·구독·댓글 등 재생목록 밖의 정보는 보지도, 모으지도 않아요</li>
                  <li>사이트 서버에 아무것도 보내거나 저장하지 않아요 (이 기기 브라우저가 구글과 바로 주고받음)</li>
                  <li>로그인 권한은 이 화면 메모리에만 1시간쯤 있다가 사라져요</li>
                </ul>
              </div>
              <p className="text-[length:calc(11.5px*var(--fs,1))] text-zinc-500 break-keep">구글이 보여 주는 권한 이름은 '유튜브 계정 관리'로 넓게 나오지만, 사이트는 위 세 가지에만 써요. 권한은 <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="underline font-bold text-purple-600">구글 계정 보안 설정</a>에서 언제든 거둘 수 있어요. 자세한 내용은 <a href="/privacy" target="_blank" rel="noreferrer" className="underline font-bold text-purple-600">개인정보처리방침</a> 2-다, 이용약관 제14조를 봐 주세요.</p>
            </div>
            <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-2">
              <Check on={age} set={setAge}>[필수] 만 14세 이상이에요</Check>
              <Check on={agree} set={setAgree}>[필수] 위 안내와 <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>YouTube 서비스 약관</a>·<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>Google 개인정보처리방침</a>에 동의해요</Check>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={close} className="py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-[length:calc(14px*var(--fs,1))] font-bold cursor-pointer">취소</button>
              <button type="button" disabled={!ok} onClick={() => { markYoutubeConsent(); const r = req; setReq(null); r?.onAgree(); }} className="py-3 rounded-2xl bg-purple-600 text-white text-[length:calc(14px*var(--fs,1))] font-bold cursor-pointer disabled:opacity-40">동의하고 구글 로그인</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
