import React, { useState } from 'react';
import { SystemConfig, NoticeItem, NoticeLink } from '../../../../types';
import { Plus, Edit2, Trash2, Check, X, Link as LinkIcon, ExternalLink, Bell, Eye, BookOpen, RotateCcw, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { RichTextEditor } from '../../../common/RichTextEditor';

export const DEFAULT_PREFACE_TEMPLATE = `### 📖 서비스 이용 일러두기

본 사이트는 스트리머 **우주하마**의 생방송 데이터를 통계적으로 분석하여 방송 유력 시간대 및 패턴을 제공하는 비공식 팬 통계 팬사이트예요.

- **데이터 수집 기준**:
  치지직(CHZZK) 및 유튜브(YouTube) 공식 공개 방송 일지와 아카이브를 바탕으로 2023년 이후 데이터를 실시간 집계해요.

- **확률 산출 및 예측**:
  요일별 패턴 가중치, 최근 30일/90일 방송 주기, 휴방 간격 및 최근 영상 업로드 여부 등을 복합 연산하여 산출되는 **통계적 추정치**예요.
  실제 스트리머의 개인 일정이나 당일 컨디션에 따라 실제 방송 시간은 변동될 수 있어요.

- **실시간 데이터 제보 및 심사**:
  유저분들께서 제보해주신 방송 일지는 데이터 무결성을 위해 운영진 심사를 거쳐 승인 후 반영돼요.

- **알림 및 개인정보**:
  PWA 웹 푸시 알림 설정 및 테마 설정은 브라우저 로컬 저장소에 안전하게 유지되며, 불필요한 개인 식별 정보를 수집하지 않아요.`;

interface NoticesSubTabProps {
  systemEdit: Partial<SystemConfig>;
  handleChange: (field: keyof SystemConfig, val: any) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const NoticesSubTab: React.FC<NoticesSubTabProps> = ({
  systemEdit,
  handleChange,
  onSave,
  saving = false
}) => {
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeForm, setNoticeForm] = useState<Partial<NoticeItem>>({ title: '', content: '', type: 'both', dismissMode: 'session' });
  const [noticeLinks, setNoticeLinks] = useState<NoticeLink[]>([]);

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

  const handleSaveNotice = () => {
    if (!noticeForm.title?.trim() || !noticeForm.content?.trim()) {
      return alert('제목과 내용을 입력해주세요.');
    }

    const currentList = systemEdit.noticeList || [];
    const validLinks: NoticeLink[] = noticeLinks
      .map(l => ({ url: l.url?.trim() || '', title: l.title?.trim() || '' }))
      .filter(l => l.url.length > 0);

    const firstLink = validLinks[0];

    if (editingNoticeId) {
      const updatedList = currentList.map(n => {
        if (n.id === editingNoticeId) {
          const updated: NoticeItem = {
            ...n,
            title: noticeForm.title!.trim(),
            content: noticeForm.content!.trim(),
            type: (noticeForm.type as any) || 'both',
            dismissMode: noticeForm.dismissMode || 'session',
          };
          const nextPrefix = (noticeForm.prefix || '').trim();
          if (nextPrefix) updated.prefix = nextPrefix;
          else delete updated.prefix;
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
      setNoticeForm({ title: '', content: '', type: 'both', dismissMode: 'session' });
      setNoticeLinks([]);
    } else {
      const newNotice: NoticeItem = {
        id: Date.now().toString(),
        title: noticeForm.title!.trim(),
        content: noticeForm.content!.trim(),
        type: (noticeForm.type as any) || 'both',
        dismissMode: noticeForm.dismissMode || 'session',
        ...((noticeForm.prefix || '').trim() ? { prefix: (noticeForm.prefix || '').trim() } : {}),
        date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
        ...(firstLink?.url ? { linkUrl: firstLink.url, linkText: firstLink.title || firstLink.url } : {}),
        ...(validLinks.length > 0 ? { links: validLinks } : {})
      };
      
      handleChange('noticeList', [newNotice, ...currentList]);
      setNoticeForm({ title: '', content: '', type: 'both', dismissMode: 'session' });
      setNoticeLinks([]);
    }
  };

  const handleStartEditNotice = (notice: NoticeItem) => {
    setEditingNoticeId(notice.id);
    setNoticeForm({
      title: notice.title,
      content: notice.content,
      type: notice.type || 'both',
      dismissMode: notice.dismissMode || 'session',
      prefix: notice.prefix || '',
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
    setNoticeForm({ title: '', content: '', type: 'both', dismissMode: 'session' });
    setNoticeLinks([]);
  };

  const handleDeleteNotice = (id: string) => {
    if (!confirm('삭제하시겠어요?')) return;
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

  // 공지사항 순서 변경 (위/아래 화살표)
  const handleMoveNotice = (index: number, direction: 'up' | 'down') => {
    const currentList = [...(systemEdit.noticeList || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;
    const temp = currentList[index];
    currentList[index] = currentList[targetIndex];
    currentList[targetIndex] = temp;
    handleChange('noticeList', currentList);
  };

  // 공지사항 순서 변경 (드래그 앤 드롭)
  const [draggedNoticeIndex, setDraggedNoticeIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedNoticeIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedNoticeIndex === null || draggedNoticeIndex === targetIndex) {
      setDraggedNoticeIndex(null);
      return;
    }
    const currentList = [...(systemEdit.noticeList || [])];
    const [removed] = currentList.splice(draggedNoticeIndex, 1);
    currentList.splice(targetIndex, 0, removed);
    handleChange('noticeList', currentList);
    setDraggedNoticeIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. 기본 글로벌 공지 모드 설정 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">공통 공지사항 노출 방식</h3>
        <p className="text-xs text-zinc-500 mb-4">
          사이트 전체에 표시될 메인 공지 배너 또는 모달 표시 방식을 선택해요.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${systemEdit.noticeType === 'none' ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <input 
              type="radio" 
              name="noticeType" 
              value="none" 
              checked={systemEdit.noticeType === 'none'} 
              onChange={() => handleChange('noticeType', 'none')} 
              className="text-purple-600"
            />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">공지 숨김 (None)</span>
          </label>
          <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${systemEdit.noticeType === 'small' ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <input 
              type="radio" 
              name="noticeType" 
              value="small" 
              checked={systemEdit.noticeType === 'small'} 
              onChange={() => handleChange('noticeType', 'small')} 
              className="text-purple-600"
            />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">상단 띠 배너 (Small)</span>
          </label>
          <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${systemEdit.noticeType === 'big' ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <input 
              type="radio" 
              name="noticeType" 
              value="big" 
              checked={systemEdit.noticeType === 'big'} 
              onChange={() => handleChange('noticeType', 'big')} 
              className="text-purple-600"
            />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">중앙 팝업 모달 (Big)</span>
          </label>
          <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${systemEdit.noticeType === 'both' ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <input 
              type="radio" 
              name="noticeType" 
              value="both" 
              checked={systemEdit.noticeType === 'both'} 
              onChange={() => handleChange('noticeType', 'both')} 
              className="text-purple-600"
            />
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">팝업 + 띠 배너 둘 다 (Both)</span>
          </label>
        </div>

        {(systemEdit.noticeType === 'small' || systemEdit.noticeType === 'both') && (
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">상단 배너 기본 단문 텍스트 (목록이 비어있을 시 대체 문구)</label>
            <input
              type="text"
              value={systemEdit.noticeContent || ''}
              onChange={e => handleChange('noticeContent', e.target.value)}
              placeholder="예: 최신 방송 데이터 업데이트가 완료되었어요."
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* 2. 팝업 & 배너 공지사항 목록 관리 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">공지사항 목록 (다중 등록 및 관리)</h3>
            <p className="text-xs text-zinc-500">등록된 공지 중 활성화된 항목이 사용자 화면에 표시돼요.</p>
          </div>
          {editingNoticeId && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold">
              공지사항 수정 중
            </span>
          )}
        </div>

        {/* 작성/수정 폼 */}
        <div id="notice-form-section" className={`border rounded-xl p-4 transition-colors ${editingNoticeId ? 'bg-purple-50/50 border-purple-300 dark:bg-purple-950/20 dark:border-purple-800' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">제목</label>
              <input 
                type="text" 
                value={noticeForm.title || ''}
                onChange={e => setNoticeForm(p => ({ ...p, title: e.target.value }))}
                placeholder="예: 새로운 기능 업데이트 안내"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">표시 유형</label>
              <select 
                value={noticeForm.type || 'both'}
                onChange={e => setNoticeForm(p => ({ ...p, type: e.target.value as any }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
              >
                <option value="both">팝업 및 띠 배너 둘 다 (Both) [기본]</option>
                <option value="big">중앙 팝업 모달만 (Big)</option>
                <option value="small">헤더 밑 띠 배너만 (Small)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">표시 및 닫기 형태</label>
              <select 
                value={noticeForm.dismissMode || 'session'}
                onChange={e => setNoticeForm(p => ({ ...p, dismissMode: e.target.value as any }))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
              >
                <option value="session">영구 표시 (새로고침/재접속 시 다시 표시) [기본]</option>
                <option value="permanent">일회성 표시 (한번 X로 닫으면 계속 숨김)</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">띠 공지 앞머리</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={noticeForm.prefix || ''}
                onChange={e => setNoticeForm(p => ({ ...p, prefix: e.target.value }))}
                placeholder={`비우면 기본값 ${systemEdit.defaultNoticePrefix || '[공지]'}`}
                maxLength={12}
                className="w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
              {['[공지]', '[안내]', '[업데이트]', '[이벤트]', '[긴급]'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setNoticeForm(p => ({ ...p, prefix: tag }))}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${(noticeForm.prefix || '') === tag ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'}`}
                >
                  {tag}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNoticeForm(p => ({ ...p, prefix: '' }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                기본값
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>전체 기본 앞머리</span>
              <input
                type="text"
                value={systemEdit.defaultNoticePrefix || ''}
                onChange={e => handleChange('defaultNoticePrefix', e.target.value)}
                placeholder="[공지]"
                maxLength={12}
                className="w-28 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
              />
              <span>(공지별 앞머리가 비어 있을 때 사용 · 아래 저장 버튼으로 반영)</span>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">내용 (서식 편집기 지원)</label>
            <RichTextEditor 
              value={noticeForm.content || ''}
              onChange={val => setNoticeForm(p => ({ ...p, content: val }))}
              placeholder="공지 내용을 입력하세요 (글자 크기, 색상, 굵게, 기울임, 밑줄, 취소선, 정렬 등 편집 도구 지원)..."
              rows={5}
              minHeight="140px"
            />
          </div>

          {/* 다중 링크 관리 */}
          <div className="mb-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" />
                <span>연결 링크 ({noticeLinks.length}개)</span>
              </label>
              <button
                type="button"
                onClick={handleAddNoticeLink}
                className="px-2.5 py-1 text-xs font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>링크 추가</span>
              </button>
            </div>

            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2">
              💡 외부 URL(https://...)뿐만 아니라 사이트 내 화면으로 펼쳐져 이동하는 <b>redirect://설정/일러두기</b>, <b>redirect://패치노트</b>, <b>redirect://기록</b>, <b>redirect://분석</b> 등을 입력할 수 있어요.
            </p>

            {noticeLinks.map((link, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="링크명 (예: 일러두기 보기)"
                  value={link.title || ''}
                  onChange={e => handleUpdateNoticeLink(idx, 'title', e.target.value)}
                  className="w-1/3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="URL (https://... 또는 redirect://설정/일러두기)"
                  value={link.url}
                  onChange={e => handleUpdateNoticeLink(idx, 'url', e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveNoticeLink(idx)}
                  className="p-1.5 text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={handleSaveNotice} 
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-xs cursor-pointer shadow-sm"
            >
              {editingNoticeId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingNoticeId ? '공지 수정 반영' : '새 공지 추가'}</span>
            </button>
            {editingNoticeId && (
              <button 
                type="button"
                onClick={handleCancelEditNotice} 
                className="bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-xl font-bold text-xs cursor-pointer"
              >
                취소
              </button>
            )}
          </div>
        </div>

        {/* 공지 목록 */}
        <div className="space-y-2.5">
          {(!systemEdit.noticeList || systemEdit.noticeList.length === 0) && (
            <p className="text-xs text-zinc-400 italic py-2">등록된 공지사항이 없어요.</p>
          )}
          {(systemEdit.noticeList || []).map((notice, nIdx) => {
            const listLen = (systemEdit.noticeList || []).length;
            const displayLinks: NoticeLink[] = (notice.links && notice.links.length > 0)
              ? notice.links
              : (notice.linkUrl ? [{ url: notice.linkUrl, title: notice.linkText || '자세히 보기' }] : []);

            return (
              <div 
                key={notice.id} 
                draggable
                onDragStart={(e) => handleDragStart(e, nIdx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, nIdx)}
                className={`flex items-start justify-between gap-2.5 sm:gap-3 p-3.5 rounded-xl border transition-all ${
                  draggedNoticeIndex === nIdx ? 'opacity-40 border-purple-400 scale-[0.99]' : ''
                } ${
                  notice.active 
                    ? 'border-purple-200 bg-purple-50/50 dark:border-purple-900/50 dark:bg-purple-950/10' 
                    : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40'
                }`}
              >
                {/* 순서 변경 드래그 핸들 & 화살표 조작부 */}
                <div className="flex flex-col items-center justify-center gap-0.5 pt-0.5 shrink-0 select-none">
                  <div 
                    title="드래그하여 순서 변경" 
                    className="p-1 text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={nIdx === 0}
                      onClick={() => handleMoveNotice(nIdx, 'up')}
                      title="위로 이동"
                      className="p-1 rounded text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={nIdx === listLen - 1}
                      onClick={() => handleMoveNotice(nIdx, 'down')}
                      title="아래로 이동"
                      className="p-1 rounded text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (!notice.type || notice.type === 'both')
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' 
                        : notice.type === 'big' 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {(!notice.type || notice.type === 'both') ? '팝업+띠배너' : notice.type === 'big' ? '팝업' : '띠배너'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (notice.dismissMode || 'session') === 'session'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}>
                      {(notice.dismissMode || 'session') === 'session' ? '영구 표시' : '일회성'}
                    </span>
                    <h4 className="font-bold text-xs text-zinc-900 dark:text-white truncate">{notice.title}</h4>
                    <span className="text-[11px] text-zinc-400">{notice.date}</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{notice.content}</p>
                  
                  {displayLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {displayLinks.map((link, lIdx) => (
                        <a 
                          key={lIdx}
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{link.title || '자세히 보기'}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    type="button"
                    onClick={() => handleStartEditNotice(notice)} 
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleToggleNotice(notice.id)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${notice.active ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}
                  >
                    {notice.active ? '비활성' : '활성'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeleteNotice(notice.id)} 
                    className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 일러두기 (설정 - 정보 탭 안내문) 편집 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">일러두기 (서비스 가이드 & 이용 수칙) 편집</h3>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              사용자 화면의 [설정] - [정보] 섹션에 노출되는 공식 '일러두기' 안내 문구를 서식 편집기로 작성해요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('기본 일러두기 템플릿 문구를 불러오시겠어요? 현재 작성 중인 내용이 대체돼요.')) {
                handleChange('preface', DEFAULT_PREFACE_TEMPLATE);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            title="기본 템플릿 불러오기"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
            <span>기본 템플릿 불러오기</span>
          </button>
        </div>

        <RichTextEditor 
          value={systemEdit.preface ?? DEFAULT_PREFACE_TEMPLATE}
          onChange={val => handleChange('preface', val)}
          placeholder="일러두기 본문을 작성하세요 (글씨 크기, 볼드, 기울임, 밑줄, 글자 색, 정렬 등 편집 지원)..."
          rows={10}
          minHeight="220px"
          label="일러두기 본문"
        />
      </div>

      {onSave && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? '저장 중...' : '공지 설정 저장하기'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
