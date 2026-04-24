// ── GitHub ────────────────────────────────────────────────────────────────────

export interface GitHubContributor {
  login: string;
  avatarUrl: string;
  totalContributions: number;
}

export interface GitHubPR {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  repo: string;
}

export interface GitHubPRMetrics {
  _rateLimited: boolean;
  prsOpened: number;
  prsMerged: number;
  prsReviewed: number;
  prsChurned: number;
  avgCycleTimeDays: number | null;
  churnPct: number;
  reviewComments: number;
  avgLinesChanged: number | null;
  avgFilesChanged: number | null;
  authoredPRs: GitHubPR[];
  reviewedPRs: GitHubPR[];
}

export type GitHubPRMetricsMap = {
  [login: string]: GitHubPRMetrics;
} & { _rateLimited?: boolean };

export interface SharedFetchState {
  rateLimited: boolean;
}

export interface FetchProgress {
  completed: number;
  total: number;
  currentRepo?: string;
  currentProject?: string;
}

// ── GitLab ────────────────────────────────────────────────────────────────────

export interface GitLabMR {
  iid: number;
  title: string;
  url: string;
  state: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  project: string;
}

export interface GitLabMRMetrics {
  mrsOpened: number;
  mrsMerged: number;
  mrsReviewed: number;
  avgCycleTimeDays: number | null;
  authoredMRs: GitLabMR[];
  reviewedMRs: GitLabMR[];
  _truncated?: boolean;
}

export interface GitLabMRMetricsMap {
  [author: string]: GitLabMRMetrics;
}

export interface GitLabTestResult {
  status: string;
  user: string;
}

// ── Jira ──────────────────────────────────────────────────────────────────────

export interface JiraSprint {
  id: string;
  name: string;
  state: string;
}

export interface JiraComment {
  author: string;
  authorId: string;
  authorEmail: string;
  date: string;
}

export interface JiraStatusTransition {
  from: string;
  to: string;
  date: string;
  author: string;
}

export interface NormalisedIssue {
  key: string;
  url: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assigneeJira: string;
  assigneeEmail: string;
  assigneeDisplay: string;
  created: string;
  updated: string;
  resolution: string | null;
  resolutionDate: string | null;
  sprints: JiraSprint[];
  currentSprint: JiraSprint | null;
  daysInProgress: number | null;
  spillovers: number;
  cycleTime: number | null;
  storyPoints: number | null;
  commentCount: number;
  comments: JiraComment[];
  statusTransitions: JiraStatusTransition[];
  remoteLinks: unknown[];
}

export interface JiraUser {
  username: string;
  displayName: string;
  email: string;
}

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
