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
const SET_KEYS = ['absence', 'high', 'medium', 'lowDay', 'lowNight', 'streamedToday'] as const;
type SetKey = typeof SET_KEYS[number];
const PER_SET = 25;

function buildPrompt(reason: string, day: string) {
  return `너는 스트리머 "우주하마"의 비공식 팬 사이트 "우주하마 방송 예측"의 문구 담당이야.
메인 화면 "방송 켜질 확률" 카드 아래 작은 상태 문구를 상황별로 만들어줘. 오늘 날짜는 ${day}.

규칙:
- 한국어, 상황별 ${PER_SET}개씩, 각 문구 6~22자, 해요체, 친근하고 따뜻하게
- 말투·소재를 최대한 다양하게 (응원, 기다림, 일상, 날씨·계절감, 가벼운 농담 등), 비슷한 문장 반복 금지
- 이모지는 문구당 최대 1개, 전체의 3분의 1 이하만
- 확률 숫자나 구체적 시간을 지어내지 말 것, 스트리머를 비하하거나 의학적 조언·진단처럼 말하지 말 것

상황:
- absence: 현재 휴방 중. 휴방 사유 "${reason || '없음'}". ${reason ? '사유를 재치 있게 살리되 걱정·응원도 섞기 (예: 사유가 "엉덩이 기억상실증"이면 "엉덩이 찾는 중이에요", "쾌유를 빌어요" 같은 느낌).' : '사유가 없으면 빈 배열.'}
- high: 곧 방송이 켜질 것 같은 시간대 (설레는 기대감)
- medium: 켜질 수도 있는 시간대 (차분한 기대)
- lowDay: 낮 시간, 아직 켜질 가능성 낮음 (여유)
- lowNight: 늦은 밤·새벽, 가능성 낮음 (편안한 밤 인사)
- streamedToday: 오늘 방송이 이미 끝남 (수고 인사, 다음 방송 기대)

JSON 으로만 답해: {"absence":[...],"high":[...],"medium":[...],"lowDay":[...],"lowNight":[...],"streamedToday":[...]}`;
}

function sanitizeSets(raw: any): Record<SetKey, string[]> {
  const out = {} as Record<SetKey, string[]>;
  SET_KEYS.forEach((k) => {
    const arr = Array.isArray(raw?.[k]) ? raw[k] : [];
    out[k] = [...new Set(arr.map((x: any) => String(x || '').trim()).filter((x: string) => x.length >= 4 && x.length <= 30))].slice(0, 40) as string[];
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

    const ref = db.collection('status_messages').doc('current');
    const current = (await ref.get()).data() || null;
    const send = (data: any, extra: Record<string, any> = {}) => {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
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
          contents: buildPrompt(reason, day),
          config: { responseMimeType: 'application/json', temperature: 1.1, httpOptions: { timeout: 25000 } },
        });
        const sets = sanitizeSets(JSON.parse(r.text || '{}'));
        if (sets.high.length >= 5 && sets.lowDay.length >= 5) {
          const doc = { key, reason, sets, model, generatedAt: now.toISOString(), lockUntil: 0 };
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
