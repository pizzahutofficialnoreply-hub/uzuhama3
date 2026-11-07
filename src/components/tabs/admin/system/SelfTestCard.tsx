import React from 'react';
import { ListChecks, ExternalLink } from 'lucide-react';

/** 관리자 > 자동화: 화면·기능 전체 점검 (손으로 돌리기) */
export function SelfTestCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">화면·기능 전체 점검 (수동)</h3>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed break-keep">
        사이트를 안쪽 창에 띄우고 사람이 누르는 순서대로 눌러 봐요: 홈 → 아래 탭 이동 → 달력에서 방송한 날 칸 → 그날 기록·링크 → 달 넘기기 → 분석 하위 탭 → 카테고리 표 게임 → 검색 → ⋮ AI 요약·저장 창 → 설정 항목 → 시청 기록 → 패치노트 글·버전 주소 → 약관·개인정보 → 없는 주소 → 서버 API·DB 읽기·보안.
        화면마다 가로 넘침·깨진 이미지·이름 없는 버튼·화면 오류도 봐요. 지금 쓰는 이 휴대폰·PC에서 그대로 돌아가서 실제 기기 점검이 돼요. 점검 중이어도 돌아가고, 이 기기의 설정·기록은 끝나면 그대로 돌려놔요. 같은 점검이 주간 자동 점검 때도 돌아요.
      </p>
      <a href="/selftest" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
        전체 점검 열기 <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
