import { recentErrors } from './errorReport';
import { latestReleaseVersion } from './appVersion';
import { getPrefs } from './userPrefs';

/**
 * 의견 보내기의 '기기 정보 · 진단' 첨부 (아이폰 피드백 앱의 sysdiagnose 처럼)
 * 개인 정보(시청 기록 내용·검색어·이메일)는 넣지 않음: 기기·브라우저·앱 버전·설정 켜짐 여부·최근 오류만
 */
export type DeviceInfo = { device: string; os: string; browser: string; app: string; screen: string; model?: string };

/** 아이폰은 기기 이름을 알려 주지 않아서 화면 크기로 짐작 (가로×세로 pt @배율) */
const IPHONES: [string, string][] = [
  ['440x956@3', 'iPhone 16 Pro Max / 17 Pro Max'],
  ['420x912@3', 'iPhone Air'],
  ['402x874@3', 'iPhone 16 Pro / 17 / 17 Pro'],
  ['430x932@3', 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus'],
  ['393x852@3', 'iPhone 14 Pro / 15 / 15 Pro / 16 / 16e'],
  ['428x926@3', 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus'],
  ['390x844@3', 'iPhone 12 / 12 Pro / 13 / 13 Pro / 14 / 16e'],
  ['375x812@3', 'iPhone X / XS / 11 Pro / 12 mini / 13 mini'],
  ['414x896@3', 'iPhone XS Max / 11 Pro Max'],
  ['414x896@2', 'iPhone XR / 11'],
  ['414x736@3', 'iPhone 6s Plus / 7 Plus / 8 Plus'],
  ['375x667@2', 'iPhone 6s / 7 / 8 / SE (2·3세대)'],
  ['320x568@2', 'iPhone SE (1세대)'],
];
/** 갤럭시 모델 번호 → 이름 (앞자리로) */
const GALAXY: [RegExp, string][] = [
  [/^SM-S94/, 'Galaxy S26 시리즈'], [/^SM-S93/, 'Galaxy S25 시리즈'], [/^SM-S92/, 'Galaxy S24 시리즈'], [/^SM-S72/, 'Galaxy S24 FE'], [/^SM-S91/, 'Galaxy S23 시리즈'], [/^SM-S90/, 'Galaxy S22 시리즈'],
  [/^SM-G99/, 'Galaxy S21 시리즈'], [/^SM-G98/, 'Galaxy S20 시리즈'], [/^SM-F9[67]/, 'Galaxy Z Fold 6·7'], [/^SM-F94/, 'Galaxy Z Fold 5'], [/^SM-F93/, 'Galaxy Z Fold 4'],
  [/^SM-F7[67]/, 'Galaxy Z Flip 6·7'], [/^SM-F73/, 'Galaxy Z Flip 5'], [/^SM-F72/, 'Galaxy Z Flip 4'], [/^SM-A/, 'Galaxy A 시리즈'], [/^SM-M/, 'Galaxy M 시리즈'], [/^SM-X/, 'Galaxy Tab S'], [/^SM-T/, 'Galaxy Tab'],
];

export function deviceInfo(model = ''): DeviceInfo {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)[._](\d+)?(?:[._](\d+))? like Mac/);
  const safariVer = Number(ua.match(/Version\/(\d+)/)?.[1] || 0);
  const and = ua.match(/Android (\d+(?:\.\d+)?)/);
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIphone = /iPhone/.test(ua);
  let device = 'PC';
  if (isIphone) {
    const key = `${Math.min(screen.width, screen.height)}x${Math.max(screen.width, screen.height)}@${Math.round(window.devicePixelRatio)}`;
    device = IPHONES.find(([k]) => k === key)?.[1] || `iPhone (${key})`;
  } else if (isIpad) device = 'iPad';
  else if (and) {
    const m = model || ua.match(/Android [^;]+; ([^;)]+)/)?.[1]?.replace(/ Build.*/, '').trim() || '';
    const named = GALAXY.find(([re]) => re.test(m))?.[1];
    device = m && m !== 'K' ? (named ? `${named} (${m})` : m) : 'Android 기기';
  } else if (/Mac/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Linux/.test(ua)) device = 'Linux';
  // iOS 26부터 사파리가 OS 버전을 옛 값으로 고정해 보냄 → 사파리 버전(= iOS 버전)을 씀
  const iosVer = ios ? (safariVer >= 26 ? `${safariVer}${ua.match(/Version\/\d+\.(\d+)/)?.[1] && ua.match(/Version\/\d+\.(\d+)/)![1] !== '0' ? `.${ua.match(/Version\/\d+\.(\d+)/)![1]}` : ''}` : `${ios[1]}${ios[2] ? `.${ios[2]}` : ''}`) : '';
  const os = ios ? `${isIpad ? 'iPadOS' : 'iOS'} ${iosVer}` : and ? `Android ${and[1]}` : /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Mac OS X ([\d_]+)/.test(ua) ? `macOS ${(ua.match(/Mac OS X ([\d_]+)/)?.[1] || '').replace(/_/g, '.')}` : navigator.platform || '';
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg|SamsungBrowser|Whale/.test(ua) ? `Chrome ${ua.match(/(?:CriOS|Chrome)\/(\d+)/)?.[1] || ''}` : /SamsungBrowser\/(\d+)/.test(ua) ? `삼성 인터넷 ${ua.match(/SamsungBrowser\/(\d+)/)?.[1]}` : /Whale\/(\d+)/.test(ua) ? `웨일 ${ua.match(/Whale\/(\d+)/)?.[1]}` : /Edg\/(\d+)/.test(ua) ? `Edge ${ua.match(/Edg\/(\d+)/)?.[1]}` : /Firefox\/(\d+)/.test(ua) ? `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1]}` : /Safari/.test(ua) ? `Safari ${safariVer || ''}` : '기타';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
  let notes: any[] = [];
  try { notes = JSON.parse(localStorage.getItem('uzuhama_patch_notes_v3') || '[]'); } catch { /* */ }
  const ver = latestReleaseVersion(notes);
  const build = String((import.meta as any).env?.VITE_BUILD_ID || '').slice(0, 7);
  const app = `${ver ? `v${ver}` : '버전 확인 중'}${build ? ` (${build})` : ''} · ${standalone ? '홈 화면 앱' : '웹'}`;
  return { device, os, browser: browser.trim(), app, screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`, ...(model ? { model } : {}) };
}

/** 더 정확하게: 안드로이드 모델 번호(크롬이 알려 줌) + 앱 버전(패치노트) 받아 오기 */
export async function deviceInfoFull(): Promise<DeviceInfo> {
  let model = '';
  try {
    const uad: any = (navigator as any).userAgentData;
    if (uad?.getHighEntropyValues) model = String((await uad.getHighEntropyValues(['model'])).model || '');
  } catch { /* */ }
  try {
    const cached = JSON.parse(localStorage.getItem('uzuhama_patch_notes_v3') || '[]');
    if (!Array.isArray(cached) || !cached.length) {
      const base = (window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app');
      const j = await fetch(`${base}/api/patch-notes`).then((r) => r.json());
      if (Array.isArray(j?.notes)) localStorage.setItem('uzuhama_patch_notes_v3', JSON.stringify(j.notes));
    }
  } catch { /* */ }
  return deviceInfo(model);
}

/** 진단 내용(글) 만들기 — 몇 초 안에 끝남 */
export async function collectDiagnose(extra?: string): Promise<string> {
  const d = await deviceInfoFull();
  const lines: string[] = [];
  const add = (k: string, v: any) => lines.push(`${k}: ${v}`);
  add('수집 시각', new Date().toLocaleString('ko-KR'));
  add('기기', `${d.device} · ${d.os}${d.model ? ` · 모델 ${d.model}` : ''}`);
  add('브라우저', d.browser);
  add('앱', d.app);
  add('화면', `${d.screen} · 창 ${window.innerWidth}×${window.innerHeight}`);
  add('언어·시간대', `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  add('인터넷', navigator.onLine ? '연결됨' : '끊김');
  add('화면 모드', document.documentElement.classList.contains('dark') ? '다크' : '라이트');
  add('빌드', (import.meta as any).env?.VITE_BUILD_ID || '-');
  try { add('알림 권한', (window as any).Notification ? Notification.permission : '지원 안 함'); } catch { /* */ }
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    add('오프라인 지원(서비스 워커)', reg ? (reg.active ? '켜짐' : '설치 중') : '없음');
  } catch { add('오프라인 지원(서비스 워커)', '확인 못 함'); }
  try {
    const est = await (navigator.storage as any)?.estimate?.();
    if (est) add('저장 공간', `${Math.round((est.usage || 0) / 1024)}KB 사용 / ${Math.round((est.quota || 0) / 1048576)}MB`);
  } catch { /* */ }
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; bytes += k.length + (localStorage.getItem(k) || '').length; }
    add('기기 저장 항목', `${localStorage.length}개 · ${Math.round(bytes / 1024)}KB`);
  } catch { add('기기 저장 항목', '읽을 수 없음 (개인 정보 보호 모드일 수 있음)'); }
  try {
    const p = getPrefs() as any;
    const on = Object.entries(p).filter(([k, v]) => /^search/.test(k) && typeof v === 'boolean').map(([k, v]) => `${k.replace(/^search/, '')}:${v ? '켬' : '끔'}`);
    add('검색 도우미', on.join(', '));
  } catch { /* */ }
  try { add('기기 연결', localStorage.getItem('uzuhama_device_link_v1') ? '연결됨' : '안 함'); } catch { /* */ }
  add('지금 화면', `${window.location.pathname}${window.location.search}`.slice(0, 80));
  const errs = recentErrors();
  lines.push('', `최근 오류 ${errs.length}건${errs.length ? ':' : ''}`);
  errs.slice(0, 10).forEach((e) => lines.push(`- ${e.at.slice(5, 19).replace('T', ' ')} ${e.path} ${e.msg.slice(0, 160)}`));
  if (extra) lines.push('', extra);
  return lines.join('\n');
}

/** 사진 첨부: 긴 쪽 1280px JPEG 로 줄여서 (문서 하나에 들어가게) */
export function shrinkImage(file: File, max = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = quality;
      let out = c.toDataURL('image/jpeg', q);
      while (out.length > 220_000 && q > 0.35) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}
