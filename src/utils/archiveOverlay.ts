/**
 * 아카이브(JSON) + Firestore logs_by_month 합치기 규칙 (사이트와 캘린더 피드가 똑같이 사용)
 *  - JSON(2016~2025)을 원본으로 두고, logs_by_month 의 항목을 덮어씀
 *  - 관리자가 JSON 기록을 고친 항목(_patch: true)은 바뀐 필드만 덮어씀
 *  - 예전 버전이 저장한 전체 사본(_patch 없음)은 추가된 영상·몰아보기·쇼츠·게임 링크만 합침
 *  - JSON 에 없는 날짜(2026년 이후 등)는 그대로 추가
 */

const PATCH_META_KEYS = new Set(['id', 'date', '_patch', '_updatedAt']);

export const normalizeGameLinks = (log: any) =>
  Array.isArray(log?.games)
    ? log.games.map((g: any) => ({ ...g, link: g?.link || g?.url || g?.gameUrl || g?.steamUrl || log.gameLink || '' }))
    : log?.games;

export function normalizeHistorical(data: any): Record<string, any> {
  const map: Record<string, any> = {};
  const processLog = (log: any, idKey?: string) => {
    if (!log || typeof log !== 'object') return;
    const id = log.id || idKey;
    if (!id) return;
    const out = { ...log, id };
    if (Array.isArray(log.games)) {
      out.games = log.games.map((g: any) => ({
        name: typeof g === 'string' ? g : (g.name || g.game || ''),
        link: typeof g === 'string' ? '' : (g.link || g.url || g.gameUrl || g.steamUrl || log.gameLink || log.gameUrl || ''),
        category: typeof g === 'string' ? '' : (g.category || log.category || ''),
      }));
    }
    map[id] = out;
  };
  if (Array.isArray(data)) data.forEach((l) => processLog(l));
  else if (data && typeof data === 'object') Object.entries(data).forEach(([k, v]) => processLog(v, k));
  return map;
}

export function applyArchivePatch(base: any, patch: any): any {
  const merged: any = { ...base };
  Object.keys(patch).forEach((k) => {
    if (PATCH_META_KEYS.has(k)) return;
    if (patch[k] === null) delete merged[k];
    else merged[k] = patch[k];
  });
  merged.id = base.id;
  merged.games = normalizeGameLinks(merged);
  return merged;
}

export function mergeLegacyArchiveCopy(base: any, copy: any): any {
  const unionByUrl = (a: any[] = [], b: any[] = [], preferB: (x: any) => boolean) => {
    const out = [...(Array.isArray(a) ? a : [])];
    (Array.isArray(b) ? b : []).forEach((item) => {
      if (!item?.url) return;
      const idx = out.findIndex((x) => x?.url === item.url);
      if (idx < 0) out.push(item);
      else if (preferB(item)) out[idx] = { ...out[idx], ...item };
    });
    return out;
  };
  const isComp = (x: any) => Boolean(x?.isCompilation || x?.compilationId);
  const baseGames: any[] = Array.isArray(base.games) ? base.games.map((g: any) => ({ ...g })) : [];
  (Array.isArray(copy.games) ? copy.games : []).forEach((g: any) => {
    if (!g?.name) return;
    const key = String(g.name).trim().toLowerCase();
    const found = baseGames.find((bg) => String(bg?.name || '').trim().toLowerCase() === key);
    const link = g.link || g.url || g.gameUrl || g.steamUrl || '';
    if (found) {
      if (!found.link && link) found.link = link;
    } else {
      baseGames.push({ name: g.name, link, category: typeof g.category === 'string' ? g.category : '' });
    }
  });
  return {
    ...base,
    games: baseGames,
    edited: unionByUrl(base.edited, copy.edited, isComp),
    vods: unionByUrl(base.vods, copy.vods, () => false),
    shorts: unionByUrl(base.shorts, copy.shorts, () => false),
  };
}

/** logs_by_month 문서 데이터 목록을 JSON 원본 위에 덮어써서 최종 기록 맵을 만듦 */
export function overlayMonthDocs(historical: Record<string, any>, monthDocs: any[]): Record<string, any> {
  const logsMap: Record<string, any> = { ...historical };
  const byDate = new Map<string, any>();
  Object.values(historical).forEach((l: any) => { if (l?.date && !byDate.has(l.date)) byDate.set(l.date, l); });
  const entries: { key: string; val: any; dc?: boolean }[] = [];
  monthDocs.forEach((docData) => {
    if (docData?.items && typeof docData.items === 'object') {
      Object.entries(docData.items).forEach(([k, val]: [string, any]) => entries.push({ key: val?.id || k, val, dc: k.endsWith('__dc') }));
    }
    Object.entries(docData || {}).forEach(([key, val]: [string, any]) => {
      if (key !== 'month' && key !== 'updatedAt' && key !== 'items' && val && typeof val === 'object' && val.date) {
        entries.push({ key: val.id || key, val });
      }
    });
  });
  // 옛 전체 사본을 먼저, 새 방식 수정분(_patch)을 나중에 적용
  // 자동 데이터 검증(__dc: 유튜브 기준 날짜·시간)은 맨 나중에
  entries.sort((x, y) => Number(Boolean(x.val?._patch)) - Number(Boolean(y.val?._patch)) || Number(Boolean(x.dc)) - Number(Boolean(y.dc)));
  entries.forEach(({ key, val }) => {
    if (!val || !val.date) return;
    const base = historical[key] || byDate.get(val.date);
    if (!base) {
      logsMap[key] = { ...val, id: key, games: normalizeGameLinks(val) };
      return;
    }
    const current = logsMap[base.id] || base;
    logsMap[base.id] = val._patch ? applyArchivePatch(current, val) : mergeLegacyArchiveCopy(current, val);
  });
  return logsMap;
}
