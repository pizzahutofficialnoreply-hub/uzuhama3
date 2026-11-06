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

// 서버(/api/patch-notes) 응답을 그대로 저장해 두는 캐시. 기본(하드코딩) 패치노트는 없음 — 노션·관리자 탭에서 쓴 글만 보임
const LOCAL_STORAGE_KEY = 'uzuhama_patch_notes_v3';
const OLD_KEYS = ['uzuhama_patch_notes_v2', 'uzuhama_patch_notes'];
const DELETED_PATCH_NOTES_KEY = 'uzuhama_patch_notes_deleted_v2';

// 관리자 저장 API: uzuhama.web.app(Firebase Hosting)에는 /api 가 없으므로 Vercel 주소로 호출
const ADMIN_MUTATE_URL = (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app'))
  ? '/api/admin/mutate'
  : 'https://uzuhama.vercel.app/api/admin/mutate';

export function usePatchNotes() {
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      OLD_KEYS.forEach((k) => localStorage.removeItem(k));
      const parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  });
  // 저장해 둔 목록이 없을 때만 '불러오는 중' 표시 (있으면 바로 보여 주고 뒤에서 새로 고침)
  const [loading, setLoading] = useState(() => patchNotes.length === 0);

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

      // 서버 목록이 곧 정답 (Firestore patch_notes + 노션). 이 기기에서 지운 것만 숨김
      const noteMap = new Map<string, PatchNote>();
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
