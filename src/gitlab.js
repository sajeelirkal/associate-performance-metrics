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

export async function fetchGitLabCommits(glUrl, glToken, glProject, authors = [], since = null, until = null) {
  const data = await glFetch('/commits', glUrl, glToken, glProject, {
    authors: authors.join(','),
    since,
    until,
  });
  return data.commits ?? [];
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
