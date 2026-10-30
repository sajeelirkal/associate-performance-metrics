/**
 * GitLab data layer — all calls go to the local Python backend at /api/gitlab.
 *
 * Credentials are forwarded via request headers so the browser never needs
 * direct connectivity to the GitLab instance (which may be behind a VPN).
 */

import { pMap, mergeMetricsEntry, apiFetch, parseList } from './utils/helpers';

function glFetch(path, glUrl, glToken, glProject, params = {}, { timeoutMs } = {}) {
  return apiFetch(`/gitlab${path}`, {
    'X-GitLab-Url':     glUrl,
    'X-GitLab-Token':   glToken,
    'X-GitLab-Project': glProject,
  }, params, { timeoutMs });
}

export function testGitLabConnection(glUrl, glToken) {
  return glFetch('/test', glUrl, glToken, '', {}, { timeoutMs: 15000 });
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

export async function fetchMultiProjectMRMetrics(glUrl, glToken, projects, authors = [], since = null, until = null, { onProgress } = {}) {
  const projectList = parseList(projects);
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
