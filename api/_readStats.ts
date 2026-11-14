/**
 * DB 읽기가 어디서 얼마나 나가는지 세기 (서버 쪽)
 * - Admin SDK 의 읽기 함수(문서 get, 쿼리 get, getAll, 트랜잭션 get, count)를 감싸서
 *   "요청 경로 › 컬렉션" 별 읽은 문서 수를 모았다가, 몇 초 뒤 한 번에 admin_data/reads_<날짜> 에 더함
 * - 방문자 기기 쪽 숫자는 /api/health?readstat=1 로 들어와 같은 문서의 c 에 더해짐
 * - 쓰기만 하고 읽지 않음 (이 기록 자체는 읽기를 늘리지 않음)
 */
import { DocumentReference, Query, Transaction, Firestore, FieldValue } from 'firebase-admin/firestore';
import { waitUntil } from '@vercel/functions';

let route = 'other';
let pending: Record<string, Record<string, number>> = {};
let timer: ReturnType<typeof setTimeout> | null = null;
let dbRef: Firestore | null = null;
let installed = false;

const safe = (s: string) => String(s || 'other').replace(/[^\w가-힣=-]/g, '_').slice(0, 60) || 'other';
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
// 한국 시간 몇 시 (시간대별로 어디서 읽었는지: 어느 시간에 갑자기 늘었는지 찾기)
const kstHour = () => `h${new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 13)}`;

/** 지금 처리 중인 요청 (setCorsHeaders 에서 부름) */
export function setReadRoute(req: any) {
  try {
    const u = new URL(req?.url || '/', 'http://x');
    const k = ['ai', 'selftest', 'img', 'kind', 'mode', 'op', 'action', 'enrich', 'src'].map((p) => (u.searchParams.get(p) ? `${p}=${u.searchParams.get(p)}` : '')).filter(Boolean).slice(0, 2).join('&');
    route = safe(`${u.pathname.replace(/^\/api\//, '')}${k ? `?${k}` : ''}`);
  } catch { route = 'other'; }
}

function add(col: string, n: number) {
  if (!n) return;
  const c = safe(col);
  (pending[route] ||= {})[c] = (pending[route][c] || 0) + n;
  if (!timer) {
    const p = new Promise<void>((resolve) => { timer = setTimeout(() => { timer = null; void flush().finally(resolve); }, 2500); });
    try { waitUntil(p); } catch { /* 로컬 */ }
  }
}

async function flush() {
  const data = pending;
  pending = {};
  if (!dbRef || !Object.keys(data).length) return;
  const s: Record<string, Record<string, any>> = {};
  const hr: Record<string, any> = {};
  Object.entries(data).forEach(([r, cols]) => {
    s[r] = {};
    let sum = 0;
    Object.entries(cols).forEach(([c, n]) => { s[r][c] = FieldValue.increment(n); sum += n; });
    hr[r] = FieldValue.increment(sum);
  });
  try {
    await (orig.docSet || (DocumentReference as any).prototype.set).call(dbRef.collection('admin_data').doc(`reads_${kstDay()}`), { s, h: { [kstHour()]: hr }, at: new Date().toISOString() }, { merge: true });
  } catch { /* 한도 초과 등: 버림 */ }
}

/** 기기에서 보낸 숫자 더하기 */
export async function addClientReads(db: Firestore, c: Record<string, number>) {
  const out: Record<string, any> = {};
  let sum = 0;
  Object.entries(c || {}).slice(0, 40).forEach(([k, n]) => { const v = Math.min(5000, Math.max(0, Math.round(Number(n) || 0))); if (v) { out[safe(k)] = FieldValue.increment(v); sum += v; } });
  if (!Object.keys(out).length) return;
  await db.collection('admin_data').doc(`reads_${kstDay()}`).set({ c: out, ch: { [kstHour()]: FieldValue.increment(sum) }, sessions: FieldValue.increment(1) }, { merge: true });
}

const topCol = (path: string) => String(path || '').split('/')[0] || 'other';
const orig: any = {};

export function installReadStats(db: Firestore) {
  dbRef = db;
  if (installed) return;
  installed = true;
  // 세기는 덤: 어떤 이유로든 실패하면 그냥 안 세고 넘어감 (DB 연결·로그인은 절대 막지 않음)
  try { patch(db); } catch (e) { console.warn('[readStats] 설치 건너뜀', e); }
}

function patch(db: Firestore) {
  const DocProto: any = (DocumentReference as any)?.prototype;
  const QueryProto: any = (Query as any)?.prototype;
  const FsProto: any = (Firestore as any)?.prototype;
  const TxProto: any = (Transaction as any)?.prototype;
  // AggregateQuery 는 패키지에서 내보내지 않음 → 실제 count() 객체에서 꺼냄
  let AggProto: any = null;
  try { AggProto = Object.getPrototypeOf((db.collection('admin_data') as any).count()); } catch { /* */ }
  if (DocProto?.get) orig.docGet = DocProto.get;
  if (DocProto?.set) orig.docSet = DocProto.set;
  if (QueryProto?.get) orig.queryGet = QueryProto.get;
  if (FsProto?.getAll) orig.getAll = FsProto.getAll;
  if (TxProto?.get) orig.txGet = TxProto.get;
  if (AggProto?.get) orig.aggGet = AggProto.get;

  if (orig.docGet) DocProto.get = async function (this: any, ...a: any[]) {
    const r = await orig.docGet.apply(this, a);
    add(topCol(this.path), 1);
    return r;
  };
  if (orig.queryGet) QueryProto.get = async function (this: any, ...a: any[]) {
    const r = await orig.queryGet.apply(this, a);
    add(topCol(this._queryOptions?.collectionId || this.id), Math.max(1, r?.size || 0));
    return r;
  };
  if (orig.getAll) FsProto.getAll = async function (this: any, ...a: any[]) {
    const r = await orig.getAll.apply(this, a);
    (r || []).forEach((s: any) => add(topCol(s?.ref?.path), 1));
    return r;
  };
  if (orig.txGet) TxProto.get = async function (this: any, ref: any, ...a: any[]) {
    const r = await orig.txGet.call(this, ref, ...a);
    if (r && typeof r.size === 'number') add(topCol(ref?._queryOptions?.collectionId || ref?.id), Math.max(1, r.size));
    else add(topCol(ref?.path), 1);
    return r;
  };
  if (orig.aggGet) AggProto.get = async function (this: any, ...a: any[]) {
    const r = await orig.aggGet.apply(this, a);
    add(`${topCol(this._query?._queryOptions?.collectionId)}(count)`, 1);
    return r;
  };
}
