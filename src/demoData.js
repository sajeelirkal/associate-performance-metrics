/**
 * Demo data for Associate Performance Metrics — sample review demo.
 *
 * Performance spread (clear top → bottom):
 *   alice-dev  ★★★★★  top performer
 *   bob-codes  ★★★★☆  strong
 *   carol-eng  ★★★☆☆  mid
 *   eve-cloud  ★★☆☆☆  below mid
 *   dave-hcp   ★☆☆☆☆  bottom performer
 */

export const DEMO_MAPPINGS = [
  { github: 'alice-dev', jira: 'alice.smith'  },
  { github: 'bob-codes', jira: 'bob.jones'    },
  { github: 'carol-eng', jira: 'carol.wilson' },
  { github: 'eve-cloud',  jira: 'eve.taylor'   },
  { github: 'dave-hcp',  jira: 'dave.brown'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(n, hourOffset = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hourOffset, 0, 0, 0);
  return d.toISOString();
}

let _key = 600;
const jkey = () => `DEMO-${++_key}`;

const avatar = (u) => `https://avatars.githubusercontent.com/u/${u}?v=4`;

// ── Contributors ──────────────────────────────────────────────────────────────
export const DEMO_CONTRIBUTORS = [
  { login: 'alice-dev', avatarUrl: avatar(10), totalContributions: 198 },
  { login: 'bob-codes', avatarUrl: avatar(20), totalContributions: 134 },
  { login: 'carol-eng', avatarUrl: avatar(30), totalContributions:  82 },
  { login: 'eve-cloud',  avatarUrl: avatar(40), totalContributions:  51 },
  { login: 'dave-hcp',  avatarUrl: avatar(50), totalContributions:  19 },
];

// ── Jira issues (pre-normalised) ──────────────────────────────────────────────
function issue({
  jiraUser, summary, status, statusCat, priority = 'Medium',
  type = 'Story', daysOpen = 10, daysProgress = null, resolved = null,
  spillovers = 0, storyPoints = null, sprint = 22, githubLinks = [],
}) {
  const createdDaysAgo = daysOpen + Math.floor(daysOpen * 0.3);
  const resolvedDate   = resolved != null ? daysAgo(resolved) : null;
  return {
    key:             jkey(),
    url:             `https://jira.example.com/browse/DEMO-${_key}`,
    summary,
    status,
    statusCategory:  statusCat,
    priority,
    issueType:       type,
    assigneeJira:    jiraUser,
    assigneeEmail:   `${jiraUser.replace('.', '@')}example.com`,
    assigneeDisplay: jiraUser.split('.').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    created:         daysAgo(createdDaysAgo),
    updated:         daysAgo(1),
    resolutionDate:  resolvedDate,
    sprints:         [{ name: `Sprint ${sprint}`, state: resolved != null ? 'closed' : 'active', id: sprint }],
    currentSprint:   { name: `Sprint ${sprint}`, state: resolved != null ? 'closed' : 'active', id: sprint },
    daysInProgress:  daysProgress ?? (statusCat !== 'Done' ? Math.floor(daysOpen * 0.6) : null),
    spillovers,
    cycleTime:       resolvedDate ? Math.floor(daysOpen * 0.9) : null,
    storyPoints,
    remoteLinks:     githubLinks.map(url => ({
      object: { url, title: url.split('/').pop(), icon: { url16x16: '' } },
    })),
  };
}

// ── PR metrics (pre-computed, mirrors what fetchPRMetrics returns) ────────────
export const DEMO_PR_METRICS = {
  'alice-dev': { prsOpened:18, prsMerged:16, prsReviewed:22, prsChurned:2, avgCycleTimeDays:2.1, churnPct:11, reviewComments:48 },
  'bob-codes': { prsOpened:13, prsMerged:12, prsReviewed:15, prsChurned:1, avgCycleTimeDays:3.4, churnPct: 8, reviewComments:31 },
  'carol-eng': { prsOpened: 9, prsMerged: 7, prsReviewed: 9, prsChurned:2, avgCycleTimeDays:4.8, churnPct:22, reviewComments:18 },
  'eve-cloud':  { prsOpened: 6, prsMerged: 5, prsReviewed: 6, prsChurned:2, avgCycleTimeDays:6.2, churnPct:33, reviewComments:11 },
  'dave-hcp':  { prsOpened: 3, prsMerged: 1, prsReviewed: 2, prsChurned:2, avgCycleTimeDays:14.0, churnPct:67, reviewComments: 3 },
};

export const DEMO_JIRA_ISSUES = [

  // ── alice.smith  (9 done · 2 open · 0 spillovers · 42 SP) ─── TOP ──────────
  issue({ jiraUser:'alice.smith', summary:'mTLS support for cluster-service API',         status:'Done',        statusCat:'Done',        daysOpen:12, resolved:4,  spillovers:0, storyPoints:8,  sprint:22, githubLinks:['https://github.com/example-org/example-repo/commit/aa1'] }),
  issue({ jiraUser:'alice.smith', summary:'OIDC provider health-check endpoint',           status:'Done',        statusCat:'Done',        daysOpen:9,  resolved:10, spillovers:0, storyPoints:5,  sprint:21 }),
  issue({ jiraUser:'alice.smith', summary:'JWT validation middleware refactor',             status:'Done',        statusCat:'Done',        daysOpen:7,  resolved:16, spillovers:0, storyPoints:3,  sprint:21 }),
  issue({ jiraUser:'alice.smith', summary:'Prometheus metrics for API latency p50/p99',    status:'Done',        statusCat:'Done',        daysOpen:8,  resolved:22, spillovers:0, storyPoints:5,  sprint:20 }),
  issue({ jiraUser:'alice.smith', summary:'ARM poller multi-region failover',              status:'Done',        statusCat:'Done',        daysOpen:11, resolved:28, spillovers:0, storyPoints:8,  sprint:20 }),
  issue({ jiraUser:'alice.smith', summary:'Audit logging for control-plane mutations',     status:'Done',        statusCat:'Done',        daysOpen:6,  resolved:35, spillovers:0, storyPoints:3,  sprint:19 }),
  issue({ jiraUser:'alice.smith', summary:'Webhook validation for ClusterTemplate CRD',   status:'Done',        statusCat:'Done',        daysOpen:9,  resolved:42, spillovers:0, storyPoints:5,  sprint:19 }),
  issue({ jiraUser:'alice.smith', summary:'Cluster autoscaler integration hooks',          status:'Done',        statusCat:'Done',        daysOpen:10, resolved:50, spillovers:0, storyPoints:3,  sprint:18 }),
  issue({ jiraUser:'alice.smith', summary:'Canary rollout gate for HCP upgrades',         status:'Done',        statusCat:'Done',        daysOpen:13, resolved:58, spillovers:0, storyPoints:2,  sprint:18 }),
  issue({ jiraUser:'alice.smith', summary:'Prometheus alert rules for control-plane SLOs', status:'In Progress', statusCat:'In Progress', daysOpen:5,  daysProgress:3, spillovers:0, storyPoints:5, sprint:22 }),
  issue({ jiraUser:'alice.smith', summary:'PodDisruptionBudget enforcement during drain',  status:'In Progress', statusCat:'In Progress', daysOpen:3,  daysProgress:2, spillovers:0, storyPoints:3, sprint:22 }),

  // ── bob.jones  (7 done · 2 open · 1 spillover · 28 SP) ─── STRONG ──────────
  issue({ jiraUser:'bob.jones', summary:'Nightly e2e test pipeline with parallel shards', status:'Done',        statusCat:'Done',        daysOpen:9,  resolved:6,  spillovers:0, storyPoints:5,  sprint:22 }),
  issue({ jiraUser:'bob.jones', summary:'VNet peering Terraform module v2',               status:'Done',        statusCat:'Done',        daysOpen:8,  resolved:14, spillovers:1, storyPoints:3,  sprint:21 }),
  issue({ jiraUser:'bob.jones', summary:'Managed identity role assignments',               status:'Done',        statusCat:'Done',        daysOpen:10, resolved:22, spillovers:0, storyPoints:5,  sprint:21 }),
  issue({ jiraUser:'bob.jones', summary:'Key Vault diagnostic settings & soft-delete',    status:'Done',        statusCat:'Done',        daysOpen:7,  resolved:30, spillovers:0, storyPoints:3,  sprint:20 }),
  issue({ jiraUser:'bob.jones', summary:'Go module download caching in CI',               status:'Done',        statusCat:'Done',        daysOpen:5,  resolved:37, spillovers:0, storyPoints:2,  sprint:20 }),
  issue({ jiraUser:'bob.jones', summary:'Semver validation on release tags',              status:'Done',        statusCat:'Done',        daysOpen:4,  resolved:44, spillovers:0, storyPoints:5,  sprint:19 }),
  issue({ jiraUser:'bob.jones', summary:'Azure Defender enablement for Key Vault',        status:'Done',        statusCat:'Done',        daysOpen:6,  resolved:51, spillovers:0, storyPoints:5,  sprint:19 }),
  issue({ jiraUser:'bob.jones', summary:'Dependency vulnerability scan in pipeline',      status:'In Progress', statusCat:'In Progress', daysOpen:4,  daysProgress:3, spillovers:0, storyPoints:3, sprint:22 }),
  issue({ jiraUser:'bob.jones', summary:'Restrict NSG to management CIDR only',          status:'In Progress', statusCat:'In Progress', daysOpen:6,  daysProgress:2, spillovers:0, storyPoints:2, sprint:22 }),

  // ── carol.wilson  (4 done · 2 open · 2 spillovers · 16 SP) ─── MID ─────────
  issue({ jiraUser:'carol.wilson', summary:'Cluster upgrade pre-flight checks',            status:'Done',        statusCat:'Done',        daysOpen:14, resolved:8,  spillovers:1, storyPoints:5,  sprint:22 }),
  issue({ jiraUser:'carol.wilson', summary:'Label selector support in NodePool list API', status:'Done',        statusCat:'Done',        daysOpen:11, resolved:18, spillovers:0, storyPoints:3,  sprint:21 }),
  issue({ jiraUser:'carol.wilson', summary:'OCP version surfaced in cluster status API',  status:'Done',        statusCat:'Done',        daysOpen:9,  resolved:28, spillovers:1, storyPoints:5,  sprint:21 }),
  issue({ jiraUser:'carol.wilson', summary:'Component health rollup in cluster status',   status:'Done',        statusCat:'Done',        daysOpen:8,  resolved:38, spillovers:0, storyPoints:3,  sprint:20 }),
  issue({ jiraUser:'carol.wilson', summary:'ARM 429 rate-limit exponential backoff',      status:'In Progress', statusCat:'In Progress', daysOpen:18, daysProgress:14, spillovers:2, storyPoints:5, sprint:22 }),
  issue({ jiraUser:'carol.wilson', summary:'Etcd member health in status API',            status:'To Do',       statusCat:'To Do',       daysOpen:3,  spillovers:0, storyPoints:3,  sprint:22 }),

  // ── eve.taylor  (3 done · 2 open · 3 spillovers · 11 SP) ─── BELOW MID ─────
  issue({ jiraUser:'eve.taylor', summary:'Private Link service auto-configuration',        status:'Done',        statusCat:'Done',        daysOpen:15, resolved:7,  spillovers:1, storyPoints:5,  sprint:22, githubLinks:['https://github.com/example-org/example-repo/commit/ee1'] }),
  issue({ jiraUser:'eve.taylor', summary:'UDR applied correctly on first cluster create', status:'Done',        statusCat:'Done',        daysOpen:10, resolved:20, spillovers:1, storyPoints:3,  sprint:21, priority:'High' }),
  issue({ jiraUser:'eve.taylor', summary:'Egress SNAT fix for large node pools',          status:'Done',        statusCat:'Done',        daysOpen:8,  resolved:34, spillovers:1, storyPoints:3,  sprint:21, priority:'High' }),
  issue({ jiraUser:'eve.taylor', summary:'BYO DNS zone support for private clusters',     status:'In Progress', statusCat:'In Progress', daysOpen:22, daysProgress:18, spillovers:3, storyPoints:5, sprint:22 }),
  issue({ jiraUser:'eve.taylor', summary:'Custom Route Table attachment',                 status:'To Do',       statusCat:'To Do',       daysOpen:5,  spillovers:0, storyPoints:5,  sprint:22 }),

  // ── dave.brown  (1 done · 3 open · 6 spillovers · 3 SP) ─── BOTTOM ─────────
  issue({ jiraUser:'dave.brown', summary:'Fix RBAC for hypershift-operator SA',           status:'Done',        statusCat:'Done',        daysOpen:24, resolved:12, spillovers:2, storyPoints:3,  sprint:22, priority:'High' }),
  issue({ jiraUser:'dave.brown', summary:'Etcd stale lease causing node not-ready',       status:'In Progress', statusCat:'In Progress', daysOpen:35, daysProgress:30, spillovers:3, storyPoints:5, sprint:22, priority:'High' }),
  issue({ jiraUser:'dave.brown', summary:'Orphaned resource blocking cluster delete',     status:'In Progress', statusCat:'In Progress', daysOpen:28, daysProgress:22, spillovers:1, storyPoints:5, sprint:22, priority:'High' }),
  issue({ jiraUser:'dave.brown', summary:'DNS TTL incorrect on cluster records',          status:'To Do',       statusCat:'To Do',       daysOpen:14, spillovers:0, storyPoints:3,  sprint:22 }),
];
