/**
 * DB 전체 백업·복원 (관리자 › 시스템 › 백업)
 *  - 내보내기: 컬렉션 목록 → 컬렉션마다 몇백 개씩 나눠 받아 기기에서 JSON 한 파일로 합침 (함수 응답 크기 한도 때문에 나눔)
 *  - 가져오기: 그 JSON 을 몇백 개씩 나눠 보내면 같은 컬렉션·문서 ID·같은 모양으로 그대로 씀 (새 Firebase 프로젝트로 옮길 때)
 *  - 시간(Timestamp)·그림 바이트·문서 참조 같은 Firestore 전용 값도 표시를 붙여 저장했다가 그대로 되돌림
 */
import { Timestamp, GeoPoint, DocumentReference, FieldValue } from 'firebase-admin/firestore';

export const BACKUP_FORMAT = 'uzuhama-firestore-backup';
export const BACKUP_VERSION = 1;

export function encodeValue(v: any): any {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Timestamp) return { __fs: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __fs: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __fs: 'ref', p: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __fs: 'bytes', b64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encodeValue);
  if (typeof v === 'object') {
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) o[k] = encodeValue(x);
    return o;
  }
  return v;
}

export function decodeValue(db: any, v: any): any {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map((x) => decodeValue(db, x));
  if (typeof v === 'object') {
    if (v.__fs === 'ts') return new Timestamp(Number(v.s) || 0, Number(v.n) || 0);
    if (v.__fs === 'geo') return new GeoPoint(Number(v.lat) || 0, Number(v.lng) || 0);
    if (v.__fs === 'ref') return db.doc(String(v.p));
    if (v.__fs === 'bytes') return Buffer.from(String(v.b64 || ''), 'base64');
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) o[k] = decodeValue(db, x);
    return o;
  }
  return v;
}

/** 컬렉션 목록 (+ 대략 문서 수: count 는 1000개당 읽기 1번이라 거의 안 듦) */
export async function listBackupCollections(db: any) {
  const cols = await db.listCollections();
  const out: { name: string; count: number | null }[] = [];
  for (const c of cols) {
    let count: number | null = null;
    try { count = (await c.count().get()).data().count; } catch { /* */ }
    out.push({ name: c.id, count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 한 컬렉션을 문서 ID 순서로 limit 개씩 (응답이 너무 커지지 않게 약 3MB 에서 끊음) */
export async function exportPage(db: any, col: string, after: string | null, limit = 300) {
  let q = db.collection(col).orderBy('__name__').limit(Math.min(500, Math.max(1, limit)));
  if (after) q = q.startAfter(after);
  const snap = await q.get();
  const docs: { id: string; data: any }[] = [];
  let bytes = 0;
  let last: string | null = null;
  for (const d of snap.docs) {
    const data = encodeValue(d.data());
    bytes += JSON.stringify(data).length;
    docs.push({ id: d.id, data });
    last = d.id;
    if (bytes > 3_000_000) break;
  }
  const more = docs.length < snap.size || snap.size === Math.min(500, Math.max(1, limit));
  return { col, docs, next: more ? last : null };
}

/** 받은 문서들을 그대로 씀 (같은 ID 가 있으면 덮어씀) */
export async function importDocs(db: any, col: string, docs: { id: string; data: any }[]) {
  if (!/^[\w-]{1,100}$/.test(col)) throw Object.assign(new Error('컬렉션 이름이 이상해요'), { status: 400 });
  let batch = db.batch();
  let n = 0;
  let written = 0;
  for (const d of docs || []) {
    if (!d?.id || typeof d.id !== 'string' || d.id.includes('/')) continue;
    batch.set(db.collection(col).doc(d.id), decodeValue(db, d.data || {}));
    n++; written++;
    if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n) await batch.commit();
  return { col, written };
}

// 복원 기록 (언제 어떤 파일을 넣었는지)
export async function noteImport(db: any, info: Record<string, any>) {
  try { await db.collection('admin_data').doc('backupLog').set({ imports: FieldValue.arrayUnion({ ...info, at: new Date().toISOString() }) }, { merge: true }); } catch { /* */ }
}
