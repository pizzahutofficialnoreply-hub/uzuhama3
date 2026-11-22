/**
 * 정해 둔 시각까지 방문자 화면을 '잠시 점검 중'으로 (DB 하루 한도·서버 사용량 때문에 잠깐 쉬어 갈 때)
 * 시각이 지나면 저절로 열림 · 관리자 페이지는 그대로
 * 2026-11-22: DB 한도 초기화(한국 17:00)까지 서버 호출도 줄이려고
 */
export const PLANNED_PAUSE_UNTIL = Date.parse('2026-11-22T08:00:00Z');
export const plannedPauseOn = (now = Date.now()) => now < PLANNED_PAUSE_UNTIL;
