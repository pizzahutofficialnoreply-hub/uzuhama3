/**
 * 배경음 (BGM): 우주하마 라이브 브금 (8곡을 이어 녹음한 한 파일) 을 작게 반복 재생
 *  - 기본 켜짐 · 설정 > 배경음 (켜기·음량·앱을 내려도 계속) · 처음 안내 '거의 다 됐어요' 에서도
 *  - 브라우저는 화면을 한 번 누르기 전엔 소리를 막아서: 켜져 있으면 첫 터치 때 시작
 *  - 듣던 위치를 기억 (앱을 닫았다 열거나 새로고침해도 이어서)
 *  - 영상(유튜브)이 화면에 뜨면 멈추고, 닫으면 이어서 · 앱을 내리면 멈춤 ('계속 듣기' 를 켜면 계속)
 *  - 음량: 아이폰은 audio.volume 을 못 바꿔서 Web Audio 로 줄임 ('계속 듣기' 일 땐 Web Audio 를 안 씀 — 앱 밖에서 끊겨서)
 */
const KEY = 'uzuhama_bgm';
const POS_KEY = 'uzuhama_bgm_pos';
const SRC = '/sound/bgm.m4a';
type Pref = { on: boolean; vol: number; bg: boolean };
const DEF: Pref = { on: true, vol: 0.5, bg: false };

/** 녹음 순서대로 (파일 안에서 시작하는 초) */
export const BGM_TRACKS: { at: number; title: string; artist: string }[] = [
  { at: 0, title: 'Demise', artist: 'Ethan Meixsell' },
  { at: 152.3, title: 'Operatic 3', artist: 'Vibe Mountain' },
  { at: 342.7, title: 'Half Pipe', artist: 'Huma-Huma' },
  { at: 478.2, title: 'Synergy', artist: 'Geographer' },
  { at: 640.7, title: 'Italy Jr.', artist: 'Underbelly' },
  { at: 802.7, title: 'Knuckles', artist: 'Slynk' },
  { at: 998.6, title: 'Membrane', artist: 'Slynk' },
  { at: 1227.5, title: 'Jolly Old St Nicholas (Instrumental)', artist: "E's Jammy Jams" },
];
export function trackAt(sec: number) {
  let i = 0;
  for (let k = 0; k < BGM_TRACKS.length; k++) if (sec >= BGM_TRACKS[k].at) i = k;
  return { index: i, ...BGM_TRACKS[i] };
}

export function getBgm(): Pref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { on: v.on !== false, vol: Math.min(1, Math.max(0, Number(v.vol ?? DEF.vol))), bg: !!v.bg };
  } catch { /* */ }
  return { ...DEF };
}
type State = Pref & { playing: boolean; track: ReturnType<typeof trackAt> };
const listeners = new Set<(s: State) => void>();
export function onBgm(fn: (s: State) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function bgmState(): State { return { ...getBgm(), playing: !!el && !el.paused, track: trackAt(el?.currentTime || savedPos()) }; }
const emit = () => { const s = bgmState(); listeners.forEach((fn) => fn(s)); };

let el: HTMLAudioElement | null = null;
let ac: AudioContext | null = null;
let gain: GainNode | null = null;
let routed = false; // Web Audio 를 거치는지
let started = false;
let videoOpen = false;
let lastTrack = -1;

const savedPos = () => { try { return Number(localStorage.getItem(POS_KEY) || 0) || 0; } catch { return 0; } };
const savePos = () => { try { if (el && el.currentTime > 0) localStorage.setItem(POS_KEY, String(Math.floor(el.currentTime))); } catch { /* */ } };

function meta() {
  if (!el || !('mediaSession' in navigator)) return;
  const t = trackAt(el.currentTime);
  if (t.index === lastTrack) return;
  lastTrack = t.index;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: '우주하마 라이브 브금', artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] });
  } catch { /* */ }
  emit();
}

function ensureEl() {
  const want = !getBgm().bg; // '계속 듣기' 가 꺼져 있을 때만 Web Audio 로 (음량 조절 가능)
  if (el && routed === want) return el;
  if (el) { savePos(); try { el.pause(); } catch { /* */ } el = null; }
  const a = new Audio();
  (window as any).__bgmEl = a; // 점검용
  a.src = SRC; a.loop = true; a.preload = 'none';
  (a as any).playsInline = true; a.setAttribute('playsinline', '');
  const pos = savedPos();
  if (pos > 0) a.addEventListener('loadedmetadata', () => { try { if (a.currentTime < 1) a.currentTime = Math.min(pos, Math.max(0, (a.duration || pos + 1) - 2)); } catch { /* */ } }, { once: true });
  a.addEventListener('timeupdate', meta);
  a.addEventListener('play', emit);
  a.addEventListener('pause', () => { savePos(); emit(); });
  routed = false; gain = null;
  if (want) {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) { ac = ac || new AC(); const s = ac!.createMediaElementSource(a); gain = ac!.createGain(); s.connect(gain); gain.connect(ac!.destination); routed = true; }
    } catch { routed = false; gain = null; }
  }
  el = a; lastTrack = -1;
  applyVol();
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('pause', () => setBgm({ on: false }));
      navigator.mediaSession.setActionHandler('play', () => setBgm({ on: true }));
      navigator.mediaSession.setActionHandler('nexttrack', () => skip(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1));
    }
  } catch { /* */ }
  return a;
}
function applyVol() {
  const v = getBgm().vol;
  // 녹음본보다 이미 작게 줄여 둔 파일 · 여기서 0~100% 로 한 번 더
  if (gain) gain.gain.value = v; else if (el) el.volume = v;
}
function play() {
  const p = getBgm();
  if (!p.on || videoOpen || (document.hidden && !p.bg)) return;
  const a = ensureEl();
  try { ac?.resume(); } catch { /* */ }
  // 인트로(채널 인트로 노래)가 도는 중이면 소리 0 으로 시작했다가 끝난 뒤 천천히 키움
  const intro = document.documentElement.classList.contains('intro-on');
  if (intro && gain && ac) { gain.gain.setValueAtTime(0, ac.currentTime); setTimeout(() => { if (gain && ac) { gain.gain.setValueAtTime(0, ac.currentTime); gain.gain.linearRampToValueAtTime(getBgm().vol, ac.currentTime + 2); } }, 2600); }
  a.play().then(() => { started = true; emit(); }).catch(() => { /* 아직 터치 전 → 첫 터치 때 */ });
}
function pause() { savePos(); try { el?.pause(); } catch { /* */ } }
/** 다음·이전 곡 */
export function skip(dir: 1 | -1) {
  const a = ensureEl();
  const cur = trackAt(a.currentTime);
  const i = (cur.index + dir + BGM_TRACKS.length) % BGM_TRACKS.length;
  try { a.currentTime = BGM_TRACKS[i].at + 0.05; } catch { /* */ }
  savePos(); meta(); emit();
}

export function setBgm(patch: Partial<Pref>) {
  const next = { ...getBgm(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
  if (patch.bg !== undefined && el) { const was = !el.paused; ensureEl(); if (was) play(); }
  applyVol();
  if (next.on) play(); else pause();
  emit();
}

/** 앱 시작 때 한 번 */
export function initBgm() {
  if (typeof window === 'undefined' || (window as any).__bgmInit) return;
  (window as any).__bgmInit = true;
  // 화면을 처음 누를 때 시작 (브라우저 소리 허락)
  const kick = () => { if (getBgm().on && (!started || el?.paused)) play(); };
  ['click', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, kick, { capture: true, passive: true }));
  // 홈 화면 앱(안드로이드)은 바로 될 수도 있어서 한 번 시도
  setTimeout(() => { if (getBgm().on) play(); }, 2500);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (getBgm().bg) savePos(); else pause(); } else play(); });
  window.addEventListener('pagehide', savePos);
  setInterval(() => { if (el && !el.paused) savePos(); }, 5000);
  // 유튜브 영상이 화면에 뜨면 멈춤 → 없어지면 이어서
  const check = () => {
    const has = !!document.querySelector('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]');
    if (has === videoOpen) return;
    videoOpen = has;
    if (has) pause(); else play();
  };
  new MutationObserver(() => check()).observe(document.body, { childList: true, subtree: true });
}
