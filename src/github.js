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

// ── PR helpers ────────────────────────────────────────────────────────────────

const SEARCH_DELAY_MS = 2200;
const SEARCH_DELAY_AUTH_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GH_REPO_CONCURRENCY = 5;

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

async function fetchPRDetails(headers, owner, name, prNumbers, delayMs = SEARCH_DELAY_MS) {
  const results = [];
  const BATCH = 6;
  for (let i = 0; i < prNumbers.length; i += BATCH) {
    if (i > 0) await sleep(delayMs);
    const batch = prNumbers.slice(i, i + BATCH);
    let hitRateLimit = false;
    const settled = await Promise.allSettled(
      batch.map(num =>
        fetch(`${BASE_URL}/repos/${owner}/${name}/pulls/${num}`, { headers })
          .then(r => {
            if (r.status === 403 || r.status === 429) { hitRateLimit = true; return null; }
            return r.ok ? r.json() : null;
          })
      )
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    if (hitRateLimit) break;
  }
  return results;
}

/**
 * Fetch per-author PR statistics using the GitHub Search API.
 * Returns a map: { [login]: { prsOpened, prsMerged, prsReviewed, prsChurned,
 *                             avgCycleTimeDays, churnPct, reviewComments,
 *                             avgLinesChanged, avgFilesChanged } }
 */
export async function fetchPRMetrics(token, repoFullName, authors = [], since = null, until = null, sharedState = null) {
  if (!authors.length) return {};
  const { owner, name } = parseRepo(repoFullName);
  const headers = buildHeaders(token);
  const repo = `repo:${owner}/${name}`;
  const createdRange = since ? ` created:${since}..${until ?? '*'}` : '';
  const mergedRange  = since ? ` merged:${since}..${until ?? '*'}`  : '';
  const delay = token ? SEARCH_DELAY_AUTH_MS : SEARCH_DELAY_MS;
  const isRateLimited = () => sharedState?.rateLimited ?? false;

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

  const mapItem = (pr, detailMap) => {
    const detail = detailMap.get(pr.number);
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.pull_request?.merged_at ? 'merged' : pr.state,
      author: pr.user?.login ?? '',
      createdAt: pr.created_at,
      mergedAt: pr.pull_request?.merged_at ?? null,
      closedAt: pr.closed_at ?? null,
      additions: detail?.additions ?? null,
      deletions: detail?.deletions ?? null,
      changedFiles: detail?.changed_files ?? null,
      repo: repoFullName,
    };
  };

  const metrics = {};
  let rateLimited = false;
  const setRateLimited = () => {
    rateLimited = true;
    if (sharedState) sharedState.rateLimited = true;
  };

  for (let ai = 0; ai < authors.length; ai++) {
    const author = authors[ai];
    if (rateLimited || isRateLimited()) {
      rateLimited = true;
      metrics[author] = { _rateLimited: true, prsOpened:0, prsMerged:0, prsReviewed:0, prsChurned:0, avgCycleTimeDays:null, churnPct:0, reviewComments:0, avgLinesChanged:null, avgFilesChanged:null, authoredPRs:[], reviewedPRs:[] };
      continue;
    }

    let openedItems = [], mergedItems = [], reviewedItems = [];

    // Fire all 3 search queries with staggered starts to overlap network time
    const [openedRes, mergedRes, reviewedRes] = await Promise.allSettled([
      searchGitHub(headers, `${repo} is:pr author:${author}${createdRange}`),
      sleep(delay).then(() => searchGitHub(headers, `${repo} is:pr is:merged author:${author}${mergedRange}`)),
      sleep(delay * 2).then(() => searchGitHub(headers, `${repo} is:pr reviewed-by:${author}${createdRange}`)),
    ]);

    for (const [res, label] of [[openedRes, 'opened'], [mergedRes, 'merged'], [reviewedRes, 'reviewed']]) {
      if (res.status === 'fulfilled') {
        if (label === 'opened') openedItems = res.value;
        else if (label === 'merged') mergedItems = res.value;
        else reviewedItems = res.value;
      } else if (String(res.reason).includes('rate limit')) {
        setRateLimited();
      } else {
        console.warn(`[PR] ${label} search failed for ${author}:`, res.reason?.message);
      }
    }

    let prDetails = [];
    if (!rateLimited) {
      const allPRNumbers = [...new Set([
        ...openedItems.map(pr => pr.number),
        ...reviewedItems.map(pr => pr.number),
      ])];
      if (allPRNumbers.length > 0) {
        try {
          prDetails = await fetchPRDetails(headers, owner, name, allPRNumbers, delay);
        } catch { /* non-fatal */ }
      }
    }

    if (!rateLimited && ai < authors.length - 1) await sleep(delay);

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

    const detailMap = new Map(prDetails.map(d => [d.number, d]));
    const mergedNumbers = new Set(mergedItems.map(pr => pr.number));
    const mergedDetails = prDetails.filter(d => mergedNumbers.has(d.number));
    const linesArr = mergedDetails.map(d => (d.additions ?? 0) + (d.deletions ?? 0));
    const filesArr = mergedDetails.map(d => d.changed_files ?? 0);

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
      avgLinesChanged: linesArr.length
        ? Math.round(linesArr.reduce((a, b) => a + b, 0) / linesArr.length)
        : null,
      avgFilesChanged: filesArr.length
        ? Math.round(filesArr.reduce((a, b) => a + b, 0) / filesArr.length * 10) / 10
        : null,
      authoredPRs: openedItems.map(pr => mapItem(pr, detailMap)),
      reviewedPRs: reviewedItems.map(pr => mapItem(pr, detailMap)),
    };
  }

  metrics._rateLimited = rateLimited;
  return metrics;
}

// ── Multi-repo wrappers ──────────────────────────────────────────────────────

function parseRepoList(input) {
  if (Array.isArray(input)) return input.map(r => r.trim()).filter(Boolean);
  return (input || '').split(',').map(r => r.trim()).filter(Boolean);
}

export async function fetchMultiRepoContributors(token, repos, { onProgress } = {}) {
  const repoList = parseRepoList(repos);
  const merged = new Map();
  let done = 0;
  await pMap(repoList, async (repo) => {
    const contribs = await fetchContributors(token, repo);
    for (const c of contribs) {
      const key = c.login.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.totalContributions += c.totalContributions;
      } else {
        merged.set(key, { ...c });
      }
    }
    done++;
    onProgress?.({ completed: done, total: repoList.length, currentRepo: repo });
  }, GH_REPO_CONCURRENCY);
  return [...merged.values()].sort((a, b) => b.totalContributions - a.totalContributions);
}

function _weightedAvg(avgA, nA, avgB, nB) {
  if (avgA == null && avgB == null) return null;
  const sumA = (avgA ?? 0) * nA;
  const sumB = (avgB ?? 0) * nB;
  const total = nA + nB;
  return total > 0 ? Math.round((sumA + sumB) / total * 10) / 10 : null;
}

function _weightedAvgRound(avgA, nA, avgB, nB) {
  if (avgA == null && avgB == null) return null;
  const sumA = (avgA ?? 0) * nA;
  const sumB = (avgB ?? 0) * nB;
  const total = nA + nB;
  return total > 0 ? Math.round((sumA + sumB) / total) : null;
}

function mergePRMetricsEntry(existing, data) {
  const prevMerged = existing.prsMerged ?? 0;
  const newMerged  = data.prsMerged ?? 0;

  existing.prsOpened      += data.prsOpened ?? 0;
  existing.prsMerged      += data.prsMerged ?? 0;
  existing.prsReviewed    += data.prsReviewed ?? 0;
  existing.prsChurned     += data.prsChurned ?? 0;
  existing.reviewComments += data.reviewComments ?? 0;
  existing.authoredPRs = (existing.authoredPRs ?? []).concat(data.authoredPRs ?? []);
  existing.reviewedPRs = (existing.reviewedPRs ?? []).concat(data.reviewedPRs ?? []);

  existing.avgCycleTimeDays = _weightedAvg(
    existing.avgCycleTimeDays, prevMerged,
    data.avgCycleTimeDays, newMerged,
  );
  existing.avgLinesChanged = _weightedAvgRound(
    existing.avgLinesChanged, prevMerged,
    data.avgLinesChanged, newMerged,
  );
  existing.avgFilesChanged = _weightedAvg(
    existing.avgFilesChanged, prevMerged,
    data.avgFilesChanged, newMerged,
  );
  existing.churnPct = existing.prsOpened > 0
    ? Math.round((existing.prsChurned / existing.prsOpened) * 100)
    : 0;
}

export async function fetchMultiRepoPRMetrics(token, repos, authors = [], since = null, until = null, { onProgress } = {}) {
  const repoList = parseRepoList(repos);
  const merged = {};
  const sharedState = { rateLimited: false };
  let done = 0;

  await pMap(repoList, async (repo) => {
    if (sharedState.rateLimited) {
      done++;
      onProgress?.({ completed: done, total: repoList.length, currentRepo: repo });
      return;
    }
    const metrics = await fetchPRMetrics(token, repo, authors, since, until, sharedState);
    if (metrics._rateLimited) sharedState.rateLimited = true;

    for (const [login, data] of Object.entries(metrics)) {
      if (login === '_rateLimited') continue;
      const existing = merged[login];
      if (!existing || existing._rateLimited) {
        merged[login] = { ...data };
      } else if (data && !data._rateLimited) {
        mergePRMetricsEntry(existing, data);
      }
    }
    done++;
    onProgress?.({ completed: done, total: repoList.length, currentRepo: repo });
  }, GH_REPO_CONCURRENCY);

  merged._rateLimited = sharedState.rateLimited;
  return merged;
}
