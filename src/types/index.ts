// ── Cache ─────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  key: string;
  ts: number;
  since?: string;
  until?: string;
  version: number;
  [dataKey: string]: unknown;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

export interface QuickRange {
  label: string;
  days: number;
}

export interface QuarterRange {
  label: string;
  start: Date;
  end: Date;
  current?: boolean;
}
