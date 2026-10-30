import { format, parseISO } from 'date-fns';
import type { QuickRange, QuarterRange } from '../types';

export const COLORS: string[] = [
  '#58a6ff','#3fb950','#f78166','#d2a8ff','#ffa657',
  '#39d353','#ff7b72','#79c0ff','#56d364','#e3b341',
];

export const PAGE_SIZE = 25;

/** Split comma-, semicolon-, space- or newline-separated input into a trimmed, non-empty list. */
export function parseList(input: string | string[]): string[] {
  if (Array.isArray(input)) return input.map(r => r.trim()).filter(Boolean);
  return (input || '').split(/[\s,;]+/).map(r => r.trim()).filter(Boolean);
}

export const QUICK_RANGES: QuickRange[] = [
  { label: '7d', days: 7 }, { label: '30d', days: 30 },
  { label: '90d', days: 90 }, { label: '6m', days: 180 }, { label: '1y', days: 365 },
];

function quarterStart(year: number, q: number): Date {
  return new Date(year, (q - 1) * 3, 1);
}

function quarterEnd(year: number, q: number): Date {
  return new Date(year, q * 3, 0);
}

export function currentQuarterStart(): Date {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return quarterStart(now.getFullYear(), q);
}

export function buildQuarterRanges(): QuarterRange[] {
  const now  = new Date();
  const year = now.getFullYear();
  const curQ = Math.floor(now.getMonth() / 3) + 1;
  const ranges: QuarterRange[] = [];
  for (let q = 1; q <= curQ; q++) {
    const start = quarterStart(year, q);
    const end   = q === curQ ? now : quarterEnd(year, q);
    ranges.push({ label: `Q${q} ${year}`, start, end, current: q === curQ });
  }
  if (curQ === 1) {
    ranges.unshift({ label: `Q4 ${year - 1}`, start: quarterStart(year - 1, 4), end: quarterEnd(year - 1, 4) });
  }
  return ranges;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

export function statusColor(status: string | null | undefined): string {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'var(--accent2)';
  if (s.includes('progress') || s.includes('review')) return 'var(--accent)';
  if (s.includes('blocked') || s.includes('impeded')) return 'var(--danger)';
  return 'var(--text-muted)';
}

export function priorityIcon(p: string | null | undefined): string {
  const m: Record<string, string> = {
    Critical: '🔴', Blocker: '🔴', Major: '🟠', Normal: '🟡', Minor: '🟢', Trivial: '⚪',
  };
  return m[p ?? ''] ?? '🔵';
}

export function looksLikeId(s: string | null | undefined): boolean {
  if (!s) return true;
  if (s.includes('@')) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  if (/^\d+:/.test(s)) return true;
  return false;
}

export function cleanDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw.includes(' · ') ? raw.split(' · ')[0].trim() : raw;
  return (name && !looksLikeId(name)) ? name : null;
}

export const PR_CHURN_TIP =
  'PR Churn = % of your opened PRs that received review comments from someone else. ' +
  'A high % means your PRs frequently required revision cycles before being accepted. ' +
  'Lower is generally better, but some discussion is healthy. ' +
  'Flagged red when > 60%.';

export const PR_CLOSED_UNMERGED_TIP =
  'PRs/MRs Closed Unmerged = PRs the author opened that were closed WITHOUT ever being merged — ' +
  'abandoned, rejected, superseded, or re-done elsewhere. ' +
  'A high count can indicate effort spent on work that never reached production. ' +
  'Context matters: some closed PRs are healthy (spike experiments, duplicate auto-generated PRs), ' +
  'while others signal rework or misaligned direction. Use as a conversation starter, not a verdict.';

export const EXCLUDED_RESOLUTIONS = new Set(["won't do", "obsolete", "duplicate", "cannot reproduce"]);

export const PRIORITY_ORDER: Record<string, number> = {
  Critical: 0, Blocker: 0, Major: 1, Normal: 2, Minor: 3, Trivial: 4,
};

/** Run fn over items with at most `concurrency` calls in flight; results keep input order. */
export async function pMap<T, R>(items: T[], fn: (item: T, idx: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

type Metrics = Record<string, unknown>;

/**
 * Merge one repo/project's per-person metrics into a running total: numbers add up,
 * lists concatenate, and averages are weighted by the merged-PR/MR count in `mergedKey`.
 */
export function mergeMetricsEntry(existing: Metrics | null | undefined, data: Metrics | null | undefined, mergedKey = 'mrsMerged'): Metrics {
  if (!existing) return { ...data };
  if (!data || typeof data !== 'object') return existing;

  const prevMerged = (existing[mergedKey] as number) ?? 0;
  const newMerged  = (data[mergedKey] as number) ?? 0;
  const weightedAvgKeys = new Set(['avgCycleTimeDays', 'avgLinesChanged', 'avgFilesChanged']);
  for (const [k, v] of Object.entries(data)) {
    if (weightedAvgKeys.has(k)) {
      if (existing[k] == null && v == null) continue;
      const sumA = ((existing[k] as number) ?? 0) * prevMerged;
      const sumB = ((v as number) ?? 0) * newMerged;
      const total = prevMerged + newMerged;
      existing[k] = total > 0 ? Math.round((sumA + sumB) / total * 10) / 10 : null;
    } else if (typeof v === 'number') {
      existing[k] = ((existing[k] as number) ?? 0) + v;
    } else if (Array.isArray(v)) {
      existing[k] = ((existing[k] as unknown[]) ?? []).concat(v);
    }
  }
  return existing;
}

/** Quote one CSV cell. Leading formula characters are prefixed so spreadsheets treat it as text. */
export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Download rows as a CSV file. Every cell is quoted, so commas, quotes and newlines in text are safe. */
export function downloadCSV(filename: string, rows: unknown[][]): void {
  const cell = csvCell;
  const blob = new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Sort key for job levels, most senior first (principal → associate, unknown last). */
export function levelSeniority(level: string | null | undefined): number {
  const l = (level || '').toLowerCase();
  if (l.startsWith('principal'))    return 0;
  if (l.startsWith('staff'))        return 1;
  if (l.startsWith('senior m'))     return 2;
  if (l.startsWith('senior'))       return 3;
  if (l === 'manager')              return 4;
  if (/^(sre|site reliability|software engineer|engineer)/.test(l)) return 5;
  if (l.startsWith('associate'))    return 6;
  return 7;
}

/** Shown when the frontend can't reach the Python backend that proxies GitHub/Jira/GitLab. */
export function backendDownError(): Error {
  return new Error(
    'Cannot reach the Python backend.\n' +
    'Run this in a terminal:\n' +
    '  cd associate-performance-metrics/backend\n' +
    '  uvicorn main:app --reload'
  );
}

/**
 * Fetch a backend API route under /api with forwarded auth headers.
 * Maps non-2xx responses to an Error carrying the backend's `detail` message.
 */
export async function apiFetch<T = unknown>(
  path: string,
  headers: Record<string, string>,
  params: Record<string, unknown> = {},
  { timeoutMs }: { timeoutMs?: number } = {},
): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers, cache: 'no-store', signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined });
  } catch {
    throw backendDownError();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text);
      detail = body.detail || body.message || detail;
    } catch {
      if (text) detail = text.slice(0, 400);
    }
    throw new Error(detail);
  }
  return res.json();
}
