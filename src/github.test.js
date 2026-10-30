import { describe, it, expect, vi } from 'vitest';

// We cannot easily unit test the fetch functions without mocking fetch,
// but we can verify the module exports the expected public API shape
describe('github module exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('./github');
    expect(typeof mod.fetchContributors).toBe('function');
    expect(typeof mod.fetchPRMetrics).toBe('function');
    expect(typeof mod.fetchMultiRepoContributors).toBe('function');
    expect(typeof mod.fetchMultiRepoPRMetrics).toBe('function');
  });
});

describe('gitlab module exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('./gitlab');
    expect(typeof mod.testGitLabConnection).toBe('function');
    expect(typeof mod.fetchGitLabMRMetrics).toBe('function');
    expect(typeof mod.fetchMultiProjectMRMetrics).toBe('function');
  });
});

describe('jira module exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('./jira');
    expect(typeof mod.fetchJiraIssues).toBe('function');
    expect(typeof mod.fetchRemoteLinksForIssues).toBe('function');
    expect(typeof mod.normaliseIssue).toBe('function');
    expect(typeof mod.resolveJiraUser).toBe('function');
    expect(typeof mod.parseSprints).toBe('function');
    expect(typeof mod.calcCycleTime).toBe('function');
  });
});

describe('fetchPRMetrics (GraphQL)', () => {
  it('builds metrics from GraphQL search results without per-PR calls', async () => {
    const { vi } = await import('vitest');
    const { fetchPRMetrics } = await import('./github');
    const pr = (number, extra) => ({
      number, title: `PR ${number}`, url: `https://github.com/o/r/pull/${number}`, state: 'MERGED',
      createdAt: '2026-07-01T00:00:00Z', mergedAt: '2026-07-03T00:00:00Z', closedAt: '2026-07-03T00:00:00Z',
      additions: 10, deletions: 20, changedFiles: 3, author: { login: 'alice' }, ...extra,
    });
    const search = (nodes, hasNextPage = false) => ({
      ok: true, status: 200,
      json: async () => ({ data: { search: { pageInfo: { hasNextPage, endCursor: 'c1' }, nodes } } }),
    });
    const fetchMock = vi.fn(async (url, opts) => {
      if (url.includes('/pulls/comments')) {
        return { ok: true, headers: new Headers(), json: async () => [{ pull_request_url: 'x/pulls/1', user: { login: 'bob' } }] };
      }
      const { q, after } = JSON.parse(opts.body).variables;
      if (q.includes('reviewed-by:')) {
        expect(q).toContain('-author:alice');
        return search([pr(10, { author: { login: 'bob' } }), pr(11, { author: { login: 'bob' } })]);
      }
      if (q.includes('commenter:')) {
        const c = (login, body) => ({ author: { login }, body });
        return search([
          pr(11, { comments: { nodes: [c('alice', '/lgtm'), c('alice', '/approve')] } }), // also formal: still 1
          pr(12, { comments: { nodes: [c('alice', 'nice\n/lgtm')] } }),
          pr(13, { comments: { nodes: [c('alice', '/lgtm cancel')] } }),
          pr(14, { comments: { nodes: [c('alice', 'nit: rename this')] } }),
          pr(15, { comments: { nodes: [c('carol', '/lgtm')] } }),
        ]);
      }
      if (q.includes('is:merged')) return search(after ? [pr(2, { additions: 30, deletions: 40, changedFiles: 1 })] : [pr(1)], !after);
      return search([pr(1), pr(3, { state: 'OPEN', mergedAt: null, closedAt: null })]);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const m = await fetchPRMetrics('tok', 'o/r', ['alice'], '2026-07-01', '2026-09-30');
      const a = m.alice;
      expect(a.prsOpened).toBe(2);
      expect(a.prsMerged).toBe(2); // second page followed
      expect(a.avgLinesChanged).toBe(50); // (30 + 70) / 2
      expect(a.avgFilesChanged).toBe(2);
      expect(a.avgCycleTimeDays).toBe(2);
      expect(a.prsChurned).toBe(1); // bob commented on #1
      expect(a.authoredPRs.map(p => [p.number, p.state])).toEqual([[1, 'merged'], [3, 'open'], [2, 'merged']]);
      // formal reviews #10, #11 + Prow approval on #12; #11 counted once; cancel, plain comments and others' /lgtm ignored
      expect(a.reviewedPRs.map(p => p.number).sort((x, y) => x - y)).toEqual([10, 11, 12]);
      expect(a.prsReviewed).toBe(3);
      expect(m._rateLimited).toBe(false);
      expect(fetchMock.mock.calls.filter(([u]) => u.includes('/pulls/')).every(([u]) => u.includes('/pulls/comments'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns nothing without a token', async () => {
    const { fetchPRMetrics } = await import('./github');
    expect(await fetchPRMetrics('', 'o/r', ['alice'])).toEqual({});
  });
});

describe('repo input forms', () => {
  it('accepts owner/name, full URL and .git forms', async () => {
    const { fetchMultiRepoContributors } = await import('./github');
    for (const repo of [
      'Azure/ARO-HCP',
      'https://github.com/Azure/ARO-HCP',
      'https://github.com/Azure/ARO-HCP.git',
      'github.com/Azure/ARO-HCP',
      'https://github.com/Azure/ARO-HCP/',
    ]) {
      const fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => null }, json: async () => [] }));
      vi.stubGlobal('fetch', fetchMock);
      await fetchMultiRepoContributors('tok', repo);
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some(u => u.includes('/repos/Azure/ARO-HCP/')), repo).toBe(true);
      vi.unstubAllGlobals();
    }
  });

  it('rejects path traversal segments', async () => {
    const { fetchMultiRepoContributors } = await import('./github');
    for (const repo of ['../x', 'owner/..', 'owner/name/extra']) {
      await expect(fetchMultiRepoContributors('tok', repo)).rejects.toThrow('owner/name');
    }
  });
});
