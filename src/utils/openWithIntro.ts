/**
 * 런칭 준비·점검 화면의 카운트다운이 00:00:00 이 되면: 시작 애니메이션(인트로)부터 다시 보여 주며 사이트를 엶
 * (새로 불러와서 점검이 끝났는지도 다시 확인) · 같은 이유로 15초 안에 또 부르면 무시 (끝없이 새로 고침 방지)
 */
export function openWithIntro() {
  try {
    const last = Number(sessionStorage.getItem('uzuhama_open_reload_at') || 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem('uzuhama_open_reload_at', String(Date.now()));
    sessionStorage.removeItem('uzuhama_intro'); // 인트로를 다시 보게
  } catch { /* */ }
  window.setTimeout(() => window.location.reload(), 600); // 00:00:00 을 잠깐 보여 준 뒤
}
