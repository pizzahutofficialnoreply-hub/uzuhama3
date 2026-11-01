import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, Save, Trash2, Sparkles } from 'lucide-react';
import { db } from '../../../../lib/firebase';
import type { SystemConfig } from '../../../../types';
import {
  Onboarding, DEFAULT_ONBOARDING, ONBOARDING_START_EVENT, STEP_TYPE_LABEL,
  type OnboardingConfig, type OnboardingStep, type OnboardingStepType, type OnboardingSection,
} from '../../../Onboarding';

/**
 * 관리자 > 처음 시작 화면: 환영·약관·안내·자판·소개 단계를 추가·삭제·수정·순서 바꾸기
 * - 저장: config/onboarding
 * - '모두에게 다시 보이기': system.onboardingVersion 을 올려 이미 본 사람에게도 다시 보임 (약관이 바뀌었을 때)
 */
const uid = () => Math.random().toString(36).slice(2, 9);
const input = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white';

export function OnboardingSubTab({ systemEdit, handleChange, onSave, saving, onUpdateSystemConfig }: {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onSave?: () => void;
  saving?: boolean;
  onUpdateSystemConfig?: (cfg: Partial<SystemConfig>) => Promise<void> | void;
}) {
  const [cfg, setCfg] = useState<OnboardingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [reshow, setReshow] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'onboarding'))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as OnboardingConfig) : null;
        setCfg(d?.steps?.length ? d : JSON.parse(JSON.stringify(DEFAULT_ONBOARDING)));
      })
      .catch(() => setCfg(JSON.parse(JSON.stringify(DEFAULT_ONBOARDING))));
  }, []);

  if (!cfg) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-purple-600" /></div>;

  const setSteps = (steps: OnboardingStep[]) => setCfg({ ...cfg, steps });
  const update = (i: number, patch: Partial<OnboardingStep>) => setSteps(cfg.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cfg.steps.length) return;
    const arr = [...cfg.steps];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setSteps(arr);
  };
  const updateSection = (i: number, k: number, patch: Partial<OnboardingSection>) =>
    update(i, { sections: (cfg.steps[i].sections || []).map((s, j) => (j === k ? { ...s, ...patch } : s)) });

  const save = async () => {
    setBusy(true);
    try {
      const version = (Number(systemEdit.onboardingVersion) || 1) + (reshow ? 1 : 0);
      await setDoc(doc(db, 'config', 'onboarding'), { version, steps: cfg.steps, updatedAt: new Date().toISOString() });
      if (reshow) {
        await onUpdateSystemConfig?.({ onboardingVersion: version });
        handleChange('onboardingVersion', version);
        setReshow(false);
      }
      alert(reshow ? '저장했어요. 이미 본 사람에게도 다음 방문 때 다시 보여요.' : '저장했어요. 처음 오는 사람부터 바뀐 내용이 보여요.');
    } catch (e: any) {
      alert('저장 중 오류: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const enabled = systemEdit.onboardingEnabled !== false;

  return (
    <div className="space-y-4">
      {/* 미리보기용 (기록 안 남김) */}
      <Onboarding enabled={false} version={0} system={systemEdit} tutorialEnabled={false} preview />
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" /> 처음 시작 화면
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">처음 온 사람에게 전체 화면으로 환영 → 약관 동의 → 안내 → 자판 → 소개 순서로 보여 주고, 끝나면 사이트 둘러보기가 이어져요.</p>
          </div>
          <button
            type="button"
            onClick={() => { handleChange('onboardingEnabled', !enabled); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${enabled ? 'bg-purple-600 text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
          >
            {enabled ? '켜짐' : '꺼짐'}
          </button>
        </div>
        {onSave && (
          <button type="button" onClick={onSave} disabled={saving} className="text-xs font-bold text-purple-600 dark:text-purple-400 underline cursor-pointer">
            {saving ? '저장 중…' : '켜기/끄기 저장'}
          </button>
        )}
        <p className="text-[11px] text-zinc-500">현재 버전 {Number(systemEdit.onboardingVersion) || 1} · 내용에 <code>{'{{termsOfService}}'}</code>, <code>{'{{privacyPolicy}}'}</code> 를 쓰면 '약관 & 전자고지'에 등록한 글이 들어가요. 굵게 **글자**, 목록 - 항목 같은 마크다운을 쓸 수 있어요.</p>
      </div>

      {cfg.steps.map((st, i) => (
        <div key={st.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-purple-600 dark:text-purple-400">{i + 1}단계</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer" aria-label="위로"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === cfg.steps.length - 1} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer" aria-label="아래로"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => window.confirm('이 단계를 지울까요?') && setSteps(cfg.steps.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer" aria-label="삭제"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <select value={st.type} onChange={(e) => update(i, { type: e.target.value as OnboardingStepType, sections: e.target.value === 'terms' ? (st.sections || []) : st.sections })} className={input}>
            {(Object.keys(STEP_TYPE_LABEL) as OnboardingStepType[]).map((t) => <option key={t} value={t}>{STEP_TYPE_LABEL[t]}</option>)}
          </select>
          <input value={st.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="제목" className={input} />
          <textarea value={st.body || ''} onChange={(e) => update(i, { body: e.target.value })} placeholder="내용 (마크다운)" rows={4} className={input} />
          <input value={st.button || ''} onChange={(e) => update(i, { button: e.target.value })} placeholder="버튼 글자 (예: 확인했어요)" className={input} />

          {st.type === 'terms' && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">동의 항목 (누르면 펼쳐지는 내용)</p>
              {(st.sections || []).map((sec, k) => (
                <div key={sec.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={sec.title} onChange={(e) => updateSection(i, k, { title: e.target.value })} placeholder="항목 이름" className={input} />
                    <label className="flex items-center gap-1 text-[11px] font-bold shrink-0 cursor-pointer">
                      <input type="checkbox" checked={sec.required} onChange={(e) => updateSection(i, k, { required: e.target.checked })} /> 필수
                    </label>
                    <button type="button" onClick={() => update(i, { sections: (st.sections || []).filter((_, j) => j !== k) })} className="p-1.5 text-red-500 cursor-pointer" aria-label="항목 삭제"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <textarea value={sec.body} onChange={(e) => updateSection(i, k, { body: e.target.value })} rows={3} placeholder="내용 ({{termsOfService}} 등 사용 가능)" className={input} />
                </div>
              ))}
              <button type="button" onClick={() => update(i, { sections: [...(st.sections || []), { id: uid(), title: '새 항목', body: '', required: false }] })} className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> 동의 항목 추가
              </button>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => setSteps([...cfg.steps, { id: uid(), type: 'notice', title: '새 안내', body: '', button: '확인했어요' }])}
        className="w-full py-3 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-sm font-bold text-zinc-500 hover:text-purple-600 hover:border-purple-400 flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Plus className="w-4 h-4" /> 단계 추가
      </button>

      <div className="sticky bottom-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-lg flex flex-wrap items-center gap-2 justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
          <input type="checkbox" checked={reshow} onChange={(e) => setReshow(e.target.checked)} />
          이미 본 사람에게도 다시 보이기 (약관이 바뀌었을 때)
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT, { detail: cfg }))} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <Eye className="w-4 h-4" /> 미리보기
          </button>
          <button type="button" onClick={() => window.confirm('기본 내용으로 되돌릴까요? (저장해야 반영돼요)') && setCfg(JSON.parse(JSON.stringify({ ...DEFAULT_ONBOARDING, version: cfg.version })))} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold cursor-pointer">
            기본값
          </button>
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 저장
          </button>
        </div>
      </div>
    </div>
  );
}
