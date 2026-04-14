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

export const DEMO_ASSOCIATES = 'alice-dev, bob-codes, carol-eng, eve-cloud, dave-hcp';

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

let _sha = 2000;
const sha = () => (++_sha).toString(16).padStart(40, '0');

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

// ── Commit factories ──────────────────────────────────────────────────────────
// Each entry: [dayOffset, hour] — deterministic so the chart looks clean
function commits(author, entries) {
  return entries.map(([day, hour, message]) => ({
    sha: sha(),
    author,
    authorAvatar: DEMO_CONTRIBUTORS.find(c => c.login === author)?.avatarUrl ?? null,
    message,
    date: daysAgo(day, hour),
    url: `https://github.com/example-org/example-repo/commit/${sha()}`,
  }));
}

// alice — commits almost every weekday, 52 total
const ALICE_COMMITS = commits('alice-dev', [
  [1,9,'feat: add mTLS support for cluster-service API'],
  [1,14,'test: integration tests for mTLS handshake'],
  [2,10,'fix: race condition in token refresh handler'],
  [3,9,'refactor: extract JWT validation into middleware'],
  [3,15,'test: unit tests for JWT middleware'],
  [4,11,'feat: implement OIDC provider health check endpoint'],
  [5,9,'feat: support multi-region failover in ARM poller'],
  [5,16,'fix: nil pointer in ARM poller retry loop'],
  [6,10,'chore: bump azure-sdk-for-go to v68.0.0'],
  [7,9,'feat: add Prometheus metrics for API latency p50/p99'],
  [7,14,'fix: histogram bucket boundaries for latency metrics'],
  [8,10,'refactor: simplify retry logic in HCP provisioner'],
  [9,9,'fix: correct subnet delegation for managed identity'],
  [9,15,'test: add subnet delegation edge-case coverage'],
  [10,11,'feat: add audit logging for control-plane mutations'],
  [11,9,'feat: implement cluster upgrade pre-flight gate'],
  [11,16,'fix: pre-flight gate false-positive on maintenance window'],
  [12,10,'refactor: consolidate ARM client into shared pkg'],
  [13,9,'feat: expose OCP version in cluster status API'],
  [14,10,'fix: status propagation lag on cluster delete'],
  [14,15,'test: mock ARM responses for status tests'],
  [15,9,'feat: add Private Link service auto-configuration'],
  [16,10,'infra: Terraform module for VNet peering v2'],
  [17,9,'ci: add nightly e2e pipeline with parallel shards'],
  [17,14,'ci: fix flaky test in node-ready assertion'],
  [18,10,'feat: BYO DNS zone support for private clusters'],
  [19,9,'fix: UDR not applied on first cluster creation attempt'],
  [20,10,'feat: NSG rule generator for standard topologies'],
  [21,9,'refactor: move network helpers to pkg/network'],
  [21,15,'docs: update network architecture ADR'],
  [22,10,'feat: label selector support in NodePool list API'],
  [23,9,'fix: ARM 429 rate-limit — add exponential backoff'],
  [24,10,'feat: story-point rollup in cluster status'],
  [25,9,'chore: update golangci-lint config for new linters'],
  [26,10,'feat: webhook validation for ClusterTemplate CRD'],
  [27,9,'fix: etcd snapshot restore skipping WAL files'],
  [28,10,'feat: RBAC helper for hypershift SA provisioning'],
  [29,9,'refactor: use structured logging throughout api-server'],
  [30,10,'feat: implement custom Route Table attachment'],
  [31,9,'fix: egress SNAT exhaustion on large node pools'],
  [32,10,'feat: add management-cluster topology validator'],
  [33,9,'test: e2e for management-cluster topology'],
  [34,10,'fix: stale informer cache causing stale cluster status'],
  [35,9,'feat: graceful drain support for node eviction'],
  [36,10,'chore: remove deprecated v1alpha1 API handlers'],
  [37,9,'fix: incorrect CIDR overlap check in subnet planner'],
  [38,10,'feat: cluster autoscaler integration hooks'],
  [39,9,'fix: reconcile loop stuck on finalizer removal'],
  [40,10,'refactor: event recorder wiring in controller setup'],
  [42,9,'feat: add canary rollout gate for HCP upgrades'],
  [44,9,'fix: PodDisruptionBudget not honored during drain'],
  [46,9,'test: comprehensive suite for upgrade gate logic'],
]);

// bob — solid, 35 commits
const BOB_COMMITS = commits('bob-codes', [
  [1,11,'ci: add nightly e2e test pipeline'],
  [2,10,'infra: update Terraform modules for VNet peering'],
  [3,9,'fix: correct Makefile target for local dev cluster'],
  [4,10,'chore: pin golangci-lint to v1.57.2'],
  [5,11,'infra: add managed identity role assignments'],
  [6,9,'ci: parallelize unit test jobs into 4 shards'],
  [7,10,'fix: broken DNS resolver in staging environment'],
  [8,9,'infra: enable diagnostic settings for Key Vault'],
  [9,11,'ci: add coverage report upload step'],
  [10,10,'fix: ARM template missing dependsOn for NSG'],
  [12,9,'infra: add flow logs for VNet subnets'],
  [13,10,'ci: cache Go module downloads in pipeline'],
  [14,9,'fix: intermittent timeout in ARM deployment poll'],
  [15,11,'infra: enable soft-delete on Key Vault'],
  [17,10,'ci: add lint step to PR checks'],
  [19,9,'fix: race in parallel test suite teardown'],
  [21,10,'infra: add private DNS zone for storage endpoints'],
  [22,9,'ci: bump pipeline agent to ubuntu-22.04'],
  [24,10,'fix: Makefile clean target leaving stale binaries'],
  [25,9,'infra: restrict NSG to management CIDR only'],
  [27,10,'ci: add semver validation on release tags'],
  [28,9,'fix: container registry credential rotation script'],
  [30,10,'infra: parameterise region in Terraform root module'],
  [31,9,'ci: fail fast on first test-suite error'],
  [33,10,'fix: subnet address space too small for scale test'],
  [35,9,'infra: tag all resources with cost-centre label'],
  [37,10,'ci: enforce branch protection via Terraform'],
  [39,9,'fix: YAML indentation in Helm chart values'],
  [41,10,'infra: move secrets to Key Vault references'],
  [43,9,'ci: add dependency vulnerability scan'],
  [45,10,'fix: incorrect log level in production config'],
  [47,9,'ci: publish test results as pipeline artifacts'],
  [49,10,'infra: enable Azure Defender for Key Vault'],
  [51,9,'fix: nil dereference in ARM error parser'],
  [53,10,'ci: add e2e smoke-test for cluster create/delete'],
]);

// carol — mid, 22 commits
const CAROL_COMMITS = commits('carol-eng', [
  [2,10,'feat: implement cluster upgrade pre-flight checks'],
  [5,9,'docs: update API reference for NodePool endpoint'],
  [8,11,'fix: incorrect status propagation on cluster delete'],
  [11,10,'feat: add label selector support to list API'],
  [14,9,'refactor: consolidate error types into pkg/errors'],
  [17,10,'test: mock ARM client for unit tests'],
  [20,9,'feat: expose OCP version in cluster status'],
  [23,11,'fix: handle 429 rate-limit from ARM gracefully'],
  [26,10,'feat: add cluster readiness probe endpoint'],
  [28,9,'fix: nodepool count off-by-one on scale-down'],
  [31,10,'test: coverage for nodepool scale-down path'],
  [33,9,'chore: update swagger spec for v1beta1 endpoints'],
  [36,11,'feat: add component health rollup to cluster status'],
  [38,10,'fix: finalizer stuck when resource group missing'],
  [40,9,'docs: add upgrade sequence diagram to ADR'],
  [42,10,'feat: surface etcd member health in status API'],
  [44,9,'fix: goroutine leak in watch-loop reconnect'],
  [46,11,'test: add fuzz tests for JQL builder'],
  [48,10,'chore: remove deprecated alpha feature flags'],
  [50,9,'fix: memory leak in large informer cache'],
  [55,10,'refactor: status controller into separate package'],
  [60,9,'docs: runbook for manual etcd compaction'],
]);

// eve — below mid, 15 commits
const EVE_COMMITS = commits('eve-cloud', [
  [3,10,'feat: add Private Link service configuration'],
  [8,9,'fix: UDR not applied on cluster creation'],
  [13,11,'feat: support BYO DNS zone for private clusters'],
  [18,10,'infra: add NSG flow logs for subnet debugging'],
  [22,9,'fix: missing egress rule for image pull'],
  [27,10,'feat: support custom Route Table attachment'],
  [31,9,'chore: update network policy docs'],
  [36,11,'fix: DNS resolution fails after VNet re-peering'],
  [40,10,'feat: add network connectivity pre-check'],
  [44,9,'fix: overlapping CIDR in dual-stack config'],
  [48,10,'docs: add private cluster networking guide'],
  [52,9,'fix: IPv6 route propagation missing for HCP nodes'],
  [57,11,'feat: expose network topology in cluster status'],
  [62,10,'fix: BGP advertisement missing for peered VNets'],
  [68,9,'chore: clean up stale network helper functions'],
]);

// dave — bottom performer, only 6 commits, spread thinly
const DAVE_COMMITS = commits('dave-hcp', [
  [7,10,'fix: stale etcd lease causing node not-ready'],
  [21,9,'fix: missing RBAC for hypershift-operator SA'],
  [38,11,'chore: clean up unused feature flag code'],
  [52,10,'fix: incorrect TTL on DNS records'],
  [67,9,'docs: add runbook for etcd backup restore'],
  [80,10,'fix: cluster delete blocked by orphaned resource'],
]);

export const DEMO_COMMITS = [
  ...ALICE_COMMITS,
  ...BOB_COMMITS,
  ...CAROL_COMMITS,
  ...EVE_COMMITS,
  ...DAVE_COMMITS,
].sort((a, b) => new Date(b.date) - new Date(a.date));

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
