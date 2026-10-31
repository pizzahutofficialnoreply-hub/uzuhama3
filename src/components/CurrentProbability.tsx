import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { BroadcastLog, SystemConfig } from "../types";
import {
  PlayCircle,
  X,
  AlertCircle,
  Clock,
  ChevronRight,
  Tv,
  Radio,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Activity,
  Hourglass,
  Moon,
  Coffee,
} from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { cn, attachKoreanParticle } from "../utils";
import { computeBroadcastProbability, formatClockMinute, kstParts } from "../utils/probability";
import { extractYoutubeId } from "../utils/urlUtils";
import { motion, AnimatePresence } from "motion/react";
import { IllnessInfoModal } from "./IllnessInfoModal";

import { WidgetShareButton } from "./common/WidgetShareButton";

const ChzzkIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    fill="currentColor"
    className={className}
  >
    <path d="M 44.5 19 H 63 L 56.25 28 H 76.25 L 50.75 62 H 74 V 77 H 21 L 46.5 43 H 26.5 Z" />
  </svg>
);

export function CurrentProbability({
  logs = [],
  onProbChange,
  system,
  onNavigateToRecommend,
}: {
  logs?: BroadcastLog[];
  onProbChange?: (prob: number) => void;
  system?: SystemConfig;
  onNavigateToRecommend?: (category?: string, searchTerm?: string, pinnedVideoId?: string) => void;
}) {
  const streamLogs = logs.filter((l) => !l.isAbsence);
  const absenceLogs = logs.filter((l) => l.isAbsence);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveData, setLiveData] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showIllnessModal, setShowIllnessModal] = useState(false);

    const handleViewDetails = () => {
    setShowDetails(!showDetails);
    if (!showDetails) {
      // when opening
      const done = localStorage.getItem("uzuhama_survey_done");
      if (!done) {
        const nextTimeStr = localStorage.getItem("uzuhama_survey_next_time");
        const nextTime = nextTimeStr ? parseInt(nextTimeStr, 10) : 0;
        if (Date.now() > nextTime) {
          
          // setTimeout(() => , 30000); // 30s auto-close
          // Check again in 1 hour if ignored
          localStorage.setItem(
            "uzuhama_survey_next_time",
            (Date.now() + 60 * 60 * 1000).toString(),
          );
        }
      }
    }
  };

  const submitSurvey = () => {
    localStorage.setItem("uzuhama_survey_done", "true");
    
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000 * 60);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "live_status", "c6e1c8cf1b128bd321cc2684c92b5a00"),
      (snap) => {
        if (snap.exists()) {
          setLiveData(snap.data());
        }
      },
      (e) => {
        // Ignore offline/unavailable errors since they are common
        if (
          e.code === "unavailable" ||
          (e.message && e.message.includes("offline"))
        ) {
          console.warn(
            "Firestore is currently offline or unavailable, using cached live status if available.",
          );
        } else {
          console.error("Failed to listen to live status:", e);
        }
      },
    );

    return () => unsubscribe();
  }, []);

  const sortedLogs = [...streamLogs].sort(
    (a, b) =>
      new Date(`${b.date}T${b.time}`).getTime() -
      new Date(`${a.date}T${a.time}`).getTime(),
  );
  const recentLog = sortedLogs[0];
  let recentInfo = null;
  let recentEndTime: Date | null = null;
  let recentDuration = 0;

  if (recentLog) {
    const logTime = new Date(`${recentLog.date}T${recentLog.time}`);
    recentDuration = recentLog.durationHours || 0;
    recentEndTime = recentLog.endTime
      ? new Date(`${recentLog.date}T${recentLog.endTime}`)
      : new Date(logTime.getTime() + recentDuration * 60 * 60 * 1000);
    if (recentLog.endTime && recentEndTime.getTime() < logTime.getTime()) {
      recentEndTime = new Date(recentEndTime.getTime() + 24 * 60 * 60 * 1000);
    }
    const hoursSinceEnd =
      (currentTime.getTime() - recentEndTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceEnd >= 0 && hoursSinceEnd <= 12) {
      recentInfo = `직전 방송: ${recentLog.vods[0]?.title || recentLog.game} (${Math.floor(hoursSinceEnd)}시간 전 종료)`;
    } else if (hoursSinceEnd < 0) {
      recentInfo = `직전 방송: ${recentLog.vods[0]?.title || recentLog.game} (진행 중이거나 방금 종료)`;
    }
  }

  const currentDayName = ["일", "월", "화", "수", "목", "금", "토"][kstParts(currentTime).dow];
  const isLive = liveData?.status === "OPEN";

  // 추천 영상 후보군 추출 (영상 제목 등은 노출하지 않고 '이 영상' 텍스트 클릭 시 맨 위로 띄움)
  const candidateVideos = useMemo(() => {
    const list: string[] = [];
    logs.forEach((l) => {
      if (Array.isArray(l.edited)) {
        l.edited.forEach((e) => {
          if (!e.isCompilation && !e.compilationId) {
            const ytId = extractYoutubeId(e.url);
            if (ytId && !list.includes(ytId)) {
              list.push(ytId);
            }
          }
        });
      }
    });
    return list;
  }, [logs]);

  const [randomVideoId, setRandomVideoId] = useState<string | null>(null);
  useEffect(() => {
    if (candidateVideos.length > 0) {
      const idx = Math.floor(Math.random() * candidateVideos.length);
      setRandomVideoId(candidateVideos[idx]);
    }
  }, [candidateVideos]);

  // ── 확률 엔진 (utils/probability.ts: 메인 카드 · 자세히 보기 · 알림 공통) ──
  const prob = useMemo(
    () => computeBroadcastProbability(logs, currentTime, { system, isLive }),
    [logs, currentTime, system, isLive],
  );
  const finalProb = prob.finalProb;
  const daysSinceLastStream = prob.gap.daysSince ?? 0;
  const hasStreamedToday = prob.pattern.state === "streamedToday";
  const isAbsencePeriod = prob.pattern.state === "absence";

  // ── 상태 메시지 ──
  let patternMessage = "";
  const isIllness = system?.absenceReason === "병명";
  const activeIllnessName = isIllness ? (system?.illnessName || system?.diseaseName) : undefined;
  const absenceDisplayReason =
    system?.absenceReason === "기타 (직접 입력)" || system?.absenceReason === "직접 입력"
      ? system?.customAbsenceReason || ""
      : isIllness
        ? activeIllnessName || "건강 문제"
        : system?.absenceReason || "";

  if (hasStreamedToday) {
    patternMessage = "오늘 이미 방송을 진행했습니다.";
  } else if (isAbsencePeriod) {
    const lead = daysSinceLastStream >= 2 ? `${daysSinceLastStream}일째 ` : "";
    patternMessage = absenceDisplayReason
      ? `${lead}${attachKoreanParticle(absenceDisplayReason, "으로/로")} 휴방 중입니다.${system?.absenceDuration ? ` (예상: ${system.absenceDuration})` : ""}`
      : `${lead}예정된 휴방 기간입니다.`;
  } else if (daysSinceLastStream >= 3) {
    patternMessage = `${daysSinceLastStream}일 연속 미방송 중입니다.`;
  } else if (daysSinceLastStream === 2) {
    patternMessage = "2일째 미방송: 평소엔 이 간격 뒤에 방송이 잦았어요.";
  } else if (daysSinceLastStream === 1) {
    patternMessage = "어제 방송을 진행했습니다.";
  }

  useEffect(() => {
    onProbChange?.(isLive ? 100 : finalProb);
  }, [finalProb, isLive, onProbChange]);

  // 15분 단위로 안정적으로 유지되면서도 시간대별로 다채롭게 전환되는 시드 인덱스
  const timeSlotSeed = (currentTime.getHours() * 4 + Math.floor(currentTime.getMinutes() / 15) + currentTime.getDate()) % 15;

  const peakFormattedTime =
    prob.time.peakMinute !== null ? formatClockMinute(prob.time.peakMinute) : "";
  const likelyTimeInfo = !prob.time.hasData
    ? "시간 기록이 부족하여 유력 시간을 분석 중입니다."
    : prob.dayProb < 10
      ? ""
      : prob.time.peakIsToday
        ? `오늘 유력 시간: ${peakFormattedTime}`
        : `다음 유력 시간: 내일 ${peakFormattedTime}`;

  let probabilityLevel: "high" | "medium" | "low" = "low";
  if (prob.next2hProb >= 30 || finalProb >= 50) probabilityLevel = "high";
  else if (prob.next2hProb >= 12 || finalProb >= 20) probabilityLevel = "medium";

  // 시간대 구분 (한국 시간)
  const currentHour = Math.floor(kstParts(currentTime).minute / 60);
  const isLateNight = currentHour >= 23 || currentHour < 7;
  const isEarlyDay = currentHour >= 7 && currentHour < 17;

  // 추천 영상 클릭 멘트: 영상 제목 등 불필요한 정보 없이 '이 영상' 텍스트에 밑줄만 적용
  const renderRecommendSpan = () => (
    <span>
      지금은 잠시{" "}
      <button
        type="button"
        onClick={() => {
          if (randomVideoId) {
            onNavigateToRecommend?.(undefined, undefined, randomVideoId);
          } else {
            onNavigateToRecommend?.();
          }
        }}
        className="underline underline-offset-4 decoration-current font-extrabold hover:opacity-80 transition-opacity cursor-pointer inline"
        title="클릭하여 추천 영상 보기"
      >
        이 영상
      </button>{" "}
      보시면서 휴식 어떠세요?
    </span>
  );

  // 자연스럽고 따뜻한 멘트 목록 (우주하마 개인 사정 자의적 추측 배제, 너무 딱딱하지 않은 어조)
  let messageContent: React.ReactNode = "";

  if (prob.pattern.state === "noData") {
    messageContent = "방송 기록이 없어 확률을 분석 중입니다.";
  } else if (hasStreamedToday) {
    messageContent = renderRecommendSpan();
  } else if (probabilityLevel === "high") {
    const HIGH_OPTIONS = [
      "슬슬 기대해볼 만한 시간이에요! ✨",
      "언제 켜져도 이상하지 않은 시간이에요",
      "조금만 더 지켜볼까요?",
      "알림에 귀 기울여볼 시간이에요 🔔",
      "기분 좋은 기대감을 가져볼 시간이에요",
      "오늘 방송 시작이 가장 유력한 시간대예요",
      "설레는 마음으로 조금만 지켜봐요"
    ];
    messageContent = HIGH_OPTIONS[timeSlotSeed % HIGH_OPTIONS.length];
  } else if (probabilityLevel === "medium") {
    const MEDIUM_OPTIONS = [
      "조금씩 기대감이 차오르는 시간이에요",
      "조금만 더 지켜볼까요?",
      "기습 방송이 찾아올지도 몰라요!",
      renderRecommendSpan(),
      "여유롭게 방송을 기다려보는 건 어떨까요?",
      "차분히 기대감을 열어둘 시간이에요"
    ];
    messageContent = MEDIUM_OPTIONS[timeSlotSeed % MEDIUM_OPTIONS.length];
  } else {
    // Low probability
    if (isLateNight) {
      const LATE_OPTIONS = [
        "시간이 늦었으니 편안한 밤 보내세요",
        "늦은 시간이라 편안한 휴식을 추천해요",
        renderRecommendSpan(),
        "오늘 하루도 고생 많으셨어요, 편안한 밤 되세요",
        renderRecommendSpan()
      ];
      messageContent = LATE_OPTIONS[timeSlotSeed % LATE_OPTIONS.length];
    } else if (isEarlyDay) {
      const DAY_OPTIONS = [
        renderRecommendSpan(),
        "오늘은 느긋하게 기다려봐요",
        "차분하게 여유를 즐겨보는 건 어떨까요?",
        "아직은 여유로운 시간이에요",
        renderRecommendSpan()
      ];
      messageContent = DAY_OPTIONS[timeSlotSeed % DAY_OPTIONS.length];
    } else {
      const LOW_OPTIONS = [
        renderRecommendSpan(),
        "조금 더 지켜보는 건 어떨까요?",
        "오늘은 느긋하게 기다려봐요",
        "차분하게 여유를 즐겨보는 건 어떨까요?",
        renderRecommendSpan()
      ];
      messageContent = LOW_OPTIONS[timeSlotSeed % LOW_OPTIONS.length];
    }
  }


  const getStatusColor = (level: string) => {
    switch (level) {
      case "high":
        return "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-400/10 border-purple-200 dark:border-purple-400/30";
      case "medium":
        return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/30";
      case "low":
        return "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-400/10 border-zinc-200 dark:border-zinc-400/30";
      default:
        return "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-400/10 border-zinc-200 dark:border-zinc-400/30";
    }
  };

  if (liveData?.status === "OPEN") {
    return (
      <div id="current-prob-live-card" className="bg-white dark:bg-zinc-900 border-2 border-red-500 dark:border-red-500/50 rounded-[24px] p-6 sm:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center">
        <div className="absolute top-4 right-4 z-20">
          <WidgetShareButton targetId="current-prob-live-card" title="생방송 진행 중" />
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 dark:bg-red-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>

        <div className="relative z-10 flex flex-col items-center gap-4 w-full">
          <div className="animate-pulse bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-1.5 rounded-full font-black tracking-widest text-sm flex items-center gap-2 border border-red-200 dark:border-red-800/50">
            <Radio className="w-4 h-4" />
            LIVE NOW
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-red-600 dark:text-red-400 leading-tight px-4 break-keep">
            우주하마 생방송!
          </h2>
          <p className="text-lg sm:text-xl font-bold text-zinc-800 dark:text-zinc-200 mt-2 break-keep max-w-2xl">
            {liveData.liveTitle}
          </p>

          <div className="flex flex-col items-center gap-1">
            <div className="text-red-600 dark:text-red-400 font-bold text-lg bg-red-50 dark:bg-red-900/10 px-4 py-1 rounded-lg border border-red-100 dark:border-red-900/20">
              {liveData.liveCategoryValue}
            </div>
            {liveData.openDate && (
              <p className="mt-2 text-red-700 dark:text-red-300 text-sm font-medium">
                방송 시작:{" "}
                {format(
                  new Date(liveData.openDate.replace(" ", "T")),
                  "a h:mm",
                  {
                    locale: ko,
                  },
                )}
              </p>
            )}
          </div>

          <a
            href="https://chzzk.naver.com/live/c6e1c8cf1b128bd321cc2684c92b5a00"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 bg-zinc-900 dark:bg-black border border-emerald-600/50 hover:bg-emerald-900/30 text-emerald-400 font-bold text-lg py-4 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
          >
            <ChzzkIcon className="w-5 h-5" />
            치지직 방송 보러가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div id="current-prob-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-6 sm:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center">
      <div className="absolute top-4 right-4 z-20">
        <WidgetShareButton targetId="current-prob-card" title="현재 방송 확률" />
      </div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>

      

      <div className="relative z-10 flex flex-col items-center gap-2">
        <h2 className="text-zinc-500 dark:text-zinc-400 text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {format(currentTime, "M월 d일 (E) a h:mm", { locale: ko })}
        </h2>

        <div className="mt-4 mb-2">
          <p className="text-zinc-500 dark:text-zinc-400 text-base font-medium mb-1">
            현재 방송 켜질 확률
          </p>
          <div 
            className="text-7xl sm:text-8xl font-black text-zinc-900 dark:text-white tracking-[0.02em] sm:tracking-[0.025em] pl-0.5"
            style={{ WebkitTextStroke: '0.95px currentColor' }}
          >
            {finalProb.toFixed(1)}
            <span className="text-4xl sm:text-5xl ml-1 tracking-normal font-bold" style={{ WebkitTextStroke: '0.45px currentColor' }}>%</span>
          </div>
          {peakFormattedTime && prob.time.hasData && (
            <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium font-hanna font-pro">
              {prob.time.peakIsToday ? "오늘 가장 유력한 시간" : "다음 유력 시간 · 내일"}{" "}
              <span className="font-bold text-purple-600 dark:text-purple-400">{peakFormattedTime}</span>
            </p>
          )}
        </div>


        {patternMessage && (() => {
          const isIllness = system?.absenceReason === '병명';
          const activeIllness = isIllness ? (system?.illnessName || system?.diseaseName) : undefined;
          if (activeIllness && patternMessage.includes(activeIllness)) {
            const parts = patternMessage.split(activeIllness);
            return (
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg border border-purple-100 dark:border-purple-800/30 mt-1 mb-2 text-center leading-relaxed">
                {parts[0]}
                <button
                  type="button"
                  onClick={() => setShowIllnessModal(true)}
                  className="font-bold underline decoration-purple-500 underline-offset-4 text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 cursor-pointer mx-0.5 transition-colors"
                  title="클릭 시 병명 의학 정보 확인"
                >
                  {activeIllness}
                </button>
                {parts.slice(1).join(activeIllness)}
              </p>
            );
          }

          return (
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1.5 rounded-lg border border-purple-100 dark:border-purple-800/30 mt-1 mb-2 text-center leading-relaxed">
              {patternMessage}
            </p>
          );
        })()}

        <div
          className={cn(
            "px-5 py-2 mt-2 rounded-2xl border flex items-center justify-center gap-2 font-bold text-sm sm:text-base font-hanna font-pro text-center max-w-full break-keep",
            getStatusColor(probabilityLevel),
          )}
        >
          {probabilityLevel === "high" ? (
            <Radio className="w-5 h-5 animate-pulse shrink-0" />
          ) : probabilityLevel === "medium" ? (
            <Hourglass className="w-5 h-5 shrink-0" />
          ) : isLateNight ? (
            <Moon className="w-5 h-5 shrink-0" />
          ) : (
            <Coffee className="w-5 h-5 shrink-0" />
          )}
          <span className="font-hanna font-pro font-bold tracking-tight">{messageContent}</span>
        </div>

        {recentInfo && (
          <div className="mt-3 text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700/50">
            {recentInfo}
          </div>
        )}
      </div>

      <div className="mt-4 w-full relative z-10 flex flex-col items-center">
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          확률 계산 자세히 보기
          {showDetails ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 16 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              className="overflow-hidden w-full border-t border-zinc-100 dark:border-zinc-800/80"
            >
              <div className="pt-5 pb-1 w-full max-w-md mx-auto text-left">
                {(() => {
                  const delta = (to: number, from: number) => {
                    const d = Math.round((to - from) * 10) / 10;
                    if (Math.abs(d) < 0.1) return null;
                    return (
                      <span className={cn("text-[11px] font-semibold tabular-nums", d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400")}>
                        {d > 0 ? "+" : ""}{d.toFixed(1)}%p
                      </span>
                    );
                  };
                  const st = prob.steps;
                  const rows: { label: string; sub: string; value: number; prev?: number; deltaValue?: number }[] = [
                    {
                      label: `${currentDayName}요일 방송 비율`,
                      sub: `최근 60일 ${currentDayName}요일 ${prob.weekday.recentCount}/${prob.weekday.recentOccurrences}회 방송`,
                      value: st.weekday,
                    },
                    {
                      label: "방송 간격",
                      sub: prob.gap.daysSince === null ? "방송 기록 없음" : `마지막 방송 ${prob.gap.daysSince}일 전`,
                      value: st.afterGap,
                      prev: st.weekday,
                    },
                    {
                      label: "휴방 · 오늘 방송 여부",
                      sub: prob.pattern.label,
                      value: st.day,
                      prev: st.afterGap,
                    },
                    {
                      label: "남은 시간대",
                      sub: prob.time.hasData
                        ? `평소 방송 시작 시각의 ${prob.time.remainingShare.toFixed(0)}%가 아직 남음`
                        : "시작 시각 기록 부족 (기본값 사용)",
                      value: finalProb,
                      deltaValue: st.final,
                      prev: st.day,
                    },
                  ];
                  return (
                    <>
                      <div className="rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/40 divide-y divide-zinc-200/70 dark:divide-zinc-700/50">
                        {rows.map((r, i) => {
                          const isLast = i === rows.length - 1;
                          return (
                            <div key={r.label} className={cn("flex items-center gap-3 px-4 py-3", isLast && "bg-purple-50/80 dark:bg-purple-950/30")}>
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-[13px] font-semibold", isLast ? "text-purple-700 dark:text-purple-300" : "text-zinc-900 dark:text-zinc-100")}>{r.label}</p>
                                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-snug break-keep">{r.sub}</p>
                              </div>
                              <div className="flex flex-col items-end shrink-0">
                                <span className={cn("text-[16px] font-black tabular-nums", isLast ? "text-purple-600 dark:text-purple-400" : "text-zinc-900 dark:text-white")}>
                                  {!isLast && r.value < 0.1 ? "0.1% 미만" : `${r.value.toFixed(1)}%`}
                                </span>
                                {r.prev !== undefined && delta(r.deltaValue ?? r.value, r.prev)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="px-1 pt-2.5 text-[11px] text-zinc-400 leading-relaxed break-keep">
                        위에서부터 차례로 반영한 결과이며, 마지막 값이 지금 이후 오늘(오전 6시 기준) 방송이 켜질 확률입니다.
                      </p>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showIllnessModal && system?.absenceReason === '병명' && (system?.illnessName || system?.diseaseName) && (
          <IllnessInfoModal
            illnessName={(system.illnessName || system.diseaseName)!}
            summary={system.illnessSummary || system.diseaseSummary}
            source={system.illnessSource || system.diseaseSource}
            sourceUrl={system.illnessSourceUrl || system.diseaseSourceUrl}
            onClose={() => setShowIllnessModal(false)}
          />
        )}
      </div>
    </div>
  );
}
