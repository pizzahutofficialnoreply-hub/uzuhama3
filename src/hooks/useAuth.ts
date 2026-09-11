import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { auth, loginWithGoogle, logout as firebaseLogout } from '../lib/firebase';

// 전역 싱글톤 인증 상태 관리 (불필요한 리스너 중복 방지 및 토큰 갱신 시 세션 안정화)
let globalUser: User | null = auth.currentUser;
let globalLoading = true;
let isInitialized = false;
const listeners = new Set<(user: User | null, loading: boolean) => void>();

function notifyAll() {
  listeners.forEach((listener) => {
    try {
      listener(globalUser, globalLoading);
    } catch (e) {
      console.debug('Auth listener notification error:', e);
    }
  });
}

function initAuthListener() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. 기본 인증 상태 리스너
  onAuthStateChanged(
    auth,
    (u) => {
      // 만약 토큰 갱신 중 일시적으로 null이 들어왔지만 auth.currentUser가 여전히 메모리에 살아있다면 보존
      if (!u && auth.currentUser) {
        globalUser = auth.currentUser;
      } else {
        globalUser = u;
      }
      globalLoading = false;
      notifyAll();
    },
    (error) => {
      console.warn('onAuthStateChanged error handled safely:', error);
      // 네트워크 일시 단절 등의 오류 시 강제 로그아웃시키지 않고 auth.currentUser 유지
      if (auth.currentUser) {
        globalUser = auth.currentUser;
      }
      globalLoading = false;
      notifyAll();
    }
  );

  // 2. 1시간 주기 토큰 자동 갱신 리스너 (세션 끊김 방지)
  onIdTokenChanged(auth, (u) => {
    if (u) {
      globalUser = u;
      notifyAll();
    }
  });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(globalUser || auth.currentUser);
  const [loading, setLoading] = useState(globalLoading);

  useEffect(() => {
    initAuthListener();

    // 초기 동기화
    setUser(globalUser || auth.currentUser);
    setLoading(globalLoading);

    const handler = (nextUser: User | null, nextLoading: boolean) => {
      setUser(nextUser);
      setLoading(nextLoading);
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const logout = async () => {
    try {
      await firebaseLogout();
      globalUser = null;
      notifyAll();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return { user, loading, loginWithGoogle, logout };
}
