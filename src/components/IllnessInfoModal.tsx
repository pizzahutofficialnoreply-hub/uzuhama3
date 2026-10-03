import React from 'react';
import { X, ExternalLink, Activity, BookOpen, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '../utils';

interface IllnessInfoModalProps {
  illnessName: string;
  summary?: string;
  source?: string;
  sourceUrl?: string;
  onClose: () => void;
}

// 자주 발생하는 일반적인 병명에 대한 공식 의학정보 기본 요약 사전 (출처: 국가건강정보포털 / 질병관리청)
const KNOWN_ILLNESS_MAP: Record<string, { summary: string; source: string; sourceUrl: string }> = {
  '독감': {
    summary: '인플루엔자 바이러스에 의한 **급성 호흡기 감염 질환**으로, <u>38도 이상의 고열</u>, 두통, 전신 근육통과 피로감이 급격히 동반됩니다. 충분한 휴식과 수분 섭취, 항바이러스제 복용이 필수적입니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '인플루엔자': {
    summary: '인플루엔자 바이러스에 의한 **급성 호흡기 감염 질환**으로, <u>38도 이상의 고열</u>, 두통, 전신 근육통과 피로감이 급격히 동반됩니다. 충분한 휴식과 수분 섭취, 항바이러스제 복용이 필수적입니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '감기': {
    summary: '바이러스에 의해 상부 호흡기에 발생하는 **급성 카타르성 염증**입니다. <u>인후통, 콧물, 기침</u> 등이 주 증상이며 충분한 수면과 휴식을 통해 면역력을 회복하는 것이 치료의 핵심입니다.',
    source: '국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '몸살': {
    summary: '과도한 피로, 면역 저하, 또는 바이러스 감염 초기 발생하는 **전신성 피로 및 근육통 상태**입니다. <u>전신 쇠약감과 발열감</u>이 발생하므로 신체 에너지 소모를 최소화하고 안정을 취해야 합니다.',
    source: '대한가정의학회',
    sourceUrl: 'https://www.kafm.or.kr'
  },
  '장염': {
    summary: '장 점막에 염증이 생기는 질환으로, <u>복통, 구토, 설사, 탈수 증상</u>을 유발합니다. **탈수 예방을 위한 이온음료/미온수 섭취**가 매우 중요하며, 자극적인 음식 섭취를 중단해야 합니다.',
    source: '질병관리청 국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '성대결절': {
    summary: '지속적인 음성 남용이나 무리한 발성으로 인해 성대 점막에 발생하는 **양성 증식성 병변**입니다. <u>쉰 목소리(애성)와 목의 건조감, 통증</u>이 발생하며, **음성 휴식(말하지 않기)**이 필수적인 치료법입니다.',
    source: '대한이비인후과학회',
    sourceUrl: 'https://www.korl.or.kr'
  },
  '후두염': {
    summary: '성대를 포함하는 후두 부위에 염증이 생기는 질환입니다. <u>목 통증, 쉰 목소리, 기침</u>이 동반되며, 목소리 사용을 최대한 자제하고 수분을 충분히 보충해야 합니다.',
    source: '국가건강정보포털',
    sourceUrl: 'https://health.kdca.go.kr'
  },
  '손목터널증후군': {
    summary: '수근관(손목 앞쪽 통로)이 좁아져 정중신경이 압박을 받는 질환입니다. <u>손가락 저림, 감각 이상, 손목 통증</u>이 나타나며, 마우스/키보드 등 손목 사용을 즉시 중단하고 고정 보호가 필요합니다.',
    source: '대한정형외과학회',
    sourceUrl: 'https://www.koa.or.kr'
  },
  '허리디스크': {
    summary: '척추 뼈 사이의 추간판이 탈출하여 신경을 압박하는 질환입니다. <u>요통과 다리 저림(방사통)</u>이 발생하며, 무리한 착석이나 구부정한 자세를 피하고 전문의 치료 및 절대 안정이 요구됩니다.',
    source: '대한척추신경외과학회',
    sourceUrl: 'https://www.neurospine.or.kr'
  },
  '이명': {
    summary: '외부 소리 자극이 없음에도 귀나 머릿속에서 소리가 들리는 증상입니다. 과도한 스트레스, 피로, 소음 노출 등이 원인이 될 수 있으며 <u>조용한 환경에서의 안정과 스트레스 완화</u>가 권장됩니다.',
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

  const summary = propSummary || known?.summary || `**${cleanName}** 증상으로 인한 신체 컨디션 저하 및 회복을 위해 일정이 조정되었습니다. <u>충분한 휴식과 안정</u>을 취하고 있습니다.`;
  const source = propSource || known?.source || '공식 보건의료 정보';
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' 증상 치료 원인')}`;

  const renderFormattedSummary = (text: string) => {
    // 줄글 형태 및 마크다운 **볼드**, <u>밑줄</u> 파싱
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
      // 볼드 파싱
      const parts = line.split(/(\*\*.*?\*\*|<u>.*?<\/u>)/g);
      return (
        <p key={lIdx} className="leading-relaxed mb-2 last:mb-0">
          {parts.map((p, pIdx) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={pIdx} className="text-zinc-900 dark:text-zinc-100 font-bold bg-amber-100/60 dark:bg-amber-900/30 px-1 py-0.5 rounded mx-0.5">{p.slice(2, -2)}</strong>;
            }
            if (p.startsWith('<u>') && p.endsWith('</u>')) {
              return <span key={pIdx} className="underline decoration-purple-500 underline-offset-3 font-semibold text-purple-700 dark:text-purple-300">{p.slice(3, -4)}</span>;
            }
            return <React.Fragment key={pIdx}>{p}</React.Fragment>;
          })}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-2xl p-6 relative overflow-hidden"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-200/80 dark:border-red-900/50 shadow-xs">
            <Activity className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="min-w-0 pr-8">
            <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block">휴방 사유 병명 안내</span>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white truncate">
              {cleanName}
            </h3>
          </div>
        </div>

        {/* Note Card Box */}
        <div className="bg-amber-50/70 dark:bg-zinc-950/80 border border-amber-200/80 dark:border-zinc-800 rounded-2xl p-4 sm:p-4.5 text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm shadow-inner relative mb-4">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 font-bold text-[11px] mb-2 pb-1.5 border-b border-amber-200/60 dark:border-zinc-800/80">
            <BookOpen className="w-3.5 h-3.5" />
            <span>핵심 건강 정보 요약 (Medical Note)</span>
          </div>
          <div className="font-sans leading-relaxed">
            {renderFormattedSummary(summary)}
          </div>
          {source && (
            <div className="mt-3 pt-2 border-t border-amber-200/40 dark:border-zinc-800/60 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
              <span>출처: <b>{source}</b></span>
            </div>
          )}
        </div>

        {/* Notice Info */}
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/50 text-[11px] text-zinc-500 dark:text-zinc-400 mb-5 leading-normal">
          <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <span>본 정보는 공식 보건의료기관 자료를 바탕으로 요약된 건강 상식 안내이며, 전문적인 의학적 진단이나 처방을 대신하지 않습니다.</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
          >
            <span>Google에서 자세히 보기</span>
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
