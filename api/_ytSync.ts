/**
 * 유튜브에 새로 올라온 편집 영상을 그 방송 기록의 '편집본'에 자동으로 연결
 * (예전 Cloudflare 'chzzk-checker' 의 handleYoutubeSync 를 지금 사이트 구조에 맞게 서버로 옮김)
 *
 * 게임 이름 찾기 (설명창 → 해시태그 → 제목 순)
 *  - 요즘 설명창 맨 위: "The Corridor 더 코리도르\n우주하마 UZUHAMA" → '우주하마' 줄 앞까지가 게임 이름 (영문·한글 둘 다 봄)
 *  - 예전 영상: #게임이름 해시태그, 아니면 제목에 기록의 게임 이름이 들어 있는지
 * 어느 방송인지
 *  - 올린 날 전 90일 안, 같은 게임을 한 방송
 *  - 시리즈 번호: 설명에 '2' 가 있으면 2편 방송만. 번호가 없으면 같은 이름(번호 없는 것)이 먼저, 없으면 가장 최근 편
 *  - 같은 게임을 며칠·몇 주 간격(30일 안)으로 이어서 했으면 그 방송들 전부 (여러 날 생방) / 한 달 넘게 띄었으면 가장 최근 묶음만
 *  - 같은 게임 방송이 너무 많으면(90일 안 8번 넘게, 예: 메챠카멜레온) 헷갈리니 가장 최근 방송에만 넣고 '확인 필요'
 * 자동으로 넣은 것은 모두 관리자 › 연동 › '자동 연결 확인'에 올라감 (승인 전에도 사이트에는 보임) · 이력에서 되돌리기도 됨
 * 관리자 › 시스템에서 끌 수 있음 (system.autoYtSyncEnabled === false) · 10분에 한 번만 실제로 함
 */
const YT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC2NFRq9s2neD_Ml0tPhNC2Q';
const DAY = 86400000;
export const normG = (s: string) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const ytId = (u: string) => (String(u || '').match(/(?:youtu\.be\/|v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || '';
const kstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);

/** 시리즈 번호 떼기: 'Mecha 2' → ['mecha', '2'], 'Game II' → ['game','2'] */
export function seriesOf(name: string): { base: string; n: string } {
  const s = String(name || '').trim().replace(/\s*[:\-–]\s*$/, '');
  const roman: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5' };
  const m = s.match(/^(.*?)[\s:]*(?:(\d{1,2})|\b(ii|iii|iv|v)\b)\s*(?:편)?$/i);
  if (m && m[1] && normG(m[1]).length >= 2) return { base: normG(m[1]), n: m[2] || roman[(m[3] || '').toLowerCase()] || '' };
  return { base: normG(s), n: '' };
}

/** 설명창·해시태그·제목에서 게임 이름 후보 */
export function gameNamesFrom(title: string, desc: string): string[] {
  const out: string[] = [];
  const lines = String(desc || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const stop = lines.findIndex((l) => /우주하마|uzuhama/i.test(l));
  if (stop > 0 && stop <= 3) {
    for (const l of lines.slice(0, stop)) {
      if (/https?:|후원|팬카페|구독/.test(l) || l.length > 80) continue;
      out.push(l);
      // "The Corridor 더 코리도르" → 영문 쪽 · 한글 쪽 따로도
      const en = l.replace(/[가-힣].*$/, '').trim();
      const ko = (l.match(/[가-힣][가-힣0-9\s:!?'·-]*$/) || [])[0]?.trim() || '';
      if (en && en !== l) out.push(en);
      if (ko && ko !== l) out.push(ko);
    }
  }
  for (const h of `${title} ${desc}`.match(/#[^\s#]{2,40}/g) || []) {
    if (!/shorts|우주하마|uzuhama|스트리머|게임방송/i.test(h)) out.push(h.slice(1).replace(/_/g, ' '));
  }
  return [...new Set(out.filter((x) => normG(x).length >= 2))];
}

type Log = { id: string; date: string; game?: string; games?: { name: string }[]; edited?: any[]; vods?: any[]; shorts?: any[] };
const namesOfLog = (l: Log) => [...(l.games || []).map((g) => g?.name), l.game].filter(Boolean) as string[];

/** 영상 하나 → 넣을 방송들 + 확인 필요 여부 */
export function pickLogs(logs: Log[], title: string, desc: string, day: string): { logs: Log[]; reason: string; ambiguous: boolean; candidates: Log[] } | null {
  const want = gameNamesFrom(title, desc).map(seriesOf);
  const text = normG(`${title} ${desc.slice(0, 600)}`);
  const recent = logs.filter((l) => l.date <= day && Date.parse(day) - Date.parse(l.date) <= 90 * DAY);
  // 각 방송이 맞는 정도: 3 이름·번호까지 같음 / 2 번호 없는 이름이 같은 게임의 다른 편 / 1 제목·설명에 기록의 게임 이름이 들어 있음
  const score = (l: Log) => {
    let best = 0;
    for (const n of namesOfLog(l)) {
      const g = seriesOf(n);
      if (g.base.length < 2) continue;
      for (const w of want) {
        if (w.base === g.base && w.n === g.n) best = Math.max(best, 3);
        else if (w.base === g.base && !w.n) best = Math.max(best, 2);
      }
      if (!want.length && text.includes(normG(n)) && normG(n).length >= 3) best = Math.max(best, 1);
    }
    return best;
  };
  const scored = recent.map((l) => ({ l, s: score(l) })).filter((x) => x.s > 0);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((x) => x.s));
  let cands = scored.filter((x) => x.s === top).map((x) => x.l).sort((a, b) => b.date.localeCompare(a.date));
  // 번호 없는 이름이 여러 편에 걸리면 가장 최근 편(가장 최근 방송의 게임 이름)만
  if (top === 2) {
    const latest = namesOfLog(cands[0]).map(seriesOf).find((g) => want.some((w) => w.base === g.base));
    if (latest) cands = cands.filter((l) => namesOfLog(l).map(seriesOf).some((g) => g.base === latest.base && g.n === latest.n));
  }
  // 가장 최근부터 30일 안 간격으로 이어진 묶음
  const chain: Log[] = [cands[0]];
  for (const l of cands.slice(1)) {
    if (Date.parse(chain[chain.length - 1].date) - Date.parse(l.date) <= 30 * DAY) chain.push(l);
    else break;
  }
  // 같은 날 방송이 여러 개(하루 두 번)면 그날은 모두
  const many = cands.length > 8 || chain.length > 6;
  const picked = many ? cands.filter((l) => l.date === cands[0].date) : chain;
  const sorted = [...picked].sort((a, b) => a.date.localeCompare(b.date));
  const reason = many ? `같은 게임 방송이 ${cands.length}번이라 가장 최근 방송에만 넣음 (확인 필요)`
    : top === 1 ? '설명창에 게임 이름이 없어 제목으로 맞춤 (확인 필요)'
    : top === 2 ? '설명창 게임 이름에 편 번호가 없어 가장 최근 편으로'
    : sorted.length > 1 ? `같은 게임을 이어서 한 ${sorted.length}번의 방송` : '설명창 게임 이름이 같은 방송';
  return { logs: sorted, reason, ambiguous: many || top === 1, candidates: cands.slice(0, 20) };
}

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

  // 최근 4달 기록
  const now = new Date(Date.now() + 9 * 3600000);
  const months = [0, 1, 2, 3].map((k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
  const snaps = await Promise.all(months.map((m) => db.collection('logs_by_month').doc(m).get()));
  const logs: Log[] = snaps.flatMap((s: any) => Object.values((s.data()?.items || {}) as Record<string, any>)).filter((l: any) => l && !l.isAbsence && !l._patch && l.date);
  const linked = new Set<string>(logs.flatMap((l: any) => [...(l.vods || []), ...(l.edited || []), ...(l.shorts || [])].map((v: any) => ytId(typeof v === 'string' ? v : v?.url))).filter(Boolean));
  const reviewed = new Set<string>(((await db.collection('yt_auto').select().limit(500).get()).docs || []).map((d: any) => d.id));

  const done: any[] = [];
  const skipped: any[] = [];
  for (const it of items) {
    const sn = it.snippet || {};
    const id = sn.resourceId?.videoId || it.contentDetails?.videoId;
    const title = String(sn.title || '');
    const desc = String(sn.description || '');
    const pub = String(it.contentDetails?.videoPublishedAt || sn.publishedAt || '');
    if (!id || !pub || linked.has(id) || reviewed.has(id)) continue;
    if (/#shorts/i.test(`${title} ${desc}`)) continue;
    if (/^우주하마\s*생방송/.test(title)) continue; // 생방 다시보기는 방송 끝날 때 따로 연결
    const p = pickLogs(logs, title, desc, kstDate(pub));
    if (!p) { skipped.push({ id, title, reason: '맞는 게임 기록 없음' }); continue; }
    const dates = p.logs.map((l) => l.date);
    const entry = { title, url: `https://www.youtube.com/watch?v=${id}`, autoLinked: true, ...(dates.length > 1 ? { allBroadcastDates: dates } : {}) };
    const changed: any[] = [];
    for (const l of p.logs) {
      const monthRef = db.collection('logs_by_month').doc(l.date.slice(0, 7));
      const res = await db.runTransaction(async (tx: any) => {
        const cur = ((await tx.get(monthRef)).data()?.items || {})[l.id];
        if (!cur || (cur.edited || []).some((e: any) => ytId(e?.url) === id)) return null;
        const after = { ...cur, edited: [...(cur.edited || []), entry] };
        tx.set(monthRef, { updatedAt: new Date().toISOString(), items: { [l.id]: after } }, { merge: true });
        tx.set(db.collection('logs').doc(l.id), after, { merge: true });
        return { before: cur, after };
      });
      if (res) {
        changed.push({ id: l.id, date: l.date });
        await db.collection('admin_audit').add({ action: 'ytSync', logId: l.id, date: l.date, text: `편집본 자동 연결: ${title}`, before: res.before, after: res.after, by: '자동', at: new Date().toISOString() }).catch(() => {});
      }
    }
    if (!changed.length) continue;
    linked.add(id);
    // 관리자 › 연동 › 자동 연결 확인 (승인 전에도 사이트에는 보임)
    await db.collection('yt_auto').doc(id).set({
      id, title, publishedAt: pub, logs: changed, reason: p.reason, ambiguous: p.ambiguous,
      candidates: p.candidates.map((l) => ({ id: l.id, date: l.date, game: namesOfLog(l)[0] || '' })),
      names: gameNamesFrom(title, desc).slice(0, 6), status: 'pending', at: new Date().toISOString(),
    });
    done.push({ id, title, logs: changed, reason: p.reason });
  }
  const last = { at: new Date().toISOString(), linked: done.length, skipped: skipped.length };
  await stRef.set({ last }, { merge: true });
  return { ok: true, linked: done, skipped: skipped.slice(0, 10) };
}
