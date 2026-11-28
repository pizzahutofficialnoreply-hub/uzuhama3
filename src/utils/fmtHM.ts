/** 3.4567시간 → '3시간 27분' (소수점 시간 대신 · 0이면 '0분') */
export function fmtHM(hours: number): string {
  const m = Math.round((Number(hours) || 0) * 60);
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`;
}
