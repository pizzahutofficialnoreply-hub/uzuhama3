/**
 * 배경음 (BGM): 우주하마 라이브 브금 모음을 작게 반복 재생
 *  - 설정 > 배경음 (켜기·음량) · 처음 안내 '거의 다 됐어요' 에서도 켤 수 있음
 *  - 브라우저는 화면을 한 번 누르기 전엔 소리를 막아서: 켜져 있으면 첫 터치 때 시작
 *    (아이폰 실험실 '화면 눌러 인트로' 로 누른 경우 그 손길로 바로 이어서)
 *  - 영상(유튜브)이 화면에 뜨면 멈추고, 닫으면 이어서 · 앱을 내리면 멈춤
 *  - 음량: 아이폰은 audio.volume 을 못 바꿔서 Web Audio 로 줄임
 */
const KEY = 'uzuhama_bgm';
const SRC = '/sound/bgm.m4a';
type Pref = { on: boolean; vol: number };
const DEF: Pref = { on: false, vol: 0.5 };

export function getBgm(): Pref {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return { on: !!v.on, vol: Math.min(1, Math.max(0, Number(v.vol ?? DEF.vol))) }; } catch { /* */ }
  return { ...DEF };
}
const listeners = new Set<(p: Pref) => void>();
export function onBgm(fn: (p: Pref) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

let el: HTMLAudioElement | null = null;
let ac: AudioContext | null = null;
let gain: GainNode | null = null;
let started = false;
let videoOpen = false;

function ensureEl() {
  if (el) return el;
  el = new Audio();
  (window as any).__bgmEl = el; // 점검용
  el.src = SRC; el.loop = true; el.preload = 'none';
  (el as any).playsInline = true;
  el.setAttribute('playsinline', '');
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) { ac = new AC(); const s = ac!.createMediaElementSource(el); gain = ac!.createGain(); s.connect(gain); gain.connect(ac!.destination); }
  } catch { ac = null; gain = null; }
  applyVol();
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: '우주하마 라이브 브금', artist: '우주하마 방송 예측', artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] });
      navigator.mediaSession.setActionHandler('pause', () => setBgm({ on: false }));
      navigator.mediaSession.setActionHandler('play', () => setBgm({ on: true }));
    }
  } catch { /* */ }
  return el;
}
function applyVol() {
  const v = getBgm().vol;
  // 녹음본보다 이미 작게 줄여 둔 파일 · 여기서 0~100% 로 한 번 더
  if (gain) gain.gain.value = v; else if (el) el.volume = v;
}
function play() {
  const p = getBgm();
  if (!p.on || videoOpen || document.hidden) return;
  const a = ensureEl();
  try { ac?.resume(); } catch { /* */ }
  // 인트로(채널 인트로 노래)가 도는 중이면 소리 0 으로 시작했다가 끝난 뒤 천천히 키움
  const intro = document.documentElement.classList.contains('intro-on');
  if (intro && gain && ac) { gain.gain.setValueAtTime(0, ac.currentTime); setTimeout(() => { if (gain && ac) { gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(getBgm().vol, ac.currentTime + 2); } }, 2600); }
  a.play().then(() => { started = true; }).catch(() => { /* 아직 터치 전 → 첫 터치 때 */ });
}
function pause() { try { el?.pause(); } catch { /* */ } }

export function setBgm(patch: Partial<Pref>) {
  const next = { ...getBgm(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
  applyVol();
  if (next.on) play(); else pause();
  listeners.forEach((fn) => fn(next));
}

/** 앱 시작 때 한 번 */
export function initBgm() {
  if (typeof window === 'undefined' || (window as any).__bgmInit) return;
  (window as any).__bgmInit = true;
  // 화면을 처음 누를 때 시작 (브라우저 소리 허락)
  const kick = () => { if (getBgm().on && !started) play(); };
  ['click', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, kick, { capture: true, passive: true }));
  // 홈 화면 앱(안드로이드)은 바로 될 수도 있어서 한 번 시도
  setTimeout(() => { if (getBgm().on) play(); }, 2500);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else play(); });
  // 유튜브 영상이 화면에 뜨면 멈춤 → 없어지면 이어서
  const check = () => {
    const has = !!document.querySelector('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]');
    if (has === videoOpen) return;
    videoOpen = has;
    if (has) pause(); else play();
  };
  new MutationObserver(() => check()).observe(document.body, { childList: true, subtree: true });
}
