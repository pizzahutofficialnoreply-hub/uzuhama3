import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/** 의견 보내기 › 자주 묻는 질문 (보내기 전에 먼저 찾아보기) */
export const FAQ: { q: string; a: string; tag: string }[] = [
  { tag: '방송', q: '방송 확률은 어떻게 계산하나요?', a: '지난 방송 기록(요일·시간대별 방송 횟수, 최근 흐름, 휴방 공지)으로 계산한 추정치예요. 실제 방송은 우주하마님이 정하니 참고로만 봐 주세요. 요약 화면의 "확률 계산 자세히 보기"에서 어떤 값이 반영됐는지 볼 수 있어요.' },
  { tag: '알림', q: '알림이 안 와요.', a: '1) 설정 › 알림에서 원하는 알림이 켜져 있는지 확인해 주세요.\n2) 휴대폰 설정에서 이 사이트(또는 브라우저)의 알림 권한이 켜져 있어야 해요.\n3) 아이폰은 사파리에서 공유 › "홈 화면에 추가"로 설치한 앱에서만 알림을 받을 수 있어요 (iOS 16.4 이상).\n4) 방해 금지·절전 모드면 늦게 오거나 안 올 수 있어요.' },
  { tag: '앱', q: '앱처럼 설치할 수 있나요?', a: '네. 안드로이드 크롬은 메뉴 › "앱 설치" 또는 "홈 화면에 추가", 아이폰 사파리는 공유 버튼 › "홈 화면에 추가"를 누르면 돼요. 설정 › 앱 설치에서 기기에 맞춘 안내를 볼 수 있어요.' },
  { tag: '기록', q: '방송 기록(날짜·게임·영상 링크)이 틀렸어요.', a: '그 영상이나 방송 카드의 ⋯ 메뉴 › 신고로 알려 주세요. 없는 방송을 새로 넣을 때는 의견 보내기 › 데이터 요청 › 방송 기록 추가를 써 주세요.' },
  { tag: 'AI', q: 'AI 요약·대사(스크립트)가 틀려요.', a: 'AI가 영상을 보고 자동으로 만든 거라 틀리거나 빠진 부분이 있을 수 있어요. 펼친 영상 화면의 ⋯ › 신고로 알려 주시면 고칠게요. 요약은 하루에 볼 수 있는 양이 정해져 있어서 새 영상은 며칠 걸릴 수 있어요.' },
  { tag: '화면', q: '화면이 예전 그대로이거나 이상해요.', a: '설정 › 새로고침을 눌러 주세요 (화면을 아래로 당겨도 같아요). 그래도 같으면 설정 › 캐시 삭제를 한 번 해 주세요. 그래도 안 되면 의견 보내기 › 앱 점검을 돌린 뒤 결과를 붙여서 보내 주시면 원인을 찾기 쉬워요.' },
  { tag: '기록', q: '시청 기록·내 재생목록이 사라졌어요.', a: '시청 기록, 내 재생목록, 가린 영상, 설정은 이 기기(브라우저)에만 저장돼요. 브라우저 데이터를 지우거나 다른 기기·브라우저에서 열면 보이지 않아요. 설정의 기기 간 동기화를 쓰면 다른 기기로 옮길 수 있어요.' },
  { tag: '계정', q: '로그인해야 쓸 수 있나요?', a: '아니요. 로그인 없이 모든 기능을 쓸 수 있어요. 로그인은 기기 간 동기화 같은 일부 기능에만 필요해요.' },
  { tag: '사이트', q: '공식 사이트인가요?', a: '우주하마님을 좋아하는 팬이 만든 비공식 사이트예요. 우주하마님·치지직·유튜브와는 관련이 없어요.' },
  { tag: '의견', q: '보낸 의견의 답변은 어디서 보나요?', a: '의견 보내기 › 내 의견 내역에서 볼 수 있어요. 새 답변이 생기면 앱을 열 때 아래에 "새 답변이 있어요" 알림이 떠요. 내역은 이 기기에만 저장돼요.' },
];

export function FeedbackFaq({ onAsk }: { onAsk: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const words = q.trim().split(/\s+/).filter(Boolean);
  const list = FAQ.map((f, i) => ({ ...f, i })).filter((f) => !words.length || words.every((w) => `${f.q} ${f.a} ${f.tag}`.includes(w)));
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <Search className="w-4 h-4 text-zinc-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="궁금한 것 찾기 (예: 알림)" className="flex-1 bg-transparent text-[14px] outline-none text-zinc-900 dark:text-white" />
      </label>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
        {list.map((f) => (
          <div key={f.i}>
            <button type="button" aria-expanded={open === f.i} onClick={() => setOpen(open === f.i ? null : f.i)} className="w-full flex items-center gap-2 px-4 py-3.5 text-left cursor-pointer">
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10.5px] font-black">{f.tag}</span>
              <span className="flex-1 text-[13.5px] font-bold text-zinc-900 dark:text-white break-keep">{f.q}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open === f.i ? 'rotate-180' : ''}`} />
            </button>
            {open === f.i && <p className="px-4 pb-4 -mt-1 text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line break-keep">{f.a}</p>}
          </div>
        ))}
        {!list.length && <p className="px-4 py-6 text-center text-[13px] text-zinc-500">찾는 질문이 없어요.</p>}
      </div>
      <button type="button" onClick={onAsk} className="w-full py-3 rounded-xl bg-purple-600 text-white text-[13px] font-bold cursor-pointer">찾는 답이 없으면 의견 보내기</button>
    </div>
  );
}
