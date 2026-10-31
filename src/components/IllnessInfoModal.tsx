import React from 'react';
import { X, ExternalLink, Activity, BookOpen, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useBodyScrollLock } from '../utils';

interface IllnessInfoModalProps {
  illnessName: string;
  summary?: string;
  source?: string;
  sourceUrl?: string;
  onClose: () => void;
}

// 자주 발생하는 일반적인 병명에 대한 공식 의학정보 기본 요약 사전 (구글 검색 AI 개요 양식)
const KNOWN_ILLNESS_MAP: Record<string, { summary: string; source: string; sourceUrl: string }> = {
  '독감': {
    summary: '독감(인플루엔자)은 인플루엔자 바이러스에 의한 급성 호흡기 감염 질환입니다. 38도 이상의 갑작스러운 고열, 두통, 전신 근육통과 피로감이 급격히 동반됩니다. 충분한 휴식과 수분 섭취, 항바이러스제 복용이 필수적입니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '인플루엔자': {
    summary: '인플루엔자(독감)는 인플루엔자 바이러스에 의한 급성 호흡기 감염 질환입니다. 38도 이상의 갑작스러운 고열, 두통, 전신 근육통과 피로감이 급격히 동반됩니다. 충분한 휴식과 수분 섭취, 항바이러스제 복용이 필수적입니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '감기': {
    summary: '바이러스에 의해 상부 호흡기에 발생하는 급성 카타르성 염증입니다. 인후통, 콧물, 기침 등이 주 증상이며 충분한 수면과 휴식을 통해 면역력을 회복하는 것이 치료의 핵심입니다.',
    source: '국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '몸살': {
    summary: '과도한 피로, 면역 저하 또는 감염 초기 발생하는 전신성 피로 및 근육통 상태입니다. 전신 쇠약감과 발열감이 발생하므로 신체 에너지 소모를 최소화하고 안정을 취해야 합니다.',
    source: '대한가정의학회',
    sourceUrl: 'https://www.kafm.or.kr'
  },
  '장염': {
    summary: '장 점막에 염증이 생기는 질환으로 복통, 구토, 설사, 탈수 증상을 유발합니다. 탈수 예방을 위한 이온음료/미온수 섭취가 매우 중요하며, 자극적인 음식 섭취를 중단하고 휴식이 필요합니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '성대결절': {
    summary: '지속적인 음성 남용이나 무리한 발성으로 인해 성대 점막에 발생하는 양성 결절 질환입니다. 쉰 목소리와 목의 건조감, 통증이 발생하며 말을 하지 않는 음성 휴식이 필수적인 치료법입니다.',
    source: '대한이비인후과학회',
    sourceUrl: 'https://www.korl.or.kr'
  },
  '후두염': {
    summary: '성대를 포함하는 후두 부위에 염증이 생기는 질환입니다. 목 통증, 쉰 목소리, 기침이 동반되며 목소리 사용을 최대한 자제하고 수분을 충분히 보충해야 합니다.',
    source: '국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '손목터널증후군': {
    summary: '수근관(손목 앞쪽 통로)이 좁아져 정중신경이 압박을 받는 질환입니다. 손가락 저림, 감각 이상, 손목 통증이 나타나며 마우스/키보드 등 손목 사용을 즉시 중단하고 고정 보호가 필요합니다.',
    source: '대한정형외과학회',
    sourceUrl: 'https://www.koa.or.kr'
  },
  '허리디스크': {
    summary: '척추 뼈 사이의 추간판이 탈출하여 신경을 압박하는 질환입니다. 요통과 다리 저림이 발생하며 무리한 착석이나 구부정한 자세를 피하고 전문의 치료 및 절대 안정이 요구됩니다.',
    source: '대한척추신경외과학회',
    sourceUrl: 'https://www.neurospine.or.kr'
  },
  '이명': {
    summary: '외부 소리 자극이 없음에도 귀나 머릿속에서 소리가 들리는 증상입니다. 과도한 스트레스, 피로, 소음 노출 등이 원인이 될 수 있으며 조용한 환경에서의 안정과 스트레스 완화가 권장됩니다.',
    source: '국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  }
};

export function IllnessInfoModal({
  illnessName,
  summary: propSummary,
  source: propSource,
  sourceUrl: propSourceUrl,
  onClose
}: IllnessInfoModalProps) {
  useBodyScrollLock(true);

  const cleanName = illnessName.trim();
  const known = KNOWN_ILLNESS_MAP[cleanName] || Object.entries(KNOWN_ILLNESS_MAP).find(([key]) => cleanName.includes(key))?.[1];

  const summary = propSummary || known?.summary || `${cleanName} 증상으로 인한 신체 컨디션 저하 및 건강 회복을 위해 일정이 조정되었습니다. 충분한 휴식과 안정을 취하고 있습니다.`;
  const source = propSource || known?.source || '공식 보건의료 정보';
  const effectiveSourceUrl = propSourceUrl || known?.sourceUrl || '';

  const renderFormattedSummary = (text: string) => {
    if (!text) return null;
    // raw HTML 태그 제거
    const cleanText = text
      .replace(/<\/?(u|b|strong|em|p|span|div|br)[^>]*>/gi, '')
      .trim();

    const lines = cleanText.split('\n');
    return lines.map((line, lIdx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return <div key={lIdx} className="h-2" />;

      // 불릿 기호 처리 (- or * or •)
      const isBullet = /^[*\-•]\s+/.test(trimmedLine);
      const content = isBullet ? trimmedLine.replace(/^[*\-•]\s+/, '') : trimmedLine;

      // 마크다운 헤더 (### or ##)
      const isHeader = /^#{1,4}\s+/.test(trimmedLine);
      const headerContent = isHeader ? trimmedLine.replace(/^#{1,4}\s+/, '') : content;

      if (isHeader) {
        return (
          <h4 key={lIdx} className="font-extrabold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 mt-2.5 mb-1 text-left">
            {headerContent}
          </h4>
        );
      }

      const parts = headerContent.split(/(\*\*.*?\*\*)/g);

      return (
        <div key={lIdx} className={`text-left leading-relaxed mb-2 last:mb-0 flex items-start gap-1.5 ${isBullet ? 'pl-2' : ''}`}>
          {isBullet && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mt-2 shrink-0" />
          )}
          <p className="flex-1 text-left text-zinc-700 dark:text-zinc-300">
            {parts.map((p, pIdx) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return (
                  <strong key={pIdx} className="text-zinc-900 dark:text-zinc-100 font-bold bg-amber-100/70 dark:bg-amber-900/40 px-1 py-0.5 rounded mx-0.5">
                    {p.slice(2, -2)}
                  </strong>
                );
              }
              return <React.Fragment key={pIdx}>{p}</React.Fragment>;
            })}
          </p>
        </div>
      );
    });
  };

  return (
    <div 
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.98 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="w-full sm:max-w-xl h-[92vh] sm:h-auto sm:max-h-[85vh] bg-white dark:bg-zinc-900 border-t sm:border border-zinc-200 dark:border-zinc-800 rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden text-left relative"
      >
        {/* 새 창 헤더 (상단 고정, 스크롤해도 닫기 X 버튼이 절대 사라지지 않음) */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-5 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3.5 sm:py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2 text-left">
            <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-200/80 dark:border-red-900/50 shadow-xs">
              <Activity className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-bold text-red-600 dark:text-red-400 tracking-tight">
                  휴방 사유 병명 안내
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-900/40 font-semibold">
                  의학 정보
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-white truncate">
                {cleanName}
              </h2>
            </div>
          </div>

          {/* 항상 노출되는 고정 닫기 (X) 버튼 */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-200 transition-colors cursor-pointer shrink-0"
            title="창 닫기"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
        </header>

        {/* 본문 스크롤 영역 (왼쪽 정렬, 내용이 아무리 길어도 내부 스크롤로 안전하게 열람 가능) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-4 text-left">
          {/* 핵심 정보 카드 (공식 의학 정보 / 국가건강정보포털 포맷) */}
          <div className="bg-amber-50/70 dark:bg-zinc-950/70 border border-amber-200/80 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm shadow-xs relative text-left">
            <div className="flex items-center justify-between text-amber-800 dark:text-amber-400 font-bold text-[11px] sm:text-xs mb-3 pb-2 border-b border-amber-200/60 dark:border-zinc-800/80 text-left">
              <div className="flex items-center gap-1.5 text-left">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>핵심 건강 정보 요약 (Medical Note)</span>
              </div>
              <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-normal">
                공식 요약
              </span>
            </div>

            {/* 왼쪽 정렬 본문 요약 */}
            <div className="font-sans leading-relaxed text-left">
              {renderFormattedSummary(summary)}
            </div>

            {/* 공식 출처 표기 */}
            {source && (
              <div className="mt-4 pt-2.5 border-t border-amber-200/50 dark:border-zinc-800/70 text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center justify-between flex-wrap gap-2 text-left">
                <div className="flex items-center gap-1 text-left">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  <span>공식 출처: <b className="text-zinc-900 dark:text-zinc-200">{source}</b></span>
                </div>
                {effectiveSourceUrl && (
                  <a
                    href={effectiveSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 text-[11px] font-medium"
                  >
                    <span>기관 사이트 바로가기</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* 주의 안내 박스 */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/60 text-[11.5px] text-zinc-600 dark:text-zinc-400 leading-relaxed text-left border border-zinc-200/60 dark:border-zinc-700/50">
            <ShieldAlert className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <span className="text-left">
              본 정보는 보건의료기관 공식 자료를 바탕으로 요약된 건강 안내 정보이며, 전문 의료진의 진료나 처방을 대신하지 않습니다.
            </span>
          </div>
        </div>

        {/* 하단 고정 액션 바 */}
        <footer className="sticky bottom-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-5 py-3.5 sm:p-5 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:pb-5 border-t border-zinc-200/80 dark:border-zinc-800/80 flex shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 font-bold text-sm transition-colors cursor-pointer text-center shadow-sm"
          >
            확인
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
