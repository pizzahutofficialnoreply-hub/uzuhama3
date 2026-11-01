# 자동 확인 예약 실행 (Cloudflare Worker)

방송 시작 알림·유력 시간 알림은 서버의 `/api/notifications/tick` 이 불려야 동작해요.
지금은 ① 사이트를 열어 둔 사람의 브라우저, ② GitHub 예약 실행(자주 몇 시간씩 밀림)으로 불리고 있어서,
아무도 사이트를 안 보고 있으면 알림이 늦을 수 있어요. 이 Worker 를 한 번 올려 두면 1분마다 정확히 불러요.

## 올리는 법 (한 번만, 무료)
1. https://dash.cloudflare.com 가입
2. 이 폴더에서:
   ```bash
   npx wrangler login
   npx wrangler deploy
   ```
3. 관리자 > 시스템 > 자동 시스템 에서 '최근 실행 출처'에 `worker` 가 1~2분마다 찍히면 끝

## 코드 없이 하는 방법
https://cron-job.org 에 가입해서
`https://uzuhama.vercel.app/api/notifications/tick?src=cronjob` 을 1분(또는 5분) 간격으로 등록해도 같아요.
