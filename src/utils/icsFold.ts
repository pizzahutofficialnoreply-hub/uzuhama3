/** RFC 5545: 한 줄은 75바이트 이하, 넘으면 줄바꿈 + 공백으로 이어 씀 (구글·아이폰 캘린더 호환) */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 앞 공백 1바이트
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; }
    cur += ch; curBytes += b;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

/** 여러 줄(안에 \r\n 이 섞여 있어도)을 접어서 합침 */
export const foldIcs = (lines: string[]) => lines.join('\r\n').split('\r\n').map(foldLine).join('\r\n');
