import { format, parseISO } from 'date-fns';
import type { QuickRange, QuarterRange } from '../types';

export const COLORS: string[] = [
  '#58a6ff','#3fb950','#f78166','#d2a8ff','#ffa657',
  '#39d353','#ff7b72','#79c0ff','#56d364','#e3b341',
];

export const PAGE_SIZE = 25;

export const QUICK_RANGES: QuickRange[] = [
  { label: '7d', days: 7 }, { label: '30d', days: 30 },
  { label: '90d', days: 90 }, { label: '6m', days: 180 }, { label: '1y', days: 365 },
];

export function quarterStart(year: number, q: number): Date {
  return new Date(year, (q - 1) * 3, 1);
}

export function quarterEnd(year: number, q: number): Date {
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

export const EXCLUDED_RESOLUTIONS = new Set(["won't do", "obsolete", "duplicate", "cannot reproduce"]);

export const PRIORITY_ORDER: Record<string, number> = {
  Critical: 0, Blocker: 0, Major: 1, Normal: 2, Minor: 3, Trivial: 4,
};
