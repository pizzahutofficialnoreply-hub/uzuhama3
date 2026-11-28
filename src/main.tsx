import { installThumbFallback } from './utils/thumbFallback';
import { startOverlayScrollLock } from './utils/overlayLock';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { initThemeListener } from './utils/theme';
import { setupGlobalHaptics, setupIosTapHaptics } from './utils/haptics';
import { installErrorReporting } from './utils/errorReport';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize global theme listener (system/light/dark)
initThemeListener();
setupGlobalHaptics();
setupIosTapHaptics(); // 아이폰: 버튼마다 투명 스위치를 깔아 손가락 누름으로 '톡' (iOS 26.5+)
installErrorReporting();

// Register Service Worker for PWA and Push Notifications
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch((err) => {
      console.debug('SW registration notice:', err);
    });
  });
}

startOverlayScrollLock();
// 안내만 하는 alert 창은 모두 토스트로 (화면을 막지 않음)
try { window.alert = (m?: any) => { void import('./utils/ui').then((u) => u.toast(String(m ?? ''))); }; } catch { /* */ }
installThumbFallback();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
