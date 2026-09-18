/**
 * Extract YouTube Video ID from various URL formats
 * (e.g. watch?v=, youtu.be/, shorts/, live/, embed/, m.youtube.com, music.youtube.com, etc.)
 */
export function extractYoutubeId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();

  // 1. Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // 2. Comprehensive regex matching all common YouTube URL variations
  // Handles: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/shorts/ID, youtube.com/live/ID, youtube.com/embed/ID, m.youtube.com, etc.
  const regex = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?.*?v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return match[1];
  }

  // 3. Fallback URL search parameter inspection (v= parameter anywhere in query string)
  const vMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (vMatch && vMatch[1]) {
    return vMatch[1];
  }

  // 4. Shorts/live direct segment check
  const pathMatch = str.match(/\/(?:shorts|live)\/([a-zA-Z0-9_-]{11})/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Extract Chzzk video/clip/live ID from chzzk URL
 */
export function extractChzzkId(input: string): string | null {
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
export function extractSoopId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const match = str.match(/(?:afreecatv\.com|sooplive\.co\.kr)\/(?:player\/|video\/)([\w-]+)/i);
  if (match && match[1]) {
    return match[1].split('?')[0].split('#')[0];
  }
  return null;
}

/**
 * Checks whether a given string is any video URL or contains a video domain
 */
export function isVideoUrl(input: string): boolean {
  if (!input) return false;
  return /youtube\.com|youtu\.be|chzzk\.naver\.com|afreecatv\.com|sooplive\.co\.kr/i.test(input);
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

  // 1. Check YouTube ID match
  const queryYt = extractYoutubeId(query);
  const targetYt = extractYoutubeId(target);
  if (queryYt && targetYt && queryYt === targetYt) return true;
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

