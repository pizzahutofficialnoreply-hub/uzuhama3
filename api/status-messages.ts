import { setCorsHeaders } from './_cors.js';
import { absenceReasonForMessages, statusMessageKey, broadcastDayStr } from '../src/utils/probability.js';

/**
 * 확률 카드 상태 문구 (GET /api/status-messages)
 * - Gemini Flash-Lite 로 상황별 문구를 수십 개씩 만들어 Firestore status_messages/current 에 저장 (누적 X, 매번 교체)
 * - 새로 만드는 조건(키): 방송일(오전 6시 기준)이 바뀌었을 때, 휴방이 시작·종료되거나 사유가 바뀌었을 때
 * - 앱은 같은 키 묶음을 로컬에 저장해 두고, 키가 바뀔 때만 이 API 를 호출
 * - 확률이 오르내리는 건 미리 만들어 둔 상황별 묶음(high/medium/low...) 중에서 바로 골라 쓰므로 재생성 불필요
 */

const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
  .filter(Boolean) as string[];
const SET_KEYS = ['absence', 'high', 'medium', 'lowDay', 'lowNight', 'streamedToday', 'longWait'] as const;
type SetKey = typeof SET_KEYS[number];
const PER_SET = 25;

/** 마지막 방송 후 지난 날수에 맞는 말투 안내 */
function waitGuide(waitDays: number) {
  if (waitDays < 3) return '';
  const span = waitDays >= 60 ? `${Math.floor(waitDays / 30)}달 넘게` : waitDays >= 30 ? '한 달 넘게' : waitDays >= 14 ? '2주 넘게' : waitDays >= 7 ? '일주일 넘게' : '며칠째';
  return `
- 지금 마지막 방송 후 ${waitDays}일째(${span}) 방송이 없어. 모든 상황의 문구가 이 긴 기다림을 알고 있는 팬의 말투여야 해.
  ${waitDays >= 7 ? `"기다림은 즐거워요", "오늘도 설레요"처럼 아무 일 없는 듯 들뜬 말은 금지. 대신 그리움·안부·담담한 응원 (예: "많이 보고 싶어요", "${span} 됐네요", "건강하게만 지내 주세요", "언제 오셔도 반가울 거예요", "심심하지만 기다릴게요").` : '조금 길어진 걸 살짝 아쉬워하는 말투로.'}
  날짜 수는 '${span}' 정도로만 말하고 정확한 날수는 쓰지 말 것.`;
}

function buildPrompt(reason: string, day: string, waitDays = 0) {
  return `너는 스트리머 "우주하마"의 비공식 팬 사이트 "우주하마 방송 예측"의 문구 담당이야.
메인 화면 "방송 켜질 확률" 카드 아래 작은 상태 문구를 상황별로 만들어줘. 오늘 날짜는 ${day}.

규칙:
- 한국어, 상황별 ${PER_SET}개씩, 각 문구 6~22자, 해요체, 친근하고 따뜻하게
- 말투·소재를 최대한 다양하게 (응원, 기다림, 일상, 날씨·계절감, 가벼운 농담 등), 비슷한 문장 반복 금지
- 이모지는 문구당 최대 1개, 전체의 3분의 1 이하만
- 확률 숫자나 구체적 시간을 지어내지 말 것, 스트리머를 비하하거나 의학적 조언·진단처럼 말하지 말 것
- 말하는 사람은 방송을 기다리는 '팬(시청자)' 한 명이야. 스트리머 본인·채널 주인·운영자·관리자처럼 말하지 말 것
  (금지 예: "유튜브 놀러와요", "채널 구독해 주세요", "방송 보러 와 주세요", "저희 채널", "좋아요·알림 설정 부탁해요")
  (좋은 예: "오늘은 켜지려나요?", "기다리는 동안 다시보기 봐요", "푹 쉬고 오세요")
- 팬은 스트리머가 지금 뭘 하는지 몰라. 스트리머의 현재 상태·행동을 사실처럼 전하지 말 것 (본인이 근황을 알리는 말투도, 옆에서 지켜보는 듯한 말투도 금지)
  (금지 예: "지금도 약 잘 챙겨 먹고 누워 있어요", "푹 쉬는 중이에요", "열심히 준비하고 있어요", "엉덩이 찾는 중이에요", "곧 돌아올게요")
  (대신 팬의 바람·응원·안부로: "약 잘 챙겨 드세요", "푹 쉬고 오세요", "엉덩이 꼭 찾길 바라요", "얼른 나으세요", "준비 중이려나요?")
- 주어가 생략돼도 스트리머가 말하는 것처럼 들리면 안 돼 ("돌아올게요", "기다려 주세요", "보고 싶었죠?" 금지)
${waitGuide(waitDays)}
- medium·lowDay·lowNight·streamedToday·absence 문구 중 약 4분의 1은 기다리는 동안 지난 방송 영상을 보자는 내용으로, 반드시 '영상' 또는 '다시보기' 단어를 넣을 것 (예: "옛날 영상이나 보면서 기다려요", "다시보기 정주행 어때요?") — 사이트에서 이 단어를 누르면 추천 영상으로 이동함

상황:
- absence: 현재 휴방 중. 휴방 사유 "${reason || '없음'}". ${reason ? '사유를 재치 있게 살리되 팬 입장의 걱정·응원으로 (예: 사유가 "엉덩이 기억상실증"이면 "엉덩이 꼭 찾길 바라요", "쾌유를 빌어요" 같은 느낌). 스트리머가 지금 어떻게 지내는지 단정하지 말 것.' : '사유가 없으면 빈 배열.'}
- high: 곧 방송이 켜질 것 같은 시간대 (설레는 기대감)
- medium: 켜질 수도 있는 시간대 (차분한 기대)
- lowDay: 낮 시간, 아직 켜질 가능성 낮음 (여유)
- lowNight: 늦은 밤·새벽, 가능성 낮음 (편안한 밤 인사)
- lowNight 말고는 '밤·새벽·아침·점심·저녁' 같은 하루 중 시간을 말하는 단어를 쓰지 말 것 (아무 시간에나 보여서)
- streamedToday: 오늘 방송이 이미 끝남 (수고 인사, 다음 방송 기대)
- longWait: ${waitDays >= 7 ? '방송이 오래 없을 때 확률이 낮은 시간에 보여 줄 문구 (그리움, 안부, 심심함, 담담한 기다림. 억지로 밝게 하지 말 것)' : '지금은 해당 없음 → 빈 배열'}

JSON 으로만 답해: {"absence":[...],"high":[...],"medium":[...],"lowDay":[...],"lowNight":[...],"streamedToday":[...],"longWait":[...]}`;
}

// 팬이 아니라 채널 주인·운영자처럼 들리는 문구는 버림
export const OWNER_VOICE = /(놀러\s*와|놀러\s*오세요|들러\s*주|와\s*주세요|구독|좋아요\s*(를\s*)?(눌|부탁)|알림\s*(설정|켜)|저희|우리\s*채널|제\s*채널|채널에|방송\s*보러\s*와|돌아올게|돌아갈게|기다려\s*주세요|기다려\s*줘|보고\s*싶었죠|켤게요)/;
// 스트리머의 지금 상태를 사실처럼 전하는 문구 ("약 잘 챙겨 먹고 누워 있어요", "쉬는 중이에요")도 버림
export const STATE_REPORT = /((누워|자고|쉬고|먹고|챙겨\s*먹고|준비하고|회복하고|치료받고|요양하고|앓고|병원에)\s*(있어요|있대요|있답니다|있는\s*중)|(쉬는|회복\s*하는|회복하는|치료\s*중인|찾는|준비하는|자는|요양하는)\s*중이(에요|래요|랍니다)|(회복|치료|요양|준비)\s*중이(에요|래요))/;

function sanitizeSets(raw: any): Record<SetKey, string[]> {
  const out = {} as Record<SetKey, string[]>;
  SET_KEYS.forEach((k) => {
    const arr = Array.isArray(raw?.[k]) ? raw[k] : [];
    out[k] = [...new Set(arr.map((x: any) => String(x || '').trim()).filter((x: string) => x.length >= 4 && x.length <= 30 && !OWNER_VOICE.test(x) && !STATE_REPORT.test(x)))].slice(0, 40) as string[];
  });
  return out;
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { db } = await import('./_firebase.js');
    const now = new Date();
    const system = (await db.collection('config').doc('system').get()).data() || {};
    const key = statusMessageKey(system as any, now);
    const reason = absenceReasonForMessages(system as any, now);
    const day = broadcastDayStr(now);
    // 마지막 방송 후 지난 날수 (오래 쉬면 문구 말투가 달라짐)
    let waitDays = 0;
    try {
      const snap = await db.collection('logs').orderBy('date', 'desc').limit(20).get();
      const last = snap.docs.map((d: any) => d.data()).find((l: any) => !l.isAbsence && l.date && l.date <= day)?.date;
      if (last) waitDays = Math.max(0, Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86400000));
    } catch { /* 모르면 0 */ }

    const ref = db.collection('status_messages').doc('current');
    const current = (await ref.get()).data() || null;
    const send = (data: any, extra: Record<string, any> = {}) => {
      res.setHeader('Cache-Control', data?.key === key && data?.sets ? 'public, s-maxage=1800, stale-while-revalidate=3600' : 'public, s-maxage=60');
      return res.status(200).json({ key: data?.key || null, sets: data?.sets || null, generatedAt: data?.generatedAt || null, model: data?.model || null, ...extra });
    };
    if (current?.key === key && current?.sets) return send(current);

    // 동시에 여러 요청이 와도 한 번만 생성 (90초 잠금)
    const acquired = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : {};
      if (d?.key === key && d?.sets) return false;
      if (d?.lockUntil && d.lockUntil > Date.now()) return false;
      tx.set(ref, { lockUntil: Date.now() + 90000 }, { merge: true });
      return true;
    });
    if (!acquired) return send(current, { pending: true });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      await ref.set({ lockUntil: 0 }, { merge: true });
      return send(current, { pending: false, error: 'GEMINI_API_KEY 환경 변수가 없습니다.' });
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const errors: string[] = [];
    for (const model of MODELS) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: buildPrompt(reason, day, waitDays),
          config: { responseMimeType: 'application/json', temperature: 1.1, httpOptions: { timeout: 25000 } },
        });
        const sets = sanitizeSets(JSON.parse(r.text || '{}'));
        if (sets.high.length >= 5 && sets.lowDay.length >= 5) {
          const doc = { key, reason, waitDays, sets, model, generatedAt: now.toISOString(), lockUntil: 0 };
          await ref.set(doc); // 누적하지 않고 통째로 교체
          return send(doc);
        }
        errors.push(`${model}: 응답 형식 부족`);
      } catch (e: any) {
        errors.push(`${model}: ${String(e?.message || e).slice(0, 160)}`);
      }
    }
    await ref.set({ lockUntil: 0 }, { merge: true });
    return send(current, { pending: false, error: errors.join(' / ') });
  } catch (e: any) {
    console.error('[status-messages] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
