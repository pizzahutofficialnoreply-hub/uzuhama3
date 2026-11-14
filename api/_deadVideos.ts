/**
 * 사라진 영상 찾기 (하루 한 번, 알림 점검 때)
 * 방송 기록에 들어 있는 유튜브 링크(편집본·쇼츠·다시보기)를 유튜브에 물어봐서
 * 삭제됐거나 비공개로 바뀐 것을 config/deadVideos 에 모아 둠 → 관리자 '연동' 탭에 표시
 * 유튜브 한도: 50개에 1단위 (2,500개면 50단위)
 */
const ID_RE = /(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/;
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export async function checkDeadVideos(db: any, opts: { force?: boolean } = {}) {
  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!key) return { skipped: 'no key' };
  const metaRef = db.collection('notification_state').doc('deadVideos');
  const meta = (await metaRef.get()).data() || {};
  const day = todayKst();
  if (!opts.force && meta.day === day) return { skipped: 'already today' };
  await metaRef.set({ day, startedAt: Date.now() }, { merge: true });

  // 기록 속 유튜브 링크 모으기
  const where = new Map<string, { date: string; slot: string; title: string; logId: string }>();
  // 사이트가 보여 주는 기록 (logs 컬렉션 전체를 읽으면 기록 수만큼 읽기가 들어서)
  const { loadSiteLogs } = await import('./_siteLogs.js');
  const { logs } = await loadSiteLogs(db);
  logs.forEach((l: any) => {
    (['edited', 'shorts', 'vods'] as const).forEach((slot) => (Array.isArray(l[slot]) ? l[slot] : []).forEach((it: any) => {
      const url = typeof it === 'string' ? it : it?.url || '';
      const id = ID_RE.exec(url)?.[1];
      if (id && !where.has(id)) where.set(id, { date: l.date || '', slot, title: (typeof it === 'string' ? '' : it?.title) || '', logId: l.id });
    }));
  });
  const ids = [...where.keys()];
  const alive = new Map<string, string>(); // id → privacyStatus
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${chunk.join(',')}&key=${key}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { error: `YouTube ${r.status}`, checked: i };
    const j: any = await r.json();
    (j.items || []).forEach((v: any) => alive.set(v.id, v.status?.privacyStatus || 'public'));
  }
  const items: Record<string, any> = {};
  ids.forEach((id) => {
    const st = alive.get(id);
    if (st === undefined || st === 'private') items[id] = { ...where.get(id), reason: st === 'private' ? '비공개' : '삭제됨' };
  });
  const out = { checkedAt: new Date().toISOString(), total: ids.length, count: Object.keys(items).length, items };
  await db.collection('config').doc('deadVideos').set(out);
  await metaRef.set({ finishedAt: Date.now(), total: ids.length, dead: out.count }, { merge: true });
  return { total: ids.length, dead: out.count };
}
