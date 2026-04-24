import { describe, it, expect } from 'vitest';
import {
  fmtDate, statusColor, priorityIcon, looksLikeId, cleanDisplayName,
  quarterStart, quarterEnd, currentQuarterStart, buildQuarterRanges,
} from './helpers';

describe('fmtDate', () => {
  it('formats ISO date', () => {
    expect(fmtDate('2025-03-15')).toBe('Mar 15, 2025');
  });
  it('returns dash for null', () => {
    expect(fmtDate(null)).toBe('—');
  });
  it('returns dash for undefined', () => {
    expect(fmtDate(undefined)).toBe('—');
  });
});

describe('statusColor', () => {
  it('returns accent2 for done statuses', () => {
    expect(statusColor('Done')).toBe('var(--accent2)');
    expect(statusColor('Closed')).toBe('var(--accent2)');
    expect(statusColor('Resolved')).toBe('var(--accent2)');
  });
  it('returns accent for in-progress', () => {
    expect(statusColor('In Progress')).toBe('var(--accent)');
    expect(statusColor('In Review')).toBe('var(--accent)');
  });
  it('returns danger for blocked', () => {
    expect(statusColor('Blocked')).toBe('var(--danger)');
  });
  it('returns muted for unknown', () => {
    expect(statusColor('New')).toBe('var(--text-muted)');
  });
});

describe('priorityIcon', () => {
  it('maps known priorities', () => {
    expect(priorityIcon('Critical')).toBe('🔴');
    expect(priorityIcon('Major')).toBe('🟠');
    expect(priorityIcon('Minor')).toBe('🟢');
  });
  it('returns default for unknown', () => {
    expect(priorityIcon('Unknown')).toBe('🔵');
  });
});

describe('looksLikeId', () => {
  it('identifies machine IDs', () => {
    expect(looksLikeId('70121:6a412bae-ecf5-4dcb-b196-ff1d4375d5f6')).toBe(true);
    expect(looksLikeId('user@example.com')).toBe(true);
    expect(looksLikeId('12345')).toBe(true);
    expect(looksLikeId(null)).toBe(true);
    expect(looksLikeId('')).toBe(true);
  });
  it('identifies human names', () => {
    expect(looksLikeId('John Doe')).toBe(false);
    expect(looksLikeId('jdoe')).toBe(false);
  });
});

describe('cleanDisplayName', () => {
  it('extracts name from legacy format', () => {
    expect(cleanDisplayName('John Doe · john@example.com')).toBe('John Doe');
  });
  it('returns null for machine IDs', () => {
    expect(cleanDisplayName('70121:abc')).toBeNull();
  });
  it('returns null for null input', () => {
    expect(cleanDisplayName(null)).toBeNull();
  });
  it('returns plain name', () => {
    expect(cleanDisplayName('Alice Smith')).toBe('Alice Smith');
  });
});

describe('quarterStart / quarterEnd', () => {
  it('Q1 starts Jan 1', () => {
    const d = quarterStart(2025, 1);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
  it('Q2 starts Apr 1', () => {
    const d = quarterStart(2025, 2);
    expect(d.getMonth()).toBe(3);
  });
  it('Q1 ends Mar 31', () => {
    const d = quarterEnd(2025, 1);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(31);
  });
});

describe('currentQuarterStart', () => {
  it('returns a Date', () => {
    expect(currentQuarterStart()).toBeInstanceOf(Date);
  });
});

describe('buildQuarterRanges', () => {
  it('returns non-empty array', () => {
    const ranges = buildQuarterRanges();
    expect(ranges.length).toBeGreaterThan(0);
  });
  it('has a current quarter', () => {
    const ranges = buildQuarterRanges();
    expect(ranges.some(r => r.current)).toBe(true);
  });
});
