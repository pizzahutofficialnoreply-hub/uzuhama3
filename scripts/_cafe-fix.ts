// 임시: 카페(이츠하마타임 '영상/쇼츠 생방링크' 글) 기준으로 사이트 기록 맞추기 (쓰고 나면 지움)
// DRY=1 이면 바뀔 내용만 보여 줌
import fs from 'fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { normalizeHistorical, overlayMonthDocs } from '../src/utils/archiveOverlay';
import { youtubeIdOf } from '../src/utils/cafeImport';

const DRY = process.env.DRY === '1';
const sa = JSON.parse(process.env.SA || '{}');
initializeApp({ credential: cert(sa), projectId: sa.project_id || 'uzuhama' });
const db = getFirestore();
const yid = (x: any) => youtubeIdOf(typeof x === 'string' ? x : x?.url || '');
const META = new Set(['id', 'date', '_patch', '_updatedAt']);
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

(async () => {
  const ops = JSON.parse(fs.readFileSync('.github/workflows/_cafe_ops.json', 'utf8'));
  const hist = normalizeHistorical(JSON.parse(fs.readFileSync('public/data/historical_logs.json', 'utf8')));
  const monthSnap = await db.collection('logs_by_month').get();
  const monthDocs = monthSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const logs = overlayMonthDocs(hist, monthDocs) as Record<string, any>;
  console.log('달', monthDocs.length, '기록', Object.keys(logs).length);
  const work: Record<string, any> = {};
  const get = (id: string) => { if (!logs[id]) throw new Error(`기록 없음 ${id}`); return (work[id] ||= JSON.parse(JSON.stringify(logs[id]))); };
  const comps: any[] = [];
  const now = new Date().toISOString();
  for (const o of ops) {
    if (o.t === 'setVod') {
      const l = get(o.log);
      const v = (l.vods || []).find((x: any) => yid(x) === o.from);
      if (!v) { console.log('!! 생방 없음', o.log, o.from); continue; }
      v.url = `https://youtu.be/${o.to}`;
    } else if (o.t === 'shorts') {
      for (const id of o.remove) { const l = get(id); l.shorts = (l.shorts || []).filter((x: any) => yid(x) !== o.id); }
      for (const id of o.add) { const l = get(id); if (!(l.shorts || []).some((x: any) => yid(x) === o.id)) l.shorts = [...(l.shorts || []), { title: o.title, url: `https://youtu.be/${o.id}`, cafe: 1 }]; }
    } else if (o.t === 'removeEdited') {
      const l = get(o.log); l.edited = (l.edited || []).filter((x: any) => yid(x) !== o.id);
    } else if (o.t === 'multi') {
      const ls = o.logs.map((id: string) => get(id));
      const compId = `multi_${o.id}`;
      const dates = ls.map((l: any) => l.date).sort();
      comps.push({ id: compId, kind: 'multi', title: o.title, url: `https://youtu.be/${o.id}`, createdAt: now, gameSortOrder: 'custom', broadcasts: ls.map((l: any) => ({ logId: l.id, date: l.date, games: [] })), source: 'cafe' });
      for (const l of ls) {
        const prev = (l.edited || []).find((e: any) => yid(e) === o.id || (!e.url && e.title === o.placeholderTitle));
        const link = { ...(prev || {}), title: prev?.title || o.title, url: `https://youtu.be/${o.id}`, multiId: compId, allBroadcastDates: dates, games: prev?.games || [], createdAt: now, cafe: 1 };
        l.edited = [link, ...(l.edited || []).filter((e: any) => e !== prev && yid(e) !== o.id)];
      }
    }
  }
  // 저장할 모양: 아카이브 기록은 원본과 다른 칸만 (_patch), 나머지는 통째로
  const plan = Object.entries(work).map(([id, l]) => {
    const base = hist[id];
    let stored: any;
    if (base) {
      stored = { id: base.id, date: base.date, _patch: true, _updatedAt: now };
      new Set([...Object.keys(base), ...Object.keys(l)]).forEach((k) => { if (META.has(k)) return; if (!same(l[k], base[k])) stored[k] = l[k] === undefined ? null : l[k]; });
    } else stored = { ...l };
    const o = logs[id];
    const cnt = (x: any) => `생방${(x.vods || []).length} 영상${(x.edited || []).length} 쇼츠${(x.shorts || []).length}`;
    console.log(`${l.date} ${id}: ${cnt(o)} → ${cnt(l)}`);
    return { id, date: l.date, stored };
  });
  console.log('바꿀 기록', plan.length, '여러 날 영상', comps.length);
  if (DRY) return;
  for (const p of plan) {
    const ref = db.collection('logs').doc(p.id);
    const prev = await ref.get();
    await db.collection('admin_audit').add({ action: 'updateLog', logId: p.id, date: p.date, before: prev.exists ? prev.data() : null, after: p.stored, by: 'cafe-fix', at: new Date().toISOString() });
    await ref.set(p.stored);
    const m = p.date.slice(0, 7);
    const monthRef = db.collection('logs_by_month').doc(m);
    const snap = await monthRef.get();
    const upd: Record<string, any> = { updatedAt: new Date().toISOString(), [`items.${p.id}`]: p.stored };
    if (p.stored._patch) Object.entries((snap.data() as any)?.items || {}).forEach(([k, v]: [string, any]) => { if (k !== p.id && !k.endsWith('__dc') && v?.date === p.date && !v?._patch) upd[`items.${k}`] = FieldValue.delete(); });
    if (!snap.exists) await monthRef.set({ month: m, updatedAt: upd.updatedAt, items: { [p.id]: p.stored } });
    else await monthRef.update(upd);
  }
  for (const c of comps) await db.collection('compilations').doc(c.id).set(c, { merge: true });
  // 확인: 다시 읽어서 합친 결과
  const again = overlayMonthDocs(hist, (await db.collection('logs_by_month').get()).docs.map((d) => ({ id: d.id, ...d.data() }))) as Record<string, any>;
  let ok = 0; for (const [id, l] of Object.entries(work)) if (same(again[id]?.vods, l.vods) && same(again[id]?.edited, l.edited) && same(again[id]?.shorts, l.shorts)) ok++; else console.log('!! 다름', id);
  console.log('반영 확인', ok, '/', plan.length);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
