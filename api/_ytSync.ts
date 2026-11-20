/**
 * 유튜브에 새로 올라온 편집 영상을 그 방송 기록의 '편집본'에 자동으로 연결
 * (예전 Cloudflare 'chzzk-checker' 의 handleYoutubeSync 를 지금 사이트 구조에 맞게 서버로 옮김)
 *
 * - 채널 업로드 목록에서 최근 영상 15개 (유튜브 할당량 1)
 * - 쇼츠·이미 어디든 연결된 영상은 건너뜀
 * - 올린 날 기준 14일 안의 방송 기록 중, 영상 제목·설명에 그 방송의 게임 이름이 들어 있는 가장 가까운 기록 하나에만 연결
 *   (게임 이름이 안 맞으면 연결하지 않음 → 관리자 '연결 안 된 영상'에서 직접)
 * - 바꾸기 전 모습을 관리자 › 이력(admin_audit)에 남겨서 되돌릴 수 있음
 * - 관리자 › 시스템에서 끌 수 있음 (system.autoYtSyncEnabled === false)
 * - 10분에 한 번만 실제로 함
 */
const YT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC2NFRq9s2neD_Ml0tPhNC2Q';
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const kstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);

export async function ytSync(db: any, opts: { force?: boolean } = {}) {
  const key = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
  if (!key) return { ok: false, reason: 'YOUTUBE_API_KEY 없음' };
  const sys = (await db.collection('config').doc('system').get()).data() || {};
  if (sys.autoYtSyncEnabled === false) return { ok: false, reason: '꺼 둠' };
  const stRef = db.collection('youtube_cache').doc('yt_sync_state');
  const st = (await stRef.get()).data() || {};
  if (!opts.force && Date.now() - Number(st.at || 0) < 10 * 60000) return { ok: true, skipped: '10분 안에 함', last: st.last || null };
  await stRef.set({ at: Date.now() }, { merge: true });

  const pl = 'UU' + YT_CHANNEL_ID.slice(2);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${pl}&maxResults=15&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return { ok: false, reason: `유튜브 ${r.status}` };
  const items = ((await r.json())?.items || []) as any[];

  // 이번 달·지난달 기록 (새 영상은 거의 이 안의 방송)
  const now = new Date(Date.now() + 9 * 3600000);
  const months = [now.toISOString().slice(0, 7), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)];
  const snaps = await Promise.all(months.map((m) => db.collection('logs_by_month').doc(m).get()));
  const logs: any[] = snaps.flatMap((s: any) => Object.values((s.data()?.items || {}) as Record<string, any>)).filter((l: any) => l && !l.isAbsence && !l._patch && l.date);
  const linked = new Set<string>(logs.flatMap((l: any) => [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].map((v: any) => ytId(typeof v === 'string' ? v : v?.url))).filter(Boolean));

  const done: any[] = [];
  const skipped: any[] = [];
  for (const it of items) {
    const sn = it.snippet || {};
    const id = sn.resourceId?.videoId || it.contentDetails?.videoId;
    const title = String(sn.title || '');
    const desc = String(sn.description || '');
    const pub = String(it.contentDetails?.videoPublishedAt || sn.publishedAt || '');
    if (!id || !pub || linked.has(id)) continue;
    if (/#shorts/i.test(`${title} ${desc}`)) continue;
    if (/생방송|다시보기|라이브|live/i.test(title) && /우주하마\s*생방송/.test(title)) continue; // 생방 다시보기는 방송 끝날 때 따로 연결
    const day = kstDate(pub);
    const text = norm(`${title} ${desc.slice(0, 600)}`);
    // 올린 날 이전 14일 안, 게임 이름이 제목·설명에 들어 있는 기록 → 가장 가까운 날
    const cands = logs
      .filter((l) => l.date <= day && Date.parse(day) - Date.parse(l.date) <= 14 * 86400000)
      .map((l) => {
        const names = [...(l.games || []).map((g: any) => g?.name), l.game].map(norm).filter((n) => n.length >= 2);
        return { l, hit: names.some((n) => text.includes(n)) };
      })
      .filter((x) => x.hit)
      .sort((a, b) => b.l.date.localeCompare(a.l.date));
    if (!cands.length) { skipped.push({ id, title, reason: '맞는 게임 기록 없음' }); continue; }
    // 같은 날 기록이 둘 이상이면 어느 쪽인지 모르니 건너뜀 (확실할 때만)
    const best = cands[0].l;
    if (cands.filter((x) => x.l.date === best.date).length > 1) { skipped.push({ id, title, reason: '같은 날 기록이 여러 개' }); continue; }
    const entry = { title, url: `https://www.youtube.com/watch?v=${id}` };
    const monthRef = db.collection('logs_by_month').doc(best.date.slice(0, 7));
    const res = await db.runTransaction(async (tx: any) => {
      const cur = ((await tx.get(monthRef)).data()?.items || {})[best.id];
      if (!cur) return null;
      if ((cur.edited || []).some((e: any) => ytId(e?.url) === id)) return null;
      const after = { ...cur, edited: [...(cur.edited || []), entry] };
      tx.set(monthRef, { updatedAt: new Date().toISOString(), items: { [best.id]: after } }, { merge: true });
      tx.set(db.collection('logs').doc(best.id), after, { merge: true });
      return { before: cur, after };
    });
    if (!res) continue;
    linked.add(id);
    done.push({ id, title, logId: best.id, date: best.date });
    await db.collection('admin_audit').add({ action: 'ytSync', logId: best.id, date: best.date, text: `편집본 자동 연결: ${title}`, before: res.before, after: res.after, by: '자동', at: new Date().toISOString() }).catch(() => {});
  }
  const last = { at: new Date().toISOString(), linked: done.length, skipped: skipped.length };
  await stRef.set({ last }, { merge: true });
  return { ok: true, linked: done, skipped: skipped.slice(0, 10) };
}
