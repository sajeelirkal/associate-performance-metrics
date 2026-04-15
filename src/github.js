const BASE_URL = 'https://api.github.com';

function buildHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseRepo(repoFullName) {
  const [owner, name] = (repoFullName || '').split('/');
  if (!owner || !name) throw new Error('GitHub repo must be in owner/name format');
  return { owner, name };
}

async function fetchAllPages(url, headers) {
  let results = [];
  let page = 1;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}per_page=100&page=${page}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error: ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    results = results.concat(data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

export async function fetchContributors(token, repoFullName) {
  const { owner, name } = parseRepo(repoFullName);
  const url = `${BASE_URL}/repos/${owner}/${name}/contributors`;
  const data = await fetchAllPages(url, buildHeaders(token));
  return data.map((c) => ({
    login: c.login,
    avatarUrl: c.avatar_url,
    totalContributions: c.contributions,
  }));
}

export async function fetchCommits(token, repoFullName, authors = [], since = null, until = null) {
  const { owner, name } = parseRepo(repoFullName);
  const headers = buildHeaders(token);
  let allCommits = [];

  const targets = authors.length > 0 ? authors : [null];

  for (const author of targets) {
    let url = `${BASE_URL}/repos/${owner}/${name}/commits?`;
    if (author) url += `author=${author}&`;
    if (since) url += `since=${new Date(since).toISOString()}&`;
    if (until) {
      const untilDate = new Date(until);
      untilDate.setHours(23, 59, 59, 999);
      url += `until=${untilDate.toISOString()}&`;
    }

    const commits = await fetchAllPages(url.replace(/&$/, ''), headers);
    allCommits = allCommits.concat(
      commits.map((c) => ({
        sha: c.sha,
        author: c.author?.login || c.commit?.author?.name || 'unknown',
        authorAvatar: c.author?.avatar_url || null,
        message: c.commit?.message?.split('\n')[0] || '',
        date: c.commit?.author?.date || '',
        url: c.html_url,
      }))
    );
  }

  const seen = new Set();
  return allCommits.filter((c) => {
    if (seen.has(c.sha)) return false;
    seen.add(c.sha);
    return true;
  });
}

// ── PR helpers ────────────────────────────────────────────────────────────────

const SEARCH_DELAY_MS = 2200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Search issues/PRs, returning up to maxItems results (max 1000 via GH search). */
async function searchGitHub(headers, query, maxItems = 300) {
  const results = [];
  let page = 1;
  while (results.length < maxItems) {
    const url = `${BASE_URL}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 422) {
      console.warn(`[PR] GitHub Search 422 for query: ${query}`);
      break;
    }
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        throw new Error('rate limit exceeded — connect GitHub to increase quota');
      }
      console.warn(`[PR] GitHub Search ${res.status} for query: ${query}`);
      break;
    }
    const data = await res.json();
    const items = data.items ?? [];
    results.push(...items);
    if (items.length < 100 || results.length >= (data.total_count ?? 0)) break;
    page++;
  }
  return results;
}

/**
 * Fetch per-author PR statistics using the GitHub Search API.
 * Returns a map: { [login]: { prsOpened, prsMerged, prsReviewed, prsChurned,
 *                             avgCycleTimeDays, churnPct, reviewComments } }
 */
export async function fetchPRMetrics(token, repoFullName, authors = [], since = null, until = null) {
  if (!authors.length) return {};
  const { owner, name } = parseRepo(repoFullName);
  const headers = buildHeaders(token);
  const repo = `repo:${owner}/${name}`;
  const createdRange = since ? ` created:${since}..${until ?? '*'}` : '';
  const mergedRange  = since ? ` merged:${since}..${until ?? '*'}`  : '';

  let allReviewComments = [];
  try {
    const sinceParam = since ? `?since=${new Date(since).toISOString()}` : '';
    const rcBase = `${BASE_URL}/repos/${owner}/${name}/pulls/comments${sinceParam}`;
    for (let page = 1; page <= 10; page++) {
      const sep = rcBase.includes('?') ? '&' : '?';
      const res = await fetch(`${rcBase}${sep}per_page=100&page=${page}`, { headers });
      if (!res.ok) break;
      const chunk = await res.json();
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      allReviewComments = allReviewComments.concat(chunk);
      if (chunk.length < 100) break;
    }
  } catch { /* non-fatal */ }

  const prCommenters = new Map();
  for (const rc of allReviewComments) {
    const prNum = parseInt(rc.pull_request_url?.split('/').pop(), 10);
    if (!isNaN(prNum)) {
      if (!prCommenters.has(prNum)) prCommenters.set(prNum, new Set());
      prCommenters.get(prNum).add(rc.user?.login?.toLowerCase() ?? '');
    }
  }

  const metrics = {};
  let rateLimited = false;

  for (let ai = 0; ai < authors.length; ai++) {
    const author = authors[ai];
    if (rateLimited) {
      metrics[author] = { _rateLimited: true, prsOpened:0, prsMerged:0, prsReviewed:0, prsChurned:0, avgCycleTimeDays:null, churnPct:0, reviewComments:0 };
      continue;
    }

    let openedItems = [], mergedItems = [], reviewedItems = [];

    try { openedItems = await searchGitHub(headers, `${repo} is:pr author:${author}${createdRange}`); }
    catch (e) {
      if (String(e).includes('rate limit')) { rateLimited = true; }
      else { console.warn(`[PR] opened search failed for ${author}:`, e.message); }
    }

    if (!rateLimited) {
      await sleep(SEARCH_DELAY_MS);
      try { mergedItems = await searchGitHub(headers, `${repo} is:pr is:merged author:${author}${mergedRange}`); }
      catch (e) {
        if (String(e).includes('rate limit')) { rateLimited = true; }
        else { console.warn(`[PR] merged search failed for ${author}:`, e.message); }
      }
    }

    if (!rateLimited) {
      await sleep(SEARCH_DELAY_MS);
      try { reviewedItems = await searchGitHub(headers, `${repo} is:pr reviewed-by:${author}${createdRange}`); }
      catch (e) {
        if (String(e).includes('rate limit')) { rateLimited = true; }
        else { console.warn(`[PR] reviewed search failed for ${author}:`, e.message); }
      }
    }

    // Throttle before next author's batch
    if (!rateLimited && ai < authors.length - 1) await sleep(SEARCH_DELAY_MS);

    const cycleTimes = mergedItems
      .filter(pr => pr.pull_request?.merged_at && pr.created_at)
      .map(pr => (new Date(pr.pull_request.merged_at) - new Date(pr.created_at)) / 86_400_000);

    const authorLower = author.toLowerCase();
    const reviewComments = allReviewComments.filter(
      c => c.user?.login?.toLowerCase() === authorLower
    ).length;

    const prsChurned = openedItems.filter(pr => {
      const commenters = prCommenters.get(pr.number);
      if (!commenters || commenters.size === 0) return false;
      for (const c of commenters) { if (c !== authorLower) return true; }
      return false;
    }).length;

    metrics[author] = {
      _rateLimited:    rateLimited,
      prsOpened:       openedItems.length,
      prsMerged:       mergedItems.length,
      prsReviewed:     reviewedItems.length,
      prsChurned,
      avgCycleTimeDays: cycleTimes.length
        ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length * 10) / 10
        : null,
      churnPct: openedItems.length > 0
        ? Math.round((prsChurned / openedItems.length) * 100)
        : 0,
      reviewComments,
    };
  }

  metrics._rateLimited = rateLimited;
  return metrics;
}

export async function fetchContributorStats(token, repoFullName) {
  const { owner, name } = parseRepo(repoFullName);
  const url = `${BASE_URL}/repos/${owner}/${name}/stats/contributors`;
  const headers = buildHeaders(token);

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    return data;
  }
  return [];
}
