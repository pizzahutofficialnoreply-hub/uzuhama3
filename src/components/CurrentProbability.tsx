import { useState, useEffect, useMemo } from "react";
import { format, parseISO, differenceInDays, subDays } from "date-fns";
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
} from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { cn, attachKoreanParticle, autoFixKoreanParticles } from "../utils";
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

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const currentDayIndex = currentTime.getDay();
  const currentDayName = dayNames[currentDayIndex];

  // 1. 상세 분석 탭과 100% 동일한 데이터(생방일 + 휴방일 전체 일자)를 기반으로 요일별 실제 방송 진행률 산출
  let totalWeight = 0;
  const dayWeights = [0, 0, 0, 0, 0, 0, 0];
  const timeFreqByDay: Record<number, { minute: number; weight: number }[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  let lastLogDate: Date | null = null;
  let hasStreamedYesterday = false;
  let hasStreamedTwoDaysAgo = false;
  let hasStreamedToday = false;

  const todayStr = format(currentTime, "yyyy-MM-dd");
  const yesterdayStr = format(
    new Date(currentTime.getTime() - 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );
  const twoDaysAgoStr = format(
    new Date(currentTime.getTime() - 2 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );

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

  // 상세 분석 탭과 동일한 일자 범위 집계 (생방일 + 휴방일 전체 일자 포함)
  const weekdayOccurrenceMap: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const uniqueDatesByWeekday: Record<number, Set<string>> = {
    0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set()
  };

  const allDates = logs.map(l => l.date).filter(Boolean).sort();
  const earliestDateStr = allDates.length > 0 ? allDates[0] : format(subDays(currentTime, 180), "yyyy-MM-dd");
  const rangeStartDate = parseISO(earliestDateStr);

  if (!isNaN(rangeStartDate.getTime())) {
    const cursor = new Date(rangeStartDate);
    while (cursor <= currentTime) {
      weekdayOccurrenceMap[cursor.getDay()]++;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  streamLogs.forEach((log) => {
    try {
      if (!log.date) return;
      const d = parseISO(log.date);
      const diffDays = differenceInDays(currentTime, d);
      if (diffDays < 0) return;
      // Exponential weight (Lambda ~0.023 -> Half life 30 days)
      const weight = Math.exp(-0.023 * diffDays);

      if (log.date === todayStr) hasStreamedToday = true;
      if (log.date === yesterdayStr) hasStreamedYesterday = true;
      if (log.date === twoDaysAgoStr) hasStreamedTwoDaysAgo = true;

      if (!lastLogDate || d > lastLogDate) lastLogDate = d;
      const dayIdx = d.getDay();
      if (isNaN(dayIdx)) return;
      dayWeights[dayIdx] += weight;
      totalWeight += weight;
      uniqueDatesByWeekday[dayIdx].add(log.date);

      if (!log.time) return;
      const [h, m] = log.time.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const timeInMins = h * 60 + m;
        timeFreqByDay[dayIdx].push({ minute: timeInMins, weight });
      }
    } catch (e) {}
  });

  // 1. 오늘 요일의 전체 통계 방송 진행 확률 (상세 분석 탭과 100% 동일한 전체 일자 기반 기준)
  const todayTotalOccurrences = weekdayOccurrenceMap[currentDayIndex] || 1;
  const todayBroadcastDays = uniqueDatesByWeekday[currentDayIndex].size;
  const allTimeDayRate = todayTotalOccurrences > 0
    ? Math.min(100, (todayBroadcastDays / todayTotalOccurrences) * 100)
    : (totalWeight > 0 ? (dayWeights[currentDayIndex] / totalWeight) * 100 : 0);

  // 2. 최근 60일 기준 요일 방송 확률 (최근 60일 비중 60% 반영)
  const sixtyDaysAgo = subDays(currentTime, 60);
  let recent60WeekdayOccurrences = 0;
  const recent60WeekdayStreams = new Set<string>();

  const cur60 = new Date(sixtyDaysAgo);
  cur60.setHours(0, 0, 0, 0);
  const curToday = new Date(currentTime);
  curToday.setHours(0, 0, 0, 0);

  while (cur60 <= curToday) {
    if (cur60.getDay() === currentDayIndex) {
      recent60WeekdayOccurrences++;
    }
    cur60.setDate(cur60.getDate() + 1);
  }

  streamLogs.forEach((l) => {
    if (!l.date) return;
    try {
      const d = parseISO(l.date);
      if (d >= sixtyDaysAgo && d <= currentTime && d.getDay() === currentDayIndex) {
        recent60WeekdayStreams.add(l.date);
      }
    } catch {}
  });

  const recent60BroadcastCount = recent60WeekdayStreams.size;
  const recent60DayRate = recent60WeekdayOccurrences > 0
    ? Math.min(100, (recent60BroadcastCount / recent60WeekdayOccurrences) * 100)
    : allTimeDayRate;

  // 최근 60일 비중 가중 요일 확률 (최근 60일 트렌드 60%, 전체 통계 40%)
  const weightedDayProb = Math.round(((allTimeDayRate * 0.4) + (recent60DayRate * 0.6)) * 10) / 10;
  const baseProb = weightedDayProb;

  const calculateDensity = (
    dayIdx: number,
    targetMinute: number,
    useGlobal: boolean = false,
  ) => {
    let density = 0;
    let totalPtsWeight = 0;
    const points = useGlobal
      ? Object.values(timeFreqByDay).reduce((a, b) => a.concat(b), [])
      : timeFreqByDay[dayIdx];
    if (!points || points.length === 0) return 0;

    points.forEach((pt) => {
      let dist = Math.abs(targetMinute - pt.minute);
      if (dist > 720) dist = 1440 - dist;
      density += pt.weight * Math.exp(-(dist * dist) / (2 * 45 * 45)); // 45 min variance
      totalPtsWeight += pt.weight;
    });
    return totalPtsWeight > 0 ? (density / totalPtsWeight) * 100 : 0;
  };

  // 한국 표준시(UTC+9) 강제 고정
  const currentMinuteOfDay =
    (currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes() + 540) % 1440;

  // 2. Lagged Time Shift (Cooldown & Late End)
  let shiftMinutes = 0;
  let cooldownActive = false;
  if (recentEndTime) {
    const hoursSinceEnd =
      (currentTime.getTime() - recentEndTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceEnd >= 0 && hoursSinceEnd < 8) {
      cooldownActive = true;
    }
    const endHour = recentEndTime.getHours();
    if (endHour < 12) {
      if (endHour > 2 && endHour <= 10) {
        shiftMinutes = (endHour - 2) * 60; // Shift peaks proportional to late end
      }
    }
  }

  const findPeaks = (dayIdx: number, useGlobal: boolean = false) => {
    const peaks = [];
    const windowSize = 60;
    const densities = [];
    for (let m = 0; m < 1440; m += 5) {
      densities.push({
        minute: m,
        density: calculateDensity(dayIdx, m, useGlobal),
      });
    }

    densities.sort((a, b) => b.density - a.density);

    for (const d of densities) {
      if (d.density < 2) continue;

      let tooClose = false;
      for (const p of peaks) {
        let dist = Math.abs(d.minute - p.minute);
        if (dist > 720) dist = 1440 - dist;
        if (dist < windowSize) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        peaks.push(d);
        if (peaks.length >= 3) break;
      }
    }

    // Apply shift
    const shiftedPeaks = peaks
      .map((p) => ({
        minute: (p.minute + shiftMinutes) % 1440,
        density: p.density,
      }))
      .sort((a, b) => a.minute - b.minute);

    return shiftedPeaks;
  };

  const todayPeaks = findPeaks(currentDayIndex, true);

  let nextPeak = null;
  let isToday = true;

  for (const p of todayPeaks) {
    if (p.minute > currentMinuteOfDay) {
      nextPeak = p;
      break;
    }
  }

  if (!nextPeak) {
    const tomorrowIdx = (currentDayIndex + 1) % 7;
    const tomorrowPeaks = findPeaks(tomorrowIdx, true);
    if (tomorrowPeaks.length > 0) {
      nextPeak = tomorrowPeaks[0];
      isToday = false;
    }
  }

  // Calculate Base Probability
  // 시간대별 밀도 분포 산출
  const unshiftedMinute = (currentMinuteOfDay - shiftMinutes + 1440) % 1440;
  const globalTimeScore = calculateDensity(
    currentDayIndex,
    unshiftedMinute,
    true,
  );

  // 하루 중 최고 밀도 값 산출
  let maxTimeDensity = 1;
  for (let m = 0; m < 1440; m += 15) {
    const d = calculateDensity(currentDayIndex, m, true);
    if (d > maxTimeDensity) maxTimeDensity = d;
  }

  // 현재 시간대의 시간 밀도 비율 (유력 시간대일수록 1.0에 수렴)
  const densityRatio = maxTimeDensity > 0 ? Math.min(1.0, globalTimeScore / maxTimeDensity) : 0.5;

  // 1. 기본 통계 확률: 상세 분석 탭 전체 요일 확률과 최근 60일 비중(60%)이 가중 합산된 요일 기준 확률
  // (baseProb 및 weightedDayProb는 위에서 정밀 산출됨)

  // 2. 실시간 시간대별 확률 보정 포인트 (현재 시간대 밀도 및 집중도 반영)
  let timeModifier = 0;
  if (maxTimeDensity > 0) {
    // 피크 시간대(유력 시간대) 집중도 반영: 높은 집중도일수록 가산, 새벽/오전 미방송 시간대는 감산
    timeModifier = Math.round((Math.pow(densityRatio, 0.75) - 0.38) * 35 * 10) / 10;
  }
  const curHourCheck = currentTime.getHours();
  if (curHourCheck >= 3 && curHourCheck <= 8) {
    timeModifier = Math.min(timeModifier, -18.0);
  }

  // 3. 최근 패턴 분석
  let patternMessage = "";
  let daysSinceLastStream = 0;

  if (lastLogDate) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const ld = new Date(lastLogDate);
    ld.setHours(0, 0, 0, 0);
    daysSinceLastStream = differenceInDays(d, ld);
  }

  let patternModifier = 0;

  if (hasStreamedToday) {
    patternModifier = -80;
    patternMessage = "오늘 이미 방송을 진행했습니다.";
  } else if (cooldownActive) {
    patternModifier = -70;
    patternMessage = "휴식 및 쿨타임 시간대입니다.";
  } else if (recentDuration >= 8 && daysSinceLastStream <= 1) {
    patternModifier -= 25;
    patternMessage = `직전 장시간(${recentDuration.toFixed(1)}시간) 방송 여파로 휴식 가능성이 있습니다.`;
  } else if (
    recentDuration > 0 &&
    recentDuration <= 3 &&
    daysSinceLastStream <= 1
  ) {
    patternModifier += 15;
    patternMessage = `직전 방송이 짧아 빠른 복귀가 예상됩니다.`;
  } else if (daysSinceLastStream >= 1) {
    // Check travel/absence period
    let isTraveling = false;
    let travelMsg = "";
    let travelPenalty = -50;
    
    if (system?.travelStart && system?.travelEnd) {
      const start = parseISO(system.travelStart);
      const end = parseISO(system.travelEnd);
      if (currentTime >= start && currentTime <= end) {
        isTraveling = true;
        
        const displayReason = system.absenceReason === '기타 (직접 입력)' ? system.customAbsenceReason : system.absenceReason;
        const increasesProb = ['건강 문제', '컨디션 난조', '여행'].some(kw => system.absenceReason?.includes(kw));
        
        if (increasesProb) {
          travelPenalty = -80;
        }
        
        travelMsg = displayReason 
          ? `예정된 휴방 기간입니다. 사유: ${displayReason}`
          : "예정된 휴방/여행 기간입니다.";
      }
    }

    if (isTraveling) {
      patternModifier += travelPenalty;
      patternMessage = travelMsg;
    } else if (daysSinceLastStream === 1) {
      patternModifier += 5;
      patternMessage = `1일째 미방송: 통상적인 방송 주기 범위 내입니다.`;
    } else {
      const isIllness = system?.absenceReason === '병명';
      const activeIllnessName = isIllness ? (system?.illnessName || system?.diseaseName) : undefined;
      const displayReason = (system?.absenceReason === '기타 (직접 입력)' || system?.absenceReason === '직접 입력')
        ? (system?.customAbsenceReason || '직접 입력한 사유') 
        : (isIllness ? (activeIllnessName || '건강 문제') : system?.absenceReason);
      
      if (displayReason) {
        const reasonWithParticle = attachKoreanParticle(displayReason, '으로/로');
        patternMessage = `${daysSinceLastStream}일째 ${reasonWithParticle} 일정 조정 중입니다.${system?.absenceDuration ? ` (예상: ${system?.absenceDuration})` : ""}`;
      } else if (daysSinceLastStream === 2) {
        patternMessage = `2일째 미방송: 평소 주기보다 조금 긴 간격입니다.`;
      } else {
        patternMessage = `${daysSinceLastStream}일 연속 미방송 중입니다.`;
      }
    }
  } else if (hasStreamedYesterday && hasStreamedTwoDaysAgo) {
    patternModifier = -25;
    patternMessage = "이틀 연속 방송 진행 후 통계상 쉬어갈 가능성이 있습니다.";
  } else if (hasStreamedYesterday) {
    patternModifier = -10;
    patternMessage = "어제 방송 진행 후 오늘은 간격을 둘 가능성이 있습니다.";
  }

  // 최종 확률 산출: 기본 요일 확률(전체 데이터) + 실시간 시간대 보정 + 최근 패턴 보정 (거짓 없는 정직한 합산)
  let rawFinal = baseProb + timeModifier + patternModifier;
  let finalProb = Math.min(95.0, Math.max(2.0, Math.round(rawFinal * 10) / 10));

  useEffect(() => {
    if (onProbChange) {
      if (liveData?.status === "OPEN") {
        onProbChange(100);
      } else {
        onProbChange(finalProb);
      }
    }
  }, [finalProb, liveData?.status, onProbChange]);

  // 15분 단위로 안정적으로 유지되면서도 시간대별로 다채롭게 전환되는 시드 인덱스
  const timeSlotSeed = (currentTime.getHours() * 4 + Math.floor(currentTime.getMinutes() / 15) + currentTime.getDate()) % 15;

  let probabilityLevel = "low";

  let likelyTimeInfo = "";
  const peakMinute = nextPeak ? (Math.round(nextPeak.minute / 10) * 10) % 1440 : 0;
  const peakFormattedTime = nextPeak
    ? format(
        new Date().setHours(Math.floor(peakMinute / 60), peakMinute % 60),
        "a h:mm",
        { locale: ko }
      )
    : "";

  if (nextPeak) {
    let nextTime = new Date();
    nextTime.setHours(
      Math.floor(peakMinute / 60),
      peakMinute % 60,
      0,
      0,
    );
    if (!isToday) nextTime.setDate(nextTime.getDate() + 1);
    const diffHours =
      (nextTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    if (diffHours < 2 && finalProb > 30) {
      probabilityLevel = "high";
    } else if (diffHours <= 4 && finalProb > 20) {
      probabilityLevel = "medium";
    } else if (finalProb > 25) {
      probabilityLevel = "medium";
    } else {
      probabilityLevel = "low";
    }

    // 자세히 보기 표기(오늘 최고 유력 시간)와 100% 동일한 값 및 양식으로 통일
    likelyTimeInfo = peakFormattedTime ? `오늘 최고 유력 시간: ${peakFormattedTime}` : "";
  } else {
    likelyTimeInfo = "데이터가 부족하여 유력 시간을 분석 중입니다.";
  }

  // 시간대 구분
  const currentHour = currentTime.getHours();
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

  if (totalWeight === 0) {
    messageContent = "방송 기록이 없어 확률을 분석 중입니다.";
  } else if (hasStreamedToday || cooldownActive) {
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
        "시간이 늦었으니 편안한 밤 보내세요 🌙",
        "늦은 시간이라 편안한 휴식을 추천해요",
        renderRecommendSpan(),
        "오늘 하루도 고생 많으셨어요, 편안한 밤 되세요",
        renderRecommendSpan()
      ];
      messageContent = LATE_OPTIONS[timeSlotSeed % LATE_OPTIONS.length];
    } else if (isEarlyDay) {
      const DAY_OPTIONS = [
        renderRecommendSpan(),
        "오늘은 느긋하게 기다려봐요 ☕",
        "차분하게 여유를 즐겨보는 건 어떨까요?",
        "아직은 여유로운 시간이에요",
        renderRecommendSpan()
      ];
      messageContent = DAY_OPTIONS[timeSlotSeed % DAY_OPTIONS.length];
    } else {
      const LOW_OPTIONS = [
        renderRecommendSpan(),
        "조금 더 지켜보는 건 어떨까요?",
        "오늘은 느긋하게 기다려봐요 ☕",
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
        </div>

        {likelyTimeInfo && (
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-medium mt-1 mb-2 font-hanna font-pro text-sm">
            <ChevronRight className="w-4 h-4 text-purple-500 shrink-0" />
            <span className="font-hanna font-pro">{likelyTimeInfo}</span>
          </div>
        )}

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
            "px-5 py-2 mt-2 rounded-full border flex items-center gap-2 font-bold text-sm sm:text-base font-hanna font-pro",
            getStatusColor(probabilityLevel),
          )}
        >
          {probabilityLevel === "high" ? (
            <PlayCircle className="w-5 h-5 animate-pulse shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
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
              <div className="pt-6 pb-2 flex flex-col items-center gap-4 w-full text-sm">
                {/* 핵심 공식: 전체 요일 통계 + 최근 60일 비중 가중 + 시간대 보정 + 패턴 분석 보정값 = 최종 켜질 확률 */}
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 w-full">
                  {/* 1. 전체 통계 요일 확률 */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 min-w-[95px] sm:min-w-[115px]">
                    <span className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">
                      전체 요일 통계
                    </span>
                    <span className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-white">
                      {allTimeDayRate.toFixed(1)}%
                    </span>
                    <span className="text-[9.5px] text-zinc-400 mt-0.5">
                      {currentDayName}요일 전체
                    </span>
                  </div>

                  <div className="text-zinc-400 dark:text-zinc-500 text-xs sm:text-sm font-bold">
                    +
                  </div>

                  {/* 2. 최근 60일 가중치 */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 min-w-[95px] sm:min-w-[115px]">
                    <span className="text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                      최근 60일 통계
                    </span>
                    <span className="text-lg sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      {recent60DayRate.toFixed(1)}%
                    </span>
                    <span className="text-[9.5px] text-indigo-400/90 dark:text-indigo-300/80 mt-0.5">
                      60일 비중 60% 반영
                    </span>
                  </div>

                  <div className="text-zinc-400 dark:text-zinc-500 text-xs sm:text-sm font-bold">
                    {timeModifier >= 0 ? "+" : "-"}
                  </div>

                  {/* 3. 시간대 확률 보정 */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 min-w-[95px] sm:min-w-[115px]">
                    <span className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">
                      시간대별 보정
                    </span>
                    <span
                      className={`text-lg sm:text-2xl font-black ${
                        timeModifier > 0
                          ? "text-blue-600 dark:text-blue-400"
                          : timeModifier < 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {timeModifier >= 0 ? `+${timeModifier.toFixed(1)}` : `-${Math.abs(timeModifier).toFixed(1)}`}%p
                    </span>
                    <span className="text-[9.5px] text-zinc-400 mt-0.5">
                      {currentTime.getHours()}시대 집중도
                    </span>
                  </div>

                  <div className="text-zinc-400 dark:text-zinc-500 text-xs sm:text-sm font-bold">
                    {patternModifier >= 0 ? "+" : "-"}
                  </div>

                  {/* 4. 패턴 분석 보정값 */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 min-w-[95px] sm:min-w-[115px]">
                    <span className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">
                      패턴 분석 보정값
                    </span>
                    <span
                      className={`text-lg sm:text-2xl font-black ${
                        patternModifier > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : patternModifier < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {patternModifier >= 0 ? `+${patternModifier}` : `-${Math.abs(patternModifier)}`}%p
                    </span>
                    <span className="text-[9.5px] text-zinc-400 mt-0.5">
                      {patternModifier >= 0 ? `+${patternModifier}` : patternModifier}점 보정
                    </span>
                  </div>

                  <div className="text-zinc-400 dark:text-zinc-500 text-sm sm:text-base font-bold">
                    =
                  </div>

                  {/* 5. 최종 산출 확률 */}
                  <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 min-w-[105px] sm:min-w-[125px]">
                    <span className="text-[10.5px] font-semibold text-purple-700 dark:text-purple-300 mb-0.5">
                      최종 산출 확률
                    </span>
                    <span className="text-lg sm:text-2xl font-black text-purple-600 dark:text-purple-400">
                      {finalProb.toFixed(1)}%
                    </span>
                    <span className="text-[9.5px] text-purple-500/80 dark:text-purple-400/80 mt-0.5 font-medium">
                      방송 켜질 확률
                    </span>
                  </div>
                </div>

                {/* 실제 계산 방식 상세 표기 (오차 없는 투명한 세부 내역) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl text-left pt-2">
                  {/* 요일 및 시간대 세부 지표 */}
                  <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-1.5 text-xs">
                    <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center justify-between pb-1 border-b border-zinc-200/50 dark:border-zinc-700/40">
                      <span>요일 통계 & 시간대 집중도</span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">
                        {timeModifier >= 0 ? `+${timeModifier.toFixed(1)}` : `${timeModifier.toFixed(1)}`}%p
                      </span>
                    </div>
                    <div className="space-y-1 text-zinc-500 dark:text-zinc-400 text-[11.5px]">
                      <div className="flex justify-between">
                        <span>• 전체 통계 요일 확률 ({currentDayName}):</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {allTimeDayRate.toFixed(1)}% ({todayBroadcastDays}/{todayTotalOccurrences}회)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>• 최근 60일 {currentDayName}요일 확률:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {recent60DayRate.toFixed(1)}% ({recent60BroadcastCount}/{recent60WeekdayOccurrences}회)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>• 60일 비중 가중 요일 확률:</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {weightedDayProb.toFixed(1)}% (최근 60%, 전체 40%)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>• 현재 {currentTime.getHours()}시대 밀도 집중도:</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {globalTimeScore.toFixed(1)}점 ({Math.round(densityRatio * 100)}%)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>• 시간대 확률 보정:</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {timeModifier >= 0 ? `+${timeModifier.toFixed(1)}` : `${timeModifier.toFixed(1)}`}%p
                        </span>
                      </div>
                      {nextPeak && (
                        <div className="flex justify-between text-purple-600 dark:text-purple-400 font-hanna font-pro">
                          <span className="font-hanna font-pro">• 오늘 최고 유력 시간:</span>
                          <span className="font-semibold font-hanna font-pro">
                            {peakFormattedTime}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 최근 패턴 분석 세부 지표 */}
                  <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 space-y-1.5 text-xs">
                    <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center justify-between pb-1 border-b border-zinc-200/50 dark:border-zinc-700/40">
                      <span>최근 방송 패턴 분석 보정</span>
                      <span className={cn(
                        "font-bold",
                        patternModifier > 0 ? "text-emerald-600 dark:text-emerald-400" : patternModifier < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"
                      )}>
                        {patternModifier >= 0 ? `+${patternModifier}` : `${patternModifier}`}%p
                      </span>
                    </div>
                    <div className="space-y-1 text-zinc-500 dark:text-zinc-400 text-[11.5px]">
                      <p className="leading-snug text-zinc-700 dark:text-zinc-300">
                        {patternMessage || "특이 패턴 없음 (표준 주기)"}
                      </p>
                      <div className="flex justify-between pt-0.5 border-t border-zinc-200/50 dark:border-zinc-700/40">
                        <span>• 적용 패턴 보정값:</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {patternModifier >= 0 ? `+${patternModifier}` : patternModifier}점 ({patternModifier >= 0 ? `+${patternModifier}` : patternModifier}%p)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 산출 공식 한 줄 요약 */}
                <div className="w-full max-w-xl px-4 py-2 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-[11.5px] text-zinc-600 dark:text-zinc-300 flex items-center justify-between flex-wrap gap-1 font-hanna font-pro">
                  <span>산출 공식: 기본 {baseProb.toFixed(1)}% {timeModifier >= 0 ? `+ 시간대 ${timeModifier.toFixed(1)}%p` : `- 시간대 ${Math.abs(timeModifier).toFixed(1)}%p`} {patternModifier >= 0 ? `+ 패턴 ${patternModifier}%p` : `- 패턴 ${Math.abs(patternModifier)}%p`}</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 font-hanna font-pro">= 최종 {finalProb.toFixed(1)}%</span>
                </div>
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
