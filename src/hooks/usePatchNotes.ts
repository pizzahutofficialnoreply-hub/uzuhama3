import { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  getDocs,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp, 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { PatchNote, PatchCategory } from '../types';

const LOCAL_STORAGE_KEY = 'uzuhama_patch_notes_v2';
const DELETED_PATCH_NOTES_KEY = 'uzuhama_patch_notes_deleted_v2';

// 관리자 저장 API: uzuhama.web.app(Firebase Hosting)에는 /api 가 없으므로 Vercel 주소로 호출
const ADMIN_MUTATE_URL = (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app'))
  ? '/api/admin/mutate'
  : 'https://uzuhama.vercel.app/api/admin/mutate';
const ADMIN_EMAIL = 'saramoriyo@gmail.com';

export const DEFAULT_PATCH_NOTES: PatchNote[] = [
  {
    id: 'patch-v2.6.0',
    version: '2.6.0',
    title: 'v2.6.0 하단 네비게이션 & UI 인터랙션 대규모 개편',
    category: 'update',
    date: '2026-09-27',
    highlights: [
      '하단 탭바 ↔ 검색창 키보드 일체형 모핑 시스템',
      '회색 인디케이터 터치 드래그 스냅 탭 전환 제스처',
      '탭별 독립 스크롤 위치 기억 및 자동 복원',
      '인앱 패치노트 아카이브 및 세션 유지 강화'
    ],
    author: '운영진',
    content: `## 🚀 주요 업데이트 내역

### 1. 하단 탭바 & 검색창 인터랙션 고도화
- **키보드 일체형 고정**: 검색창 전환 시 지연 없이 키보드와 1:1로 밀착되어 부드럽게 함께 이동합니다.
- **슬림 검색창 규격 유지**: 검색창 높이(46px)를 유지하면서도 탭바와 분리된 확장 애니메이션을 제공합니다.
- **화면 최하단 블러 고정**: 하단 블러 레이어가 키보드와 함께 딸려 올라오지 않고 화면 바닥에 안정적으로 고정됩니다.

### 2. 회색 원 드래그 탭 전환 제스처
- 하단 활성 탭의 회색 원을 손가락으로 드래그하면 원하는 탭으로 부드럽게 글라이딩 스냅되어 화면이 전환됩니다.

### 3. 탭별 스크롤 위치 독립 기억
- 요약, 기록, 분석, 검색 탭 각각의 스크롤 위치를 개별 기억하여 다른 탭으로 이동했다 돌아와도 보던 위치 그대로 즉시 복원됩니다.
- 이미 확률 카드가 지나간 상태에서는 불필요한 자동 스크롤을 방지하여 시각적 피로도를 낮추었습니다.

### 4. 패치노트 아카이브 안정화
- 새 창 열림 없이 앱 내에서 매끄럽게 열리며, 열람 후 돌아와도 구글 로그인 세션이 끊김 없이 안전하게 유지됩니다.`
  },
  {
    id: 'patch-v2.5.2',
    version: '2.5.2',
    title: 'v2.5.2 통계 집계 최적화 및 캘린더 동기화 보강',
    category: 'patch',
    date: '2026-09-20',
    highlights: ['캘린더 탭 날짜별 필터링 성능 개선', '실시간 확률 알고리즘 안정화'],
    author: '운영진',
    content: `## 🛠️ 패치 및 최적화 내역
- 캘린더 탭에서 특정 날짜를 터치했을 때 일지 목록이 빠르게 렌더링되도록 쿼리 캐시를 최적화했습니다.
- 실시간 방송 확률 예측 위젯의 모바일 뷰포트 레이아웃 안정성을 개선했습니다.`
  }
];

export function usePatchNotes() {
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_PATCH_NOTES;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_PATCH_NOTES;
  });
  const [loading, setLoading] = useState(false);

  // Firestore 실시간 동기화 (로컬 캐시 및 다중 탭 양방향 동기화)
  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    const syncLists = (firestoreList: PatchNote[]) => {
      if (!isMounted) return;
      const deletedIds = new Set<string>();
      try {
        const d = JSON.parse(localStorage.getItem(DELETED_PATCH_NOTES_KEY) || '[]');
        if (Array.isArray(d)) d.forEach(id => deletedIds.add(id));
      } catch {}

      const noteMap = new Map<string, PatchNote>();

      // 1. 기본 패치노트 등록
      DEFAULT_PATCH_NOTES.forEach(note => {
        if (!deletedIds.has(note.id)) {
          noteMap.set(note.id, note);
        }
      });

      // 2. 로컬스토리지에 저장된 사용자 등록/수정 패치노트 병합
      try {
        const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        if (Array.isArray(local)) {
          local.forEach((note: PatchNote) => {
            if (note && note.id && !deletedIds.has(note.id)) {
              noteMap.set(note.id, note);
            }
          });
        }
      } catch {}

      // 3. Firestore 원격 데이터 병합 (원격이 최신 진실의 원천)
      firestoreList.forEach(note => {
        if (note && note.id && !deletedIds.has(note.id)) {
          noteMap.set(note.id, note);
        }
      });

      const mergedList = Array.from(noteMap.values());
      mergedList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      setPatchNotes(mergedList);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedList));
      } catch {}
    };

    // 패치노트는 서버 API 에서 읽음 (Firestore patch_notes + Notion 데이터베이스를 합친 목록)
    // - 서버가 관리자 권한으로 읽어 Firestore 규칙과 무관하게 표시, 3분마다 새로 확인
    const API_BASE = (import.meta.env.VITE_VERCEL_API_URL ||
      (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app') ? '' : 'https://uzuhama.vercel.app')
    ).replace(/\/+$/, '');
    let pollTimer: number | undefined;
    const fetchNotes = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/patch-notes`);
        const json = await r.json();
        if (isMounted && Array.isArray(json?.notes)) {
          const serverNotes = json.notes as PatchNote[];
          // 관리자: 예전에 저장이 실패해 이 기기에만 남아 있는 패치노트를 서버로 복구 업로드
          try {
            const user = auth.currentUser;
            if (user?.email?.toLowerCase() === ADMIN_EMAIL) {
              const serverIds = new Set(serverNotes.map((n) => n.id));
              const defaultIds = new Set(DEFAULT_PATCH_NOTES.map((n) => n.id));
              const deleted = new Set<string>(JSON.parse(localStorage.getItem(DELETED_PATCH_NOTES_KEY) || '[]'));
              const local: PatchNote[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
              const missing = (Array.isArray(local) ? local : []).filter(
                (n) => n?.id && !serverIds.has(n.id) && !defaultIds.has(n.id) && !deleted.has(n.id) && !String(n.id).startsWith('notion-')
              );
              if (missing.length > 0) {
                const token = await user.getIdToken();
                for (const note of missing) {
                  await fetch(ADMIN_MUTATE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ action: 'savePatchNote', note }),
                  }).catch(() => {});
                }
                console.info(`[패치노트] 이 기기에만 있던 ${missing.length}개를 서버에 복구했습니다.`);
              }
            }
          } catch {}
          syncLists(serverNotes);
        }
      } catch (e) {
        console.debug('Patch notes API notice:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    pollTimer = window.setInterval(fetchNotes, 3 * 60 * 1000);
    unsubscribe = () => { if (pollTimer) window.clearInterval(pollTimer); };

    fetchNotes();

    // 컴포넌트 및 다중 창 간 실시간 동기화 이벤트 수신
    const handleSync = () => {
      try {
        const s = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (s && isMounted) {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            setPatchNotes(parsed);
          }
        }
      } catch {}
    };
    window.addEventListener('uzuhama_patch_notes_changed', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      isMounted = false;
      unsubscribe();
      window.removeEventListener('uzuhama_patch_notes_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const addPatchNote = async (item: Omit<PatchNote, 'id'>) => {
    const cleanVersion = item.version.replace(/^v/, '').trim();
    const docId = `patch-v${cleanVersion}`;
    const newNote: PatchNote = {
      ...item,
      id: docId,
      version: cleanVersion,
      highlights: item.highlights || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 삭제 기록에서 복구
    try {
      const d = JSON.parse(localStorage.getItem(DELETED_PATCH_NOTES_KEY) || '[]');
      if (Array.isArray(d)) {
        const nextD = d.filter((delId: string) => delId !== docId);
        localStorage.setItem(DELETED_PATCH_NOTES_KEY, JSON.stringify(nextD));
      }
    } catch {}

    setPatchNotes(prev => {
      const exists = prev.some(p => p.id === docId);
      const next = exists ? prev.map(p => p.id === docId ? newNote : p) : [newNote, ...prev];
      next.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      const docRef = doc(db, 'patch_notes', docId);
      await setDoc(docRef, {
        ...newNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore add notice (saved locally, syncing via admin):', err);
      // 서버 관리자 엔드포인트 동기화 시도
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch(ADMIN_MUTATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'savePatchNote', note: newNote })
          });
        }
      } catch {}
    }

    window.dispatchEvent(new Event('uzuhama_patch_notes_changed'));
    return newNote;
  };

  const updatePatchNote = async (item: PatchNote) => {
    const cleanVersion = item.version.replace(/^v/, '').trim();
    const newDocId = `patch-v${cleanVersion}`;
    const updatedItem: PatchNote = { 
      ...item, 
      id: newDocId,
      version: cleanVersion,
      updatedAt: new Date().toISOString(),
    };

    if (item.id && item.id !== newDocId) {
      try {
        const d = JSON.parse(localStorage.getItem(DELETED_PATCH_NOTES_KEY) || '[]');
        const nextD = Array.from(new Set([...(Array.isArray(d) ? d : []), item.id]));
        localStorage.setItem(DELETED_PATCH_NOTES_KEY, JSON.stringify(nextD));
      } catch {}
    }

    setPatchNotes(prev => {
      const next = prev
        .filter(p => item.id !== newDocId ? p.id !== item.id : true)
        .map(p => p.id === newDocId ? updatedItem : p);
      if (!next.some(p => p.id === newDocId)) {
        next.unshift(updatedItem);
      }
      next.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      if (item.id && item.id !== newDocId) {
        try {
          await deleteDoc(doc(db, 'patch_notes', item.id));
        } catch {}
      }
      const docRef = doc(db, 'patch_notes', newDocId);
      await setDoc(docRef, {
        ...updatedItem,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore update notice (saved locally, syncing via admin):', err);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          if (item.id && item.id !== newDocId) {
            await fetch(ADMIN_MUTATE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ action: 'deletePatchNote', id: item.id })
            }).catch(() => {});
          }
          await fetch(ADMIN_MUTATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'savePatchNote', note: updatedItem })
          });
        }
      } catch {}
    }

    window.dispatchEvent(new Event('uzuhama_patch_notes_changed'));
    return updatedItem;
  };

  const deletePatchNote = async (id: string) => {
    // 삭제 목록에 추가하여 다시 동기화 시 부활 방지
    try {
      const d = JSON.parse(localStorage.getItem(DELETED_PATCH_NOTES_KEY) || '[]');
      const nextD = Array.from(new Set([...(Array.isArray(d) ? d : []), id]));
      localStorage.setItem(DELETED_PATCH_NOTES_KEY, JSON.stringify(nextD));
    } catch {}

    setPatchNotes(prev => {
      const next = prev.filter(p => p.id !== id);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      await deleteDoc(doc(db, 'patch_notes', id));
    } catch (err) {
      console.warn('Firestore delete notice:', err);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch(ADMIN_MUTATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'deletePatchNote', id })
          });
        }
      } catch {}
    }

    window.dispatchEvent(new Event('uzuhama_patch_notes_changed'));
  };

  return {
    patchNotes,
    loading,
    addPatchNote,
    updatePatchNote,
    deletePatchNote,
  };
}
