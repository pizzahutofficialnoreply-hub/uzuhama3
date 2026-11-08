/** 아주 작은 IndexedDB 키-값 저장소 (localStorage 에 넣기엔 큰 것: 월별 기록 문서 사본 등) */
const DB = 'uzuhama_kv';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result as T);
      q.onerror = () => res(undefined);
    });
  } catch { return undefined; }
}
export async function kvSet(key: string, val: any): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(val, key);
      t.oncomplete = () => res();
      t.onerror = () => res();
    });
  } catch { /* 저장 못 해도 다음에 전체를 다시 읽을 뿐 */ }
}
