import React, { useState, useEffect } from 'react';
import { deleteField } from 'firebase/firestore';
import { AppData, SystemConfig } from '../../../types';
import { 
  AlertTriangle, Bell, Plane, Send, Shield, Database, 
  Check, Save, Sparkles, Activity 
} from 'lucide-react';
import { MaintenanceSubTab } from './system/MaintenanceSubTab';
import { NoticesSubTab } from './system/NoticesSubTab';
import { AbsenceHealthSubTab } from './system/AbsenceHealthSubTab';
import { PushNotificationSubTab } from './system/PushNotificationSubTab';
import { TermsPolicySubTab } from './system/TermsPolicySubTab';
import { DataOptionsSubTab } from './system/DataOptionsSubTab';
import { OnboardingSubTab } from './system/OnboardingSubTab';
import { AutomationSubTab } from './system/AutomationSubTab';

export type SystemSubTabId = 'maintenance' | 'notices' | 'absence' | 'push' | 'terms' | 'onboarding' | 'automation' | 'data';

export function AdminSystemTab({ 
  data, 
  onUpdateSystemConfig 
}: { 
  data: AppData, 
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void> 
}) {
  const [activeSubTab, setActiveSubTab] = useState<SystemSubTabId>('maintenance');
  const [saving, setSaving] = useState(false);

  const [systemEdit, setSystemEdit] = useState<Partial<SystemConfig>>({
    noticeContent: data.system?.noticeContent || '',
    absenceReason: data.system?.absenceReason || '',
    customAbsenceReason: data.system?.customAbsenceReason || '',
    illnessName: data.system?.illnessName || '',
    illnessSummary: data.system?.illnessSummary || '',
    illnessSource: data.system?.illnessSource || '',
    illnessSourceUrl: data.system?.illnessSourceUrl || '',
    absenceDuration: data.system?.absenceDuration || '',
    maintenance: data.system?.maintenance || false,
    maintenanceTitle: data.system?.maintenanceTitle || '',
    maintenanceContent: data.system?.maintenanceContent || '',
    maintenanceStart: data.system?.maintenanceStart || '',
    maintenanceEnd: data.system?.maintenanceEnd || '',
    maintenanceLinkUrl: data.system?.maintenanceLinkUrl || '',
    maintenanceLinkText: data.system?.maintenanceLinkText || '',
    maintenanceLinks: data.system?.maintenanceLinks || (data.system?.maintenanceLinkUrl ? [{ url: data.system.maintenanceLinkUrl, title: data.system.maintenanceLinkText || '' }] : []),
    maintenanceHistory: data.system?.maintenanceHistory || [],
    maintenanceStatusText: data.system?.maintenanceStatusText || '점검 진행 중',
    maintenanceNote: data.system?.maintenanceNote || '없음',
    maintenanceChanges: data.system?.maintenanceChanges || [
      '데이터베이스 점검 및 최적화',
      '서버 연동 점검',
      '서비스 코드 수정 및 테스트'
    ],
    recurringMaintenance: data.system?.recurringMaintenance || {
      enabled: false,
      intervalWeeks: 1,
      dayOfWeek: 6,
      startTime: '10:00',
      endTime: '16:00',
      autoApply: false
    },
    adminEmail: data.system?.adminEmail || '',
    noticeType: data.system?.noticeType || 'none',
    noticeList: data.system?.noticeList || [],
    termsOfService: data.system?.termsOfService || '',
    privacyPolicy: data.system?.privacyPolicy || '',
    preface: data.system?.preface || '',
    travelStart: data.system?.travelStart || '',
    travelEnd: data.system?.travelEnd || '',
    recentVideoUploadDate: data.system?.recentVideoUploadDate || '',
    appVersion: data.system?.appVersion || '1.0.0',
    termsVersion: data.system?.termsVersion || 1,
    ...(data.system?.termsRevision ? { termsRevision: data.system.termsRevision } : {}),
    termsHistory: data.system?.termsHistory || [],
    showLegacyCategoryAnalysis: data.system?.showLegacyCategoryAnalysis !== false,
    tutorialEnabled: data.system?.tutorialEnabled !== false,
    archiveSourceUrl: data.system?.archiveSourceUrl || '',
    absenceReasonOptions: data.system?.absenceReasonOptions || [
      "개인 사정",
      "건강 문제/컨디션 난조",
      "인터넷/장비 이슈",
      "가족 행사/일정",
      "지각",
      "기타 (직접 입력)"
    ],
    feedbackTabs: data.system?.feedbackTabs || [
      "요약 탭",
      "기록 탭",
      "분석 탭",
      "검색 탭",
      "데이터 제보 (+)",
      "설정",
      "패치노트",
      "기타"
    ]
  });

  useEffect(() => {
    if (data.system) {
      setSystemEdit(prev => {
        const next = {
          ...prev,
          ...data.system,
          maintenanceLinks: data.system?.maintenanceLinks || (data.system?.maintenanceLinkUrl ? [{ url: data.system.maintenanceLinkUrl, title: data.system.maintenanceLinkText || '' }] : prev.maintenanceLinks),
          maintenanceChanges: data.system?.maintenanceChanges || prev.maintenanceChanges,
          recurringMaintenance: data.system?.recurringMaintenance || prev.recurringMaintenance,
        };
        // 병명이 아닌 사유로 설정된 경우 기존 병명 데이터가 화면에 남아있지 않도록 제거
        if (next.absenceReason !== '병명') {
          delete next.illnessName;
          delete next.illnessSummary;
          delete next.illnessSource;
          delete next.illnessSourceUrl;
          delete next.diseaseName;
          delete next.diseaseSummary;
          delete next.diseaseSource;
          delete next.diseaseSourceUrl;
        }
        if (next.absenceReason !== '직접 입력' && next.absenceReason !== '기타 (직접 입력)') {
          delete next.customAbsenceReason;
        }
        return next;
      });
    }
  }, [data.system]);

  const handleChange = (key: keyof SystemConfig, value: any) => {
    setSystemEdit(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!onUpdateSystemConfig) return;
    setSaving(true);
    try {
      const configToSave: Partial<SystemConfig> = { ...systemEdit };
      if (configToSave.absenceReason !== '병명') {
        configToSave.illnessName = deleteField() as any;
        configToSave.illnessSummary = deleteField() as any;
        configToSave.illnessSource = deleteField() as any;
        configToSave.illnessSourceUrl = deleteField() as any;
        configToSave.diseaseName = deleteField() as any;
        configToSave.diseaseSummary = deleteField() as any;
        configToSave.diseaseSource = deleteField() as any;
        configToSave.diseaseSourceUrl = deleteField() as any;
      }
      if (configToSave.absenceReason !== '직접 입력' && configToSave.absenceReason !== '기타 (직접 입력)') {
        configToSave.customAbsenceReason = deleteField() as any;
      }
      await onUpdateSystemConfig(configToSave);
      setSystemEdit(configToSave);
      alert('시스템 설정이 성공적으로 저장되었어요.');
    } catch (err: any) {
      console.error('handleSave error:', err);
      alert('시스템 설정 저장 중 오류가 발생했어요:\n' + (err?.message || '알 수 없는 오류'));
    } finally {
      setSaving(false);
    }
  };

  const subTabs = [
    {
      id: 'maintenance' as SystemSubTabId,
      label: '점검 & 정기점검',
      icon: AlertTriangle,
      badge: systemEdit.maintenance ? 'ON' : undefined,
      badgeColor: 'bg-red-500 text-white'
    },
    {
      id: 'notices' as SystemSubTabId,
      label: '공지사항 관리',
      icon: Bell,
      badge: (systemEdit.noticeList || []).filter(n => n.active).length > 0 
        ? `${(systemEdit.noticeList || []).filter(n => n.active).length}` 
        : undefined,
      badgeColor: 'bg-purple-600 text-white'
    },
    {
      id: 'absence' as SystemSubTabId,
      label: '휴방 & 건강 정보',
      icon: Plane,
      badge: systemEdit.absenceReason ? '설정됨' : undefined,
      badgeColor: 'bg-amber-500 text-white'
    },
    {
      id: 'push' as SystemSubTabId,
      label: '웹 푸시 알림',
      icon: Send,
    },
    {
      id: 'terms' as SystemSubTabId,
      label: '약관 & 전자고지',
      icon: Shield,
    },
    {
      id: 'onboarding' as SystemSubTabId,
      label: '처음 시작 화면',
      icon: Sparkles,
    },
    {
      id: 'automation' as SystemSubTabId,
      label: '자동 시스템',
      icon: Activity,
    },
    {
      id: 'data' as SystemSubTabId,
      label: '시스템 & 데이터',
      icon: Database,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 탭 안의 탭: 서브탭 네비게이션 바 */}
      <div className="border border-black/[0.06] dark:border-white/10 rounded-full p-1 shadow-sm sticky top-[calc(env(safe-area-inset-top,0px)+64px)] z-20 backdrop-blur-xl bg-white/85 dark:bg-zinc-900/85">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-0.5">
          {subTabs.map(tab => {
            const isActive = activeSubTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-zinc-200/80 dark:bg-white/15 text-zinc-950 dark:text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 세부 서브탭 렌더링 */}
      <div className="min-h-[500px]">
        {activeSubTab === 'maintenance' && (
          <MaintenanceSubTab 
            systemEdit={systemEdit}
            handleChange={handleChange}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {activeSubTab === 'notices' && (
          <NoticesSubTab 
            systemEdit={systemEdit}
            handleChange={handleChange}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {activeSubTab === 'absence' && (
          <AbsenceHealthSubTab 
            systemEdit={systemEdit}
            handleChange={handleChange}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {activeSubTab === 'push' && (
          <PushNotificationSubTab />
        )}

        {activeSubTab === 'terms' && (
          <TermsPolicySubTab 
            systemEdit={systemEdit}
            handleChange={handleChange}
            onUpdateSystemConfig={onUpdateSystemConfig}
            onSave={handleSave}
            saving={saving}
          />
        )}

        {activeSubTab === 'onboarding' && (
          <OnboardingSubTab
            systemEdit={systemEdit}
            handleChange={handleChange}
            onSave={handleSave}
            saving={saving}
            onUpdateSystemConfig={onUpdateSystemConfig}
          />
        )}

        {activeSubTab === 'automation' && <AutomationSubTab />}

        {activeSubTab === 'data' && (
          <DataOptionsSubTab 
            systemEdit={systemEdit}
            handleChange={handleChange}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </div>

      {/* 전체 저장 플로팅 액션 바 */}
      <div className="flex justify-end pt-4 pb-2 sticky bottom-[calc(max(10px,env(safe-area-inset-bottom)-12px)+66px)] sm:bottom-6 z-30 pointer-events-auto">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold px-8 py-3 rounded-2xl shadow-xl transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? '시스템 설정 저장 중...' : '모든 시스템 설정 저장'}</span>
        </button>
      </div>
    </div>
  );
}
