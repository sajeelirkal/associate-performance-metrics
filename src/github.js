const REPO_OWNER = 'Azure';
const REPO_NAME = 'ARO-HCP';
const BASE_URL = 'https://api.github.com';

function buildHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
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

export async function fetchContributors(token) {
  const url = `${BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/contributors`;
  const data = await fetchAllPages(url, buildHeaders(token));
  return data.map((c) => ({
    login: c.login,
    avatarUrl: c.avatar_url,
    totalContributions: c.contributions,
  }));
}

export async function fetchCommits(token, authors = [], since = null, until = null) {
  const headers = buildHeaders(token);
  let allCommits = [];

  const targets = authors.length > 0 ? authors : [null];

  for (const author of targets) {
    let url = `${BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/commits?`;
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

  // Deduplicate by sha
  const seen = new Set();
  return allCommits.filter((c) => {
    if (seen.has(c.sha)) return false;
    seen.add(c.sha);
    return true;
  });
}

// ── PR helpers ────────────────────────────────────────────────────────────────

/** Search issues/PRs, returning up to maxItems results (max 1000 via GH search). */
async function searchGitHub(headers, query, maxItems = 300) {
  const results = [];
  let page = 1;
  while (results.length < maxItems) {
    const url = `${BASE_URL}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 422) break; // query too complex / no results
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403 || res.status === 429) {
        // Throw so callers can detect rate-limiting
        throw new Error('rate limit exceeded — connect GitHub to increase quota');
      }
      break; // any other error: return what we have so far
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
export async function fetchPRMetrics(token, authors = [], since = null, until = null) {
  if (!authors.length) return {};
  const headers = buildHeaders(token);
  const repo = `repo:${REPO_OWNER}/${REPO_NAME}`;
  // Space-separated so encodeURIComponent turns it into %20 — a proper qualifier
  // separator in GitHub search. Using `+` here causes %2B after encoding, which
  // GitHub decodes as a literal + and merges with the previous qualifier value.
  const dateRange = since ? ` created:${since}..${until ?? '*'}` : '';

  // Fetch review comments in a capped way (max 5 pages = 500 comments) to
  // avoid exhausting the rate-limit budget before the search queries run.
  // We still use the since-filter so old comments are excluded.
  let allReviewComments = [];
  try {
    const sinceParam = since ? `?since=${new Date(since).toISOString()}` : '';
    const rcBase = `${BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/comments${sinceParam}`;
    for (let page = 1; page <= 10; page++) {
      const sep = rcBase.includes('?') ? '&' : '?';
      const res = await fetch(`${rcBase}${sep}per_page=100&page=${page}`, { headers });
      if (!res.ok) break;
      const chunk = await res.json();
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      allReviewComments = allReviewComments.concat(chunk);
      if (chunk.length < 100) break;
    }
  } catch { /* non-fatal — churn/review-comments just won't show */ }

  // Build a lookup: PR number → Set of commenters
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

  for (const author of authors) {
    if (rateLimited) {
      // If we already know we're rate-limited, mark remaining authors and stop
      metrics[author] = { _rateLimited: true, prsOpened:0, prsMerged:0, prsReviewed:0, prsChurned:0, avgCycleTimeDays:null, churnPct:0, reviewComments:0 };
      continue;
    }

    // Run 3 searches sequentially (not parallel) to stay well inside the
    // GitHub search rate limit of 30 authenticated / 10 unauthenticated req/min.
    let openedItems = [], mergedItems = [], reviewedItems = [];

    try { openedItems   = await searchGitHub(headers, `${repo} is:pr author:${author}${dateRange}`); }
    catch (e) { if (String(e).includes('rate limit')) { rateLimited = true; } }

    try { mergedItems   = await searchGitHub(headers, `${repo} is:pr is:merged author:${author}${dateRange}`); }
    catch (e) { if (String(e).includes('rate limit')) { rateLimited = true; } }

    try { reviewedItems = await searchGitHub(headers, `${repo} is:pr reviewed-by:${author}${dateRange}`); }
    catch (e) { if (String(e).includes('rate limit')) { rateLimited = true; } }

    // Avg PR cycle time (open → merge) in days
    const cycleTimes = mergedItems
      .filter(pr => pr.pull_request?.merged_at && pr.created_at)
      .map(pr => (new Date(pr.pull_request.merged_at) - new Date(pr.created_at)) / 86_400_000);

    // Review comments LEFT by this author (counted from the comments we fetched)
    const authorLower = author.toLowerCase();
    const reviewComments = allReviewComments.filter(
      c => c.user?.login?.toLowerCase() === authorLower
    ).length;

    // Churn = opened PRs that received review comments from someone other than the author
    const prsChurned = openedItems.filter(pr => {
      const commenters = prCommenters.get(pr.number);
      if (!commenters || commenters.size === 0) return false;
      for (const c of commenters) { if (c !== authorLower) return true; }
      return false;
    }).length;

    metrics[author] = {
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

  // Attach a top-level flag so the UI can warn the user
  metrics._rateLimited = rateLimited;
  return metrics;
}

export async function fetchContributorStats(token) {
  const url = `${BASE_URL}/repos/${REPO_OWNER}/${REPO_NAME}/stats/contributors`;
  const headers = buildHeaders(token);

  // GitHub may return 202 while computing stats; retry up to 5 times
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
