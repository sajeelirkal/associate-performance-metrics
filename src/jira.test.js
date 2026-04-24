import { describe, it, expect } from 'vitest';
import {
  parseSprints, calcDaysInProgress, calcSprintSpillovers,
  calcCycleTime, normaliseIssue,
} from './jira';

describe('parseSprints', () => {
  it('handles null/empty', () => {
    expect(parseSprints(null)).toEqual([]);
    expect(parseSprints(undefined)).toEqual([]);
  });
  it('parses object sprints', () => {
    const result = parseSprints([{ id: 1, name: 'Sprint 1', state: 'active' }]);
    expect(result).toEqual([{ id: '1', name: 'Sprint 1', state: 'active' }]);
  });
  it('parses string sprints', () => {
    const result = parseSprints(['id=42,name=Sprint X,state=closed']);
    expect(result[0].id).toBe('42');
    expect(result[0].name).toBe('Sprint X');
    expect(result[0].state).toBe('closed');
  });
});

describe('calcDaysInProgress', () => {
  it('returns null without changelog', () => {
    expect(calcDaysInProgress(null)).toBeNull();
    expect(calcDaysInProgress({ histories: [] })).toBeNull();
  });
});

describe('calcSprintSpillovers', () => {
  it('returns 0 without changelog', () => {
    expect(calcSprintSpillovers(null)).toBe(0);
    expect(calcSprintSpillovers({ histories: [] })).toBe(0);
  });
  it('counts sprint changes', () => {
    const changelog = {
      histories: [
        { items: [{ field: 'Sprint' }] },
        { items: [{ field: 'status' }] },
        { items: [{ field: 'Sprint' }] },
      ],
    };
    expect(calcSprintSpillovers(changelog)).toBe(2);
  });
});

describe('calcCycleTime', () => {
  it('returns null without resolution date', () => {
    expect(calcCycleTime({ fields: { created: '2025-01-01', resolutiondate: null } })).toBeNull();
  });
  it('calculates days between creation and resolution', () => {
    const result = calcCycleTime({
      fields: { created: '2025-01-01T00:00:00.000Z', resolutiondate: '2025-01-11T00:00:00.000Z' },
    });
    expect(result).toBe(10);
  });
});

describe('normaliseIssue', () => {
  it('extracts key fields from raw issue', () => {
    const raw = {
      key: 'TEST-123',
      self: 'https://jira.example.com/rest/api/2/issue/12345',
      fields: {
        summary: 'Test issue',
        status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
        priority: { name: 'Major' },
        issuetype: { name: 'Story' },
        assignee: { displayName: 'Alice', name: 'alice', emailAddress: 'alice@test.com' },
        created: '2025-01-01',
        updated: '2025-01-10',
        resolution: null,
        resolutiondate: null,
        customfield_10020: null,
        comment: { comments: [] },
      },
      changelog: { histories: [] },
    };
    const result = normaliseIssue(raw);
    expect(result.key).toBe('TEST-123');
    expect(result.summary).toBe('Test issue');
    expect(result.status).toBe('In Progress');
    expect(result.priority).toBe('Major');
    expect(result.issueType).toBe('Story');
    expect(result.assigneeDisplay).toBe('Alice');
    expect(result.url).toContain('TEST-123');
    expect(result.cycleTime).toBeNull();
    expect(result.spillovers).toBe(0);
  });
});
