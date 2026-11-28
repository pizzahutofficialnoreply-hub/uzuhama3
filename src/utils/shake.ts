/**
 * 휴대폰을 흔들면 문제 신고 (실험실 · 기본 꺼짐)
 * - 아이폰은 움직임 센서를 쓰려면 화면을 누른 그 순간에 허락을 받아야 해서, 실험실에서 켤 때 물어봄
 * - 1초 안에 세게 3번 흔들면 한 번 (5초 동안은 다시 안 뜸)
 */
import { getPrefs } from './userPrefs';

export async function askMotionPermission(): Promise<boolean> {
  const DM: any = (window as any).DeviceMotionEvent;
  if (!DM) return false;
  if (typeof DM.requestPermission !== 'function') return true; // 안드로이드·PC: 허락 필요 없음
  try { return (await DM.requestPermission()) === 'granted'; } catch { return false; }
}

export function startShake(onShake: () => void): () => void {
  let last = { x: 0, y: 0, z: 0 }; let hits: number[] = []; let quietUntil = 0;
  const on = (e: DeviceMotionEvent) => {
    if (!getPrefs().labShake || document.hidden) return;
    const a = e.accelerationIncludingGravity; if (!a) return;
    const x = a.x || 0, y = a.y || 0, z = a.z || 0;
    const d = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z);
    last = { x, y, z };
    const now = Date.now();
    if (d < 28 || now < quietUntil) return;
    hits = [...hits.filter((t) => now - t < 1000), now];
    if (hits.length >= 3) { hits = []; quietUntil = now + 5000; onShake(); }
  };
  window.addEventListener('devicemotion', on);
  return () => window.removeEventListener('devicemotion', on);
}
