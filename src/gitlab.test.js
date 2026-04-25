import { describe, it, expect } from 'vitest';
import { mergeMetricsEntry } from './gitlab';

describe('mergeMetricsEntry', () => {
  it('returns a copy of data when existing is null/undefined', () => {
    const data = { mrsOpened: 3, mrsMerged: 2, avgLinesChanged: 100, authoredMRs: [{ iid: 1 }] };
    const result = mergeMetricsEntry(null, data);
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
  });

  it('returns existing unchanged when data is null', () => {
    const existing = { mrsOpened: 5 };
    expect(mergeMetricsEntry(existing, null)).toBe(existing);
  });

  it('sums numeric fields', () => {
    const a = { mrsOpened: 3, mrsMerged: 2, mrsReviewed: 1, reviewNotes: 5 };
    const b = { mrsOpened: 4, mrsMerged: 3, mrsReviewed: 2, reviewNotes: 8 };
    const result = mergeMetricsEntry(a, b);
    expect(result.mrsOpened).toBe(7);
    expect(result.mrsMerged).toBe(5);
    expect(result.mrsReviewed).toBe(3);
    expect(result.reviewNotes).toBe(13);
  });

  it('computes weighted average for avgCycleTimeDays', () => {
    const a = { mrsMerged: 2, avgCycleTimeDays: 3.0 };
    const b = { mrsMerged: 3, avgCycleTimeDays: 6.0 };
    const result = mergeMetricsEntry(a, b);
    // (3.0*2 + 6.0*3) / 5 = 4.8
    expect(result.avgCycleTimeDays).toBe(4.8);
  });

  it('computes weighted average for avgLinesChanged', () => {
    const a = { mrsMerged: 4, avgLinesChanged: 100 };
    const b = { mrsMerged: 6, avgLinesChanged: 200 };
    const result = mergeMetricsEntry(a, b);
    // (100*4 + 200*6) / 10 = 160
    expect(result.avgLinesChanged).toBe(160);
  });

  it('computes weighted average for avgFilesChanged', () => {
    const a = { mrsMerged: 4, avgFilesChanged: 5.0 };
    const b = { mrsMerged: 6, avgFilesChanged: 10.0 };
    const result = mergeMetricsEntry(a, b);
    // (5*4 + 10*6) / 10 = 8
    expect(result.avgFilesChanged).toBe(8);
  });

  it('skips weighted avg when both sides are null', () => {
    const a = { mrsMerged: 0, avgCycleTimeDays: null, avgLinesChanged: null, avgFilesChanged: null };
    const b = { mrsMerged: 0, avgCycleTimeDays: null, avgLinesChanged: null, avgFilesChanged: null };
    const result = mergeMetricsEntry(a, b);
    expect(result.avgCycleTimeDays).toBeNull();
    expect(result.avgLinesChanged).toBeNull();
    expect(result.avgFilesChanged).toBeNull();
  });

  it('treats null as 0 when one side has a value for weighted avg', () => {
    const a = { mrsMerged: 3, avgLinesChanged: null };
    const b = { mrsMerged: 2, avgLinesChanged: 50 };
    const result = mergeMetricsEntry(a, b);
    // (0*3 + 50*2) / 5 = 20
    expect(result.avgLinesChanged).toBe(20);
  });

  it('returns null for weighted avg when total mrsMerged is 0', () => {
    const a = { mrsMerged: 0, avgLinesChanged: 10 };
    const b = { mrsMerged: 0, avgLinesChanged: 20 };
    const result = mergeMetricsEntry(a, b);
    expect(result.avgLinesChanged).toBeNull();
  });

  it('concatenates array fields', () => {
    const a = { mrsMerged: 1, authoredMRs: [{ iid: 1 }], reviewedMRs: [{ iid: 10 }] };
    const b = { mrsMerged: 1, authoredMRs: [{ iid: 2 }], reviewedMRs: [] };
    const result = mergeMetricsEntry(a, b);
    expect(result.authoredMRs).toHaveLength(2);
    expect(result.authoredMRs.map(m => m.iid)).toEqual([1, 2]);
    expect(result.reviewedMRs).toHaveLength(1);
  });

  it('initializes missing array on existing with empty array', () => {
    const a = { mrsMerged: 1 };
    const b = { mrsMerged: 1, authoredMRs: [{ iid: 5 }] };
    const result = mergeMetricsEntry(a, b);
    expect(result.authoredMRs).toEqual([{ iid: 5 }]);
  });

  it('initializes missing numeric on existing with 0', () => {
    const a = { mrsMerged: 1 };
    const b = { mrsMerged: 2, mrsOpened: 3 };
    const result = mergeMetricsEntry(a, b);
    expect(result.mrsMerged).toBe(3);
    expect(result.mrsOpened).toBe(3);
  });

  it('rounds weighted average to one decimal place', () => {
    const a = { mrsMerged: 3, avgCycleTimeDays: 1.0 };
    const b = { mrsMerged: 7, avgCycleTimeDays: 2.0 };
    const result = mergeMetricsEntry(a, b);
    // (1.0*3 + 2.0*7) / 10 = 17/10 = 1.7
    expect(result.avgCycleTimeDays).toBe(1.7);
  });
});
