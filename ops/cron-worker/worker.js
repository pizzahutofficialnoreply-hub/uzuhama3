// 우주하마 방송 예측: 1분마다 자동 확인(방송 시작·유력 시간 알림)을 부르는 Cloudflare Worker
// GitHub 예약 실행은 몇 시간씩 밀릴 때가 있어서, 정확한 알림이 필요하면 이걸 씀 (Cloudflare 무료 요금제로 충분)
export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(
      fetch('https://uzuhama.vercel.app/api/notifications/tick?src=worker', { headers: { 'User-Agent': 'uzuhama-cron-worker' } })
        .then((r) => r.text())
        .catch(() => null)
    );
  },
  // 브라우저로 열면 상태만 보여 줌
  async fetch() {
    return new Response('uzuhama cron worker: 1분마다 /api/notifications/tick 을 불러요.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
