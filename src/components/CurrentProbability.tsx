import { useState, useEffect } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
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
} from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { cn, attachKoreanParticle, autoFixKoreanParticles } from "../utils";
import { motion, AnimatePresence } from "motion/react";

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
}: {
  logs?: BroadcastLog[];
  onProbChange?: (prob: number) => void;
  system?: SystemConfig;
}) {
  const streamLogs = logs.filter((l) => !l.isAbsence);
  const absenceLogs = logs.filter((l) => l.isAbsence);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveData, setLiveData] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

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

  // 1. Exponential Recency Weighting
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

      if (!log.time) return;
      const [h, m] = log.time.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const timeInMins = h * 60 + m;
        timeFreqByDay[dayIdx].push({ minute: timeInMins, weight });
      }
    } catch (e) {}
  });

  const maxDayCount = Math.max(...dayWeights) || 1;
  const normalizedTodayProb =
    totalWeight > 0 ? (dayWeights[currentDayIndex] / totalWeight) * 100 : 0;

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
  // We need the density at unshifted time to match current minute properly,
  // or we evaluate density of (currentMinute - shift)
  const unshiftedMinute = (currentMinuteOfDay - shiftMinutes + 1440) % 1440;
  const globalTimeScore = calculateDensity(
    currentDayIndex,
    unshiftedMinute,
    true,
  );
  const dayWeightScore =
    totalWeight > 0 ? (dayWeights[currentDayIndex] / totalWeight) * 40 : 0;
  let heuristicScore = globalTimeScore * 1.5 + dayWeightScore;

  // 3. Time Decay (Survival)
  if (todayPeaks.length > 0) {
    // Find the last chronological peak of the day
    const lastPeak = [...todayPeaks].sort((a, b) => a.minute - b.minute).pop();
    if (lastPeak && currentMinuteOfDay > lastPeak.minute) {
      const minsPassed = currentMinuteOfDay - lastPeak.minute;
      if (minsPassed > 120) {
        // Softer exponential decay after 2 hours past the LAST peak
        const hoursPassed = minsPassed / 60;
        const decayFactor = Math.exp(-(hoursPassed - 2) * 0.4);
        heuristicScore *= 0.3 + 0.7 * decayFactor; // Retain at least 30% of the base time score
      } else {
        // Very gentle decay in the first 2 hours past the last peak
        const decayFactor = Math.exp(-minsPassed / 480);
        heuristicScore *= decayFactor;
      }
    }
  }
  // Markov Chain Transition Stats
  let onOn = 0,
    onOff = 0,
    offOn = 0,
    offOff = 0;
  const streamDaysSet = new Set(streamLogs.map((l) => l.date));
  const datesToEvaluate = [];
  for (let i = 90; i >= 1; i--) {
    const d = new Date(currentTime);
    d.setDate(d.getDate() - i);
    datesToEvaluate.push(format(d, "yyyy-MM-dd"));
  }

  for (let i = 0; i < datesToEvaluate.length - 1; i++) {
    const t1 = streamDaysSet.has(datesToEvaluate[i]);
    const t2 = streamDaysSet.has(datesToEvaluate[i + 1]);
    if (t1 && t2) onOn++;
    else if (t1 && !t2) onOff++;
    else if (!t1 && t2) offOn++;
    else if (!t1 && !t2) offOff++;
  }

  let avgRestCycle = offOff / (onOff || 1) + 1;
  if (avgRestCycle < 1.5) avgRestCycle = 1.5;

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
    patternModifier -= 30;
    patternMessage = `직전 장시간(${recentDuration.toFixed(1)}시간) 방송 여파로 휴방 확률이 상승합니다.`;
  } else if (
    recentDuration > 0 &&
    recentDuration <= 3 &&
    daysSinceLastStream <= 1
  ) {
    patternModifier += 20;
    patternMessage = `직전 방송이 짧아 빠른 복귀가 예상됩니다.`;
  } else if (daysSinceLastStream >= 1) {
    const expectedRest = Math.ceil(avgRestCycle);

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
    } else if (daysSinceLastStream <= expectedRest) {
      patternModifier += 15 * daysSinceLastStream;
      patternMessage = `${daysSinceLastStream}일째 휴방 중으로 복귀 기대감이 높습니다.`;
    } else {
      const overDays = daysSinceLastStream - expectedRest;
      const isLongAbsence = daysSinceLastStream >= 7;

      // 장기 휴방(7일 이상) 중 영상 업로드 감지 (시스템 설정 또는 로그 내 마지막 방송 이후 영상)
      let hasVideoUploadDuringLongAbsence = false;
      let videoUploadSourceDesc = '';

      if (isLongAbsence) {
        if (system?.recentVideoUploadDate && system.recentVideoUploadDate > (lastLogDate || '')) {
          hasVideoUploadDuringLongAbsence = true;
          videoUploadSourceDesc = `영상 업로드(${system.recentVideoUploadDate})`;
        } else if (logs && Array.isArray(logs)) {
          const logsWithVideos = logs.filter(
            (l) => (l.edited && l.edited.length > 0) || (l.shorts && l.shorts.length > 0)
          );
          for (const l of logsWithVideos) {
            if (l.date && l.date > (lastLogDate || '')) {
              hasVideoUploadDuringLongAbsence = true;
              videoUploadSourceDesc = `영상 업로드(${l.date})`;
              break;
            }
          }
        }
      }

      if (overDays <= 3) {
        patternModifier += Math.max(0, 10 - overDays * 3);
        patternMessage = `${daysSinceLastStream}일째 휴방 중입니다. (평균 휴방 주기 초과)`;
      } else {
        // 완만한 감쇄 적용 (기존 5씩 떨어지던 것을 2.5로 줄임, 최대치도 줄여서 0.1로 급락 방지)
        patternModifier -= Math.min(15, (overDays - 3) * 2.5);
        const displayReason = system?.absenceReason === '기타 (직접 입력)' ? system?.customAbsenceReason : system?.absenceReason;
        if (displayReason) {
          const reasonWithParticle = attachKoreanParticle(displayReason, '으로/로');
          patternMessage = `${daysSinceLastStream}일째 ${reasonWithParticle} 인한 휴방 중입니다.${system?.absenceDuration ? ` (예상 기간: ${system?.absenceDuration})` : ""}`;
        } else {
          patternMessage = `${daysSinceLastStream}일째 장기 휴방 중입니다. 언제든 올 수 있습니다.`;
        }
      }

      // 장기 휴방 중 영상 업로드 시 이후 확률에 소폭 가산점 부여 (+18)
      if (isLongAbsence && hasVideoUploadDuringLongAbsence) {
        patternModifier += 18;
        const uploadSource = videoUploadSourceDesc || '유튜브 영상';
        const uploadSourceWithParticle = attachKoreanParticle(uploadSource, '이/가');
        patternMessage += ` (🎬 장기 휴방 중 ${uploadSourceWithParticle} 업로드되어 복귀 기대감으로 방송 확률에 소폭 가산점이 반영되었습니다.)`;
      }
    }
  } else if (hasStreamedYesterday && hasStreamedTwoDaysAgo) {
    patternModifier = -30;
    patternMessage = "이틀 연속 방송했으므로 오늘은 휴방 확률이 높습니다.";
  } else if (hasStreamedYesterday) {
    const probOnGivenOn = (onOn / (onOn + onOff || 1)) * 100;
    if (probOnGivenOn < 40) {
      patternModifier = -15;
      patternMessage = "최근 패턴상 연속 방송 확률이 낮습니다.";
    } else {
      patternModifier = +10;
      patternMessage = "최근 패턴상 연속 방송 가능성이 있습니다.";
    }
  }

  heuristicScore += patternModifier;
  if (heuristicScore < 0) heuristicScore = 0;

  // Soft Cap
  let finalProb = 0;
  if (totalWeight > 0) {
    const SCALING_FACTOR = 80;
    finalProb = 85.0 * (1 - Math.exp(-heuristicScore / SCALING_FACTOR));
  }

  // 혹시 켤 수도 있으므로 최소 확률 0.1% 보장
  if (finalProb < 0.1) finalProb = 0.1;

  const baseScore = Math.max(0, heuristicScore - patternModifier);
  let baseProb = totalWeight > 0 ? 85.0 * (1 - Math.exp(-baseScore / 80)) : 0;
  if (baseProb < 0.1) baseProb = 0.1;

  let timeProb = Math.max(0, baseProb);
  const probDiff = finalProb - timeProb;

  useEffect(() => {
    if (onProbChange) {
      if (liveData?.status === "OPEN") {
        onProbChange(100);
      } else {
        onProbChange(finalProb);
      }
    }
  }, [finalProb, liveData?.status, onProbChange]);

  let probabilityLevel = "low";
  let message = "현재는 비활성/휴식 시간대입니다.";
  if (totalWeight === 0) {
    message = "방송 기록이 없어 확률을 계산할 수 없습니다.";
  }

  let likelyTimeInfo = "";
  if (nextPeak) {
    // Add jitter so the time isn't always exactly the same (e.g. 6:50)
    const jitter =
      ((currentTime.getDate() * 7 + nextPeak.minute * 3) % 21) - 10;
    let adjustedMinute = (nextPeak.minute + jitter + 1440) % 1440;
    adjustedMinute = Math.round(adjustedMinute / 10) * 10;

    let nextTime = new Date();
    nextTime.setHours(
      Math.floor(adjustedMinute / 60),
      adjustedMinute % 60,
      0,
      0,
    );
    if (!isToday) nextTime.setDate(nextTime.getDate() + 1);
    const diffHours =
      (nextTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60);

    if (diffHours < 2 && finalProb > 25) {
      probabilityLevel = "high";
      message =
        "매우 유력한 시간대입니다. 조만간 방송이 켜질 가능성이 높습니다.";
    } else if (diffHours <= 4 && finalProb > 15) {
      probabilityLevel = "medium";
      message = "서서히 기대되는 시간대입니다.";
    } else if (finalProb > 15) {
      probabilityLevel = "medium";
      message = "방송이 켜질 가능성이 있는 시간대입니다.";
    } else {
      probabilityLevel = "low";
      message = "현재는 비활성/휴식 시간대입니다.";
    }

    const h = Math.floor(adjustedMinute / 60);
    const m = adjustedMinute % 60;
    const ampm = h >= 12 ? "오후" : "오전";
    const h12 = h % 12 || 12;
    const mm = m.toString().padStart(2, "0");

    let dayStr = isToday ? "오늘" : "내일";
    if (!isToday && h < 4) {
      dayStr = "오늘 새벽";
    } else if (currentTime.getHours() >= 23 && !isToday) {
      dayStr = "내일";
    }

    likelyTimeInfo = `${dayStr} 다음 유력 시간: ${ampm} ${h12}:${mm}`;
  } else {
    likelyTimeInfo = "데이터가 부족하여 유력 시간을 분석 중입니다.";
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
      <div id="current-prob-live-card" className="bg-white dark:bg-zinc-900 border-2 border-red-500 dark:border-red-500/50 rounded-3xl p-8 shadow-xl dark:shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center">
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
    <div id="current-prob-card" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center">
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
            style={{ WebkitTextStroke: '0.65px currentColor' }}
          >
            {finalProb.toFixed(1)}
            <span className="text-4xl sm:text-5xl ml-1 tracking-normal font-bold" style={{ WebkitTextStroke: '0.3px currentColor' }}>%</span>
          </div>
        </div>

        {likelyTimeInfo && (
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-medium mt-1 mb-2">
            <ChevronRight className="w-4 h-4 text-purple-500" />
            {likelyTimeInfo}
          </div>
        )}

        {patternMessage && (
          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-1 rounded-lg border border-purple-100 dark:border-purple-800/30 mt-1 mb-2">
            {patternMessage}
          </p>
        )}

        <div
          className={cn(
            "px-5 py-2 mt-2 rounded-full border flex items-center gap-2 font-bold text-sm sm:text-base",
            getStatusColor(probabilityLevel),
          )}
        >
          {probabilityLevel === "high" ? (
            <PlayCircle className="w-5 h-5 animate-pulse" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{message}</span>
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
              <div className="pt-6 pb-2 flex flex-wrap justify-center gap-6 sm:gap-12 text-sm">
                <div className="flex flex-col items-center">
                  <span className="text-zinc-500 dark:text-zinc-500 mb-1">
                    오늘({currentDayName}) 방송 비중
                  </span>
                  <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                    {normalizedTodayProb.toFixed(1)}%
                  </span>
                </div>
                <div className="text-zinc-300 dark:text-zinc-700 text-2xl font-light mt-2">
                  ×
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-500 dark:text-zinc-500 mb-1">
                    {currentDayName}요일 시간 확률
                  </span>
                  <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200">
                    {timeProb.toFixed(1)}%
                  </span>
                  {nextPeak &&
                    (() => {
                      const peakMin = Math.round(nextPeak.minute / 10) * 10;
                      return (
                        <span className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          (최고 확률:{" "}
                          {format(
                            new Date().setHours(
                              Math.floor(peakMin / 60),
                              peakMin % 60,
                            ),
                            "a h:mm",
                            { locale: ko },
                          )}
                          )
                        </span>
                      );
                    })()}
                </div>
                <div className="text-zinc-300 dark:text-zinc-700 text-2xl font-light mt-2">
                  {probDiff >= 0 ? "+" : "-"}
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-500 dark:text-zinc-500 mb-1">
                    패턴 분석 보정
                  </span>
                  <span
                    className={`text-lg font-bold ${probDiff > 0 ? "text-green-600 dark:text-green-400" : probDiff < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"}`}
                  >
                    {Math.abs(probDiff).toFixed(1)}%p
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
