/** 수정 기록 (서버 쪽): 사이트가 바뀐 문서만 다시 읽게 경로를 남김 — src/utils/changeLog.ts 와 같은 모양 */
export async function markChangedAdmin(db: any, path: string, op: 'set' | 'delete' = 'set') {
  try { await db.collection('changes').add({ path, op, at: new Date().toISOString() }); } catch { /* */ }
}
