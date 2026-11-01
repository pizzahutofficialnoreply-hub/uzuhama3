import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  memoryLocalCache 
} from "firebase/firestore";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
// 분석·푸시 알림 모듈은 쓸 때만 불러옴 (첫 로딩 가볍게)
import type { Analytics } from "firebase/analytics";
import type { Messaging } from "firebase/messaging";

// Firebase 설정값 (실제 가이드 기준)
const firebaseConfig = {
  apiKey: "AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM",
  authDomain: "uzuhama.firebaseapp.com",
  databaseURL: "https://uzuhama-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "uzuhama",
  storageBucket: "uzuhama.firebasestorage.app",
  messagingSenderId: "8322844637",
  appId: "1:8322844637:web:85ed5c72a675f66adad834",
  measurementId: "G-3FTG5M6WX9"
};

// 앱 중복 초기화 방지
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Safari 및 PWA 환경에서 IndexedDB 꼬임 방지를 위해 Memory Cache 적용
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.debug('Firebase persistence notice:', err);
  });
}

// Analytics 안전하게 가져오기 (브라우저 환경 체크)
export const getAnalyticsInstance = async (): Promise<Analytics | null> => {
  if (typeof window !== 'undefined') {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) {
      return getAnalytics(app);
    }
  }
  return null;
};

// Messaging 안전하게 가져오기
export const messaging = async (): Promise<Messaging | null> => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const { getMessaging, isSupported } = await import("firebase/messaging");
    if (await isSupported()) {
      return getMessaging(app);
    }
  }
  return null;
};

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export default app;