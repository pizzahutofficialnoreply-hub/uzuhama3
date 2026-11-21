/**
 * 내가 보낸 의견·신고 내역 (이 기기에만 저장) + 답변 확인
 * - 보낼 때 문서 id 와 내용 일부를 기기에 적어 둠
 * - 답변(반영 완료·보류·관리자 답글)은 서버가 '이 기기가 보낸 것'만 알려 줌 (/api/health?fb=…&v=기기번호)
 * - 새 답변이 생기면 앱을 열 때 아래 알림으로 '새 답변이 있어요 · 보기'
 */
import { visitorId } from './submitGuard';

export type MyFeedback = { id: string; kind: string; title: string; text: string; at: number; status?: string; answer?: string; answeredAt?: string; seen?: boolean };
const KEY = 'uzuhama_my_feedback_v1';
const CHECK_KEY = 'uzuhama_my_feedback_checked';
const API = typeof window !== 'undefined' && /vercel\.app$/.test(window.location.hostname) ? '' : 'https://uzuhama.vercel.app';
export const MY_FEEDBACK_EVENT = 'uzuhama-my-feedback';

export function myFeedbacks(): MyFeedback[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list: MyFeedback[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(MY_FEEDBACK_EVENT)); } catch { /* */ }
}
export function rememberFeedback(id: string, kind: string, title: string, text: string) {
  if (!id) return;
  save([{ id, kind, title: String(title || '').slice(0, 120), text: String(text || '').slice(0, 1500), at: Date.now() }, ...myFeedbacks().filter((x) => x.id !== id)]);
}
export function markAnswersSeen() {
  save(myFeedbacks().map((x) => (x.answeredAt ? { ...x, seen: true } : x)));
}
export const unseenAnswers = () => myFeedbacks().filter((x) => x.answeredAt && !x.seen);

/** 서버에 답변 확인 (force 가 아니면 6시간에 한 번) → 새로 생긴 답변 수 */
export async function refreshAnswers(force = false): Promise<number> {
  const list = myFeedbacks();
  const open = list.filter((x) => !x.answeredAt && Date.now() - x.at < 180 * 86400000);
  if (!open.length) return 0;
  try { if (!force && Date.now() - Number(localStorage.getItem(CHECK_KEY) || 0) < 6 * 3600000) return 0; localStorage.setItem(CHECK_KEY, String(Date.now())); } catch { /* */ }
  try {
    const r = await fetch(`${API}/api/health?fb=${open.slice(0, 30).map((x) => x.id).join(',')}&v=${encodeURIComponent(visitorId())}`);
    if (!r.ok) return 0;
    const j = await r.json();
    const got: Record<string, { status?: string; answer?: string; at?: string }> = j?.items || {};
    let n = 0;
    save(myFeedbacks().map((x) => {
      const g = got[x.id];
      if (!g || !g.status || g.status === 'pending') return x;
      if (!x.answeredAt) n++;
      return { ...x, status: g.status, answer: g.answer || '', answeredAt: g.at || new Date().toISOString() };
    }));
    return n;
  } catch { return 0; }
}

export const STATUS_LABEL: Record<string, string> = { pending: '확인 중', approved: '반영 완료', rejected: '보류' };
/** 답글이 비어 있으면 기본 안내 */
export const answerText = (x: MyFeedback) => x.answer?.trim()
  || (x.status === 'approved' ? '보내 주신 내용이 이번 패치로 반영·해결됐어요. 확인해 보시고, 그래도 똑같으면 다시 알려 주세요.' : x.status === 'rejected' ? '검토했지만 이번에는 반영하지 않기로 했어요. 더 알려 주실 내용이 있으면 다시 보내 주세요.' : '');
