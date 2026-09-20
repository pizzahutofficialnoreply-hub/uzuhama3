/**
 * Extract YouTube Video ID from various URL formats
 * (e.g. watch?v=, youtu.be/, shorts/, live/, embed/, m.youtube.com, music.youtube.com, etc.)
 */
export function extractYoutubeId(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  // Clean surrounding whitespace, brackets, quotes, markdown angle brackets
  const str = input.trim().replace(/^[<\"\'\(\[]+|[>\"\'\)\]]+$/g, '').trim();
  if (!str) return null;

  // 1. Direct 11-char Video ID (YouTube IDs consist of base64url characters [a-zA-Z0-9_-])
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // 2. Comprehensive regex matching all common YouTube URL variations
  // Handles: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/shorts/ID, youtube.com/live/ID, youtube.com/embed/ID, m.youtube.com, etc.
  const regex = /(?:youtu\.be\/|(?:[a-zA-Z0-9-]+\.)?youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?.*?v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return match[1];
  }

  // 3. Fallback: v= anywhere in query string parameter
  const vMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (vMatch && vMatch[1]) {
    return vMatch[1];
  }

  // 4. Shorts/live/embed/v direct segment check anywhere in path
  const pathMatch = str.match(/\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Normalizes any YouTube URL format (or raw Video ID) to the canonical standard URL:
 * https://www.youtube.com/watch?v=${videoId}
 */
export function normalizeYoutubeUrl(input: string | undefined | null): string {
  if (!input) return '';
  const vid = extractYoutubeId(input);
  if (vid) {
    return `https://www.youtube.com/watch?v=${vid}`;
  }
  return input.trim();
}

/**
 * Extract Chzzk video/clip/live ID from chzzk URL
 */
export function extractChzzkId(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const match = str.match(/chzzk\.naver\.com\/(?:video|clips|live)\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1].split('?')[0].split('#')[0];
  }
  return null;
}

/**
 * Extract SOOP / AfreecaTV VOD or live ID
 */
export function extractSoopId(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const match = str.match(/(?:afreecatv\.com|sooplive\.co\.kr)\/(?:player\/|video\/)([\w-]+)/i);
  if (match && match[1]) {
    return match[1].split('?')[0].split('#')[0];
  }
  return null;
}

/**
 * Checks whether a given string is any video URL or contains a video domain or video ID
 */
export function isVideoUrl(input: string | undefined | null): boolean {
  if (!input) return false;
  return /youtube\.com|youtu\.be|chzzk\.naver\.com|afreecatv\.com|sooplive\.co\.kr/i.test(input) || !!extractYoutubeId(input);
}

/**
 * Clean URL for fuzzy string matching (strips protocol, www, trailing slashes, and query params)
 */
export function cleanUrlForMatch(url: string): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '') // remove query/hash for path matching
    .replace(/\/+$/, '');
}

/**
 * Check if a target URL matches the search input (by extracted ID or by normalized URL)
 */
export function matchMediaUrl(targetUrl: string | undefined | null, searchInput: string): boolean {
  if (!targetUrl || !searchInput) return false;
  const target = targetUrl.trim();
  const query = searchInput.trim();

  // 1. Check YouTube ID match (풀링크, 단축, 라이브, 쇼츠, 임베드 등 모두 11자리 고유 식별자로 완벽 비교)
  const queryYt = extractYoutubeId(query);
  const targetYt = extractYoutubeId(target);
  if (queryYt && targetYt && queryYt === targetYt) return true;
  // LIKE '%VideoID%' 조건 비교
  if (queryYt && target.includes(queryYt)) return true;
  if (targetYt && query.includes(targetYt)) return true;

  // 2. Check Chzzk ID match
  const queryChzzk = extractChzzkId(query);
  const targetChzzk = extractChzzkId(target);
  if (queryChzzk && targetChzzk && queryChzzk === targetChzzk) return true;
  if (queryChzzk && target.includes(queryChzzk)) return true;
  if (targetChzzk && query.includes(targetChzzk)) return true;

  // 3. Check SOOP / AfreecaTV match
  const querySoop = extractSoopId(query);
  const targetSoop = extractSoopId(target);
  if (querySoop && targetSoop && querySoop === targetSoop) return true;
  if (querySoop && target.includes(querySoop)) return true;
  if (targetSoop && query.includes(targetSoop)) return true;

  // 4. Normalized path substring match
  const cleanedTarget = cleanUrlForMatch(target);
  const cleanedQuery = cleanUrlForMatch(query);
  if (cleanedTarget && cleanedQuery && (cleanedTarget.includes(cleanedQuery) || cleanedQuery.includes(cleanedTarget))) {
    return true;
  }

  // 5. Fallback substring match
  const lowerTarget = target.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerTarget.includes(lowerQuery) || lowerQuery.includes(lowerTarget)) {
    return true;
  }

  return false;
}

/**
 * Check if a BroadcastLog contains any media matching the searchInput
 */
export function matchLogMedia(log: any, searchInput: string): boolean {
  if (!log || !searchInput) return false;
  const query = searchInput.trim();
  if (!query) return false;

  const queryYt = extractYoutubeId(query);

  // 1. Direct URLs
  if (log.youtubeUrl && matchMediaUrl(log.youtubeUrl, query)) return true;
  if (log.chzzkUrl && matchMediaUrl(log.chzzkUrl, query)) return true;
  if (log.liveUrl && matchMediaUrl(log.liveUrl, query)) return true;
  if (log.vodUrl && matchMediaUrl(log.vodUrl, query)) return true;

  // 2. Vods
  if (Array.isArray(log.vods)) {
    for (const v of log.vods) {
      const u = typeof v === 'string' ? v : (v?.url || v?.link);
      if (u && matchMediaUrl(u, query)) return true;
    }
  }

  // 3. Shorts
  if (Array.isArray(log.shorts)) {
    for (const s of log.shorts) {
      const u = typeof s === 'string' ? s : (s?.url || s?.link);
      if (u && matchMediaUrl(u, query)) return true;
    }
  }

  // 4. Edited
  if (Array.isArray(log.edited)) {
    for (const e of log.edited) {
      const u = typeof e === 'string' ? e : (e?.url || e?.link);
      if (u && matchMediaUrl(u, query)) return true;
    }
  }

  // 5. Games links
  if (Array.isArray(log.games)) {
    for (const g of log.games) {
      if (g?.vodUrl && matchMediaUrl(g.vodUrl, query)) return true;
      if (g?.link && matchMediaUrl(g.link, query)) return true;
      if (g?.youtubeUrl && matchMediaUrl(g.youtubeUrl, query)) return true;
    }
  }

  // 6. Fast direct Video ID check across JSON string of media fields if queryYt exists
  if (queryYt) {
    if (log.youtubeUrl && log.youtubeUrl.includes(queryYt)) return true;
    if (Array.isArray(log.vods) && log.vods.some((v: any) => (typeof v === 'string' ? v : v?.url)?.includes(queryYt))) return true;
    if (Array.isArray(log.shorts) && log.shorts.some((s: any) => (typeof s === 'string' ? s : s?.url)?.includes(queryYt))) return true;
    if (Array.isArray(log.edited) && log.edited.some((e: any) => (typeof e === 'string' ? e : e?.url)?.includes(queryYt))) return true;
  }

  return false;
}

