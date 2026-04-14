/**
 * Jira data layer — all calls go to the local Python backend at /api.
 *
 * Supports both Atlassian Cloud (email + API token → Basic Auth) and
 * Jira Data Center (PAT → Bearer).  Pass a non-empty `email` to enable
 * Cloud mode; omit it (or pass '') for Data Center.
 */

async function backendFetch(path, jiraUrl, token, email, params = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  const headers = {
    'X-Jira-Url':   jiraUrl,
    'X-Jira-Token': token,
  };
  if (email) headers['X-Jira-Email'] = email;

  let res;
  try {
    res = await fetch(url.toString(), { headers });
  } catch {
    throw new Error(
      'Cannot reach the Python backend at localhost:8000.\n' +
      'Run this in a terminal:\n' +
      '  cd aro-hcp-dashboard/backend\n' +
      '  uvicorn main:app --reload --port 8000'
    );
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

export async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Search for Jira users matching a query (email, display name, username).
 * Returns [{username, displayName, email}]
 * On Atlassian Cloud, username is the accountId.
 */
export async function resolveJiraUser(jiraUrl, token, email, query) {
  return backendFetch('/resolve-user', jiraUrl, token, email, { query });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchJiraIssues(jiraUrl, token, email, jiraUsernames, since, until) {
  if (!jiraUsernames.length) return [];
  const data = await backendFetch('/issues', jiraUrl, token, email, {
    usernames: jiraUsernames.join(','),
    since,
    until,
  });
  return data.issues ?? [];
}

export async function fetchRemoteLinksForIssues(jiraUrl, token, email, issueKeys) {
  if (!issueKeys.length) return {};
  const results = {};
  for (let i = 0; i < issueKeys.length; i += 50) {
    const chunk = issueKeys.slice(i, i + 50);
    const data = await backendFetch('/remotelinks', jiraUrl, token, email, {
      keys: chunk.join(','),
    });
    Object.assign(results, data);
  }
  return results;
}

// ── Sprint helpers ────────────────────────────────────────────────────────────
export function parseSprints(sprintField) {
  if (!sprintField) return [];
  const arr = Array.isArray(sprintField) ? sprintField : [sprintField];
  return arr.map((s) => {
    if (typeof s === 'object' && s !== null) {
      return { id: String(s.id), name: s.name || 'Unknown', state: s.state || 'unknown' };
    }
    // Older Jira serialises sprints as strings
    const id    = s.match(/\bid=(\d+)/)?.[1] ?? '';
    const name  = s.match(/\bname=([^,\]]+)/)?.[1] ?? 'Unknown';
    const state = s.match(/\bstate=([^,\]]+)/)?.[1]?.toLowerCase() ?? 'unknown';
    return { id, name, state };
  });
}

// ── Changelog-derived metrics ─────────────────────────────────────────────────

export function calcDaysInProgress(changelog) {
  if (!changelog?.histories?.length) return null;
  let firstExit = null;
  for (const h of changelog.histories) {
    for (const item of h.items ?? []) {
      if (item.field === 'status' && item.fromString?.toLowerCase() === 'new') {
        const d = new Date(h.created);
        if (!firstExit || d < firstExit) firstExit = d;
      }
    }
  }
  if (!firstExit) return null;
  return Math.floor((Date.now() - firstExit.getTime()) / 86_400_000);
}

export function calcSprintSpillovers(changelog) {
  if (!changelog?.histories?.length) return 0;
  return changelog.histories.reduce((count, h) => {
    return (h.items ?? []).find((i) => i.field === 'Sprint') ? count + 1 : count;
  }, 0);
}

export function calcCycleTime(issue) {
  const created  = new Date(issue.fields.created);
  const resolved = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null;
  if (!resolved) return null;
  return Math.floor((resolved - created) / 86_400_000);
}

// ── Normalise raw Jira issue → flat object ────────────────────────────────────
export function normaliseIssue(raw) {
  const f           = raw.fields;
  const sprints     = parseSprints(f.customfield_10020);
  return {
    key:             raw.key,
    url:             `${raw.self.split('/rest/')[0]}/browse/${raw.key}`,
    summary:         f.summary,
    status:          f.status?.name ?? '—',
    statusCategory:  f.status?.statusCategory?.name ?? '',
    priority:        f.priority?.name ?? '—',
    issueType:       f.issuetype?.name ?? '—',
    assigneeJira:    f.assignee?.accountId ?? f.assignee?.name ?? '—',
    assigneeEmail:   f.assignee?.emailAddress ?? '',
    assigneeDisplay: f.assignee?.displayName ?? f.assignee?.name ?? '—',
    created:         f.created,
    updated:         f.updated,
    resolutionDate:  f.resolutiondate ?? null,
    sprints,
    currentSprint:   sprints.find((s) => s.state === 'active') ?? sprints.at(-1) ?? null,
    daysInProgress:  calcDaysInProgress(raw.changelog),
    spillovers:      calcSprintSpillovers(raw.changelog),
    cycleTime:       calcCycleTime(raw),
    storyPoints:     f.customfield_10016 ?? null,
    remoteLinks:     [],
  };
}
