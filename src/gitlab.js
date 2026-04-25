/**
 * GitLab data layer — all calls go to the local Python backend at /api/gitlab.
 *
 * Credentials are forwarded via request headers so the browser never needs
 * direct connectivity to the GitLab instance (which may be behind a VPN).
 */

async function glFetch(path, glUrl, glToken, glProject, params = {}) {
  const url = new URL(`/api/gitlab${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  const headers = {
    'X-GitLab-Url':     glUrl,
    'X-GitLab-Token':   glToken,
    'X-GitLab-Project': glProject,
  };

  let res;
  try {
    res = await fetch(url.toString(), { headers });
  } catch {
    throw new Error(
      'Cannot reach the Python backend at localhost:8000.\n' +
      'Run this in a terminal:\n' +
      '  cd associate-performance-metrics/backend\n' +
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

export async function testGitLabConnection(glUrl, glToken) {
  const url = new URL('/api/gitlab/test', window.location.origin);
  const headers = {
    'X-GitLab-Url':   glUrl,
    'X-GitLab-Token': glToken,
  };

  let res;
  try {
    res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('Cannot reach the Python backend.');
  }

  const text = await res.text().catch(() => '');
  let data = {};
  try { data = JSON.parse(text); } catch { /* non-JSON */ }

  if (!res.ok) {
    throw new Error(data.detail || text.slice(0, 300) || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchGitLabMRMetrics(glUrl, glToken, glProject, authors = [], since = null, until = null) {
  if (!authors.length) return {};
  const data = await glFetch('/mrs', glUrl, glToken, glProject, {
    authors: authors.join(','),
    since,
    until,
  });
  return data.metrics ?? {};
}

// ── Multi-project wrappers ───────────────────────────────────────────────────

const GL_PROJECT_CONCURRENCY = 3;

async function pMap(items, fn, concurrency) {
  const results = [];
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

function parseProjectList(input) {
  if (Array.isArray(input)) return input.map(p => p.trim()).filter(Boolean);
  return (input || '').split(',').map(p => p.trim()).filter(Boolean);
}

export function mergeMetricsEntry(existing, data) {
  if (!existing) return { ...data };
  if (!data || typeof data !== 'object') return existing;

  const prevMerged = existing.mrsMerged ?? 0;
  const newMerged  = data.mrsMerged ?? 0;
  const weightedAvgKeys = new Set(['avgCycleTimeDays', 'avgLinesChanged', 'avgFilesChanged']);
  for (const [k, v] of Object.entries(data)) {
    if (weightedAvgKeys.has(k)) {
      if (existing[k] == null && v == null) continue;
      const sumA = (existing[k] ?? 0) * prevMerged;
      const sumB = (v ?? 0) * newMerged;
      const total = prevMerged + newMerged;
      existing[k] = total > 0 ? Math.round((sumA + sumB) / total * 10) / 10 : null;
    } else if (typeof v === 'number') {
      existing[k] = (existing[k] ?? 0) + v;
    } else if (Array.isArray(v)) {
      existing[k] = (existing[k] ?? []).concat(v);
    }
  }
  return existing;
}

export async function fetchMultiProjectMRMetrics(glUrl, glToken, projects, authors = [], since = null, until = null, { onProgress } = {}) {
  const projectList = parseProjectList(projects);
  const merged = {};
  let done = 0;

  await pMap(projectList, async (project) => {
    const metrics = await fetchGitLabMRMetrics(glUrl, glToken, project, authors, since, until);
    for (const [login, data] of Object.entries(metrics)) {
      merged[login] = mergeMetricsEntry(merged[login], data);
    }
    done++;
    onProgress?.({ completed: done, total: projectList.length, currentProject: project });
  }, GL_PROJECT_CONCURRENCY);

  return merged;
}
