import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useHiddenList, unhideVideo } from '../../utils/hiddenVideos';
import { SwipeRow } from '../common/SwipeRow';
import { toast } from '../../utils/ui';

/** 설정 › 맞춤 추천·시청 기록 › 숨긴 영상 (다시 보이게) */
export function HiddenVideosRow() {
  const list = useHiddenList();
  const [open, setOpen] = useState(false);
  const show = (id: string) => { unhideVideo(id); toast('다시 보이게 했어요', 'success'); };
  return (
    <div className="py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-start gap-2.5 text-left cursor-pointer">
        <EyeOff className="w-4 h-4 mt-0.5 text-zinc-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white">숨긴 영상 <span className="text-zinc-400 font-bold">{list.length}</span></p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">신고 버튼이나 ⋮ 메뉴에서 '이 영상 가리기'로 숨긴 영상이에요. 이 기기에서만 숨겨져요.</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-0.5 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {list.length === 0 ? (
              <p className="mt-2 pl-6.5 text-xs text-zinc-400">숨긴 영상이 없어요.</p>
            ) : (
              <ul className="mt-2 space-y-1.5" data-testid="hidden-videos">
                <AnimatePresence initial={false}>
                  {list.map((v) => (
                    <motion.li key={v.id} layout exit={{ opacity: 0, height: 0 }}>
                      <SwipeRow radius={14} label="숨긴 영상" right={[{ key: 'show', label: '보이기', icon: <Eye />, tone: 'bg-purple-600 text-white', onRun: () => show(v.id) }]}>
                        <div className="flex items-center gap-2.5 p-1.5 rounded-[14px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
                          <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" className="w-20 aspect-video rounded-lg object-cover bg-zinc-200 dark:bg-zinc-800 shrink-0 blur-[1px] grayscale" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-2 break-keep">{v.title || v.id}</p>
                            <p className="text-[10.5px] text-zinc-400">{new Date(v.at).toLocaleDateString('ko-KR')} 숨김</p>
                          </div>
                          <button type="button" onClick={() => show(v.id)} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer">다시 보이기</button>
                        </div>
                      </SwipeRow>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
