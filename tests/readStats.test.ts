import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { installReadStats } from '../api/_readStats';

describe('읽기 세기 설치', () => {
  it('실제 Firestore 객체에 설치해도 오류가 안 남 (count 포함)', () => {
    const app = initializeApp({ projectId: 'demo-test' }, 'readstats-test');
    const db = getFirestore(app);
    expect(() => installReadStats(db)).not.toThrow();
    const agg: any = Object.getPrototypeOf((db.collection('x') as any).count());
    expect(String(agg.get)).toContain('aggGet');
  });
});
