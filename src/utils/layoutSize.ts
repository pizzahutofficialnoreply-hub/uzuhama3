/**
 * PC 화면으로 볼지: 너비가 min 이상이고 높이도 넉넉할 때(520px 이상)만
 * 휴대폰을 가로로 돌리면 너비는 넓어도 높이가 낮아 휴대폰 화면 그대로 (index.css 의 sm·md·lg 와 같은 기준)
 */
export const WIDE_MIN_H = 520;
export const wideAt = (min: number) => typeof window !== 'undefined' && window.innerWidth >= min && window.innerHeight >= WIDE_MIN_H;
