import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normAssociateKey, loadCache, saveCache,
  stripPRListsForCache, stripMRListsForCache, clearAllCaches,
  GH_CACHE_KEY, JIRA_CACHE_KEY, GL_CACHE_KEY,
  CACHE_TTL_MS, CACHE_VERSION,
} from './cache';

const mockStorage = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(k => mockStorage[k] ?? null),
    setItem: vi.fn((k, v) => { mockStorage[k] = v; }),
    removeItem: vi.fn(k => { delete mockStorage[k]; }),
  });
});

describe('normAssociateKey', () => {
  it('sorts and lowercases comma-separated names', () => {
    expect(normAssociateKey('Charlie, alice, Bob')).toBe('alice,bob,charlie');
  });
  it('handles empty string', () => {
    expect(normAssociateKey('')).toBe('');
  });
  it('handles null', () => {
    expect(normAssociateKey(null)).toBe('');
  });
  it('filters blank entries', () => {
    expect(normAssociateKey('a,,b, ,c')).toBe('a,b,c');
  });
});

describe('loadCache', () => {
  it('returns null when no data', () => {
    expect(loadCache('test', 'key')).toBeNull();
  });

  it('returns cached data when key matches', () => {
    const data = { key: 'mykey', ts: Date.now(), version: CACHE_VERSION, value: 42 };
    mockStorage['test'] = JSON.stringify(data);
    const result = loadCache('test', 'mykey');
    expect(result).toEqual(data);
  });

  it('returns null on key mismatch', () => {
    const data = { key: 'mykey', ts: Date.now(), version: CACHE_VERSION };
    mockStorage['test'] = JSON.stringify(data);
    expect(loadCache('test', 'otherkey')).toBeNull();
  });

  it('returns null on version mismatch and removes entry', () => {
    const data = { key: 'mykey', ts: Date.now(), version: CACHE_VERSION + 99 };
    mockStorage['test'] = JSON.stringify(data);
    expect(loadCache('test', 'mykey')).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith('test');
  });

  it('returns null when expired', () => {
    const data = { key: 'mykey', ts: Date.now() - CACHE_TTL_MS - 1000, version: CACHE_VERSION };
    mockStorage['test'] = JSON.stringify(data);
    expect(loadCache('test', 'mykey')).toBeNull();
  });

  it('validates since/until', () => {
    const data = { key: 'mykey', ts: Date.now(), version: CACHE_VERSION, since: '2025-01-01', until: '2025-06-01' };
    mockStorage['test'] = JSON.stringify(data);
    expect(loadCache('test', 'mykey', { since: '2025-01-01', until: '2025-06-01' })).toEqual(data);
    expect(loadCache('test', 'mykey', { since: '2024-01-01' })).toBeNull();
    expect(loadCache('test', 'mykey', { until: '2024-06-01' })).toBeNull();
  });
});

describe('saveCache', () => {
  it('saves data with version', () => {
    saveCache('test', { key: 'k', ts: 1 });
    const saved = JSON.parse(mockStorage['test']);
    expect(saved.version).toBe(CACHE_VERSION);
    expect(saved.key).toBe('k');
  });

  it('falls back when too large', () => {
    const big = { key: 'k', ts: 1, data: 'x'.repeat(5 * 1024 * 1024) };
    const fallback = { key: 'k', ts: 1, data: 'small' };
    saveCache('test', big, fallback);
    const saved = JSON.parse(mockStorage['test']);
    expect(saved.data).toBe('small');
  });

  it('skips when even fallback is too large', () => {
    const big = { key: 'k', ts: 1, data: 'x'.repeat(5 * 1024 * 1024) };
    saveCache('test', big);
    expect(mockStorage['test']).toBeUndefined();
  });
});

describe('stripPRListsForCache', () => {
  it('strips authoredPRs and reviewedPRs', () => {
    const input = {
      user1: { prsOpened: 5, authoredPRs: [1,2,3], reviewedPRs: [4,5] },
      _rateLimited: false,
    };
    const result = stripPRListsForCache(input);
    expect(result.user1.prsOpened).toBe(5);
    expect(result.user1.authoredPRs).toBeUndefined();
    expect(result.user1.reviewedPRs).toBeUndefined();
    expect(result._rateLimited).toBe(false);
  });
});

describe('stripMRListsForCache', () => {
  it('strips authoredMRs and reviewedMRs', () => {
    const input = {
      user1: { mrsOpened: 3, authoredMRs: [1,2], reviewedMRs: [3] },
    };
    const result = stripMRListsForCache(input);
    expect(result.user1.mrsOpened).toBe(3);
    expect(result.user1.authoredMRs).toBeUndefined();
    expect(result.user1.reviewedMRs).toBeUndefined();
  });
});

describe('clearAllCaches', () => {
  it('removes all three cache keys', () => {
    mockStorage[GH_CACHE_KEY] = '{}';
    mockStorage[JIRA_CACHE_KEY] = '{}';
    mockStorage[GL_CACHE_KEY] = '{}';
    clearAllCaches();
    expect(localStorage.removeItem).toHaveBeenCalledWith(GH_CACHE_KEY);
    expect(localStorage.removeItem).toHaveBeenCalledWith(JIRA_CACHE_KEY);
    expect(localStorage.removeItem).toHaveBeenCalledWith(GL_CACHE_KEY);
  });
});
