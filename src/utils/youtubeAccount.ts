/**
 * 내 유튜브 재생목록에 바로 저장 (구글 로그인 · YouTube Data API)
 * - 관리자가 OAuth 클라이언트 ID 를 넣어 두면 켜짐 (config/system.youtubeOAuthClientId)
 * - 로그인 창은 구글이 띄우고, 받은 토큰은 이 탭 메모리에만 (저장하지 않음, 1시간쯤 뒤 만료)
 * - 사이트 서버는 거치지 않음: 브라우저 → 구글 API 로 바로
 * 유튜브 한도: 사이트 전체 하루 10,000 단위, 영상 하나 담기 50 · 새 재생목록 50 · 목록 보기 1
 * '나중에 볼 동영상'은 유튜브가 API 로 담는 걸 막아 둬서 직접 만든 재생목록에만 담을 수 있음
 */
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const API = 'https://www.googleapis.com/youtube/v3';
let clientId = '';
let gisLoading: Promise<void> | null = null;
let tokenClient: any = null;
let token: { value: string; exp: number } | null = null;
let pending: { resolve: (t: string) => void; reject: (e: any) => void } | null = null;
const listeners = new Set<() => void>();

export function setYoutubeClientId(id?: string | null) {
  const next = String(id || '').trim();
  if (next === clientId) return;
  clientId = next;
  tokenClient = null;
  if (clientId) prepare();
  listeners.forEach((l) => l());
}
export const youtubeSaveEnabled = () => Boolean(clientId);
export function onYoutubeConfig(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** 로그인 창을 누르는 순간 바로 띄울 수 있게 구글 스크립트를 미리 받아 둠 */
function prepare() {
  if (typeof window === 'undefined' || !clientId) return;
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      if ((window as any).google?.accounts?.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error('구글 로그인 스크립트를 못 불러왔어요')); };
      document.head.appendChild(s);
    });
  }
  gisLoading.then(() => {
    if (tokenClient || !clientId) return;
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r: any) => {
        const p = pending; pending = null;
        if (r?.access_token) { token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in || 3600) - 60) * 1000 }; p?.resolve(r.access_token); }
        else p?.reject(new Error(r?.error_description || r?.error || '로그인하지 않았어요'));
      },
      error_callback: (e: any) => { const p = pending; pending = null; p?.reject(new Error(e?.type === 'popup_closed' ? '로그인 창을 닫았어요' : e?.message || '로그인 실패')); },
    });
  }).catch(() => { /* 다음에 다시 */ });
}

/** 토큰 받기: 있으면 그대로, 없으면 구글 로그인 창 (버튼을 누른 그 순간에 불러야 창이 막히지 않음) */
export function getYoutubeToken(): Promise<string> {
  if (token && token.exp > Date.now()) return Promise.resolve(token.value);
  if (!tokenClient) { prepare(); return Promise.reject(new Error('구글 로그인 준비 중이에요. 잠깐 뒤 다시 눌러 주세요.')); }
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: token ? '' : undefined });
  });
}
export function signOutYoutube() {
  if (token && (window as any).google?.accounts?.oauth2) (window as any).google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
}

async function call(path: string, init: RequestInit = {}) {
  const t = await getYoutubeToken();
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) token = null;
    const reason = j?.error?.errors?.[0]?.reason || '';
    if (/quota/i.test(reason)) throw new Error('오늘 사이트 전체의 유튜브 저장 한도가 다 찼어요. 내일 다시 해 주세요.');
    if (reason === 'youtubeSignupRequired') throw new Error('이 구글 계정에 유튜브 채널이 없어요. 유튜브에서 채널을 먼저 만들어 주세요.');
    if (reason === 'videoAlreadyInPlaylist' || r.status === 409) throw new Error('이미 들어 있어요.');
    throw new Error(j?.error?.message || `유튜브 오류 (${r.status})`);
  }
  return j;
}

export type YtPlaylist = { id: string; title: string; count: number };
export async function listMyYoutubePlaylists(): Promise<YtPlaylist[]> {
  const j = await call('/playlists?part=snippet,contentDetails&mine=true&maxResults=50');
  return (j.items || []).map((p: any) => ({ id: p.id, title: p.snippet?.title || '(제목 없음)', count: Number(p.contentDetails?.itemCount || 0) }));
}
export async function createYoutubePlaylist(title: string, privacy: 'private' | 'unlisted' | 'public' = 'private'): Promise<YtPlaylist> {
  const j = await call('/playlists?part=snippet,status', { method: 'POST', body: JSON.stringify({ snippet: { title: title.slice(0, 150), description: '우주하마 방송 예측에서 만든 재생목록' }, status: { privacyStatus: privacy } }) });
  return { id: j.id, title: j.snippet?.title || title, count: 0 };
}
export async function addToYoutubePlaylist(playlistId: string, videoId: string) {
  await call('/playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }) });
}
