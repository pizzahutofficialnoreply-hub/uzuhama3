import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { encodeValue, decodeValue } from '../../api/_backup';

describe('DB 백업 값 변환', () => {
  it('시간·바이트·중첩 값을 JSON 으로 갔다가 그대로 돌아옴', () => {
    const src = { at: new Timestamp(1700000000, 5), img: Buffer.from([1, 2, 3, 250]), nested: { list: [1, 'a', null, { t: new Timestamp(1, 0) }] }, s: '글자', n: 3.5, b: true };
    const json = JSON.parse(JSON.stringify(encodeValue(src)));
    const back = decodeValue({ doc: (p: string) => ({ path: p }) }, json);
    expect(back.at).toBeInstanceOf(Timestamp);
    expect(back.at.seconds).toBe(1700000000);
    expect(back.at.nanoseconds).toBe(5);
    expect(Buffer.isBuffer(back.img) && [...back.img]).toEqual([1, 2, 3, 250]);
    expect(back.nested.list[3].t.seconds).toBe(1);
    expect(back.s).toBe('글자');
    expect(back.n).toBe(3.5);
    expect(back.b).toBe(true);
  });
});
