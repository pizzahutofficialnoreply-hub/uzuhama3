import React, { useEffect, useMemo, useState } from 'react';
import { addToYoutubePlaylist, createYoutubePlaylist, onYoutubeConfig, youtubeSaveEnabled } from '../../../utils/youtubeAccount';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, ArrowUp, Bookmark, Check, ChevronDown, Send, ExternalLink, ListVideo, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '../../../utils';
import { CollectionPanel } from '../../common/CollectionPanel';
import { VideoListRow } from '../../common/VideoListRow';
import { ShareButton } from '../../common/ShareButton';
import { GlassPlayButton, YoutubeLogo } from '../../common/MediaIcons';
import { useViewStyle } from '../../../hooks/useViewStyle';
import { VideoCard } from '../RecommendTab';
import { toast } from '../../common/ItemMenu';
import {
  deleteList, embedQueueUrl, exportLink, importList, parseImport, moveItem, removeFromList, renameList, setDefaultList, useMyPlaylists, youtubeQueueUrl, type MyList,
} from '../../../utils/myPlaylists';

/**
 * 재생목록 탭 맨 위: 내가 저장한 재생목록 (이 기기에만 있음)
 * - 펼치면 우주하마 채널 재생목록과 같은 모양 (모두 재생은 사이트 안에서 이어 재생)
 * - 유튜브에서 이어 보기: 유튜브가 임시 재생목록으로 열어 줌 → 거기서 '저장'하면 내 유튜브 재생목록으로
 */
const thumbOf = (l: MyList) => (l.items[0] ? `https://i.ytimg.com/vi/${l.items[0].id}/mqdefault.jpg` : '');
const urlOf = (kind: string, id: string) => (kind === 'short' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);

export function MyPlaylists({ searchTerm }: { searchTerm: string }) {
  const { lists, defaultListId } = useMyPlaylists();
  const [openId, setOpenId] = useState<string | null>(null);
  const term = searchTerm.trim().toLowerCase().replace(/\s+/g, '');
  const shown = useMemo(() => (term
    ? lists.filter((l) => l.name.toLowerCase().replace(/\s+/g, '').includes(term) || l.items.some((x) => x.title.toLowerCase().replace(/\s+/g, '').includes(term)))
    : lists), [lists, term]);

  if (!lists.length) {
    return term ? null : (
      <div className="mb-6 px-4 py-3.5 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
        <Bookmark className="w-4 h-4 text-purple-500 shrink-0" />
        <span className="flex-1">카드의 <b className="text-zinc-700 dark:text-zinc-200">⋮ › 저장</b>을 누르면 여기에 내 재생목록이 생겨요.</span>
        <ImportButton />
      </div>
    );
  }
  if (!shown.length) return null;

  return (
    <section className="mb-8">
      <div className="px-1 mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white flex items-center gap-1.5"><Bookmark className="w-4 h-4 text-purple-500" /> 내 재생목록 <span className="text-xs font-semibold text-zinc-400">이 기기에 저장돼요</span></h3>
        <ImportButton />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shown.map((l) => (
          <div key={l.id} className={cn(openId === l.id && 'col-span-full')}>
            <AnimatePresence mode="wait" initial={false}>
              {openId === l.id ? (
                <motion.div key="open" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
                  <MyListDetail list={l} isDefault={defaultListId === l.id} onClose={() => setOpenId(null)} />
                </motion.div>
              ) : (
                <motion.div key="card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
                  <MyListCard list={l} isDefault={defaultListId === l.id} onOpen={() => setOpenId(l.id)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

function shareTextOf(l: MyList) {
  return [`📂 ${l.name} (${l.items.length}개)`, '', ...l.items.map((x, i) => `${i + 1}. ${x.title}\n${urlOf(x.kind, x.id)}`)].join('\n');
}

function MyListCard({ list, isDefault, onOpen }: { list: MyList; isDefault: boolean; onOpen: () => void }) {
  const thumb = thumbOf(list);
  return (
    <div className="group relative h-full flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1">
      <button type="button" onClick={onOpen} className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer" title="재생목록 열기">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">아직 비어 있어요</span>}
        {thumb && <span className="absolute inset-0 bg-black/10 flex items-center justify-center"><GlassPlayButton /></span>}
        <span className="absolute bottom-2 left-2 text-xs px-2.5 py-1 font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow-md bg-zinc-900/85 text-white border border-white/20">
          <ListVideo className="w-3.5 h-3.5" /> 내 재생목록 ({list.items.length}개)
        </span>
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left cursor-pointer">
            <p className="font-bold text-zinc-900 dark:text-white truncate hover:text-purple-600 dark:hover:text-purple-400 transition-colors">{list.name}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{isDefault ? '저장을 누르면 바로 여기에 담겨요' : `마지막 수정 ${new Date(list.updatedAt).toLocaleDateString('ko-KR')}`}</p>
          </button>
          {list.items.length > 0 && <ShareButton className="-mr-1 -mt-0.5" getText={() => shareTextOf(list)} title={`${list.name} 재생목록`} />}
        </div>
        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs hover:scale-[1.01] bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-950/70 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200/90 dark:border-purple-800/90"
          >
            <span className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="font-bold text-purple-900 dark:text-purple-200">재생목록 영상 펼치기</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-200/90 dark:bg-purple-900/90 text-purple-800 dark:text-purple-200">{list.items.length}개</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MyListDetail({ list, isDefault, onClose }: { list: MyList; isDefault: boolean; onClose: () => void }) {
  const [viewStyle, setViewStyle] = useViewStyle('playlist');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const ids = list.items.filter((x) => x.kind !== 'short').map((x) => x.id);
  // 내 유튜브로 통째로 보내기 (관리자가 구글 클라이언트 ID 를 넣었을 때)
  const [ytOn, setYtOn] = useState(youtubeSaveEnabled());
  useEffect(() => onYoutubeConfig(() => setYtOn(youtubeSaveEnabled())), []);
  const [ytMsg, setYtMsg] = useState('');
  const sendToYoutube = async () => {
    if (!window.confirm(`'${list.name}' 이름으로 내 유튜브에 비공개 재생목록을 만들고 영상 ${ids.length}개를 담을까요?`)) return;
    try {
      setYtMsg('구글 로그인 중…');
      const p = await createYoutubePlaylist(list.name);
      let ok = 0;
      for (const id of ids) {
        setYtMsg(`담는 중 ${ok}/${ids.length}`);
        try { await addToYoutubePlaylist(p.id, id); ok++; } catch (e: any) { if (/한도/.test(String(e?.message))) throw e; }
      }
      setYtMsg(`내 유튜브에 '${p.title}' 재생목록을 만들었어요 (${ok}/${ids.length}개).`);
    } catch (e: any) { setYtMsg(String(e?.message || e)); }
  };
  const allIds = list.items.map((x) => x.id);

  return (
    <CollectionPanel
      ariaLabel={`${list.name} 재생목록`}
      thumbnail={thumbOf(list) || ''}
      title={list.name}
      channelTitle="나"
      showPublisher
      metaLine={`내 재생목록 · ${list.items.length}개${isDefault ? ' · 기본 저장 위치' : ''}`}
      embedSrc={embedQueueUrl(allIds)}
      playLabel="모두 재생"
      onClose={onClose}
      countLabel={`${list.items.length}개`}
      viewStyle={viewStyle}
      onViewStyleChange={setViewStyle}
    >
      <div className="flex flex-wrap items-center gap-2 px-1 mb-3">
        {editing ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { renameList(list.id, name); setEditing(false); } }} className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700" autoFocus />
            <button type="button" onClick={() => { renameList(list.id, name); setEditing(false); }} className="p-2 rounded-xl bg-purple-600 text-white cursor-pointer" aria-label="이름 저장"><Check className="w-4 h-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1 cursor-pointer"><Pencil className="w-3.5 h-3.5" /> 이름 바꾸기</button>
        )}
        {ids.length > 0 && (
          <a href={youtubeQueueUrl(ids)} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 text-xs font-bold flex items-center gap-1">
            <YoutubeLogo className="w-3.5 h-3.5" /> 유튜브에서 이어 보기 <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {ytOn && ids.length > 0 && (
          <button type="button" onClick={sendToYoutube} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer">
            <YoutubeLogo className="w-3.5 h-3.5" /> 내 유튜브 재생목록으로 만들기
          </button>
        )}
        <button type="button" onClick={() => setDefaultList(isDefault ? null : list.id)} className={cn('px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer', isDefault ? 'bg-purple-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800')}>
          {isDefault ? '기본 저장 위치 ✓' : '기본 저장 위치로'}
        </button>
        <button type="button" onClick={async () => {
          // 다른 기기(예: 사파리 ↔ 홈 화면 앱)로 옮기거나 친구에게 나눠 주기: 링크 하나로
          const link = exportLink(list);
          try {
            if (navigator.share) await navigator.share({ title: `${list.name} 재생목록`, text: `우주하마 방송 예측 재생목록 '${list.name}' (${list.items.length}개)`, url: link });
            else { await navigator.clipboard.writeText(link); toast('가져오기 링크를 복사했어요. 다른 기기에서 열면 돼요'); }
          } catch { /* 취소 */ }
        }} className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1 cursor-pointer"><Send className="w-3.5 h-3.5" /> 다른 기기로 옮기기·나눠 주기</button>
        <button type="button" onClick={() => { if (window.confirm(`'${list.name}' 재생목록을 지울까요?`)) { deleteList(list.id); onClose(); } }} className="ml-auto px-3 py-1.5 rounded-xl text-red-600 text-xs font-bold flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> 목록 지우기</button>
      </div>
      {ytMsg && <p className="px-1 -mt-1 mb-2 text-xs font-bold text-red-600">{ytMsg}</p>}
      {ids.length > 0 && <p className="px-1 -mt-1 mb-3 text-[11px] text-zinc-500">유튜브에서 이어 보기를 누르면 유튜브가 임시 재생목록으로 열어 줘요. 거기서 '저장'을 누르면 내 유튜브 재생목록이 돼요 (쇼츠 제외, 50개까지).</p>}

      {list.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">아직 담은 게 없어요. 카드의 저장 버튼을 눌러 보세요.</p>
      ) : viewStyle === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 px-1.5">
          {list.items.map((x) => (
            <VideoCard key={x.id} video={{ id: x.id, videoTitle: x.title, videoUrl: urlOf(x.kind, x.id), isLive: x.kind === 'live', category: '', allBroadcastDates: [] }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.items.map((x, i) => (
            <div key={x.id} className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <VideoListRow dense index={i + 1} videoId={x.id} title={x.title} href={urlOf(x.kind, x.id)} saveKind={x.kind} subline={x.kind === 'short' ? '쇼츠' : x.kind === 'live' ? '생방송' : undefined} />
              </div>
              <div className="flex flex-col shrink-0">
                <button type="button" disabled={i === 0} onClick={() => moveItem(list.id, x.id, -1)} className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 cursor-pointer" aria-label="위로"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" disabled={i === list.items.length - 1} onClick={() => moveItem(list.id, x.id, 1)} className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 cursor-pointer" aria-label="아래로"><ArrowDown className="w-3.5 h-3.5" /></button>
              </div>
              <button type="button" onClick={() => removeFromList(list.id, x.id)} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer shrink-0" aria-label="목록에서 빼기"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </CollectionPanel>
  );
}

/** 다른 기기에서 보낸 가져오기 링크·코드 붙여 넣기 */
function ImportButton() {
  return (
    <button type="button" onClick={() => {
      const raw = window.prompt('다른 기기에서 받은 재생목록 링크(또는 코드)를 붙여 넣어 주세요');
      if (!raw) return;
      const p = parseImport(raw);
      if (!p) { alert('읽을 수 없는 링크예요. 다시 복사해 주세요.'); return; }
      importList(p);
      toast(`'${p.name}' (${p.items.length}개)을 가져왔어요`);
    }} className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 cursor-pointer">가져오기</button>
  );
}
