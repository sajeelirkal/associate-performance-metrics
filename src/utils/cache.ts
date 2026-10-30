import type { CacheEntry } from '../types';

export const GH_CACHE_KEY = 'gh_cache';
export const JIRA_CACHE_KEY = 'jira_cache';
export const GL_CACHE_KEY = 'gl_cache';
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const CACHE_MAX_BYTES = 4 * 1024 * 1024;
export const CACHE_VERSION = 2;

const cacheLog: (...args: unknown[]) => void =
  import.meta.env.DEV ? console.log.bind(console) : () => {};
const cacheWarn: (...args: unknown[]) => void =
  import.meta.env.DEV ? console.warn.bind(console) : () => {};

export function normAssociateKey(raw: string): string {
  return (raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).sort().join(',');
}

export function loadCache(
  storageKey: string,
  expectedKey: string,
  { since, until }: { since?: string; until?: string } = {},
): CacheEntry | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) { cacheLog(`[cache] No ${storageKey} cache found`); return null; }
    const cache: CacheEntry = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) {
      cacheLog(`[cache] ${storageKey} version mismatch`, { cached: cache.version, expected: CACHE_VERSION });
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      return null;
    }
    if (cache.key !== expectedKey) {
      cacheLog(`[cache] ${storageKey} key mismatch`, { cached: cache.key, expected: expectedKey });
      return null;
    }
    if (since && cache.since !== since) {
      cacheLog(`[cache] ${storageKey} since mismatch`, { cached: cache.since, expected: since });
      return null;
    }
    if (until && cache.until !== until) {
      cacheLog(`[cache] ${storageKey} until mismatch`, { cached: cache.until, expected: until });
      return null;
    }
    const age = Date.now() - (cache.ts || 0);
    if (age > CACHE_TTL_MS) {
      cacheLog(`[cache] ${storageKey} expired (${(age / 3600000).toFixed(1)}h old)`);
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      return null;
    }
    cacheLog(`[cache] Restored ${storageKey} from ${new Date(cache.ts).toLocaleString()}`);
    return cache;
  } catch (e) { cacheWarn(`[cache] Failed to load ${storageKey}:`, (e as Error).message); return null; }
}

export function saveCache(
  storageKey: string,
  data: Record<string, unknown>,
  fallbackData: Record<string, unknown> | null = null,
): void {
  try {
    const payload = { ...data, version: CACHE_VERSION };
    const json = JSON.stringify(payload);
    if (json.length > CACHE_MAX_BYTES) {
      if (fallbackData) {
        cacheWarn(`[cache] ${storageKey} full payload too large (${(json.length / 1024).toFixed(0)} KB), saving without PR lists`);
        return saveCache(storageKey, fallbackData);
      }
      cacheWarn(`[cache] ${storageKey} too large (${(json.length / 1024).toFixed(0)} KB > ${CACHE_MAX_BYTES / 1024} KB limit), skipping save`);
      return;
    }
    localStorage.setItem(storageKey, json);
    cacheLog(`[cache] Saved ${storageKey} (${(json.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    if (fallbackData) {
      cacheWarn(`[cache] ${storageKey} save failed, retrying without PR lists`);
      return saveCache(storageKey, fallbackData);
    }
    cacheWarn(`[cache] Failed to save ${storageKey}:`, (e as Error).message);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }
}

/** Drop the bulky per-person PR/MR lists so the cached copy fits in localStorage. */
export function stripListsForCache(metrics: Record<string, unknown>, listKeys: string[]): Record<string, unknown> {
  const slim: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metrics)) {
    slim[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([key]) => !listKeys.includes(key)))
      : v;
  }
  return slim;
}

export function clearAllCaches(): void {
  for (const k of [GH_CACHE_KEY, JIRA_CACHE_KEY, GL_CACHE_KEY]) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}
