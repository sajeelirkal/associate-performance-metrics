import { describe, it, expect } from 'vitest';

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
    expect(typeof mod.checkBackendHealth).toBe('function');
    expect(typeof mod.resolveJiraUser).toBe('function');
    expect(typeof mod.parseSprints).toBe('function');
    expect(typeof mod.calcCycleTime).toBe('function');
  });
});
