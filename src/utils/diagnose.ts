import { recentErrors } from './errorReport';
import { latestReleaseVersion } from './appVersion';
import { getPrefs } from './userPrefs';

/**
 * 의견 보내기의 '기기 정보 · 진단' 첨부 (아이폰 피드백 앱의 sysdiagnose 처럼)
 * 개인 정보(시청 기록 내용·검색어·이메일)는 넣지 않음: 기기·브라우저·앱 버전·설정 켜짐 여부·최근 오류만
 */
export type DeviceInfo = { device: string; os: string; browser: string; app: string; screen: string };

export function deviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const ios = ua.match(/OS (\d+)[._](\d+)?(?:[._](\d+))? like Mac/);
  const and = ua.match(/Android (\d+(?:\.\d+)?)/);
  const device = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : and ? (ua.match(/Android [^;]+; ([^;)]+)/)?.[1]?.replace(/ Build.*/, '') || 'Android 기기') : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : '알 수 없음';
  const os = ios ? `iOS ${ios[1]}${ios[2] ? `.${ios[2]}` : ''}` : and ? `Android ${and[1]}` : /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Mac OS X ([\d_]+)/.test(ua) ? `macOS ${(ua.match(/Mac OS X ([\d_]+)/)?.[1] || '').replace(/_/g, '.')}` : navigator.platform || '';
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg|SamsungBrowser|Whale/.test(ua) ? `Chrome ${ua.match(/(?:CriOS|Chrome)\/(\d+)/)?.[1] || ''}` : /SamsungBrowser\/(\d+)/.test(ua) ? `삼성 인터넷 ${ua.match(/SamsungBrowser\/(\d+)/)?.[1]}` : /Whale\/(\d+)/.test(ua) ? `웨일 ${ua.match(/Whale\/(\d+)/)?.[1]}` : /Edg\/(\d+)/.test(ua) ? `Edge ${ua.match(/Edg\/(\d+)/)?.[1]}` : /Firefox\/(\d+)/.test(ua) ? `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1]}` : /Safari/.test(ua) ? `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}` : '기타';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
  let notes: any[] = [];
  try { notes = JSON.parse(localStorage.getItem('uzuhama_patch_notes_v3') || '[]'); } catch { /* */ }
  const app = `${latestReleaseVersion(notes) ? `v${latestReleaseVersion(notes)}` : '버전 모름'}${standalone ? ' · 홈 화면 앱' : ' · 웹'}`;
  return { device, os, browser: browser.trim(), app, screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x` };
}

/** 진단 내용(글) 만들기 — 몇 초 안에 끝남 */
export async function collectDiagnose(extra?: string): Promise<string> {
  const d = deviceInfo();
  const lines: string[] = [];
  const add = (k: string, v: any) => lines.push(`${k}: ${v}`);
  add('수집 시각', new Date().toLocaleString('ko-KR'));
  add('기기', `${d.device} · ${d.os}`);
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
