import React from 'react';
import { AppData, BroadcastLog } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useEffect } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isLocked]);
}

export function parseTimeTo24(timeStr: string): { hour: number; minute: number } {
  if (!timeStr || typeof timeStr !== 'string') return { hour: 0, minute: 0 };
  
  const parts = timeStr.trim().split(' ');
  const time = parts[0];
  const period = parts.length > 1 ? parts[1].toUpperCase() : null;
  
  let [hour, minute] = time.split(':').map(Number);
  if (isNaN(hour)) hour = 0;
  if (isNaN(minute)) minute = 0;
  
  if (period === 'PM' && hour !== 12) {
    hour += 12;
  } else if (period === 'AM' && hour === 12) {
    hour = 0;
  }
  
  return { hour, minute };
}

export function formatTimeRange(startTime: string, endTime?: string, durationHours?: number): string {
  if (!startTime) return '';
  const format12 = (h: number, m: number) => {
    const period = h >= 12 && h < 24 ? '오후' : '오전';
    const hour12 = h % 12 || 12;
    return m > 0 ? `${period} ${Math.floor(hour12)}:${m.toString().padStart(2, '0')}` : `${period} ${Math.floor(hour12)}시`;
  };
  
  const startObj = parseTimeTo24(startTime);
  const startStr = format12(startObj.hour, startObj.minute);
  
  let endStr = '';
  if (endTime) {
    const endObj = parseTimeTo24(endTime);
    endStr = format12(endObj.hour, endObj.minute);
  } else if (durationHours) {
    const totalMins = startObj.hour * 60 + startObj.minute + Math.round(durationHours * 60);
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    endStr = format12(endH, endM);
  }
  
  return `${startStr}${endStr ? ` ~ ${endStr}` : ''}`;
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function formatTo12Hour(timeStr: string): string {
  if (!timeStr) return '';
  const [time, period] = timeStr.split(' ');
  if (!time || !period) return '';
  
  let [hours, minutes] = time.split(':');
  
  const p = period === 'AM' ? '오전' : '오후';
  if (minutes === '00' || !minutes) {
    return `${p} ${hours}시`;
  }
  return `${p} ${hours}:${minutes}`;
}

export function parseTimeString(timeStr: string): number {
  return parseTimeTo24(timeStr).hour;
}

const CHOSUNG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const HANGUL_START = 44032;
const HANGUL_END = 55203;
const isVowel = (char: string) => /[ㅏ-ㅣ]/.test(char);

export function getChosung(text: string) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const chosungIndex = Math.floor((code - HANGUL_START) / 588);
      result += CHOSUNG[chosungIndex];
    } else {
      result += text[i];
    }
  }
  return result;
}

export function fuzzyKoreanMatch(query: string, target: string) {
  if (!query) return true;
  if (!target) return false;
  
  const normQ = query.replace(/\s+/g, '').toLowerCase();
  const normT = target.replace(/\s+/g, '').toLowerCase();
  
  const replaceNumber = (s: string) => s.replace(/1/g, '한').replace(/2/g, '두').replace(/3/g, '세').replace(/4/g, '네');
  const normQNum = replaceNumber(normQ);
  const normTNum = replaceNumber(normT);
  
  const check = (q: string, t: string) => {
    if (t.includes(q)) return true;
    const cT = getChosung(t);
    const cQ = getChosung(q);
    if (cT.includes(cQ)) return true;
    const queryConsonants = Array.from(cQ).filter(c => !isVowel(c));
    if (queryConsonants.length > 0) {
      let qIdx = 0;
      for (let tIdx = 0; tIdx < cT.length; tIdx++) {
        if (cT[tIdx] === queryConsonants[qIdx]) {
          qIdx++;
        }
        if (qIdx === queryConsonants.length) return true;
      }
    }
    return false;
  };
  
  return check(normQ, normT) || check(normQNum, normTNum);
}

export function fuzzyDateMatch(query: string, dateStr: string): boolean {
  if (!query || !dateStr) return false;
  
  const trimmed = query.trim();
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  
  const logYear = parseInt(parts[0], 10);
  const logMonth = parseInt(parts[1], 10);
  const logDay = parseInt(parts[2], 10);

  // 1. 단순 전체 YYYY-MM-DD 또는 서브스트링 포함 여부
  if (dateStr.includes(trimmed)) return true;

  // 2. "M월 D일" / "M월 D" / "M월" 등 한글 날짜 패턴 (예: "5월 12일", "5월12일", "05월 02일", "5월")
  const koreanMonthDayMatch = trimmed.match(/^(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일?)?$/);
  if (koreanMonthDayMatch) {
    const qMonth = parseInt(koreanMonthDayMatch[1], 10);
    const qDay = koreanMonthDayMatch[2] ? parseInt(koreanMonthDayMatch[2], 10) : null;
    
    if (qMonth >= 1 && qMonth <= 12) {
      if (qDay !== null) {
        return logMonth === qMonth && logDay === qDay;
      }
      return logMonth === qMonth;
    }
  }

  // 3. "M/D", "M-D", "M.D" 또는 "M/" 패턴 (예: "5/12", "05/12", "5-12", "5.12", "5/")
  const separatorMatch = trimmed.match(/^(\d{1,2})\s*[\/\.-]\s*(\d{1,2})?$/);
  if (separatorMatch) {
    const qMonth = parseInt(separatorMatch[1], 10);
    const qDay = separatorMatch[2] ? parseInt(separatorMatch[2], 10) : null;
    
    if (qMonth >= 1 && qMonth <= 12) {
      if (qDay !== null) {
        return logMonth === qMonth && logDay === qDay;
      }
      return logMonth === qMonth;
    }
  }

  // 4. 순수 4자리 숫자 (예: "0512", "1103" -> MMDD 또는 YYYY)
  if (/^\d{4}$/.test(trimmed)) {
    const qMonth = parseInt(trimmed.substring(0, 2), 10);
    const qDay = parseInt(trimmed.substring(2, 4), 10);
    if (qMonth >= 1 && qMonth <= 12 && qDay >= 1 && qDay <= 31) {
      if (logMonth === qMonth && logDay === qDay) return true;
    }
    if (parseInt(trimmed, 10) === logYear) return true;
  }

  // 5. "YYYY년 M월 D일" 등 년도가 포함된 한글 패턴 (예: "2024년 5월 12일", "24년 5월")
  const fullKoreanMatch = trimmed.match(/^(\d{2,4})\s*년(?:\s*(\d{1,2})\s*월)?(?:\s*(\d{1,2})\s*일?)?$/);
  if (fullKoreanMatch) {
    let qYear = parseInt(fullKoreanMatch[1], 10);
    if (qYear < 100) qYear += 2000;
    const qMonth = fullKoreanMatch[2] ? parseInt(fullKoreanMatch[2], 10) : null;
    const qDay = fullKoreanMatch[3] ? parseInt(fullKoreanMatch[3], 10) : null;
    
    if (logYear === qYear) {
      if (qMonth !== null && qDay !== null) {
        return logMonth === qMonth && logDay === qDay;
      }
      if (qMonth !== null) {
        return logMonth === qMonth;
      }
      return true;
    }
  }

  // 6. "YY.MM.DD" 또는 "YYYY.MM.DD" (마침표로 연결된 전체 날짜)
  const dotDateMatch = trimmed.match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotDateMatch) {
    let qYear = parseInt(dotDateMatch[1], 10);
    if (qYear < 100) qYear += 2000;
    const qMonth = parseInt(dotDateMatch[2], 10);
    const qDay = parseInt(dotDateMatch[3], 10);
    return logYear === qYear && logMonth === qMonth && logDay === qDay;
  }

  return false;
}

export interface YouTubeVideoStats {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  viewCount?: number;
  likeCount?: number;
  publishedAt?: string;
  type?: 'video' | 'shorts';
  originLog?: {
    editedUrl?: string;
    vodUrl?: string;
    shortsUrl?: string;
  };
}

export async function fetchYoutubeVideoStats(videoMap: Map<string, any>): Promise<YouTubeVideoStats[]> {
  const videoIds = Array.from(videoMap.keys());
  if (!videoIds || videoIds.length === 0) return [];

  const apiKey = (import.meta as any).env.VITE_YOUTUBE_API_KEY || (import.meta as any).env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("YouTube API key is missing");
    return videoIds.map(id => ({
      id,
      title: `Video ${id}`,
      url: `https://youtube.com/watch?v=${id}`,
      type: 'video',
      viewCount: 0,
      originLog: videoMap.get(id)
    }));
  }

  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const allStats: YouTubeVideoStats[] = [];

  for (const chunk of chunks) {
    try {
      const idsStr = chunk.join(',');
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${idsStr}&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.items) {
        data.items.forEach((item: any) => {
          allStats.push({
            id: item.id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
            url: `https://youtube.com/watch?v=${item.id}`,
            viewCount: parseInt(item.statistics?.viewCount || '0', 10),
            likeCount: parseInt(item.statistics?.likeCount || '0', 10),
            publishedAt: item.snippet.publishedAt,
            type: 'video',
            originLog: videoMap.get(item.id)
          });
        });
      }
    } catch (e) {
      console.error("Failed to fetch youtube stats", e);
    }
  }

  return allStats;
}

export function getWeightedRandomVideos(videos: YouTubeVideoStats[], count: number): YouTubeVideoStats[] {
  // Simple random selection
  const shuffled = [...videos].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * 한국어 단어의 받침 유무를 판별하여 올바른 조사를 반환합니다.
 * @param word 앞선 단어
 * @param particleType 조사 유형 ('으로/로' | '이/가' | '을/를' | '은/는' | '과/와' | '이나/나' | '이란/란')
 */
export function getKoreanParticle(
  word: string, 
  particleType: '으로/로' | '이/가' | '을/를' | '은/는' | '과/와' | '이나/나' | '이란/란'
): string {
  if (!word || typeof word !== 'string') {
    return particleType.split('/')[0];
  }

  // 특수문자, 괄호 등 끝부분의 무의미한 기호 제거 후 마지막 음절 검사
  const cleanWord = word.trim().replace(/[\s.,!?;:()\[\]'"]+$/g, '');
  if (!cleanWord) return particleType.split('/')[0];

  const lastChar = cleanWord[cleanWord.length - 1];
  const charCode = lastChar.charCodeAt(0);

  // 한글 완성형 음절 범위: AC00 ~ D7A3
  if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
    const jongseong = (charCode - 0xAC00) % 28;
    const hasJongseong = jongseong > 0;

    switch (particleType) {
      case '으로/로':
        // 받침이 없거나 'ㄹ' 받침(jongseong === 8)일 때는 '로'
        return (!hasJongseong || jongseong === 8) ? '로' : '으로';
      case '이/가':
        return hasJongseong ? '이' : '가';
      case '을/를':
        return hasJongseong ? '을' : '를';
      case '은/는':
        return hasJongseong ? '은' : '는';
      case '과/와':
        return hasJongseong ? '과' : '와';
      case '이나/나':
        return hasJongseong ? '이나' : '나';
      case '이란/란':
        return hasJongseong ? '이란' : '란';
    }
  }

  // 숫자로 끝날 경우의 일반적인 발음 기준
  if (/[013678]$/.test(cleanWord)) {
    // 0(영), 1(일), 3(삼), 6(육), 7(칠), 8(팔)은 받침 있음
    if (particleType === '으로/로') {
      return (/[18]$/.test(cleanWord)) ? '로' : '으로'; // 1(일), 8(팔)은 ㄹ받침 -> 로
    }
    return particleType.split('/')[0];
  } else if (/[2459]$/.test(cleanWord)) {
    // 2(이), 4(사), 5(오), 9(구)는 받침 없음
    return particleType.split('/')[1];
  }

  return particleType.split('/')[1];
}

export function attachKoreanParticle(
  word: string, 
  particleType: '으로/로' | '이/가' | '을/를' | '은/는' | '과/와' | '이나/나' | '이란/란'
): string {
  return `${word}${getKoreanParticle(word, particleType)}`;
}

/**
 * 텍스트 내의 '(으)로', '(이/가)', '(을/를)', '(은/는)', '(과/와)' 등의 패턴을 올바른 조사로 자동 변환
 */
export function autoFixKoreanParticles(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  return text
    .replace(/([가-힣0-9a-zA-Z]+)\(으\)로/g, (_, word) => `${word}${getKoreanParticle(word, '으로/로')}`)
    .replace(/([가-힣0-9a-zA-Z]+)\(이\/가\)/g, (_, word) => `${word}${getKoreanParticle(word, '이/가')}`)
    .replace(/([가-힣0-9a-zA-Z]+)\(을\/를\)/g, (_, word) => `${word}${getKoreanParticle(word, '을/를')}`)
    .replace(/([가-힣0-9a-zA-Z]+)\(은\/는\)/g, (_, word) => `${word}${getKoreanParticle(word, '은/는')}`)
    .replace(/([가-힣0-9a-zA-Z]+)\(과\/와\)/g, (_, word) => `${word}${getKoreanParticle(word, '과/와')}`)
    .replace(/([가-힣0-9a-zA-Z]+)으로\/로/g, (_, word) => `${word}${getKoreanParticle(word, '으로/로')}`);
}
