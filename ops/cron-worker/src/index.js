// 우주하마 방송 예측: Cloudflare 'chzzk-checker' 워커 (새 버전)
//
// 예전 버전은 Firestore 에 직접(로그인 없이) 써서, 데이터베이스 보안 규칙을 잠근 뒤로는 저장이 모두 거절되고 있었음.
// 이제 실제 일은 사이트 서버(Vercel, 관리자 권한)가 하고, 워커는 정해진 시간에 서버를 불러 주기만 함.
//  - 매분: 방송 상태 확인 → 실시간 카드 갱신, 방송 시작 알림, 유력 시간 알림, 방송이 끝나면 방송 기록 자동 생성
//  - 하루 두 번(11:35, 23:35): 유튜브 영상·쇼츠 목록과 쇼츠-영상 연결 새로 받기
// 비밀값(YOUTUBE_API_KEY 등)은 이제 워커에 필요 없음 (서버에 있음)

const SITE = 'https://uzuhama.vercel.app';
const HEADERS = { 'User-Agent': 'uzuhama-chzzk-checker' };

async function call(path) {
  try {
    const r = await fetch(`${SITE}${path}`, { headers: HEADERS });
    const text = await r.text();
    return { path, status: r.status, body: text.slice(0, 300) };
  } catch (e) {
    return { path, error: String(e && e.message ? e.message : e) };
  }
}

async function minutely() {
  return [await call('/api/notifications/tick?src=worker')];
}

async function twiceDaily() {
  // 12시간 지난 목록은 서버가 알아서 새로 받음 (관리자 권한 필요 없음)
  return Promise.all([
    call('/api/videos/shorts?kind=uploads'),
    call('/api/videos/shorts'),
    call('/api/videos/shorts?kind=related'),
  ]);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(event.cron === '35 2,14 * * *' ? twiceDaily() : minutely());
  },
  // 브라우저로 열면 지금 한 번 실행하고 결과를 보여 줌 (/sync-youtube 는 하루 두 번 작업)
  async fetch(request) {
    const url = new URL(request.url);
    const result = url.pathname === '/sync-youtube' ? await twiceDaily() : await minutely();
    return new Response(JSON.stringify(result, null, 2), { headers: { 'content-type': 'application/json;charset=UTF-8' } });
  },
};
