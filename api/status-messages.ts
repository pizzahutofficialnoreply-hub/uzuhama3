import { setCorsHeaders } from './_cors.js';
import { isAbsencePeriodActive, kstParts } from '../src/utils/probability.js';

/**
 * 확률 카드 상태 문구 (GET /api/status-messages)
 * - Gemini 로 상황별 문구 묶음을 만들어 Firestore status_messages/current 에 저장, 모든 사용자가 같은 묶음 사용
 * - 다시 만드는 조건: 날짜(KST)가 바뀌었거나 휴방 사유가 바뀌었을 때 → 하루 최대 1~2회 호출
 * - 생성 실패 시 이전 묶음(있으면)을 그대로 돌려주고, 클라이언트는 기본 문구로 대체
 */

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const SET_KEYS = ['absence', 'high', 'medium', 'lowDay', 'lowNight', 'streamedToday'] as const;
type SetKey = typeof SET_KEYS[number];

function absenceReasonText(system: any): string {
  const reason = system?.absenceReason || '';
  if (reason === '기타 (직접 입력)' || reason === '직접 입력') return (system?.customAbsenceReason || '').trim();
  if (reason === '병명') return (system?.illnessName || system?.diseaseName || '건강 문제').trim();
  return String(reason).trim();
}

function buildPrompt(reason: string) {
  return `너는 스트리머 "우주하마"의 비공식 팬 사이트 "우주하마 방송 예측"의 문구 담당이야.
메인 화면의 "방송 켜질 확률" 카드 아래 작은 알약 모양 상태 문구를 상황별로 만들어줘.

규칙:
- 한국어, 상황별 7개씩, 각 문구 6~22자, 존댓말(해요체), 친근하고 따뜻하게
- 이모지는 문구당 최대 1개, 전체의 절반 이하만
- 확률 숫자나 시간을 지어내지 말 것, 스트리머를 비하하거나 의학적 조언·진단처럼 말하지 말 것
- 같은 묶음 안에서 비슷한 문장 반복 금지

상황:
- absence: 현재 휴방 중. 휴방 사유는 "${reason || '없음'}". ${reason ? '사유를 재치 있게 살리되 걱정·응원도 섞어줘 (예: 사유가 "엉덩이 기억상실증"이면 "엉덩이 찾는 중이에요", "쾌유를 빌어요" 같은 느낌).' : '사유가 없으면 빈 배열로.'}
- high: 곧 방송이 켜질 것 같은 시간대 (기대감)
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
    out[k] = [...new Set(arr.map((x: any) => String(x || '').trim()).filter((x: string) => x.length >= 4 && x.length <= 30))].slice(0, 10) as string[];
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
    const today = kstParts(now).dateStr;
    const system = (await db.collection('config').doc('system').get()).data() || {};
    const reason = isAbsencePeriodActive(system as any, today) || system.absenceReason ? absenceReasonText(system) : '';
    const key = `${today}|${reason}`;

    const ref = db.collection('status_messages').doc('current');
    const current = (await ref.get()).data() || null;
    const send = (data: any, extra: Record<string, any> = {}) => {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json({ key: data?.key || null, reason: data?.reason || '', sets: data?.sets || null, generatedAt: data?.generatedAt || null, ...extra });
    };
    if (current?.key === key && current?.sets) return send(current);

    // 동시에 여러 요청이 와도 한 번만 생성 (2분 잠금)
    const acquired = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : {};
      if (d?.key === key && d?.sets) return false;
      if (d?.lockUntil && d.lockUntil > Date.now()) return false;
      tx.set(ref, { lockUntil: Date.now() + 120000 }, { merge: true });
      return true;
    });
    if (!acquired) return send(current, { stale: true });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      await ref.set({ lockUntil: 0 }, { merge: true });
      return send(current, { stale: true, error: 'GEMINI_API_KEY 환경 변수가 없습니다.' });
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    let sets: Record<SetKey, string[]> | null = null;
    let lastError = '';
    for (const model of MODELS) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: buildPrompt(reason),
          config: { responseMimeType: 'application/json', temperature: 1.0 },
        });
        const parsed = sanitizeSets(JSON.parse(r.text || '{}'));
        if (parsed.high.length >= 3 && parsed.lowDay.length >= 3) {
          sets = parsed;
          break;
        }
        lastError = `${model}: 응답 형식 부족`;
      } catch (e: any) {
        lastError = `${model}: ${e?.message || e}`;
      }
    }

    if (!sets) {
      await ref.set({ lockUntil: 0 }, { merge: true });
      return send(current, { stale: true, error: lastError });
    }

    const doc = { key, reason, sets, generatedAt: now.toISOString(), lockUntil: 0 };
    await ref.set(doc);
    return send(doc);
  } catch (e: any) {
    console.error('[status-messages] failed:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
