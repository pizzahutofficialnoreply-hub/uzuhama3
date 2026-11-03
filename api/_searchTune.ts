/**
 * 검색 조정 (하루 한 번, 알림 점검(tick) 때 같이 / 관리자가 '지금 조정' 눌러도)
 *
 * 모으는 것 (feedbacks 컬렉션, 방문자가 남김)
 *  - search_report: 검색 결과 카드의 ⋮ > 신고 ("수면방송에 안 맞아요", "연결이 틀려요" …)
 *  - search_rating: 말하듯 검색·줄임말·오타 보정을 쓴 검색 아래 "결과에 만족하시나요?" 👍/👎 (+ 한 줄 의견)
 *  - 일반 제보·제안 중 '검색' 이야기
 *
 * 하는 것
 *  1) 규칙 (AI 없이): 같은 검색어에 '안 맞아요' 신고가 온 영상은 그 검색어에서 빼고, 같은 느낌(수면방송 등)에서 2번 넘게 신고되면 그 느낌 전체에서 뺌
 *  2) AI (Gemini, 하루 1번 호출): 불만족 검색어와 의견을 보고 비슷한 말·줄임말·느낌 단어를 더 넣거나 안 어울리는 장르를 빼자고 제안 → 정해진 모양만 받아서 검사 후 반영
 *  결과는 config/searchTuning 에 저장 → 앱이 검색할 때 그대로 씀 (검색할 때는 AI 를 부르지 않음)
 */

const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest'].filter(Boolean) as string[];
const CONCEPT_KEYS = ['겨울', '여름', '봄', '가을', '크리스마스', '할로윈', '설날', '추석', '명절', '잔잔한 방송', '공포', '웃김', '힐링', '감동', '귀여움', '긴장', '분노', '바다', '우주'];

export type SearchTuning = {
  updatedAt: string;
  /** 검색어(띄어쓰기 없앤 것) → 그 검색어에서 뺄 영상 ID */
  demote: Record<string, string[]>;
  /** 느낌(수면방송 등) → 그 느낌으로 찾을 때 뺄 영상 ID */
  conceptDemote: Record<string, string[]>;
  /** 단어 → 같은 뜻으로 함께 찾을 말 */
  synonyms: Record<string, string[]>;
  /** 느낌별로 더 찾을 말 / 뺄 장르 */
  conceptAdd: Record<string, { expand?: string[]; avoid?: string[] }>;
  log: { day: string; reports: number; ratings: number; bad: number; summary: string; model?: string }[];
};

const sq = (s: string) => String(s || '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
const words = (arr: any, max: number) => [...new Set((Array.isArray(arr) ? arr : []).map((x: any) => String(x || '').trim()).filter((x: string) => x && x.length <= 20 && !/[<>{}"]/.test(x)))].slice(0, max) as string[];
const pushUnique = (arr: string[] = [], add: string[], cap: number) => [...new Set([...arr, ...add])].slice(-cap);
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export async function tuneSearch(db: any, opts: { force?: boolean } = {}) {
  const ref = db.collection('config').doc('searchTuning');
  const metaRef = db.collection('notification_state').doc('searchTune');
  const meta = (await metaRef.get()).data() || {};
  const day = todayKst();
  if (!opts.force && meta.day === day) return { skipped: 'already today' };
  await metaRef.set({ day, startedAt: Date.now() }, { merge: true });

  const since = new Date(Number(meta.lastAt || 0) || Date.now() - 7 * 86400000);
  const snap = await db.collection('feedbacks').where('createdAt', '>', since).orderBy('createdAt', 'asc').limit(800).get();
  const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  const reports = docs.filter((d: any) => d.type === 'search_report');
  const ratings = docs.filter((d: any) => d.type === 'search_rating');
  const general = docs.filter((d: any) => (d.type === 'suggestion' || d.type === 'bug') && /검색|추천/.test(`${d.title || ''} ${d.content || ''}`));

  const cur: SearchTuning = { updatedAt: '', demote: {}, conceptDemote: {}, synonyms: {}, conceptAdd: {}, log: [], ...((await ref.get()).data() || {}) };

  // 1) 규칙: '이 검색어에 안 맞아요'
  const conceptCount = new Map<string, number>();
  reports.forEach((r: any) => {
    if (r.reason !== 'not_match' || !r.videoId) return;
    const q = sq(r.query || '');
    if (q) cur.demote[q] = pushUnique(cur.demote[q], [r.videoId], 200);
    (Array.isArray(r.concepts) ? r.concepts : []).forEach((c: string) => {
      const k = `${c}|${r.videoId}`;
      conceptCount.set(k, (conceptCount.get(k) || 0) + 1);
    });
  });
  // 그 느낌에서 (이번까지 합쳐) 2번 이상 신고된 영상은 느낌 전체에서 빼기
  const prevCounts: Record<string, number> = meta.conceptCounts || {};
  conceptCount.forEach((n, k) => { prevCounts[k] = (prevCounts[k] || 0) + n; });
  Object.entries(prevCounts).forEach(([k, n]) => {
    if (n < 2) return;
    const [c, vid] = k.split('|');
    if (CONCEPT_KEYS.includes(c)) cur.conceptDemote[c] = pushUnique(cur.conceptDemote[c], [vid], 300);
  });

  // 2) AI: 불만족 검색과 의견 → 비슷한 말·느낌 단어 보강
  const bad = ratings.filter((r: any) => r.good === false);
  let summary = `신고 ${reports.length} · 평가 ${ratings.length}(불만족 ${bad.length})`;
  let model: string | undefined;
  const apiKey = process.env.GEMINI_API_KEY;
  const worthAsking = bad.length + reports.filter((r: any) => r.note).length + general.length > 0;
  if (apiKey && worthAsking) {
    const lines = [
      ...bad.slice(0, 60).map((r: any) => `[불만족] 검색어: ${r.query} / 해석: ${r.understood || '-'}${r.note ? ` / 의견: ${String(r.note).slice(0, 120)}` : ''}`),
      ...reports.filter((r: any) => r.note || r.reason !== 'not_match').slice(0, 40).map((r: any) => `[신고:${r.reason}] 검색어: ${r.query || '-'} / 영상: ${String(r.title || '').slice(0, 60)}${r.note ? ` / 의견: ${String(r.note).slice(0, 120)}` : ''}`),
      ...general.slice(0, 15).map((g: any) => `[제보] ${String(g.title || '').slice(0, 60)}: ${String(g.content || '').slice(0, 160)}`),
    ];
    const prompt = `스트리머 "우주하마" 팬 사이트의 영상 검색을 개선하려고 해. 검색은 기기 안에서 규칙으로 돌아가고, 너는 하루 한 번 아래 사용자 반응을 보고 사전만 보강해.
느낌(콘셉트) 목록: ${CONCEPT_KEYS.join(', ')}
현재 추가 사전: ${JSON.stringify({ synonyms: cur.synonyms, conceptAdd: cur.conceptAdd }).slice(0, 1500)}

사용자 반응:
${lines.join('\n')}

규칙:
- synonyms: 검색어 속 단어가 사이트 영상 제목에서 다른 말로 쓰일 법하면 같은 뜻 말 (예: "잠" → ["수면", "자장가"]). 단어마다 최대 5개, 확실한 것만.
- conceptAdd: 위 느낌 목록의 이름만 키로. expand 는 그 느낌으로 찾을 때 더 볼 말, avoid 는 그 느낌에 안 어울리는 게임 장르(예: 공포, FPS). 각각 최대 5개.
- 반응에 근거가 없으면 빈 값으로. 지어내지 말 것.
- summary: 오늘 무엇을 바꿨는지 한국어 한 문장.
JSON 으로만: {"synonyms":{},"conceptAdd":{},"summary":""}`;
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    for (const m of MODELS) {
      try {
        const r = await ai.models.generateContent({ model: m, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.3, httpOptions: { timeout: 25000 } } });
        const out = JSON.parse(r.text || '{}');
        Object.entries(out.synonyms || {}).slice(0, 20).forEach(([k, v]) => {
          const key = sq(k);
          const add = words(v, 5).filter((x) => sq(x) !== key);
          if (key && key.length <= 20 && add.length) cur.synonyms[key] = pushUnique(cur.synonyms[key], add, 8);
        });
        Object.entries(out.conceptAdd || {}).forEach(([k, v]: [string, any]) => {
          if (!CONCEPT_KEYS.includes(k)) return;
          const prev = cur.conceptAdd[k] || {};
          cur.conceptAdd[k] = { expand: pushUnique(prev.expand, words(v?.expand, 5), 15), avoid: pushUnique(prev.avoid, words(v?.avoid, 5), 10) };
        });
        if (typeof out.summary === 'string' && out.summary.trim()) summary = `${summary} · ${out.summary.trim().slice(0, 140)}`;
        model = m;
        break;
      } catch (e: any) {
        summary = `${summary} · AI 실패(${m}): ${String(e?.message || e).slice(0, 60)}`;
      }
    }
  }

  cur.updatedAt = new Date().toISOString();
  cur.log = [{ day, reports: reports.length, ratings: ratings.length, bad: bad.length, summary, ...(model ? { model } : {}) }, ...(cur.log || [])].slice(0, 30);
  await ref.set(cur);
  const lastAt = docs.length ? (docs[docs.length - 1].createdAt?.toMillis?.() || Date.now()) : Number(meta.lastAt || 0) || Date.now();
  await metaRef.set({ day, lastAt, conceptCounts: prevCounts, finishedAt: Date.now() }, { merge: true });
  return { ok: true, reports: reports.length, ratings: ratings.length, bad: bad.length, summary };
}
