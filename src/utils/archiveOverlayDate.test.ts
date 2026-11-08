import { it, expect } from 'vitest'; import { overlayMonthDocs } from './archiveOverlay';
it('o', () => { const h = { a: { id: 'a', date: '2024-06-20', time: '' } }; const m = overlayMonthDocs(h, [{ items: { a__dc: { id: 'a', date: '2024-06-20', _date: '2024-06-21', _patch: true, time: '00:00' } } }]); expect(m.a.date).toBe('2024-06-21'); });
