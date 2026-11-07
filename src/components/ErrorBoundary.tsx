import React from 'react';
import { reportError } from '../utils/errorReport';

/** 화면이 통째로 깨졌을 때: 하얀 화면 대신 안내 + 새로 고침, 오류는 조용히 기록 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: any) { reportError(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 800 }}>화면을 그리다가 문제가 생겼어요</p>
        <p style={{ fontSize: 13, opacity: 0.7 }}>운영자에게 자동으로 알려졌어요. 새로 고치면 대부분 해결돼요.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: 14, background: '#5873a8', color: '#fff', fontWeight: 700, border: 0, cursor: 'pointer' }}>새로 고침</button>
      </div>
    );
  }
}
