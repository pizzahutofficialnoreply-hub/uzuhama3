import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Upload, RefreshCw } from 'lucide-react';
import { mutate } from './SearchTuningCard';
import { confirmSheet, toast } from '../../../../utils/ui';

/**
 * DB 전체 백업·복원
 *  - 내려받기: 모든 컬렉션을 몇백 개씩 받아 이 기기에서 JSON 파일 하나로 (읽기 = 문서 수만큼 듦)
 *  - 복원: 그 파일을 올리면 같은 컬렉션·문서 ID·같은 모양으로 다시 씀 (새 Firebase 프로젝트로 옮긴 뒤에 쓰면 그대로 등록)
 */
type Col = { name: string; count: number | null };
const FORMAT = 'uzuhama-firestore-backup';
// 다시 만들 수 있는 저장소(유튜브 목록·검색 색인 조각 등)는 기본으로 빼 둠 — 체크하면 같이 백업
const REGEN = /^(youtube_|search_|selftest_runs$)/;

export function BackupCard() {
  const [cols, setCols] = useState<Col[] | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'' | 'list' | 'export' | 'import'>('');
  const [prog, setProg] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setBusy('list'); setErr('');
    try {
      const j = await mutate('backupList');
      setCols(j.collections || []);
      setPick(Object.fromEntries((j.collections || []).map((c: Col) => [c.name, !REGEN.test(c.name)])));
    } catch (e: any) { setErr(String(e?.message || e)); }
    setBusy('');
  };

  const chosen = (cols || []).filter((c) => pick[c.name]);
  const estReads = chosen.reduce((a, c) => a + (c.count || 0), 0);

  const doExport = async () => {
    if (!chosen.length) return;
    setBusy('export'); setErr('');
    const out: Record<string, { id: string; data: any }[]> = {};
    let total = 0;
    try {
      for (const c of chosen) {
        out[c.name] = [];
        let after: string | null = null;
        do {
          setProg(`${c.name} 받는 중… ${out[c.name].length}${c.count != null ? `/${c.count}` : ''}개 (전체 ${total}개)`);
          const j: any = await mutate('backupExport', { col: c.name, after, limit: 300 });
          out[c.name].push(...(j.docs || []));
          total += (j.docs || []).length;
          after = j.next || null;
        } while (after);
      }
      const file = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), collections: out };
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const a = document.createElement('a');
      const t = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
      a.href = URL.createObjectURL(blob);
      a.download = `uzuhama-backup-${t}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setProg(`다 받았어요 · 컬렉션 ${Object.keys(out).length}개 · 문서 ${total}개 · ${(blob.size / 1048576).toFixed(1)}MB`);
      toast('백업 파일을 내려받았어요', 'success');
    } catch (e: any) { setErr(`${prog} 에서 멈췄어요: ${String(e?.message || e)}`); }
    setBusy('');
  };

  const doImport = async (f: File) => {
    setErr('');
    let file: any;
    try { file = JSON.parse(await f.text()); } catch { setErr('JSON 파일을 읽지 못했어요'); return; }
    if (file?.format !== FORMAT || typeof file.collections !== 'object') { setErr('이 사이트에서 내려받은 백업 파일이 아니에요'); return; }
    const names = Object.keys(file.collections);
    const docCount = names.reduce((a, n) => a + (file.collections[n]?.length || 0), 0);
    const ok = await confirmSheet({
      title: '백업 파일로 복원할까요?',
      message: `${String(file.exportedAt || '').slice(0, 16).replace('T', ' ')} 백업 · 컬렉션 ${names.length}개 · 문서 ${docCount}개를 지금 연결된 DB에 그대로 써요. 같은 ID 문서는 백업 내용으로 덮어쓰고, 백업에 없는 문서는 그대로 둬요.`,
      confirmText: '복원하기',
      danger: true,
    });
    if (!ok) return;
    setBusy('import');
    let done = 0;
    let first = true;
    try {
      for (const n of names) {
        const docs: any[] = file.collections[n] || [];
        // 요청 하나가 너무 커지지 않게 (약 2.5MB · 최대 400개씩)
        let chunk: any[] = [];
        let size = 0;
        const send = async () => {
          if (!chunk.length) return;
          await mutate('backupImport', { col: n, docs: chunk, first, file: f.name, exportedAt: file.exportedAt });
          first = false;
          done += chunk.length;
          setProg(`${n} 쓰는 중… 전체 ${done}/${docCount}개`);
          chunk = []; size = 0;
        };
        for (const d of docs) {
          const s = JSON.stringify(d).length;
          if (chunk.length && (size + s > 2_500_000 || chunk.length >= 400)) await send();
          chunk.push(d); size += s;
        }
        await send();
      }
      setProg(`복원 끝 · 문서 ${done}개를 썼어요`);
      toast('복원을 마쳤어요', 'success');
    } catch (e: any) { setErr(`${done}/${docCount}개 쓰고 멈췄어요: ${String(e?.message || e)} (같은 파일로 다시 하면 이어서 덮어써요)`); }
    setBusy('');
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50';
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3" data-testid="backup-card">
      <div className="flex items-center gap-2">
        <HardDriveDownload className="w-4 h-4 text-purple-500" />
        <h3 className="font-bold text-sm text-zinc-900 dark:text-white">DB 백업 · 복원 (JSON)</h3>
      </div>
      <p className="text-[11px] text-zinc-500 break-keep leading-relaxed">
        DB 전체를 JSON 파일 하나로 내려받고, 다른 Firebase 프로젝트로 옮긴 뒤 그 파일을 올리면 같은 모양으로 다시 등록해요.
        내려받기는 <b>문서 수만큼 DB 읽기</b>를 써서, 무료 한도(하루 5만)가 넉넉할 때 하세요. 오늘 한도를 다 썼으면 오후 5시쯤 이후에 돼요.
      </p>
      {!cols ? (
        <button type="button" disabled={busy === 'list'} onClick={() => void load()} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>
          <RefreshCw className={`w-3.5 h-3.5 ${busy === 'list' ? 'animate-spin' : ''}`} /> 컬렉션 목록 불러오기
        </button>
      ) : (
        <>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {cols.map((c) => (
              <label key={c.name} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer">
                <input type="checkbox" checked={!!pick[c.name]} onChange={(e) => setPick((p) => ({ ...p, [c.name]: e.target.checked }))} />
                <span className="flex-1 font-mono text-zinc-800 dark:text-zinc-200">{c.name}</span>
                {REGEN.test(c.name) && <span className="text-[10px] text-zinc-400">다시 만들 수 있음</span>}
                <span className="tabular-nums text-zinc-500">{c.count ?? '?'}개</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">고른 컬렉션 {chosen.length}개 · 내려받기에 읽기 약 <b>{estReads.toLocaleString()}</b>번</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !chosen.length} onClick={() => void doExport()} className={`${btn} bg-purple-600 text-white`}>
              <Download className="w-3.5 h-3.5" /> JSON으로 내려받기
            </button>
            <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className={`${btn} bg-zinc-100 dark:bg-zinc-800`}>
              <Upload className="w-3.5 h-3.5" /> JSON 파일로 복원
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f); }} />
          </div>
        </>
      )}
      {prog && <p className="text-xs text-zinc-600 dark:text-zinc-300" role="status">{prog}</p>}
      {err && <p className="text-xs text-red-500 break-keep">{err}</p>}
    </div>
  );
}
