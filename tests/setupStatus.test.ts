import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectDevice, iosVersion } from '../src/utils/setupStatus';

const setUA = (ua: string, platform = '', touch = 0) => {
  vi.stubGlobal('navigator', { userAgent: ua, platform, maxTouchPoints: touch });
};
afterEach(() => vi.unstubAllGlobals());

describe('기기·브라우저 자동 확인', () => {
  it('iOS 26 사파리 (OS 버전은 18_6 으로 고정, 사파리 버전 26)', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1');
    expect(iosVersion()).toBe(26);
    expect(detectDevice()).toBe('ios-safari');
  });
  it('iOS 18 사파리', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1');
    expect(detectDevice()).toBe('ios-safari-18');
  });
  it('아이폰 크롬 · 카톡', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1');
    expect(detectDevice()).toBe('ios-chrome');
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0');
    expect(detectDevice()).toBe('ios-inapp');
  });
  it('안드로이드 크롬 · 삼성 인터넷', () => {
    setUA('Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36');
    expect(detectDevice()).toBe('android-chrome');
    setUA('Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36');
    expect(detectDevice()).toBe('android-samsung');
  });
  it('PC 크롬 · 맥 사파리', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'Win32');
    expect(detectDevice()).toBe('desktop-chrome');
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 'MacIntel', 0);
    expect(detectDevice()).toBe('desktop-safari');
  });
});
