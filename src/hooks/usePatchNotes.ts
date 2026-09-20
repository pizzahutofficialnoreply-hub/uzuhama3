import { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PatchNote, PatchCategory } from '../types';

const INITIAL_PATCH_NOTES: PatchNote[] = [
  {
    id: 'patch-1.0.0',
    version: '1.0.0',
    title: '우주하마 방송 통계 1.0.0 정식 출시',
    category: 'update',
    date: '2026-03-20',
    author: '우주하마 통계팀',
    highlights: [
      'iOS 느낌의 정밀한 카드 UI (R24) 전면 적용',
      '패치노트 & 핫픽스 & 업데이트 공지 아카이브 신설',
      '캘린더 구독 시 페이지 바로가기 링크 자동 제공',
      '막대그래프 점선/포인트 커서 가이드 도입'
    ],
    content: `## 🌟 우주하마 방송 통계 1.0.0 정식 릴리즈

우주하마 팬 여러분을 위한 방송 통계 및 일정 분석 시스템이 정식 버전으로 업그레이드되었습니다.

### 📌 주요 업데이트 내용
- **버전별 패치노트 아카이브 (/patch-0.0.0)**
  - 패치노트, 핫픽스 노트, 업데이트 공지, 개발자 노트를 한눈에 확인할 수 있는 전용 라우트 및 아카이브가 개설되었습니다.
- **캘린더 구독 개선**
  - 구독한 캘린더 이벤트 메모에 사이트 접속 링크가 자동 첨부되어 방송 통계를 손쉽게 확인할 수 있습니다.
- **막대그래프 시각화 강화**
  - 마우스 호버 시 꺾은선 그래프와 동일하게 점선 가이드와 점(Point) 핀포인트가 표시되어 데이터 판독이 쉬워졌습니다.
- **투표 프라이버시 보호 투명화**
  - 1인 1투표 중복 방지를 위한 IP 식별 용도 안내 및 위치 추적 불가 원칙을 명시하였습니다.`
  },
  {
    id: 'patch-0.9.5',
    version: '0.9.5',
    title: '그래프 툴팁 시각화 및 투표 보안 강화 핫픽스',
    category: 'hotfix',
    date: '2026-03-19',
    author: '운영팀',
    highlights: [
      '막대그래프 호버 점선 및 닷(Dot) 가이드 추가',
      '한자 및 특수문자 시스템 폰트 폴백 렌더링 최적화',
      '투표 IP 암호화 식별 및 개인정보 처리방침 안내'
    ],
    content: `### ⚡ 핫픽스 조치 사항
- **특수문자 및 한자 깨짐 개선**: 일부 닉네임 및 제목에 포함된 한자/특수문자가 정상 표시되도록 폰트 폴백 레이어를 보강했습니다.
- **막대 차트 커서 점선 통일**: 막대그래프에서도 현재 보고 있는 위치를 명확히 인지할 수 있도록 직관적인 점선과 포인터 가이드를 적용했습니다.
- **익명 투표 IP 정책 고지**: 1인 1투표 검증용 비가역 해시 저장 정책을 사용자가 명확히 알 수 있도록 배너와 안내문을 배치했습니다.`
  },
  {
    id: 'patch-0.9.0',
    version: '0.9.0',
    title: '통계 분석 알고리즘 개선 및 모바일 제스처 고도화',
    category: 'patch',
    date: '2026-03-10',
    author: '개발팀',
    highlights: [
      '요일별/시간대별 뱅온 확률 가중치 엔진 최적화',
      '모바일 플로팅 독 네비게이션 개선',
      '클립보드 공유 및 이미지 카드 캡처 화질 향상'
    ],
    content: `### 🛠️ 패치 세부 내역
1. **확률 가중치 계산 고도화**
   - 최근 6개월 방송 기록에 동적 가중치를 부여하여 현재 시점의 방송 시작 확률을 더 정확하게 산출합니다.
2. **모바일 반응형 최적화**
   - iOS 노치 및 Safe Area에 맞춘 헤더 여백 및 하단 플로팅 독 오프셋을 안정화했습니다.`
  },
  {
    id: 'patch-0.8.0',
    version: '0.8.0',
    title: '개발자 노트: 실시간 푸시 아키텍처와 PWA 캐싱 원리',
    category: 'dev',
    date: '2026-02-28',
    author: '총괄 개발자',
    highlights: [
      'Web Push Notification VAPID 키 핸드셰이크 구조',
      'Service Worker 오프라인 캐시 및 무중단 새로고침 전략'
    ],
    content: `### 👨‍💻 개발자 노트: 안정적인 알림 전달을 위한 여정

우주하마 방송 통계 시스템은 방송 시작 및 휴방 공지를 1초라도 더 빠르게 전달하기 위해 VAPID 기반의 Web Push 아키텍처를 도입했습니다.

- **푸시 토큰 세션 갱신**: 사용자가 구독 설정을 변경할 때 실시간 Firestore 트랜잭션으로 상태를 동기화합니다.
- **Service Worker 수명주기**: 백그라운드 수신 시 즉각적인 OS 알림을 띄우고, 알림 탭 시 해당 날짜의 방송 기록으로 직접 진입할 수 있도록 설계했습니다.`
  }
];

const LOCAL_STORAGE_KEY = 'uzuhama_patch_notes_v1';

export function usePatchNotes() {
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>(() => {
    if (typeof window === 'undefined') return INITIAL_PATCH_NOTES;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return INITIAL_PATCH_NOTES;
  });
  const [loading, setLoading] = useState(true);

  // Firestore 실시간 동기화
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const patchesRef = collection(db, 'patch_notes');
      const q = query(patchesRef, orderBy('date', 'desc'));
      
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const list: PatchNote[] = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              version: d.version || '0.0.0',
              title: d.title || '패치노트',
              category: (d.category as PatchCategory) || 'patch',
              date: d.date || new Date().toISOString().split('T')[0],
              content: d.content || '',
              highlights: d.highlights || [],
              author: d.author || '운영진',
              createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
              updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt,
            };
          });
          setPatchNotes(list);
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
          } catch {}
        } else {
          // 컬렉션이 비어있으면 로컬 초기 데이터 유지
        }
        setLoading(false);
      }, (err) => {
        console.debug('Patch notes snapshot notice:', err);
        setLoading(false);
      });
    } catch (e) {
      console.debug('Patch notes firestore init notice:', e);
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  const addPatchNote = async (item: Omit<PatchNote, 'id'>) => {
    const cleanVersion = item.version.replace(/^v/, '').trim();
    const newNote: Omit<PatchNote, 'id'> = {
      ...item,
      version: cleanVersion,
      highlights: item.highlights || [],
    };

    try {
      const docRef = await addDoc(collection(db, 'patch_notes'), {
        ...newNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const created: PatchNote = { ...newNote, id: docRef.id };
      setPatchNotes(prev => [created, ...prev]);
      return created;
    } catch (err) {
      // 로컬 폴백 저장
      const fallbackId = `local-${Date.now()}`;
      const created: PatchNote = { ...newNote, id: fallbackId };
      const updated = [created, ...patchNotes];
      setPatchNotes(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return created;
    }
  };

  const updatePatchNote = async (item: PatchNote) => {
    const cleanVersion = item.version.replace(/^v/, '').trim();
    const updatedItem = { ...item, version: cleanVersion };

    try {
      if (!item.id.startsWith('local-') && !item.id.startsWith('patch-')) {
        const docRef = doc(db, 'patch_notes', item.id);
        await updateDoc(docRef, {
          ...updatedItem,
          updatedAt: serverTimestamp(),
        });
      }
      setPatchNotes(prev => prev.map(p => p.id === item.id ? updatedItem : p));
      try {
        const next = patchNotes.map(p => p.id === item.id ? updatedItem : p);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    } catch (err) {
      setPatchNotes(prev => prev.map(p => p.id === item.id ? updatedItem : p));
      try {
        const next = patchNotes.map(p => p.id === item.id ? updatedItem : p);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
  };

  const deletePatchNote = async (id: string) => {
    try {
      if (!id.startsWith('local-') && !id.startsWith('patch-')) {
        await deleteDoc(doc(db, 'patch_notes', id));
      }
      setPatchNotes(prev => prev.filter(p => p.id !== id));
      try {
        const next = patchNotes.filter(p => p.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    } catch (err) {
      setPatchNotes(prev => prev.filter(p => p.id !== id));
      try {
        const next = patchNotes.filter(p => p.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
  };

  return {
    patchNotes,
    loading,
    addPatchNote,
    updatePatchNote,
    deletePatchNote,
  };
}
