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
import { getAnalytics, isSupported as isAnalyticsSupported, Analytics } from "firebase/analytics";
import { getMessaging, isSupported as isMessagingSupported, Messaging } from "firebase/messaging";

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
    const supported = await isAnalyticsSupported();
    if (supported) {
      return getAnalytics(app);
    }
  }
  return null;
};

// Messaging 안전하게 가져오기
export const messaging = async (): Promise<Messaging | null> => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const supported = await isMessagingSupported();
    if (supported) {
      return getMessaging(app);
    }
  }
  return null;
};

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

export default app;