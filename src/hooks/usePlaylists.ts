import { useEffect, useState } from 'react';

/**
 * 우주하마 유튜브 채널 공개 재생목록 (재생목록 탭과, 재생목록 이름으로 게임을 채우는 데 같이 사용)
 * - 서버는 유튜브를 처음 한 번만 부르고 저장해 둔 것을 돌려줌. 브라우저에도 하루 보관, 여러 화면이 한 번만 받음
 */
export interface PlaylistItem { videoId: string; title: string; publishedAt: string; position: number }
export interface Playlist { id: string; title: string; description: string; publishedAt: string; thumbnail: string; itemCount: number; items: PlaylistItem[] }
export interface PlaylistsResponse { playlists: Playlist[]; channelTitle: string; channelThumbnail: string }
type State = { data: PlaylistsResponse | null; loading: boolean; error: string | null };

const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
).replace(/\/+$/, '');
const STORAGE_KEY = 'uzuhama_playlists_v2';
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

let state: State = { data: null, loading: true, error: null };
try {
  localStorage.removeItem('uzuhama_playlists_v1');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved?.data?.playlists) state = { data: saved.data, loading: Date.now() - saved.at > LOCAL_TTL_MS, error: null };
} catch { /* 저장 공간 없음 */ }

const listeners = new Set<(s: State) => void>();
let fetching = false;
function set(next: State) { state = next; listeners.forEach((fn) => fn(state)); }

function ensureLoaded() {
  if (!state.loading || fetching) return;
  fetching = true;
  fetch(`${API_BASE}/api/videos/playlists`)
    .then((r) => r.json())
    .then((json) => {
      const ok = Array.isArray(json?.playlists) && json.playlists.length > 0;
      const data: PlaylistsResponse | null = ok
        ? { playlists: json.playlists, channelTitle: json.channelTitle || '우주하마', channelThumbnail: json.channelThumbnail || '' }
        : null;
      if (data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, at: Date.now() })); } catch { /* 가득 참 */ } }
      set({ data: data || state.data, loading: false, error: data ? null : (json?.error || 'empty') });
    })
    .catch((e) => set({ ...state, loading: false, error: String(e?.message || e) }))
    .finally(() => { fetching = false; });
}

export function usePlaylists() {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    ensureLoaded();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
