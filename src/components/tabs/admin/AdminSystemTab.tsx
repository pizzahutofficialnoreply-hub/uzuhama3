import { useState, useEffect } from 'react';
import { AppData, SystemConfig, NoticeItem, NoticeLink, TermsRevision } from '../../../types';
import { Settings, Plus, Edit2, Trash2, Check, X, Database, Loader2, AlertCircle, Link as LinkIcon, ExternalLink, Shield, Eye, Calendar, AlertTriangle } from 'lucide-react';
import { format, addDays, differenceInCalendarDays } from 'date-fns';
import { migrateLogsToMonthly, MigrationProgress } from '../../../utils/migrateLogs';
import { TermsRevisionModal } from '../../TermsRevisionModal';
import { deleteField } from 'firebase/firestore';

export function AdminSystemTab({ 
  data, 
  onUpdateSystemConfig 
}: { 
  data: AppData, 
  onUpdateSystemConfig?: (sys: Partial<SystemConfig>) => Promise<void> 
}) {
  const [systemEdit, setSystemEdit] = useState<Partial<SystemConfig>>({
    noticeContent: data.system?.noticeContent || '',
    absenceReason: data.system?.absenceReason || '',
    absenceDuration: data.system?.absenceDuration || '',
    maintenance: data.system?.maintenance || false,
    maintenanceStart: data.system?.maintenanceStart || '',
    maintenanceEnd: data.system?.maintenanceEnd || '',
    adminEmail: data.system?.adminEmail || '',
    noticeType: data.system?.noticeType || 'none',
    noticeList: data.system?.noticeList || [],
    termsOfService: data.system?.termsOfService || '',
    privacyPolicy: data.system?.privacyPolicy || '',
    travelStart: data.system?.travelStart || '',
    travelEnd: data.system?.travelEnd || '',
    recentVideoUploadDate: data.system?.recentVideoUploadDate || '',
    appVersion: data.system?.appVersion || '1.0.0',
    termsVersion: data.system?.termsVersion || 1,
    ...(data.system?.termsRevision ? { termsRevision: data.system.termsRevision } : {}),
    termsHistory: data.system?.termsHistory || [],
    showLegacyCategoryAnalysis: data.system?.showLegacyCategoryAnalysis !== false,
    archiveSourceUrl: data.system?.archiveSourceUrl || '',
    absenceReasonOptions: data.system?.absenceReasonOptions || [
      "개인 사정",
      "건강 문제/컨디션 난조",
      "인터넷/장비 이슈",
      "가족 행사/일정",
      "지각",
      "기타 (직접 입력)"
    ]
  });
  
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeForm, setNoticeForm] = useState<Partial<NoticeItem>>({ title: '', content: '', type: 'big' });
  const [noticeLinks, setNoticeLinks] = useState<NoticeLink[]>([]);
  const [newReason, setNewReason] = useState('');
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // 약관 개정안 작성 폼 상태
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const defaultNormalEffective = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const [revisionForm, setRevisionForm] = useState<Partial<TermsRevision>>({
    type: 'normal',
    title: '',
    target: 'all',
    noticeDate: todayStr,
    effectiveDate: defaultNormalEffective,
    changesSummary: '',
    objectionGuide: '',
  });
  const [previewRevision, setPreviewRevision] = useState<TermsRevision | null>(null);
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  const handleStartMigration = async () => {
    if (!window.confirm('기존 logs 컬렉션의 모든 데이터를 읽어 월별 묶음 문서(logs_by_month)로 이관하시겠습니까?\n\n이관 후에도 기존 logs 데이터는 보존되며 새 컬렉션에 동기화됩니다.')) {
      return;
    }
    setIsMigrating(true);
    try {
      await migrateLogsToMonthly((prog) => {
        setMigrationProgress(prog);
      });
    } catch (e: any) {
      console.error(e);
      alert('마이그레이션 실패: ' + e?.message);
    } finally {
      setIsMigrating(false);
    }
  };

  useEffect(() => {
    if (data.system) {
      setSystemEdit({
        noticeContent: data.system?.noticeContent || '',
        absenceReason: data.system?.absenceReason || '',
        absenceDuration: data.system?.absenceDuration || '',
        maintenance: data.system?.maintenance || false,
        maintenanceStart: data.system?.maintenanceStart || '',
        maintenanceEnd: data.system?.maintenanceEnd || '',
        adminEmail: data.system?.adminEmail || '',
        noticeType: data.system?.noticeType || 'none',
        noticeList: data.system?.noticeList || [],
        termsOfService: data.system?.termsOfService || '',
        privacyPolicy: data.system?.privacyPolicy || '',
        travelStart: data.system?.travelStart || '',
        travelEnd: data.system?.travelEnd || '',
        recentVideoUploadDate: data.system?.recentVideoUploadDate || '',
        appVersion: data.system?.appVersion || '1.0.0',
        termsVersion: data.system?.termsVersion || 1,
        ...(data.system?.termsRevision ? { termsRevision: data.system.termsRevision } : {}),
        termsHistory: data.system?.termsHistory || [],
        showLegacyCategoryAnalysis: data.system?.showLegacyCategoryAnalysis !== false,
        archiveSourceUrl: data.system?.archiveSourceUrl || '',
        absenceReasonOptions: data.system?.absenceReasonOptions || [
          "개인 사정",
          "건강 문제/컨디션 난조",
          "인터넷/장비 이슈",
          "가족 행사/일정",
          "지각",
          "기타 (직접 입력)"
        ]
      });
    }
  }, [data.system]);

  const handleChange = (key: keyof SystemConfig, value: any) => {
    setSystemEdit(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (onUpdateSystemConfig) {
      try {
        await onUpdateSystemConfig(systemEdit);
        alert('시스템 설정이 성공적으로 저장되었습니다.');
      } catch (err: any) {
        console.error('handleSave error:', err);
        alert('시스템 설정 저장 중 오류가 발생했습니다:\n' + (err?.message || '알 수 없는 오류'));
      }
    }
  };

  // 약관 개정 유형 변경 시 시행일 자동 계산
  const handleRevisionTypeChange = (type: 'normal' | 'important') => {
    const noticeDate = revisionForm.noticeDate ? new Date(revisionForm.noticeDate) : new Date();
    const daysToAdd = type === 'important' ? 30 : 7;
    const newEffective = format(addDays(noticeDate, daysToAdd), 'yyyy-MM-dd');
    setRevisionForm(prev => ({
      ...prev,
      type,
      effectiveDate: newEffective
    }));
  };

  // 약관 개정안 발행
  const handlePublishRevision = async () => {
    if (!revisionForm.title?.trim()) {
      return alert('개정 안내 제목을 입력해주세요.');
    }
    if (!revisionForm.changesSummary?.trim()) {
      return alert('직전 버전 대비 변경 사항(무엇이 어떻게 바뀌었는지)을 입력해주세요.');
    }
    if (!revisionForm.noticeDate || !revisionForm.effectiveDate) {
      return alert('공지 일자와 적용(시행) 일자를 입력해주세요.');
    }

    const noticeDate = new Date(revisionForm.noticeDate);
    const effectiveDate = new Date(revisionForm.effectiveDate);
    const diffDays = differenceInCalendarDays(effectiveDate, noticeDate);

    if (revisionForm.type === 'important' && diffDays < 30) {
      return alert(`'중요 (30일)' 개정은 공지일로부터 최소 30일 후부터 시행해야 합니다.\n(현재 설정 간격: ${diffDays}일)`);
    }

    if (revisionForm.type === 'normal' && diffDays < 7) {
      if (!window.confirm(`일반 약관 개정은 최소 7일의 사전 고지 기간을 권장합니다. (현재: ${diffDays}일)\n그대로 진행하시겠습니까?`)) {
        return;
      }
    }

    const nextVersion = (systemEdit.termsVersion || 1) + 1;
    const newRevision: TermsRevision = {
      version: nextVersion,
      type: revisionForm.type || 'normal',
      title: revisionForm.title.trim(),
      noticeDate: revisionForm.noticeDate,
      effectiveDate: revisionForm.effectiveDate,
      target: revisionForm.target || 'all',
      changesSummary: revisionForm.changesSummary.trim(),
      ...(revisionForm.objectionGuide?.trim() ? { objectionGuide: revisionForm.objectionGuide.trim() } : {}),
      previousTerms: systemEdit.termsOfService || '',
      newTerms: systemEdit.termsOfService || '',
      previousPrivacy: systemEdit.privacyPolicy || '',
      newPrivacy: systemEdit.privacyPolicy || '',
    };

    const nextHistory = [newRevision, ...(systemEdit.termsHistory || [])];
    const updatedSystem: Partial<SystemConfig> = {
      ...systemEdit,
      termsVersion: nextVersion,
      termsRevision: newRevision,
      termsHistory: nextHistory,
    };

    setSystemEdit(updatedSystem);

    if (onUpdateSystemConfig) {
      try {
        await onUpdateSystemConfig(updatedSystem);
        alert(`약관 개정안 (v${nextVersion}, ${revisionForm.type === 'important' ? '중요 30일' : '일반 7일'})이 성공적으로 발행되었습니다!\n뷰어 접속자들에게 개정 안내 팝업이 표시됩니다.`);
        setShowRevisionForm(false);
      } catch (err: any) {
        console.error('handlePublishRevision error:', err);
        alert('약관 개정안 발행 중 오류가 발생했습니다:\n' + (err?.message || '알 수 없는 오류'));
      }
    }
  };

  const handleCancelActiveRevision = async () => {
    if (!window.confirm('현재 활성화된 약관 개정 안내 팝업을 중단하시겠습니까?')) {
      return;
    }
    const updatedSystem: any = {
      ...systemEdit,
      termsRevision: deleteField(),
    };
    setSystemEdit(prev => {
      const next = { ...prev };
      delete next.termsRevision;
      return next;
    });
    if (onUpdateSystemConfig) {
      try {
        await onUpdateSystemConfig(updatedSystem);
        alert('활성 개정 안내가 해제되었습니다.');
      } catch (err: any) {
        console.error('handleCancelActiveRevision error:', err);
        alert('개정 안내 해제 중 오류가 발생했습니다:\n' + (err?.message || '알 수 없는 오류'));
      }
    }
  };

  // 공지사항 복수 링크 관리 헬퍼
  const handleAddNoticeLink = () => {
    setNoticeLinks(prev => [...prev, { url: '', title: '' }]);
  };

  const handleUpdateNoticeLink = (index: number, field: 'url' | 'title', value: string) => {
    setNoticeLinks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveNoticeLink = (index: number) => {
    setNoticeLinks(prev => prev.filter((_, i) => i !== index));
  };

  // 공지사항 로직
  const handleSaveNotice = () => {
    if (!noticeForm.title?.trim() || !noticeForm.content?.trim()) {
      return alert('제목과 내용을 입력해주세요.');
    }

    const currentList = systemEdit.noticeList || [];

    // 유효한 링크 목록 필터링
    const validLinks: NoticeLink[] = noticeLinks
      .map(l => ({ url: l.url?.trim() || '', title: l.title?.trim() || '' }))
      .filter(l => l.url.length > 0);

    const firstLink = validLinks[0];

    if (editingNoticeId) {
      // 수정 모드
      const updatedList = currentList.map(n => {
        if (n.id === editingNoticeId) {
          const updated: NoticeItem = {
            ...n,
            title: noticeForm.title!.trim(),
            content: noticeForm.content!.trim(),
            type: (noticeForm.type as any) || 'big',
          };
          if (firstLink?.url) {
            updated.linkUrl = firstLink.url;
            updated.linkText = firstLink.title || firstLink.url;
          } else {
            delete updated.linkUrl;
            delete updated.linkText;
          }
          if (validLinks.length > 0) {
            updated.links = validLinks;
          } else {
            delete updated.links;
          }
          return updated;
        }
        return n;
      });
      handleChange('noticeList', updatedList);
      setEditingNoticeId(null);
      setNoticeForm({ title: '', content: '', type: 'big' });
      setNoticeLinks([]);
      alert('공지사항이 수정되었습니다. 아래 [시스템 설정 저장] 버튼을 눌러 저장해주세요.');
    } else {
      // 신규 추가 모드
      const newNotice: NoticeItem = {
        id: Date.now().toString(),
        title: noticeForm.title!.trim(),
        content: noticeForm.content!.trim(),
        type: (noticeForm.type as any) || 'big',
        date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
        ...(firstLink?.url ? { linkUrl: firstLink.url, linkText: firstLink.title || firstLink.url } : {}),
        ...(validLinks.length > 0 ? { links: validLinks } : {})
      };
      
      handleChange('noticeList', [newNotice, ...currentList]);
      setNoticeForm({ title: '', content: '', type: 'big' });
      setNoticeLinks([]);
      alert('새 공지사항이 추가되었습니다. 아래 [시스템 설정 저장] 버튼을 눌러 저장해주세요.');
    }
  };

  const handleStartEditNotice = (notice: NoticeItem) => {
    setEditingNoticeId(notice.id);
    setNoticeForm({
      title: notice.title,
      content: notice.content,
      type: notice.type,
      linkUrl: notice.linkUrl || '',
      linkText: notice.linkText || ''
    });

    if (notice.links && Array.isArray(notice.links) && notice.links.length > 0) {
      setNoticeLinks(notice.links.map(l => ({ url: l.url || '', title: l.title || '' })));
    } else if (notice.linkUrl) {
      setNoticeLinks([{ url: notice.linkUrl, title: notice.linkText || '' }]);
    } else {
      setNoticeLinks([]);
    }

    const el = document.getElementById('notice-form-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEditNotice = () => {
    setEditingNoticeId(null);
    setNoticeForm({ title: '', content: '', type: 'big' });
    setNoticeLinks([]);
  };

  const handleDeleteNotice = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const currentList = systemEdit.noticeList || [];
    handleChange('noticeList', currentList.filter(n => n.id !== id));
    if (editingNoticeId === id) {
      handleCancelEditNotice();
    }
  };

  const handleToggleNotice = (id: string) => {
    const currentList = systemEdit.noticeList || [];
    handleChange('noticeList', currentList.map(n => n.id === id ? { ...n, active: !n.active } : n));
  };

  return (
    <div className="space-y-6">
      {/* 1. 장기 휴방 / 여행 일정 설정 (확률 모델 반영) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          ✈️ 장기 휴방 / 여행 일정 설정 (확률 모델 반영)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">시작일</label>
            <input 
              type="date"
              value={systemEdit.travelStart || ''}
              onChange={e => handleChange('travelStart', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">종료일</label>
            <input 
              type="date"
              value={systemEdit.travelEnd || ''}
              onChange={e => handleChange('travelEnd', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">휴방 사유</label>
            <select
              value={systemEdit.absenceReason === '기타 (직접 입력)' ? '기타 (직접 입력)' : (systemEdit.absenceReason || '')}
              onChange={e => {
                const val = e.target.value;
                handleChange('absenceReason', val);
              }}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            >
              <option value="">설정 안함</option>
              <option value="건강 문제">건강 문제 (휴방 확률 증가)</option>
              <option value="휴식">휴식</option>
              <option value="컨디션 난조">컨디션 난조 (휴방 확률 증가)</option>
              <option value="개인 일정">개인 일정</option>
              <option value="여행">여행 (휴방 확률 증가)</option>
              <option value="장비 문제">장비 문제</option>
              <option value="기타 (직접 입력)">기타 (직접 입력)</option>
            </select>
          </div>
        </div>

        {/* 장기 휴방 중 유튜브 영상 업로드일 (확률 가산점 반영) */}
        <div className="mt-4 p-4 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/60">
          <label className="block text-sm font-bold text-purple-900 dark:text-purple-300 mb-1 flex items-center gap-1.5">
            <span>🎬 장기 휴방(7일 이상) 중 유튜브 영상 업로드일 설정</span>
            <span className="text-xs font-normal text-purple-600 dark:text-purple-400">(확률 소폭 가산점 부여)</span>
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-2">
            <input 
              type="date"
              value={systemEdit.recentVideoUploadDate || ''}
              onChange={e => handleChange('recentVideoUploadDate', e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
            {systemEdit.recentVideoUploadDate && (
              <button
                type="button"
                onClick={() => handleChange('recentVideoUploadDate', '')}
                className="px-3 py-2 text-xs text-zinc-500 hover:text-red-500 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors shrink-0"
              >
                초기화
              </button>
            )}
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              * 마지막 생방송 이후 7일 이상 휴방 상태일 때, 이 날짜에 새 영상이 올라오면 복귀 기대감으로 방송 예측 확률에 소폭 가산점이 자동 반영됩니다. (미입력 시에도 최근 등록 영상 로그를 자동 감지)
            </p>
          </div>
        </div>
        {systemEdit.absenceReason === '기타 (직접 입력)' && (
          <div className="mt-4">
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">기타 사유 입력</label>
            <input
              type="text"
              value={systemEdit.customAbsenceReason || ''}
              onChange={e => handleChange('customAbsenceReason', e.target.value)}
              placeholder="직접 입력할 사유를 적어주세요."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* 2. 점검 모드 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-600" />
          시스템 점검 모드 (접속 차단)
        </h3>
        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input 
            type="checkbox"
            checked={systemEdit.maintenance || false}
            onChange={e => handleChange('maintenance', e.target.checked)}
            className="w-5 h-5 text-purple-600 rounded"
          />
          <span className="font-bold text-zinc-900 dark:text-white">점검 모드 켜기</span>
        </label>
        
        {systemEdit.maintenance && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">예상 시작 시간</label>
                <input 
                  type="datetime-local"
                  value={systemEdit.maintenanceStart || ''}
                  onChange={e => handleChange('maintenanceStart', e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">예상 종료 시간 (도달 시 자동 종료)</label>
                <input 
                  type="datetime-local"
                  value={systemEdit.maintenanceEnd || ''}
                  onChange={e => handleChange('maintenanceEnd', e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              * 예상 종료 시간이 설정되면, 해당 시간에 도달하는 즉시 사용자 화면에서 점검 안내가 자동으로 해제(종료)되어 정상 사이트로 접속됩니다.
            </p>

            {systemEdit.maintenanceEnd && new Date(systemEdit.maintenanceEnd).getTime() <= Date.now() && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
                <span>
                  설정된 종료 시간 경과로 현재 일반 사용자에게는 점검 화면이 자동 종료되어 정상 제공 중입니다.
                </span>
                <button
                  type="button"
                  onClick={() => handleChange('maintenance', false)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors shrink-0 ml-2"
                >
                  점검 모드 OFF로 정리
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 3. 공지사항 모달 목록 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">팝업 공지사항 관리 (다중 등록 및 수정)</h3>
          {editingNoticeId && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full font-bold">
              공지사항 수정 중
            </span>
          )}
        </div>

        <div id="notice-form-section" className={`border rounded-xl p-4 mb-6 transition-colors ${editingNoticeId ? 'bg-purple-50/50 border-purple-300 dark:bg-purple-950/20 dark:border-purple-800' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">타이틀</label>
              <input 
                type="text" 
                value={noticeForm.title || ''}
                onChange={e => setNoticeForm(p => ({ ...p, title: e.target.value }))}
                placeholder="예: 새로운 기능 업데이트 안내"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">유형</label>
              <select 
                value={noticeForm.type || 'big'}
                onChange={e => setNoticeForm(p => ({ ...p, type: e.target.value as any }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm"
              >
                <option value="big">큰 팝업 (가운데)</option>
                <option value="small">작은 배너 (상단)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">내용 (링크는 자동으로 클릭 가능하게 변환됩니다)</label>
            <textarea 
              value={noticeForm.content || ''}
              onChange={e => setNoticeForm(p => ({ ...p, content: e.target.value }))}
              placeholder="공지 내용을 입력하세요..."
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm min-h-[100px]"
            />
          </div>

          {/* 다중 링크 추가 및 관리 */}
          <div className="mb-4 p-3.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" />
                <span>공지사항 연결 링크 ({noticeLinks.length}개)</span>
              </label>
              <button
                type="button"
                onClick={handleAddNoticeLink}
                className="px-2.5 py-1 text-xs font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg transition-colors flex items-center gap-1 border border-purple-200 dark:border-purple-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>링크 추가</span>
              </button>
            </div>

            {noticeLinks.length === 0 ? (
              <p className="text-xs text-zinc-500 py-1">
                등록된 링크가 없습니다. 위 <strong className="text-purple-600 dark:text-purple-400">+ 링크 추가</strong> 버튼을 눌러 패치노트나 영상 주소 등의 링크를 여러 개 등록할 수 있습니다.
              </p>
            ) : (
              <div className="space-y-2.5">
                {noticeLinks.map((link, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex-1">
                      <input
                        type="url"
                        value={link.url}
                        onChange={e => handleUpdateNoticeLink(idx, 'url', e.target.value)}
                        placeholder="https://... 링크 URL 주소"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <div className="w-full sm:w-48">
                      <input
                        type="text"
                        value={link.title || ''}
                        onChange={e => handleUpdateNoticeLink(idx, 'title', e.target.value)}
                        placeholder="링크 텍스트 (예: 패치노트)"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveNoticeLink(idx)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors self-end sm:self-center"
                      title="링크 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-[11px] text-zinc-500">
              * 링크는 여러 개 추가할 수 있으며, 공지 모달 및 배너에서 버튼이나 링크 목록으로 표시됩니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveNotice} 
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
            >
              {editingNoticeId ? (
                <>
                  <Check className="w-4 h-4" /> 공지 수정 완료
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> 공지 추가
                </>
              )}
            </button>
            {editingNoticeId && (
              <button 
                onClick={handleCancelEditNotice} 
                className="flex items-center gap-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                <X className="w-4 h-4" /> 수정 취소
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {(systemEdit.noticeList || []).map((notice) => {
            const displayLinks: NoticeLink[] = (notice.links && notice.links.length > 0)
              ? notice.links
              : (notice.linkUrl ? [{ url: notice.linkUrl, title: notice.linkText || '자세히 보기' }] : []);

            return (
              <div key={notice.id} className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl border ${notice.active ? 'border-purple-200 bg-purple-50/70 dark:border-purple-900/50 dark:bg-purple-900/10' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'} transition-colors`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${notice.type === 'big' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                      {notice.type === 'big' ? '팝업' : '상단배너'}
                    </span>
                    <h4 className="font-bold text-zinc-900 dark:text-white truncate">{notice.title}</h4>
                    <span className="text-xs text-zinc-500">{notice.date}</span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{notice.content}</p>
                  
                  {displayLinks.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <span className="text-xs text-zinc-500 block mb-1">연결 링크 ({displayLinks.length}개):</span>
                      <div className="flex flex-wrap gap-2">
                        {displayLinks.map((link, lIdx) => (
                          <a 
                            key={lIdx}
                            href={link.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline bg-white dark:bg-zinc-800 px-2 py-1 rounded-md border border-purple-200 dark:border-purple-800/60"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>{link.title || '자세히 보기'}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0">
                  <button 
                    onClick={() => handleStartEditNotice(notice)} 
                    title="공지 수정"
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleToggleNotice(notice.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${notice.active ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}
                  >
                    {notice.active ? '비활성화' : '활성화'}
                  </button>
                  <button 
                    onClick={() => handleDeleteNotice(notice.id)} 
                    title="공지 삭제"
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 시스템 버전 및 약관 버전 설정 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">버전 및 데이터 표시 설정</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">앱 버전 (appVersion)</label>
            <input 
              type="text"
              value={systemEdit.appVersion || ''}
              onChange={e => handleChange('appVersion', e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">약관 동의 버전 (termsVersion)</label>
            <input 
              type="number"
              value={systemEdit.termsVersion || 1}
              onChange={e => handleChange('termsVersion', Number(e.target.value))}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <p className="text-xs text-zinc-500 mt-1">숫자를 올리면 사용자들에게 재동의 팝업이 노출됩니다.</p>
          </div>
        </div>

        {/* 과거(~2025) 데이터 카테고리 분석 표시 토글 */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>과거(~2025) 데이터 카테고리 분석 메뉴 표시</span>
              {systemEdit.showLegacyCategoryAnalysis ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  활성화됨
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  비활성화 (숨김)
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              ~2025년 과거 데이터 조회 시 상세 분석 탭에서 '카테고리 분석' 서브탭 및 PDF 리포트 포함 여부를 설정합니다.
              (비활성화 시 '방송 추이 및 요일별 분석'만 표시됩니다)
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('showLegacyCategoryAnalysis', !systemEdit.showLegacyCategoryAnalysis)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              systemEdit.showLegacyCategoryAnalysis
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {systemEdit.showLegacyCategoryAnalysis ? '카테고리 분석 켜짐' : '카테고리 분석 꺼짐'}
          </button>
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
            우주하마 생방송 아카이브 링크 (URL)
          </label>
          <input 
            type="url"
            placeholder="https://..."
            value={systemEdit.archiveSourceUrl || ''}
            onChange={e => handleChange('archiveSourceUrl', e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p className="text-xs text-zinc-500 mt-1">푸터의 '우주하마 생방송 아카이브' 안내 텍스트에 연결될 링크 주소입니다.</p>
        </div>
      </div>

      {/* 5. 약관 및 개인정보처리방침 개정 관리 시스템 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              약관 및 개인정보처리방침 개정 관리 (Terms Revision)
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              약관 개정 시 사전 고지(일반 7일 vs 중요 30일), 직전 버전 대비 변경 사항 비교, 이의 제기 방법 및 거부권 안내 팝업을 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRevisionForm(!showRevisionForm)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4" />
            {showRevisionForm ? '개정 작성 취소' : '신규 개정안 작성'}
          </button>
        </div>

        {/* 현재 활성 개정안 상태 카드 */}
        {systemEdit.termsRevision ? (
          <div className="p-5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-600 text-white">
                  현재 활성 개정안 (v{systemEdit.termsRevision.version})
                </span>
                {systemEdit.termsRevision.type === 'important' ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    중요 개정 (30일 사전 고지 / 동의 체크 필수)
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
                    일반 개정 (7일 후 시행 / 동의 간주)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewRevision(systemEdit.termsRevision!)}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  팝업 미리보기
                </button>
                <button
                  type="button"
                  onClick={handleCancelActiveRevision}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors border border-red-200 dark:border-red-900/40"
                >
                  개정안 중단
                </button>
              </div>
            </div>

            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              {systemEdit.termsRevision.title}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span>공지 일자: <strong>{systemEdit.termsRevision.noticeDate}</strong></span>
              </div>
              <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span>적용(시행) 일자: <strong className="text-purple-600 dark:text-purple-400">{systemEdit.termsRevision.effectiveDate}</strong></span>
              </div>
            </div>

            <div className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="font-bold text-zinc-700 dark:text-zinc-200 mb-1">직전 버전 대비 변경 사항 요약:</div>
              <p className="whitespace-pre-wrap leading-relaxed">{systemEdit.termsRevision.changesSummary}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-xs text-zinc-500">
            현재 뷰어에 표시 중인 활성화된 약관 개정 안내가 없습니다.
          </div>
        )}

        {/* 신규 개정안 작성 폼 */}
        {showRevisionForm && (
          <div className="p-5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-4">
            <h4 className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-600" />
              새로운 약관 개정안 작성 및 발행
            </h4>

            {/* 1. 개정 유형 선택 (일반 7일 vs 중요 30일) */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">개정 유형 선택 (필수)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleRevisionTypeChange('normal')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    revisionForm.type === 'normal'
                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 ring-2 ring-purple-500'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="font-bold text-sm mb-1 flex items-center justify-between">
                    <span>일반 개정 (7일 후 시행)</span>
                    {revisionForm.type === 'normal' && <Check className="w-4 h-4 text-purple-600" />}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    개정 7일 후 적용. 직전 버전 대비 변경 사항, 시행일, 이의 제기 방법 안내 후 거부 의사가 없으면 동의 간주되는 단순 팝업.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRevisionTypeChange('important')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    revisionForm.type === 'important'
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="font-bold text-sm mb-1 flex items-center justify-between">
                    <span>중요 개정 (30일 사전 고지)</span>
                    {revisionForm.type === 'important' && <Check className="w-4 h-4 text-amber-600" />}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    최소 30일 후부터 시행. 변경 사항, 적용 일자 고지 및 사용자의 <strong>동의 여부 체크박스 필수 확인</strong>.
                  </p>
                </button>
              </div>
            </div>

            {/* 개정 제목 및 대상 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">개정 안내 제목</label>
                <input
                  type="text"
                  placeholder="예: 2026년 상반기 서비스 이용약관 및 개인정보처리방침 개정 안내"
                  value={revisionForm.title || ''}
                  onChange={e => setRevisionForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">개정 대상</label>
                <select
                  value={revisionForm.target || 'all'}
                  onChange={e => setRevisionForm(prev => ({ ...prev, target: e.target.value as any }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="all">이용약관 및 개인정보처리방침 전체</option>
                  <option value="terms">이용약관만</option>
                  <option value="privacy">개인정보처리방침만</option>
                </select>
              </div>
            </div>

            {/* 날짜 설정 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">공지 등록 일자</label>
                <input
                  type="date"
                  value={revisionForm.noticeDate || todayStr}
                  onChange={e => setRevisionForm(prev => ({ ...prev, noticeDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  적용(시행) 일자 {revisionForm.type === 'important' ? '(최소 30일 후)' : '(최소 7일 후)'}
                </label>
                <input
                  type="date"
                  value={revisionForm.effectiveDate || ''}
                  onChange={e => setRevisionForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>

            {/* 무엇이 어떻게 바뀌었는지 (직전 버전 대비 변경 사항) */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                주요 변경 사항 비교 (직전 버전 대비 무엇이 어떻게 바뀌었는지)
              </label>
              <textarea
                placeholder="[주요 개정 내용]&#10;1. 제X조 (신규 서비스 및 통계 기능 도입에 따른 목적 규정 구체화)&#10;- 변경 전: 기존 방송 데이터 조회 및 예측 제공&#10;- 변경 후: 과거 스프레드시트 기록 연동 및 통합 상세 통계 기능 추가&#10;&#10;2. 개인정보 처리방침 제X조 (쿠키 및 로컬스토리지 이용 목적 안내)&#10;- 사용자의 설정 값(탭, 테마, 공지 확인 이력) 보존을 위한 브라우저 로컬 저장소 활용 내역 명시"
                value={revisionForm.changesSummary || ''}
                onChange={e => setRevisionForm(prev => ({ ...prev, changesSummary: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[140px] outline-none"
              />
            </div>

            {/* 이의 제기 방법 및 거부권 안내 */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                이의 제기 방법 및 거부권 안내 문구 (미입력 시 기본 문구 사용)
              </label>
              <textarea
                placeholder={`개정 약관에 동의하지 않으시는 경우 회원 탈퇴 또는 서비스 이용 중단을 요청하실 수 있으며, 관리자 문의(${systemEdit.adminEmail || 'admin@example.com'})를 통해 이의를 제기하실 수 있습니다. 시행일 전까지 별도의 거부 의사를 표시하지 아니한 경우 본 개정안에 동의한 것으로 간주됩니다.`}
                value={revisionForm.objectionGuide || ''}
                onChange={e => setRevisionForm(prev => ({ ...prev, objectionGuide: e.target.value }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[80px] outline-none"
              />
            </div>

            {/* 폼 하단 액션 */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const tempRevision: TermsRevision = {
                    version: (systemEdit.termsVersion || 1) + 1,
                    type: revisionForm.type || 'normal',
                    title: revisionForm.title || (revisionForm.type === 'important' ? '[중요] 이용약관 및 개인정보처리방침 개정 안내' : '이용약관 및 개인정보처리방침 개정 안내'),
                    noticeDate: revisionForm.noticeDate || todayStr,
                    effectiveDate: revisionForm.effectiveDate || defaultNormalEffective,
                    changesSummary: revisionForm.changesSummary || '직전 버전 대비 변경 사항 요약 미리보기 텍스트입니다.',
                    objectionGuide: revisionForm.objectionGuide || undefined,
                  };
                  setPreviewRevision(tempRevision);
                }}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                팝업 미리보기
              </button>
              <button
                type="button"
                onClick={handlePublishRevision}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-md"
              >
                개정안 즉시 발행 및 뷰어 적용
              </button>
            </div>
          </div>
        )}

        {/* 이전 개정 이력 (termsHistory) */}
        {systemEdit.termsHistory && systemEdit.termsHistory.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              과거 개정 이력 ({systemEdit.termsHistory.length}건)
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {systemEdit.termsHistory.map((hist, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <span>v{hist.version}</span>
                      <span>{hist.title}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {hist.type === 'important' ? '중요 30일' : '일반 7일'}
                      </span>
                    </div>
                    <div className="text-zinc-400">
                      공지일: {hist.noticeDate} / 시행일: {hist.effectiveDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewRevision(hist)}
                    className="p-1.5 text-zinc-500 hover:text-purple-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    title="당시 팝업 보기"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6. 데이터베이스 이관 (logs -> logs_by_month) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              월별 일지 데이터베이스 이관 (마이그레이션)
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              기존 단일 일지 문서(<code className="font-mono text-purple-600">logs</code>)들을 월별 묶음 문서(<code className="font-mono text-purple-600">logs_by_month</code>)로 일괄 변환하여 트래픽 및 읽기 비용을 대폭 절감합니다.
            </p>
          </div>
          <button
            onClick={handleStartMigration}
            disabled={isMigrating}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0"
          >
            {isMigrating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                이관 진행 중...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                월별 데이터로 이관 시작
              </>
            )}
          </button>
        </div>

        {migrationProgress && (
          <div className={`mt-4 p-4 rounded-xl border text-sm ${
            migrationProgress.status === 'success' 
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' 
              : migrationProgress.status === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
          }`}>
            <div className="flex items-center gap-2 font-bold mb-1">
              {migrationProgress.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
              {migrationProgress.status === 'success' && <Check className="w-4 h-4 text-green-600" />}
              {migrationProgress.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
              <span>상태: {migrationProgress.status === 'running' ? '진행 중' : migrationProgress.status === 'success' ? '완료' : '오류'}</span>
            </div>
            <p className="text-xs">{migrationProgress.message}</p>
          </div>
        )}
      </div>

      {/* 6. 약관 및 방침 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">서비스 이용약관 및 개인정보처리방침</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">이용약관</label>
            <textarea 
              value={systemEdit.termsOfService || ''}
              onChange={e => handleChange('termsOfService', e.target.value)}
              placeholder="제 1조 (목적)..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[250px] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">개인정보처리방침</label>
            <textarea 
              value={systemEdit.privacyPolicy || ''}
              onChange={e => handleChange('privacyPolicy', e.target.value)}
              placeholder="본 사이트는 원활한 서비스 제공을 위해 최소한의..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[250px] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 sticky bottom-4">
        <button 
          onClick={handleSave}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
        >
          모든 변경사항 저장
        </button>
      </div>

      {/* 관리자 팝업 미리보기 모달 */}
      {previewRevision && (
        <TermsRevisionModal
          revision={previewRevision}
          adminEmail={systemEdit.adminEmail}
          isPreview={true}
          onClose={() => setPreviewRevision(null)}
          onAcknowledge={() => {
            alert('미리보기 확인 완료 (실제 사용자에게는 이 동작 시 모달이 닫히며 동의/확인 처리됩니다)');
            setPreviewRevision(null);
          }}
        />
      )}
    </div>
  );
}
