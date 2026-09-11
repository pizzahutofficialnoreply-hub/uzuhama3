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

export function fuzzyDateMatch(query: string, dateStr: string) {
  if (/[a-zA-Z가-힣]/.test(query.replace(/[월일\s\/\.-]/g, ''))) return false;
  
  const normalize = (s: string) => s.replace(/[^0-9]/g, '');
  const nQuery = normalize(query);
  if (!nQuery || nQuery.length > 4) return false;
  
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const month = parts[1];
  const day = parts[2];
  
  const mmdd = month + day;
  const m_d = parseInt(month, 10).toString() + parseInt(day, 10).toString();
  
  return mmdd.includes(nQuery) || m_d.includes(nQuery);
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
