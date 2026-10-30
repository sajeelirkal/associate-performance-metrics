import { pMap, mergeMetricsEntry, parseList } from './utils/helpers';

const BASE_URL = 'https://api.github.com';

function buildHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Accepts "owner/name", a full https://github.com/owner/name URL, or "github.com/owner/name". */
function parseRepo(repoFullName) {
  const cleaned = (repoFullName || '').trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const parts = cleaned.split('/');
  const valid = (part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..';
  if (parts.length !== 2 || !valid(parts[0]) || !valid(parts[1])) {
    throw new Error('GitHub repo must be in owner/name format');
  }
  const [owner, name] = parts;
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

const GH_REPO_CONCURRENCY = 5;
const GH_AUTHOR_CONCURRENCY = 3;


/** True for a Prow `/lgtm` or `/approve` command line, but not its `cancel` form. */
export function isProwApproval(body) {
  return /^[ \t]*\/(lgtm|approve)\b(?![ \t]+cancel\b)/im.test(body ?? '');
}

// ponytail: last 100 comments per PR; an approval buried deeper on a very busy PR is missed.
const SEARCH_QUERY = `query($q: String!, $after: String, $stats: Boolean!, $comments: Boolean!) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url state createdAt mergedAt closedAt
      additions @include(if: $stats) deletions @include(if: $stats) changedFiles @include(if: $stats)
      author { login }
      comments(last: 100) @include(if: $comments) { nodes { author { login } body } }
    } }
  }
}`;

/**
 * Search PRs via GraphQL, up to maxItems. Line/file stats come back inline, so no
 * per-PR follow-up calls, and GraphQL's point budget replaces the 30/min REST search limit.
 */
async function searchPRs(headers, query, { stats = true, comments = false, maxItems = 300 } = {}) {
  const results = [];
  let after = null;
  while (results.length < maxItems) {
    const res = await fetch(`${BASE_URL}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q: query, after, stats, comments } }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 || res.status === 429 || body.errors?.some(e => e.type === 'RATE_LIMITED')) {
      throw new Error('rate limit exceeded — wait a minute and re-fetch');
    }
    if (!res.ok || body.errors) {
      console.warn(`[PR] GitHub GraphQL search failed (${res.status}) for query: ${query}`, body.errors ?? body.message);
      break;
    }
    const { nodes, pageInfo } = body.data.search;
    results.push(...nodes.filter(n => n.number));
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
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
  if (!authors.length || !token) return {}; // GitHub GraphQL has no anonymous access
  const { owner, name } = parseRepo(repoFullName);
  const headers = buildHeaders(token);
  const repo = `repo:${owner}/${name}`;
  const createdRange = since ? ` created:${since}..${until ?? '*'}` : '';
  const mergedRange  = since ? ` merged:${since}..${until ?? '*'}`  : '';
  const isRateLimited = () => sharedState?.rateLimited ?? false;

  // ponytail: capped at 10 pages (1000 comments) per repo, same as before; raise if busy repos undercount.
  const reviewCommentsPromise = (async () => {
    try {
      const sinceParam = since ? `&since=${new Date(since).toISOString()}` : '';
      const pageUrl = (page) => `${BASE_URL}/repos/${owner}/${name}/pulls/comments?per_page=100&page=${page}${sinceParam}`;
      const first = await fetch(pageUrl(1), { headers });
      if (!first.ok) return [];
      const lastPage = Math.min(10, Number(first.headers.get('link')?.match(/[?&]page=(\d+)[^>]*>; rel="last"/)?.[1] ?? 1));
      const rest = await Promise.all(
        Array.from({ length: lastPage - 1 }, (_, k) => fetch(pageUrl(k + 2), { headers }).then(r => (r.ok ? r.json() : [])))
      );
      return [await first.json(), ...rest].flat();
    } catch { return []; } // non-fatal
  })();

  // Resolved alongside the author searches instead of blocking them.
  const reviewCommentsReady = reviewCommentsPromise.then(allReviewComments => {
    const prCommenters = new Map();
    for (const rc of allReviewComments) {
      const prNum = parseInt(rc.pull_request_url?.split('/').pop(), 10);
      if (!isNaN(prNum)) {
        if (!prCommenters.has(prNum)) prCommenters.set(prNum, new Set());
        prCommenters.get(prNum).add(rc.user?.login?.toLowerCase() ?? '');
      }
    }
    return { allReviewComments, prCommenters };
  });

  const mapItem = (pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.mergedAt ? 'merged' : pr.state.toLowerCase(),
    author: pr.author?.login ?? '',
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt ?? null,
    closedAt: pr.closedAt ?? null,
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changedFiles ?? null,
    repo: repoFullName,
  });

  const metrics = {};
  let rateLimited = false;
  const setRateLimited = () => {
    rateLimited = true;
    if (sharedState) sharedState.rateLimited = true;
  };

  await pMap(authors, async (author) => {
    if (rateLimited || isRateLimited()) {
      rateLimited = true;
      metrics[author] = { _rateLimited: true, prsOpened:0, prsMerged:0, prsClosedUnmerged:0, prsReviewed:0, prsChurned:0, avgCycleTimeDays:null, churnPct:0, reviewComments:0, avgLinesChanged:null, avgFilesChanged:null, authoredPRs:[], reviewedPRs:[] };
      return;
    }

    let openedItems = [], mergedItems = [], formalReviewItems = [], commentedItems = [];

    // Reviews only count on other people's PRs: GitHub records an author's replies to
    // review comments as "reviews" of their own PR. Stats are only shown for authored PRs.
    const [openedRes, mergedRes, reviewedRes, commentedRes] = await Promise.allSettled([
      searchPRs(headers, `${repo} is:pr author:${author}${createdRange}`),
      searchPRs(headers, `${repo} is:pr is:merged author:${author}${mergedRange}`),
      searchPRs(headers, `${repo} is:pr reviewed-by:${author} -author:${author}${createdRange}`, { stats: false }),
      searchPRs(headers, `${repo} is:pr commenter:${author} -author:${author}${createdRange}`, { stats: false, comments: true }),
    ]);

    for (const [res, label] of [[openedRes, 'opened'], [mergedRes, 'merged'], [reviewedRes, 'reviewed'], [commentedRes, 'commented']]) {
      if (res.status === 'fulfilled') {
        if (label === 'opened') openedItems = res.value;
        else if (label === 'merged') mergedItems = res.value;
        else if (label === 'reviewed') formalReviewItems = res.value;
        else commentedItems = res.value;
      } else if (String(res.reason).includes('rate limit')) {
        setRateLimited();
      } else {
        console.warn(`[PR] ${label} search failed for ${author}:`, res.reason?.message);
      }
    }

    // Reviewed = formal GitHub review or a Prow /lgtm or /approve comment, once per PR.
    const reviewedMap = new Map(formalReviewItems.map(pr => [pr.number, pr]));
    for (const pr of commentedItems) {
      if (pr.comments?.nodes?.some(c => c.author?.login?.toLowerCase() === author.toLowerCase() && isProwApproval(c.body))) {
        reviewedMap.set(pr.number, pr);
      }
    }
    const reviewedItems = [...reviewedMap.values()];

    const cycleTimes = mergedItems
      .filter(pr => pr.mergedAt && pr.createdAt)
      .map(pr => (new Date(pr.mergedAt) - new Date(pr.createdAt)) / 86_400_000);

    const { allReviewComments, prCommenters } = await reviewCommentsReady;
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

    // Authored list = PRs opened in range ∪ PRs merged in range (deduped).
    // A PR merged this period but opened earlier counts toward prsMerged, so it
    // must appear in the table too — otherwise the count and the list disagree.
    const authoredMap = new Map();
    for (const pr of [...openedItems, ...mergedItems]) {
      if (!authoredMap.has(pr.number)) authoredMap.set(pr.number, mapItem(pr));
    }

    const linesArr = mergedItems.map(pr => (pr.additions ?? 0) + (pr.deletions ?? 0));
    const filesArr = mergedItems.map(pr => pr.changedFiles ?? 0);

    metrics[author] = {
      _rateLimited:    rateLimited,
      prsOpened:       openedItems.length,
      prsMerged:       mergedItems.length,
      // Closed without ever merging (state 'closed', no mergedAt) — abandoned/rejected work.
      prsClosedUnmerged: [...authoredMap.values()].filter(pr => pr.state === 'closed').length,
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
      authoredPRs: [...authoredMap.values()],
      reviewedPRs: reviewedItems.map(pr => mapItem(pr)),
    };
  }, GH_AUTHOR_CONCURRENCY);

  metrics._rateLimited = rateLimited;
  return metrics;
}

// ── Multi-repo wrappers ──────────────────────────────────────────────────────

export async function fetchMultiRepoContributors(token, repos, { onProgress } = {}) {
  const repoList = parseList(repos);
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

export async function fetchMultiRepoPRMetrics(token, repos, authors = [], since = null, until = null, { onProgress } = {}) {
  const repoList = parseList(repos);
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
        mergeMetricsEntry(existing, data, 'prsMerged');
        existing.churnPct = existing.prsOpened > 0 ? Math.round((existing.prsChurned / existing.prsOpened) * 100) : 0;
      }
    }
    done++;
    onProgress?.({ completed: done, total: repoList.length, currentRepo: repo });
  }, GH_REPO_CONCURRENCY);

  merged._rateLimited = sharedState.rateLimited;
  return merged;
}
