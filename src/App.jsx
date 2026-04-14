import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { format, parseISO, eachDayOfInterval, subDays, subMonths, startOfDay } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { fetchContributors, fetchCommits, fetchPRMetrics } from './github';
import {
  fetchJiraIssues, fetchRemoteLinksForIssues, normaliseIssue, checkBackendHealth, resolveJiraUser,
} from './jira';
import {
  DEMO_CONTRIBUTORS, DEMO_COMMITS, DEMO_JIRA_ISSUES, DEMO_MAPPINGS, DEMO_ASSOCIATES, DEMO_PR_METRICS,
} from './demoData';
import './App.css';

const COLORS = ['#58a6ff','#3fb950','#f78166','#d2a8ff','#ffa657','#39d353','#ff7b72','#79c0ff','#56d364','#e3b341'];
const QUICK_RANGES = [
  { label: '7d', days: 7 }, { label: '30d', days: 30 },
  { label: '90d', days: 90 }, { label: '6m', days: 180 }, { label: '1y', days: 365 },
];

// Returns the first day of a given calendar quarter for a given year
function quarterStart(year, q) {
  return new Date(year, (q - 1) * 3, 1);
}
function quarterEnd(year, q) {
  // Last day of the last month of the quarter
  return new Date(year, q * 3, 0);
}
function currentQuarterStart() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return quarterStart(now.getFullYear(), q);
}
// Build quick-range buttons for every quarter in the current year + last year's Q4 if we're in Q1
function buildQuarterRanges() {
  const now  = new Date();
  const year = now.getFullYear();
  const curQ = Math.floor(now.getMonth() / 3) + 1;
  const ranges = [];
  for (let q = 1; q <= curQ; q++) {
    const start = quarterStart(year, q);
    const end   = q === curQ ? now : quarterEnd(year, q);
    ranges.push({ label: `Q${q} ${year}`, start, end, current: q === curQ });
  }
  // If we're in Q1, also offer last year's Q4
  if (curQ === 1) {
    ranges.unshift({ label: `Q4 ${year - 1}`, start: quarterStart(year - 1, 4), end: quarterEnd(year - 1, 4) });
  }
  return ranges;
}
const QUARTER_RANGES = buildQuarterRanges();

// ── Ancillary-commit filter ───────────────────────────────────────────────────
const ANCILLARY_RE = [
  /^(wip|noop|no-op)\b/i,
  /\bbump\b/i,
  /\bimage\b/i,
  /^merge (branch|pull request|tag|remote)/i,
  /^revert\b/i,
  /^(chore|ci|build|style|test|docs|release)(\(.+\))?:/i,
  /update.*dependenc/i,
  /dependabot/i,
  /auto.?generated/i,
  /automated?\s/i,
  /\brelease\s+v?\d+\.\d+/i,
  /^v?\d+\.\d+\.\d+$/,       // bare version tags
  /\[skip ci\]/i,
  /^fixup!/i,
  /^squash!/i,
];

function isAncillaryCommit(msg) {
  if (!msg) return true;
  if (msg.trim().length < 8) return true;
  const m = msg.trim();
  return ANCILLARY_RE.some(re => re.test(m));
}

// Strip conventional-commit prefix for display (feat: → keep body only)
function commitDisplayMsg(msg) {
  return msg.replace(/^(feat|fix|refactor|perf|improve|add|remove|update|chore|ci|docs|test|build|style)(\(.+\))?:\s*/i, '').trim();
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function statusColor(status) {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'var(--accent2)';
  if (s.includes('progress') || s.includes('review')) return 'var(--accent)';
  if (s.includes('blocked') || s.includes('impeded')) return 'var(--danger)';
  return 'var(--text-muted)';
}

function priorityIcon(p) {
  const m = { Critical: '🔴', Blocker: '🔴', Major: '🟠', Normal: '🟡', Minor: '🟢', Trivial: '⚪' };
  return m[p] ?? '🔵';
}

// ── Info tip ──────────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  return (
    <span className="infotip-wrap">
      <span className="infotip-icon" aria-label="info">ⓘ</span>
      <span className="infotip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

const PR_CHURN_TIP =
  'PR Churn = % of your opened PRs that received review comments from someone else. ' +
  'A high % means your PRs frequently required revision cycles before being accepted. ' +
  'Lower is generally better, but some discussion is healthy. ' +
  'Flagged red when > 60%.';

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, showLink }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ color:'#8b949e', marginBottom:6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
      {showLink && payload[0]?.value > 0 && (
        <p style={{ color:'#58a6ff', marginTop:6, fontSize:11 }}>Click to open on GitHub ↗</p>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GitHubIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function JiraIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M15.89 2.16L8.3 9.74a1.05 1.05 0 000 1.48l4.52 4.52 7.58-7.58-4.51-5.98z" fill="#2684FF"/>
      <path d="M16.11 29.84l7.59-7.58a1.05 1.05 0 000-1.48l-4.52-4.52-7.58 7.58 4.51 5.98z" fill="#2684FF"/>
      <path d="M8.3 9.74l-.01-.01A1.05 1.05 0 006.81 9.2L2 13.99a1.05 1.05 0 000 1.48l6.29 6.29 7.58-7.58-7.57-4.44z" fill="url(#jira_a)"/>
      <path d="M23.7 22.26l.01.01a1.05 1.05 0 001.48.53l4.81-4.79a1.05 1.05 0 000-1.48l-6.29-6.29-7.58 7.58 7.57 4.44z" fill="url(#jira_b)"/>
      <defs>
        <linearGradient id="jira_a" x1="9.13" y1="16" x2="2" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset=".18" stopColor="#0052CC"/><stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
        <linearGradient id="jira_b" x1="22.87" y1="16" x2="30" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset=".18" stopColor="#0052CC"/><stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

function CalendarIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('github');
  const [backendUp,       setBackendUp]       = useState(null); // null=unchecked, true, false
  const [oauthAvailable, setOauthAvailable]   = useState(false); // backend has OAuth configured

  const switchTab = useCallback(async (t) => {
    setTab(t);
    if (t === 'jira' || t === 'performance' || t === 'settings') {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          setBackendUp(true);
          setOauthAvailable(!!data.github_oauth_configured);
        } else {
          setBackendUp(false);
        }
      } catch {
        setBackendUp(false);
      }
    }
  }, []);

  // ── Shared config ──
  const [token,      setToken]      = useState(() => localStorage.getItem('gh_token') || '');
  const [associates, setAssociates] = useState(() => localStorage.getItem('gh_associates') || '');
  const [sinceDate,  setSinceDate]  = useState(() => currentQuarterStart());
  const [untilDate,  setUntilDate]  = useState(() => new Date());
  const since = useMemo(() => format(sinceDate, 'yyyy-MM-dd'), [sinceDate]);
  const until = useMemo(() => format(untilDate, 'yyyy-MM-dd'), [untilDate]);

  // Shared associate filter — applies across GitHub, Jira and Performance tabs
  const [activeAssociate, setActiveAssociate] = useState(null); // github username

  // ── Jira config ──
  const [jiraBase,   setJiraBase]   = useState(() => localStorage.getItem('jira_base')  || 'https://redhat.atlassian.net');
  const [jiraEmail,  setJiraEmail]  = useState(() => localStorage.getItem('jira_email') || '');
  const [jiraApiKey, setJiraApiKey] = useState(() => localStorage.getItem('jira_key')   || '');

  // Mapping stored as array of {github, jira} rows — persisted as JSON
  const [mappings, setMappings] = useState(() => {
    try {
      const stored = localStorage.getItem('user_mapping');
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : [];
    } catch { return []; }
  });

  const addMappingRow    = () => setMappings(m => [...m, { github: '', jira: '', jiraDisplay: '' }]);
  const removeMappingRow = (i) => setMappings(m => m.filter((_, idx) => idx !== i));
  const updateMapping    = (i, field, val) =>
    setMappings(m => m.map((row, idx) => {
      if (idx !== i) return row;
      // Clear the display label if the user manually edits the raw jira field
      return field === 'jira' ? { ...row, jira: val, jiraDisplay: '' } : { ...row, [field]: val };
    }));

  // Per-row lookup state: { [rowIndex]: { loading, results, error } }
  const [lookupState, setLookupState] = useState({});
  const lookupJiraUser = async (rowIdx) => {
    const query = mappings[rowIdx]?.jira?.trim();
    if (!query || !jiraBase || !jiraApiKey) return;
    setLookupState(s => ({ ...s, [rowIdx]: { loading: true, results: [], error: null } }));
    try {
      const results = await resolveJiraUser(jiraBase, jiraApiKey, jiraEmail, query);
      setLookupState(s => ({ ...s, [rowIdx]: { loading: false, results, error: results.length === 0 ? 'No users found' : null } }));
    } catch (e) {
      setLookupState(s => ({ ...s, [rowIdx]: { loading: false, results: [], error: e.message } }));
    }
  };

  // ── GitHub state ──
  const [contributors, setContributors] = useState([]);
  const [commits,      setCommits]      = useState([]);
  const [prMetrics,    setPrMetrics]    = useState({}); // { [login]: { prsOpened, prsMerged, ... } }
  const [prFetchNote,  setPrFetchNote]  = useState(''); // warning/info message after PR fetch
  const [demoMode,     setDemoMode]     = useState(false);
  const [ghLoading,    setGhLoading]    = useState(false);
  const [ghError,      setGhError]      = useState(null);
  const [ghFetched,    setGhFetched]    = useState(false);
  const [selectedAuthors, setSelectedAuthors] = useState([]);
  const [hoveredDay,   setHoveredDay]   = useState(null);
  const [searchMsg,    setSearchMsg]    = useState('');
  const [ghPage,       setGhPage]       = useState(1);

  // ── Jira state ──
  const [jiraIssues,  setJiraIssues]  = useState([]);
  const [remoteLinks, setRemoteLinks] = useState({}); // { issueKey: [link, ...] }
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError,   setJiraError]   = useState(null);
  const [jiraFetched, setJiraFetched] = useState(false);
  const [jiraSearch,  setJiraSearch]  = useState('');
  const [jiraFilter,  setJiraFilter]  = useState('all'); // all | open | done
  const [jiraPage,    setJiraPage]    = useState(1);
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [workSummaryOpen, setWorkSummaryOpen] = useState(true);
  const [collapsedPersons, setCollapsedPersons] = useState({});
  const togglePerson = (github) =>
    setCollapsedPersons(s => ({ ...s, [github]: !s[github] }));

  const PAGE_SIZE = 25;

  // ── Persist ──
  // ── Handle GitHub OAuth callback — token arrives in the URL fragment ─────────
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#github_token=')) {
      const t = hash.slice('#github_token='.length);
      if (t) {
        setToken(t);
        localStorage.setItem('gh_token', t);
      }
      // Clean the token out of the URL so it's not visible / replayable
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const params = new URLSearchParams(window.location.search);
    const ghErr = params.get('github_error');
    if (ghErr) {
      setGhError(`GitHub OAuth failed: ${ghErr}`);
      params.delete('github_error');
      const newSearch = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem('gh_token',      token);                     }, [token]);
  useEffect(() => { localStorage.setItem('gh_associates', associates);                }, [associates]);
  useEffect(() => { localStorage.setItem('jira_base',     jiraBase);                  }, [jiraBase]);
  useEffect(() => { localStorage.setItem('jira_email',    jiraEmail);                 }, [jiraEmail]);
  useEffect(() => { localStorage.setItem('jira_key',      jiraApiKey);                }, [jiraApiKey]);
  const [mappingSaved, setMappingSaved] = useState(false);
  useEffect(() => {
    localStorage.setItem('user_mapping', JSON.stringify(mappings));
    setMappingSaved(true);
    const t = setTimeout(() => setMappingSaved(false), 2000);
    return () => clearTimeout(t);
  }, [mappings]);

  // ── Export / Import config ──
  const handleExportConfig = useCallback(() => {
    const config = {
      jiraBase, jiraEmail,
      mappings,
      ghAssociates: associates,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aro-hcp-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [jiraBase, jiraEmail, mappings, associates]);

  const handleImportConfig = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const cfg = JSON.parse(ev.target.result);
        if (cfg.jiraBase)    setJiraBase(cfg.jiraBase);
        if (cfg.jiraEmail)   setJiraEmail(cfg.jiraEmail);
        if (Array.isArray(cfg.mappings) && cfg.mappings.length) setMappings(cfg.mappings);
        if (cfg.ghAssociates) setAssociates(cfg.ghAssociates);
      } catch { alert('Invalid config file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // ── Parse inputs ──
  // Valid (complete) rows only — defined first so associateList can use it
  const userMapping = useMemo(
    () => mappings.filter(r => r.github?.trim() && r.jira?.trim()),
    [mappings]
  );

  // GitHub usernames: prefer the mapping table; fall back to the manual field
  const associateList = useMemo(() => {
    if (userMapping.length > 0) return userMapping.map(r => r.github.trim());
    return associates.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  }, [userMapping, associates]);

  // Jira usernames derived from mapping (or fallback to associateList itself)
  const jiraUsernames = useMemo(() => {
    if (userMapping.length) return userMapping.map(m => m.jira).filter(Boolean);
    return associateList;
  }, [userMapping, associateList]);

  // Jira identity tokens for the currently active associate (via mapping)
  // Returns an array of lowercase strings to match against assigneeJira or assigneeEmail

  // Full associate list for chips (from mapping, falling back to contributors)
  const associateOptions = useMemo(() => {
    if (userMapping.length) return userMapping.filter(r => r.github);
    return associateList.map(g => ({ github: g, jira: g }));
  }, [userMapping, associateList]);

  const applyQuickRange = (days) => {
    setSinceDate(subDays(new Date(), days));
    setUntilDate(new Date());
  };

  // ── GitHub fetch ──────────────────────────────────────────────────────────
  const handleFetchGitHub = useCallback(async () => {
    setGhError(null); setGhLoading(true); setGhFetched(false);
    try {
      const [contribs, rawCommits, prMeta] = await Promise.all([
        fetchContributors(token),
        fetchCommits(token, associateList, since, until),
        fetchPRMetrics(token, associateList, since, until).catch(() => ({})),
      ]);
      const relevantLogins = new Set(associateList.map(a => a.toLowerCase()));
      setContributors(
        associateList.length > 0
          ? contribs.filter(c => relevantLogins.has(c.login.toLowerCase()))
          : contribs.slice(0, 20)
      );
      setCommits(rawCommits.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setPrMetrics(prMeta);
      if (prMeta._rateLimited) {
        setPrFetchNote('⚠ GitHub search rate limit reached — PR data may be incomplete. Connect via OAuth or wait a minute and re-fetch.');
      } else if (!token) {
        setPrFetchNote('ℹ No GitHub token — unauthenticated requests have a very low rate limit (10/min). Connect GitHub for full PR data.');
      } else {
        setPrFetchNote('');
      }
      setSelectedAuthors([]); setGhPage(1); setGhFetched(true);
    } catch (e) { setGhError(e.message); }
    finally { setGhLoading(false); }
  }, [token, associateList, since, until]);

  // ── Jira test connection ──────────────────────────────────────────────────
  const [jiraTestStatus, setJiraTestStatus] = useState(null); // null | 'ok' | 'error'
  const [jiraTestMsg,    setJiraTestMsg]    = useState('');

  const handleTestJira = useCallback(async () => {
    setJiraTestStatus(null); setJiraTestMsg(''); setJiraError(null);
    try {
      const headers = { 'X-Jira-Url': jiraBase, 'X-Jira-Token': jiraApiKey };
      if (jiraEmail) headers['X-Jira-Email'] = jiraEmail;
      let res;
      try {
        res = await fetch('/api/test', { headers, signal: AbortSignal.timeout(10000) });
      } catch {
        setJiraTestStatus('error');
        setJiraTestMsg('Cannot reach the Python backend. Start it with: cd backend && uvicorn main:app --reload --port 8000');
        return;
      }
      const text = await res.text().catch(() => '');
      let data = {};
      try { data = JSON.parse(text); } catch { /* non-JSON body — fall through */ }
      if (!res.ok) {
        setJiraTestStatus('error');
        setJiraTestMsg(data.detail || text.slice(0, 300) || `HTTP ${res.status}`);
      } else {
        setJiraTestStatus('ok');
        setJiraTestMsg(`Connected as: ${data.user}`);
      }
    } catch (e) {
      setJiraTestStatus('error');
      setJiraTestMsg(e.message);
    }
  }, [jiraBase, jiraEmail, jiraApiKey]);

  // ── Jira fetch ────────────────────────────────────────────────────────────
  const handleFetchJira = useCallback(async () => {
    setJiraError(null); setJiraLoading(true); setJiraFetched(false);
    try {
      const raw = await fetchJiraIssues(jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until);
      const issues = raw.map(normaliseIssue);
      setJiraIssues(issues);
      const keys = issues.map(i => i.key);
      fetchRemoteLinksForIssues(jiraBase, jiraApiKey, jiraEmail, keys)
        .then(links => setRemoteLinks(links))
        .catch(() => {});
      setJiraPage(1); setJiraFetched(true);
    } catch (e) { setJiraError(e.message); }
    finally { setJiraLoading(false); }
  }, [jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until]);

  // ── Fetch everything at once ──────────────────────────────────────────────
  const fetchAllLoading = ghLoading || jiraLoading;

  const handleFetchAll = useCallback(async () => {
    await Promise.allSettled([handleFetchGitHub(), handleFetchJira()]);
  }, [handleFetchGitHub, handleFetchJira]);

  const handleLoadDemo = useCallback(() => {
    setCommits(DEMO_COMMITS);
    setContributors(DEMO_CONTRIBUTORS);
    setPrMetrics(DEMO_PR_METRICS);
    setPrFetchNote('');
    setJiraIssues(DEMO_JIRA_ISSUES);
    setRemoteLinks({});
    setMappings(DEMO_MAPPINGS);
    setGhFetched(true);
    setJiraFetched(true);
    setGhError(null);
    setJiraError(null);
    setDemoMode(true);
    setActiveAssociate(null);
    setGhPage(1);
    setJiraPage(1);
    setTab('github');
  }, []);

  const handleClearDemo = useCallback(() => {
    setCommits([]);
    setContributors([]);
    setPrMetrics({});
    setPrFetchNote('');
    setJiraIssues([]);
    setRemoteLinks({});
    setMappings(DEMO_MAPPINGS);
    setGhFetched(false);
    setJiraFetched(false);
    setDemoMode(false);
    setActiveAssociate(null);
  }, []);

  // ── GitHub derived data ───────────────────────────────────────────────────
  const filteredCommits = useMemo(() => commits.filter(c => {
    // Global associate filter takes precedence over multi-select chips
    if (activeAssociate && c.author?.toLowerCase() !== activeAssociate.toLowerCase()) return false;
    if (!activeAssociate && selectedAuthors.length > 0 && !selectedAuthors.includes(c.author)) return false;
    if (searchMsg && !c.message.toLowerCase().includes(searchMsg.toLowerCase()) &&
        !c.author.toLowerCase().includes(searchMsg.toLowerCase())) return false;
    return true;
  }), [commits, selectedAuthors, activeAssociate, searchMsg]);

  const pagedCommits = useMemo(() => {
    const s = (ghPage - 1) * PAGE_SIZE;
    return filteredCommits.slice(s, s + PAGE_SIZE);
  }, [filteredCommits, ghPage]);

  const commitsPerDayData = useMemo(() => {
    if (!filteredCommits.length) return [];
    const counts = {};
    filteredCommits.forEach(c => {
      const day = c.date ? format(parseISO(c.date), 'yyyy-MM-dd') : null;
      if (day) counts[day] = (counts[day] || 0) + 1;
    });
    return eachDayOfInterval({ start: parseISO(since), end: parseISO(until) }).map(d => {
      const key = format(d, 'yyyy-MM-dd');
      return { date: format(d, 'MMM d'), isoDate: key, commits: counts[key] || 0 };
    });
  }, [filteredCommits, since, until]);

  const commitsPerAuthorData = useMemo(() => {
    const counts = {};
    filteredCommits.forEach(c => { counts[c.author] = (counts[c.author] || 0) + 1; });
    return Object.entries(counts).map(([author, commits]) => ({ author, commits }))
      .sort((a, b) => b.commits - a.commits).slice(0, 15);
  }, [filteredCommits]);

  const weeklyStackedData = useMemo(() => {
    if (!filteredCommits.length) return { data: [], authors: [] };
    const authorSet = new Set(); const weeks = {};
    filteredCommits.forEach(c => {
      if (!c.date) return;
      const d = parseISO(c.date);
      const wk = format(startOfDay(d), "yyyy-'W'ww");
      if (!weeks[wk]) weeks[wk] = { week: format(d, 'MMM d'), _ts: d.getTime() };
      weeks[wk][c.author] = (weeks[wk][c.author] || 0) + 1;
      authorSet.add(c.author);
    });
    return { data: Object.values(weeks).sort((a, b) => a._ts - b._ts), authors: [...authorSet] };
  }, [filteredCommits]);

  const dowData = useMemo(() => {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const counts = Array(7).fill(0);
    filteredCommits.forEach(c => { if (c.date) counts[parseISO(c.date).getDay()]++; });
    return days.map((day, i) => ({ day, commits: counts[i] }));
  }, [filteredCommits]);

  const ghStats = useMemo(() => {
    const uniqueAuthors = new Set(filteredCommits.map(c => c.author)).size;
    const activeDays = new Set(filteredCommits.map(c => c.date?.slice(0,10)).filter(Boolean)).size;
    return {
      total: filteredCommits.length, uniqueAuthors, activeDays,
      avgPerDay: activeDays ? (filteredCommits.length / activeDays).toFixed(1) : 0,
    };
  }, [filteredCommits]);

  const openDayOnGitHub = useCallback((isoDate) => {
    if (!isoDate) return;
    const authors = selectedAuthors.length === 1 ? `&author=${selectedAuthors[0]}` : '';
    window.open(
      `https://github.com/Azure/ARO-HCP/commits/main/?since=${isoDate}T00:00:00Z&until=${isoDate}T23:59:59Z${authors}`,
      '_blank', 'noreferrer'
    );
  }, [selectedAuthors]);

  // ── Jira assignee matching helper ─────────────────────────────────────────
  // Matches assigneeJira (username like wehe.openshift) OR assigneeEmail
  // against a mapping value that could be either a username or an email.
  const issueMatchesAssignee = useCallback((issue, jiraValue) => {
    if (!jiraValue) return false;
    const v = jiraValue.toLowerCase();
    const tokens = new Set([v]);
    if (v.includes('@')) tokens.add(v.split('@')[0]);

    const jiraName   = issue.assigneeJira?.toLowerCase()  ?? '';
    const jiraEmail  = issue.assigneeEmail?.toLowerCase() ?? '';
    const emailLocal = jiraEmail.includes('@') ? jiraEmail.split('@')[0] : jiraEmail;
    return tokens.has(jiraName) || tokens.has(jiraEmail) || tokens.has(emailLocal);
  }, []);

  // ── Jira derived data ─────────────────────────────────────────────────────
  const filteredJiraIssues = useMemo(() => jiraIssues.filter(i => {
    // Global associate filter — resolve github→jira mapping then token-match
    if (activeAssociate) {
      const row = userMapping.find(m => m.github.toLowerCase() === activeAssociate.toLowerCase());
      const jiraVal = row?.jira || activeAssociate;
      if (!issueMatchesAssignee(i, jiraVal)) return false;
    }
    if (jiraFilter === 'open' && i.statusCategory?.toLowerCase().includes('done')) return false;
    if (jiraFilter === 'done' && !i.statusCategory?.toLowerCase().includes('done')) return false;
    if (jiraSearch) {
      const q = jiraSearch.toLowerCase();
      return i.key.toLowerCase().includes(q) ||
             i.summary.toLowerCase().includes(q) ||
             i.assigneeDisplay.toLowerCase().includes(q) ||
             i.status.toLowerCase().includes(q);
    }
    return true;
  }), [jiraIssues, jiraFilter, jiraSearch, activeAssociate, userMapping, issueMatchesAssignee]);

  // ── Jira table sort ──────────────────────────────────────────────────────
  const [jiraSortKey, setJiraSortKey] = useState(null);
  const [jiraSortDir, setJiraSortDir] = useState('asc');

  const handleJiraSort = useCallback((key) => {
    if (jiraSortKey === key) {
      setJiraSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setJiraSortKey(key);
      setJiraSortDir('asc');
    }
    setJiraPage(1);
  }, [jiraSortKey]);

  const PRIORITY_ORDER = { Critical:0, Blocker:0, Major:1, Normal:2, Minor:3, Trivial:4 };

  const sortedJiraIssues = useMemo(() => {
    if (!jiraSortKey) return filteredJiraIssues;
    const dir = jiraSortDir === 'asc' ? 1 : -1;
    return [...filteredJiraIssues].sort((a, b) => {
      let av, bv;
      switch (jiraSortKey) {
        case 'key':         av = a.key;            bv = b.key;            break;
        case 'summary':     av = a.summary;        bv = b.summary;        break;
        case 'assignee':    av = a.assigneeDisplay; bv = b.assigneeDisplay; break;
        case 'status':      av = a.status;         bv = b.status;         break;
        case 'priority':    av = PRIORITY_ORDER[a.priority] ?? 99; bv = PRIORITY_ORDER[b.priority] ?? 99; break;
        case 'daysActive':  av = a.daysInProgress ?? -1; bv = b.daysInProgress ?? -1; break;
        case 'spillovers':  av = a.spillovers;     bv = b.spillovers;     break;
        case 'cycleTime':   av = a.cycleTime ?? -1; bv = b.cycleTime ?? -1; break;
        case 'sp':          av = a.storyPoints ?? -1; bv = b.storyPoints ?? -1; break;
        case 'sprint':      av = a.currentSprint?.name ?? ''; bv = b.currentSprint?.name ?? ''; break;
        default:            return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
  }, [filteredJiraIssues, jiraSortKey, jiraSortDir]);

  const pagedJira = useMemo(() => {
    const s = (jiraPage - 1) * PAGE_SIZE;
    return sortedJiraIssues.slice(s, s + PAGE_SIZE);
  }, [sortedJiraIssues, jiraPage]);

  const jiraTotalPages = Math.ceil(sortedJiraIssues.length / PAGE_SIZE);

  // ── Jira contribution share data ─────────────────────────────────────────
  const jiraContribData = useMemo(() => {
    const people = userMapping.length > 0
      ? userMapping
      : associateList.map(g => ({ github: g, jira: g, jiraDisplay: '' }));
    return people
      .map(({ github, jira, jiraDisplay }) => {
        const mine  = filteredJiraIssues.filter(i => issueMatchesAssignee(i, jira));
        const done  = mine.filter(i => i.statusCategory?.toLowerCase().includes('done')).length;
        const open  = mine.length - done;
        const sp    = mine.filter(i => i.statusCategory?.toLowerCase().includes('done'))
                          .reduce((s, i) => s + (i.storyPoints || 0), 0);

        // Pull real name + email from the first matching Jira issue's assignee fields
        const firstIssue    = mine[0];
        const assigneeName  = firstIssue?.assigneeDisplay || jiraDisplay || github;
        const assigneeEmail = firstIssue?.assigneeEmail   || '';
        // Short label for pie slices (name only to avoid overflow)
        const shortLabel    = assigneeName !== '—' ? assigneeName : github;
        // Full label used in tooltips (name + email)
        const fullLabel     = assigneeEmail ? `${shortLabel} (${assigneeEmail})` : shortLabel;

        return { name: github, label: shortLabel, fullLabel, email: assigneeEmail, total: mine.length, done, open, sp };
      })
      .filter(p => p.total > 0);
  }, [filteredJiraIssues, userMapping, associateList, issueMatchesAssignee]);

  // ── Performance metrics (combined) ───────────────────────────────────────

  const perfData = useMemo(() => {
    const people = userMapping.length > 0 ? userMapping : associateList.map(g => ({ github: g, jira: g }));

    return people.map(({ github, jira }) => {
      const ghCommits  = commits.filter(c => c.author?.toLowerCase() === github?.toLowerCase());
      const ghActiveDays = new Set(ghCommits.map(c => c.date?.slice(0,10)).filter(Boolean)).size;

      const myIssues   = jiraIssues.filter(i => issueMatchesAssignee(i, jira));
      const doneIssues = myIssues.filter(i => i.statusCategory?.toLowerCase().includes('done'));
      const openIssues = myIssues.filter(i => !i.statusCategory?.toLowerCase().includes('done'));

      const avgCycleTime = (() => {
        const valid = doneIssues.map(i => i.cycleTime).filter(v => v !== null);
        return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      })();

      const avgDaysInProgress = (() => {
        const valid = openIssues.map(i => i.daysInProgress).filter(v => v !== null);
        return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      })();

      const totalSpillovers  = myIssues.reduce((s, i) => s + i.spillovers, 0);
      const totalSP          = doneIssues.reduce((s, i) => s + (i.storyPoints || 0), 0);
      const lastCommit       = ghCommits[0]?.date ?? null;

      return {
        github, jira,
        commits: ghCommits.length,
        activeDays: ghActiveDays,
        issuesTotal: myIssues.length,
        issuesDone: doneIssues.length,
        issuesOpen: openIssues.length,
        avgCycleTime,
        avgDaysInProgress,
        totalSpillovers,
        totalSP,
        commitsPerIssue: doneIssues.length ? (ghCommits.length / doneIssues.length).toFixed(1) : '—',
        lastCommit,
      };
    }).filter(p => p.commits > 0 || p.issuesTotal > 0);
  }, [userMapping, associateList, commits, jiraIssues, issueMatchesAssignee]);

  // ── Work summary (narrative) per associate ────────────────────────────────
  const workSummary = useMemo(() => {
    const people = userMapping.length > 0 ? userMapping : associateList.map(g => ({ github: g, jira: g }));

    return people.map(({ github, jira, jiraDisplay }) => {
      // ── Jira items ──
      const myIssues = jiraIssues.filter(i => issueMatchesAssignee(i, jira));
      const jiraItems = myIssues.map(i => ({
        key:     i.key,
        url:     i.url,
        title:   i.summary,
        status:  i.status,
        isDone:  i.statusCategory?.toLowerCase().includes('done'),
        type:    'jira',
        issueType: i.issueType,
        priority:  i.priority,
      }));

      // ── GitHub commit items — deduplicated, ancillary removed ──
      const ghCommits = commits.filter(c => c.author?.toLowerCase() === github?.toLowerCase());
      // Deduplicate by normalised message
      const seen = new Set();
      const commitItems = ghCommits
        .filter(c => !isAncillaryCommit(c.message))
        .filter(c => {
          const key = commitDisplayMsg(c.message).toLowerCase().slice(0, 60);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(c => ({
          sha:     c.sha,
          url:     c.url,
          title:   commitDisplayMsg(c.message),
          date:    c.date,
          type:    'github',
        }));

      const displayName = jiraDisplay || github;
      return { github, jira, displayName, jiraItems, commitItems };
    }).filter(p => p.jiraItems.length > 0 || p.commitItems.length > 0);
  }, [userMapping, associateList, commits, jiraIssues, issueMatchesAssignee]);

  // radarShaped: metric-centric rows, one column per person — works for 1 or N people
  const radarShaped = useMemo(() => {
    const src = activeAssociate ? perfData.filter(p => p.github === activeAssociate) : perfData;
    if (!src.length) return [];
    const maxCommits    = Math.max(...src.map(p => p.commits),    1);
    const maxDone       = Math.max(...src.map(p => p.issuesDone), 1);
    const maxActiveDays = Math.max(...src.map(p => p.activeDays), 1);
    const maxSP         = Math.max(...src.map(p => p.totalSP),    1);
    const normed = src.map(p => ({
      name:           p.github,
      'Commit Volume': Math.round((p.commits    / maxCommits)    * 100),
      'Issues Done':   Math.round((p.issuesDone / maxDone)       * 100),
      'Active Days':   Math.round((p.activeDays / maxActiveDays) * 100),
      'Story Points':  Math.round((p.totalSP    / maxSP)         * 100),
      'Low Spillover': p.totalSpillovers === 0 ? 100 : Math.max(0, 100 - p.totalSpillovers * 20),
    }));
    const metrics = ['Commit Volume', 'Issues Done', 'Active Days', 'Story Points', 'Low Spillover'];
    return metrics.map(m => {
      const row = { subject: m };
      normed.forEach(p => { row[p.name] = p[m]; });
      return row;
    });
  }, [perfData, activeAssociate]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const toggleAuthor = (login) => {
    setSelectedAuthors(prev => prev.includes(login) ? prev.filter(a => a !== login) : [...prev, login]);
    setGhPage(1);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          {/* Team analytics logo — bar chart + people */}
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* bar chart */}
            <rect x="3"  y="18" width="5" height="10" rx="1.5" fill="#58a6ff" opacity="0.9"/>
            <rect x="10" y="12" width="5" height="16" rx="1.5" fill="#3fb950" opacity="0.9"/>
            <rect x="17" y="7"  width="5" height="21" rx="1.5" fill="#d2a8ff" opacity="0.9"/>
            <rect x="24" y="14" width="5" height="14" rx="1.5" fill="#ffa657" opacity="0.9"/>
            {/* upward trend line */}
            <polyline points="5.5,22 12.5,15 19.5,9 26.5,17" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
            {/* people dots on trend */}
            <circle cx="5.5"  cy="22" r="2" fill="#58a6ff"/>
            <circle cx="12.5" cy="15" r="2" fill="#3fb950"/>
            <circle cx="19.5" cy="9"  r="2" fill="#d2a8ff"/>
            <circle cx="26.5" cy="17" r="2" fill="#ffa657"/>
          </svg>
          <div>
            <div className="header-title">Team Performance Metrics</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', opacity:0.7, marginTop:2 }}>
              Measures activity signals · use with managerial discretion
            </div>
          </div>
        </div>
        <nav className="tab-nav">
          {[
            { id: 'github',      label: 'GitHub',      icon: <GitHubIcon size={15} /> },
            { id: 'jira',        label: 'Jira',         icon: <JiraIcon size={15} /> },
            { id: 'performance', label: 'Performance',  icon: <span style={{fontSize:14}}>📊</span> },
            { id: 'settings',    label: 'Settings',     icon: <span style={{fontSize:14}}>⚙️</span> },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">

        {/* ══ Demo mode banner ════════════════════════════════════════════ */}
        {demoMode && tab !== 'settings' && (
          <div style={{ background:'linear-gradient(90deg,#6e40c9,#d2a8ff)', color:'#fff', padding:'6px 20px', fontSize:12, display:'flex', alignItems:'center', gap:12 }}>
            <span>🎭 <strong>Demo Mode</strong> — synthetic data only, no real GitHub or Jira connections.</span>
            <button onClick={() => setTab('settings')} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', borderRadius:6, color:'#fff', padding:'2px 10px', cursor:'pointer', fontSize:12 }}>
              Exit Demo
            </button>
          </div>
        )}

        {/* ══ Slim status bar (visible on all non-settings tabs) ════════════ */}
        {tab !== 'settings' && (
          <div className="status-bar">
            <div className="status-bar-left">
              <span className="status-pill">
                <CalendarIcon />
                {format(sinceDate,'MMM d, yyyy')} — {format(untilDate,'MMM d, yyyy')}
              </span>
              {associates && (
                <span className="status-pill">
                  <GitHubIcon size={12}/> {associateList.join(', ')}
                </span>
              )}
              {userMapping.length > 0 && (
                <span className="status-pill">
                  <JiraIcon size={12}/> {userMapping.length} mapping{userMapping.length !== 1 ? 's' : ''}
                </span>
              )}
              {activeAssociate && (
                <span className="status-pill" style={{ background:'rgba(88,166,255,0.15)', borderColor:'var(--accent)', color:'var(--accent)' }}>
                  👤 {activeAssociate}
                  <button
                    onClick={() => setActiveAssociate(null)}
                    style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:'0 0 0 4px', fontSize:13, lineHeight:1 }}
                    title="Clear filter"
                  >✕</button>
                </span>
              )}
            </div>
            <div className="status-bar-actions">
              <button className="btn btn-primary" onClick={handleFetchAll} disabled={fetchAllLoading} style={{ padding:'4px 16px', fontSize:12 }}>
                {fetchAllLoading
                  ? <><span className="spinner" style={{ width:11, height:11, borderWidth:2 }}/> Fetching…</>
                  : <>↻ Refresh All</>}
              </button>
              <button
                className={`btn btn-outline${ghError ? ' btn-error-outline' : ''}`}
                onClick={handleFetchGitHub}
                disabled={fetchAllLoading}
                style={{ padding:'4px 12px', fontSize:12, display:'flex', alignItems:'center', gap:4 }}
                title={ghError ? `GitHub error — click to retry` : 'Fetch GitHub only'}
              >
                {ghLoading
                  ? <><span className="spinner" style={{ width:11, height:11, borderWidth:2 }}/></>
                  : <GitHubIcon size={13}/>}
                {ghError ? '⚠ GitHub' : 'GitHub'}
              </button>
              <button
                className={`btn btn-outline${jiraError ? ' btn-error-outline' : ''}`}
                onClick={handleFetchJira}
                disabled={fetchAllLoading}
                style={{ padding:'4px 12px', fontSize:12, display:'flex', alignItems:'center', gap:4 }}
                title={jiraError ? `Jira error — click to retry` : 'Fetch Jira only'}
              >
                {jiraLoading
                  ? <><span className="spinner" style={{ width:11, height:11, borderWidth:2 }}/></>
                  : <JiraIcon size={13}/>}
                {jiraError ? '⚠ Jira' : 'Jira'}
              </button>
              <button className="btn btn-outline" onClick={() => switchTab('settings')} style={{ padding:'4px 12px', fontSize:12 }}>
                ⚙️ Settings
              </button>
            </div>
          </div>
        )}

        {jiraTestStatus && tab !== 'settings' && (
          <div className={`alert ${jiraTestStatus === 'ok' ? 'alert-info' : 'alert-error'}`} style={{ marginBottom:16 }}>
            {jiraTestStatus === 'ok' ? '✓ ' : '✗ '}{jiraTestMsg}
          </div>
        )}

        {/* ══ Settings tab ═══════════════════════════════════════════════════ */}
        {tab === 'settings' && (
          <div className="settings-page">
            {/* ── GitHub ── */}
            <section className="settings-section">
              <h2 className="settings-section-title"><GitHubIcon size={16}/> GitHub</h2>
              <div className="settings-grid">
                <div className="field">
                  <label>GitHub Authentication</label>

                  {/* OAuth button — shown when backend has OAuth configured */}
                  {oauthAvailable && (
                    <a
                      href="/api/github/login"
                      className="btn btn-primary"
                      style={{ display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', marginBottom:10, width:'fit-content' }}
                    >
                      <GitHubIcon size={16}/> {token ? '↻ Re-connect with GitHub' : 'Connect with GitHub'}
                    </a>
                  )}

                  {/* Token status pill */}
                  {token && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <span className="status-pill" style={{ color:'var(--accent2)' }}>
                        ✓ GitHub connected
                      </span>
                      <button
                        className="link-btn"
                        style={{ fontSize:12, color:'var(--danger)' }}
                        onClick={() => { setToken(''); localStorage.removeItem('gh_token'); }}
                      >
                        Disconnect
                      </button>
                    </div>
                  )}

                  {/* PAT fallback — always available */}
                  <details open={!oauthAvailable}>
                    <summary style={{ fontSize:12, color:'var(--text-muted)', cursor:'pointer', userSelect:'none', marginBottom:6 }}>
                      {oauthAvailable ? 'Or use a Personal Access Token instead' : 'Personal Access Token'}
                    </summary>
                    <input className="input" type="password" placeholder="ghp_…" value={token}
                      onChange={e => setToken(e.target.value)} style={{ marginTop:6 }} />
                    <span className="token-hint">
                      <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Team+Performance+Metrics" target="_blank" rel="noreferrer">Generate token →</a> (public_repo scope)
                    </span>
                  </details>

                  {oauthAvailable === false && backendUp && (
                    <span className="token-hint" style={{ marginTop:6, display:'block' }}>
                      To enable OAuth: set <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> env vars before starting the backend.{' '}
                      <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">Create OAuth App →</a>
                    </span>
                  )}
                </div>
                <div className="field">
                  <label>Associate GitHub Usernames</label>
                  {userMapping.length > 0 ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 10px', background:'var(--surface2)', borderRadius:6, border:'1px solid var(--border)' }}>
                      {associateList.map((u, i) => (
                        <span key={u} style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'var(--surface3)', color: COLORS[i % COLORS.length], border:`1px solid ${COLORS[i % COLORS.length]}40` }}>{u}</span>
                      ))}
                    </div>
                  ) : (
                    <input className="input" type="text" placeholder="user1, user2, user3  (blank = all contributors)" value={associates} onChange={e => setAssociates(e.target.value)} />
                  )}
                  <span className="token-hint">
                    {userMapping.length > 0
                      ? <>GitHub usernames are taken from the mapping table below — <button className="link-btn" onClick={() => document.getElementById('mapping-section')?.scrollIntoView({ behavior:'smooth' })}>edit mapping ↓</button></>
                      : 'Or add a GitHub ↔ Jira mapping below to auto-populate this list.'
                    }
                  </span>
                </div>
              </div>
            </section>

            {/* ── Date range ── */}
            <section className="settings-section">
              <h2 className="settings-section-title"><CalendarIcon /> Date Range</h2>
              <div className="settings-grid">
                <div className="field">
                  <label>From</label>
                  <DatePicker
                    selected={sinceDate}
                    onChange={d => d && setSinceDate(d)}
                    selectsStart startDate={sinceDate} endDate={untilDate} maxDate={untilDate}
                    dateFormat="MMM d, yyyy"
                    className="input dp-input" calendarClassName="dp-calendar"
                  />
                </div>
                <div className="field">
                  <label>To</label>
                  <DatePicker
                    selected={untilDate}
                    onChange={d => d && setUntilDate(d)}
                    selectsEnd startDate={sinceDate} endDate={untilDate}
                    minDate={sinceDate} maxDate={new Date()}
                    dateFormat="MMM d, yyyy"
                    className="input dp-input" calendarClassName="dp-calendar"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Quick select</label>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                    {QUARTER_RANGES.map(r => {
                      const active = format(sinceDate,'yyyy-MM-dd') === format(r.start,'yyyy-MM-dd');
                      return (
                        <button
                          key={r.label}
                          className={`btn ${active ? 'btn-primary' : 'btn-outline'}`}
                          style={{ padding:'5px 14px', fontWeight: r.current ? 600 : 400 }}
                          onClick={() => { setSinceDate(r.start); setUntilDate(r.end); }}
                          title={r.current ? 'Current quarter (today as end date)' : undefined}
                        >
                          {r.label}{r.current ? ' ★' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {QUICK_RANGES.map(r => (
                      <button key={r.label} className="btn btn-outline" style={{ padding:'5px 14px' }} onClick={() => applyQuickRange(r.days)}>{r.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Jira ── */}
            <section className="settings-section">
              <h2 className="settings-section-title"><JiraIcon size={16}/> Atlassian / Jira</h2>
              <div className="settings-grid">
                <div className="field">
                  <label>Jira Base URL</label>
                  <input className="input" type="text" placeholder="https://redhat.atlassian.net" value={jiraBase} onChange={e => setJiraBase(e.target.value)} />
                  <span className="token-hint">Sent to the Python backend — not called from the browser</span>
                </div>
                <div className="field">
                  <label>Atlassian Account Email <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(Cloud only)</span></label>
                  <input className="input" type="email" placeholder="you@example.com" value={jiraEmail} onChange={e => setJiraEmail(e.target.value)} />
                  <span className="token-hint">Required for Atlassian Cloud — leave blank for Jira Data Center</span>
                </div>
                <div className="field">
                  <label>API Token <span style={{ fontWeight:400, color:'var(--text-muted)' }}>(Cloud) / PAT (Data Center)</span></label>
                  <input className="input" type="password" placeholder="Paste your token here" value={jiraApiKey} onChange={e => setJiraApiKey(e.target.value)} />
                  <span className="token-hint">
                    Cloud: <strong>account.atlassian.com → Security → API tokens</strong>
                    &nbsp;·&nbsp;
                    DC: <strong>Profile → Personal Access Tokens</strong>
                  </span>
                </div>
                <div className="field" style={{ alignSelf:'end' }}>
                  <button className="btn btn-outline" onClick={handleTestJira} style={{ marginBottom:8, width:'100%' }}>
                    Test Connection
                  </button>
                  {jiraTestStatus && (
                    <div className={`alert ${jiraTestStatus === 'ok' ? 'alert-info' : 'alert-error'}`} style={{ marginTop:8 }}>
                      {jiraTestStatus === 'ok' ? '✓ ' : '✗ '}{jiraTestMsg}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Username mapping ── */}
            <section id="mapping-section" className="settings-section">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <h2 className="settings-section-title" style={{ margin:0 }}>GitHub ↔ Jira Username Mapping</h2>
                  {mappingSaved && (
                    <span style={{ fontSize:12, color:'var(--accent2)', fontWeight:500, transition:'opacity .3s' }}>✓ Saved</span>
                  )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-outline" style={{ padding:'4px 12px', fontSize:12 }} onClick={addMappingRow}>+ Add row</button>
                  <button className="btn btn-outline" style={{ padding:'4px 12px', fontSize:12 }} onClick={handleExportConfig} title="Download all settings as a JSON file">↓ Export config</button>
                  <label className="btn btn-outline" style={{ padding:'4px 12px', fontSize:12, cursor:'pointer' }} title="Restore settings from a previously exported JSON file">
                    ↑ Import config
                    <input type="file" accept=".json" style={{ display:'none' }} onChange={handleImportConfig} />
                  </label>
                </div>
              </div>
              <p style={{ margin:'0 0 12px', fontSize:12, color:'var(--text-muted)' }}>
                Type a name or email in the Jira column, click <strong>🔍 Lookup</strong>, then select the person.
                The display name is shown in the UI — the underlying Cloud accountId is stored automatically.
              </p>
              <div className="mapping-table">
                <div className="mapping-header" style={{ gridTemplateColumns:'1fr 1fr auto auto' }}>
                  <span>GitHub Username</span>
                  <span>Jira Username</span>
                  <span/>
                  <span/>
                </div>
                {mappings.map((row, i) => {
                  const ls = lookupState[i] || {};
                  const resolved = !!row.jiraDisplay;
                  return (
                    <div key={i} style={{ display:'contents' }}>
                      <div className="mapping-row" style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:8, alignItems:'start', padding:'6px 16px' }}>
                        <input className="input" placeholder="github-login" value={row.github}
                          onChange={e => updateMapping(i,'github',e.target.value)} />

                        {/* Jira column — show resolved pill when accountId has a display label */}
                        {resolved ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                            <div style={{
                              flex:1, background:'var(--surface2)', border:'1px solid var(--border)',
                              borderRadius:6, padding:'5px 10px', fontSize:13, minWidth:0,
                            }}>
                              <div style={{ fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {row.jiraDisplay}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {row.jira}
                              </div>
                            </div>
                            <button
                              className="btn btn-outline"
                              style={{ padding:'3px 7px', fontSize:11, whiteSpace:'nowrap', flexShrink:0 }}
                              title="Clear and re-enter"
                              onClick={() => updateMapping(i, 'jira', '')}
                            >✎</button>
                          </div>
                        ) : (
                          <input className="input" placeholder="Search name/email then click Lookup" value={row.jira}
                            onChange={e => { updateMapping(i,'jira',e.target.value); setLookupState(s => ({ ...s, [i]: undefined })); }} />
                        )}

                        <button
                          className="btn btn-outline"
                          style={{ padding:'4px 10px', fontSize:12, whiteSpace:'nowrap' }}
                          disabled={ls.loading || !row.jira.trim()}
                          onClick={() => lookupJiraUser(i)}
                          title="Search Jira for this user"
                        >
                          {ls.loading ? '…' : '🔍 Lookup'}
                        </button>
                        <button className="mapping-remove" onClick={() => { removeMappingRow(i); setLookupState(s => { const n={...s}; delete n[i]; return n; }); }} title="Remove">✕</button>
                      </div>
                      {ls.error && (
                        <div style={{ gridColumn:'1 / -1', padding:'0 16px 6px', fontSize:12, color:'var(--error)' }}>{ls.error}</div>
                      )}
                      {ls.results?.length > 0 && (
                        <div style={{ gridColumn:'1 / -1', padding:'0 16px 8px' }}>
                          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>Select to apply:</div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            {ls.results.map(u => {
                              const label = [u.displayName, u.email].filter(Boolean).join(' · ');
                              return (
                                <button
                                  key={u.username}
                                  className="btn btn-outline"
                                  style={{ fontSize:12, padding:'4px 12px', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}
                                  onClick={() => {
                                    setMappings(m => m.map((r, idx) => idx === i
                                      ? { ...r, jira: u.username, jiraDisplay: label || u.username }
                                      : r
                                    ));
                                    setLookupState(s => ({ ...s, [i]: undefined }));
                                  }}
                                >
                                  <span style={{ fontWeight:500 }}>{u.displayName || u.username}</span>
                                  {u.email && <span style={{ color:'var(--text-muted)', fontSize:11 }}>{u.email}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {mappings.length === 0 && (
                  <div style={{ padding:'14px 16px', color:'var(--text-muted)', fontSize:13 }}>No mappings — click "+ Add row"</div>
                )}
              </div>
            </section>

            {/* ── Fetch buttons ── */}
            <section className="settings-section">
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {/* Fetch All */}
                <button
                  className="btn btn-primary"
                  onClick={handleFetchAll}
                  disabled={fetchAllLoading}
                  style={{ flex:'1 1 200px', justifyContent:'center', padding:'10px', fontSize:14 }}
                >
                  {fetchAllLoading
                    ? <><span className="spinner" style={{ width:15, height:15, borderWidth:2 }}/> Fetching GitHub &amp; Jira…</>
                    : <>↻ Fetch All  <span style={{ opacity:.6, fontSize:12, fontWeight:400 }}>(GitHub + Jira)</span></>}
                </button>

                {/* GitHub only */}
                <button
                  className="btn btn-outline"
                  onClick={handleFetchGitHub}
                  disabled={ghLoading || jiraLoading}
                  style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
                  title="Fetch only GitHub data"
                >
                  {ghLoading
                    ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2 }}/> GitHub…</>
                    : <><GitHubIcon size={14}/> {ghFetched && !ghError ? '↻ Re-fetch GitHub' : 'Fetch GitHub'}</>}
                </button>

                {/* Jira only */}
                <button
                  className="btn btn-outline"
                  onClick={handleFetchJira}
                  disabled={ghLoading || jiraLoading}
                  style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
                  title="Fetch only Jira data"
                >
                  {jiraLoading
                    ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2 }}/> Jira…</>
                    : <><JiraIcon size={14}/> {jiraFetched && !jiraError ? '↻ Re-fetch Jira' : 'Fetch Jira'}</>}
                </button>
              </div>

              {/* Status row */}
              <div style={{ marginTop:10, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                {ghFetched && !ghError   && <span className="status-pill" style={{ color:'var(--accent2)' }}>✓ GitHub fetched</span>}
                {jiraFetched && !jiraError && <span className="status-pill" style={{ color:'#2684FF' }}>✓ Jira fetched</span>}
                {demoMode && <span className="status-pill" style={{ color:'#d2a8ff' }}>🎭 Demo mode active</span>}
                {ghError   && <span className="status-pill" style={{ color:'var(--danger)' }}>✗ GitHub error — use Fetch GitHub to retry</span>}
                {jiraError && <span className="status-pill" style={{ color:'var(--danger)' }}>✗ Jira error — use Fetch Jira to retry</span>}
              </div>

              {/* Demo data */}
              <div style={{ marginTop:16, padding:'14px 16px', background:'var(--surface2)', borderRadius:8, border:'1px dashed var(--border)' }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:6, color:'#d2a8ff' }}>🎭 Demo Mode</div>
                <p style={{ margin:'0 0 10px', fontSize:12, color:'var(--text-muted)' }}>
                  Load synthetic data for 5 fictional team members — perfect for demos without needing GitHub or Jira credentials.
                </p>
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    className="btn btn-outline"
                    style={{ borderColor:'#d2a8ff', color:'#d2a8ff', fontSize:13, padding:'6px 16px' }}
                    onClick={handleLoadDemo}
                  >
                    🎭 Load Demo Data
                  </button>
                  {demoMode && (
                    <button
                      className="btn btn-outline"
                      style={{ fontSize:13, padding:'6px 16px' }}
                      onClick={handleClearDemo}
                    >
                      ✕ Clear Demo
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ══ GitHub tab ═════════════════════════════════════════════════════ */}
        {tab === 'github' && (
          <>
            {ghError && <div className="alert alert-error">{ghError}</div>}
            {!ghFetched && !ghLoading && (
              <div className="empty-state">
                <GitHubIcon />
                <p>Enter your GitHub token and click "Fetch GitHub"</p>
              </div>
            )}
            {ghLoading && <div className="loading-overlay"><div className="spinner"/>Fetching from Azure/ARO-HCP…</div>}

            {ghFetched && !ghLoading && (
              <>
                {/* Contributor chips */}
                {contributors.length > 0 && (
                  <div className="filters-row">
                    <div className="filter-group">
                      <label>Filter by contributor</label>
                      <div className="chip-list">
                        <button
                          className={`chip chip-all ${!activeAssociate && selectedAuthors.length === 0 ? 'active' : ''}`}
                          onClick={() => { setActiveAssociate(null); setSelectedAuthors([]); setGhPage(1); }}
                        >All</button>
                        {contributors.map((c, i) => (
                          <button
                            key={c.login}
                            className={`chip ${activeAssociate === c.login || (!activeAssociate && selectedAuthors.includes(c.login)) ? 'active' : ''}`}
                            onClick={() => {
                              // Clicking a chip sets the global associate filter
                              setActiveAssociate(prev => prev === c.login ? null : c.login);
                              setSelectedAuthors([]);
                              setGhPage(1);
                            }}
                          >
                            {c.avatarUrl && <img src={c.avatarUrl} alt="" />}
                            {c.login}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="stats-grid">
                  {[
                    { label:'Total Commits', value: ghStats.total.toLocaleString(), sub:'in selected range', color:'var(--accent)' },
                    { label:'Contributors',  value: ghStats.uniqueAuthors, sub:'active authors', color:'var(--accent2)' },
                    { label:'Active Days',   value: ghStats.activeDays,    sub:'days with commits', color:'var(--accent4)' },
                    { label:'Avg / Day',     value: ghStats.avgPerDay,     sub:'commits per active day', color:'var(--accent5)' },
                  ].map(s => (
                    <div key={s.label} className="stat-card">
                      <div className="label">{s.label}</div>
                      <div className="value" style={{ color: s.color }}>{s.value}</div>
                      <div className="sub">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div className="charts-grid">
                  {/* Commits over time */}
                  <div className="chart-card full-width">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <h3 style={{ margin:0 }}>Commits Over Time</h3>
                      <div className="day-hover-bar">
                        {hoveredDay ? (
                          <>
                            <span className="day-hover-date">{hoveredDay.date}</span>
                            <span className="day-hover-count">{hoveredDay.commits} commit{hoveredDay.commits !== 1 ? 's' : ''}</span>
                            {hoveredDay.commits > 0 && (
                              <a className="day-hover-link"
                                href={`https://github.com/Azure/ARO-HCP/commits/main/?since=${hoveredDay.isoDate}T00:00:00Z&until=${hoveredDay.isoDate}T23:59:59Z${selectedAuthors.length===1?`&author=${selectedAuthors[0]}`:''}`}
                                target="_blank" rel="noreferrer">
                                View on GitHub ↗
                              </a>
                            )}
                          </>
                        ) : <span className="day-hover-hint">↖ Hover a day to pin it</span>}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={commitsPerDayData} margin={{ top:4, right:8, left:-20, bottom:0 }}
                        onMouseMove={d => { const p = d?.activePayload?.[0]?.payload; if (p) setHoveredDay(p); }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="date" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false}
                          interval={Math.max(0, Math.floor(commitsPerDayData.length/10)-1)} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="commits" stroke="#58a6ff" strokeWidth={2} dot={false} activeDot={{ r:5, strokeWidth:0 }} name="Commits" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* By author */}
                  <div className="chart-card">
                    <h3>Commits by Author</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={commitsPerAuthorData} layout="vertical" margin={{ top:0, right:16, left:20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
                        <XAxis type="number" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="author" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} width={90} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="commits" name="Commits" radius={[0,4,4,0]}>
                          {commitsPerAuthorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Day of week */}
                  <div className="chart-card">
                    <h3>Activity by Day of Week</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={dowData} margin={{ top:0, right:8, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="day" tick={{ fill:'#8b949e', fontSize:12 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="commits" name="Commits" radius={[4,4,0,0]}>
                          {dowData.map((_, i) => <Cell key={i} fill={i===0||i===6?'#f78166':'#3fb950'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly stacked */}
                  {weeklyStackedData.authors.length > 0 && (
                    <div className="chart-card full-width">
                      <h3>Weekly Commits by Author (Stacked)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={weeklyStackedData.data} margin={{ top:4, right:8, left:-20, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis dataKey="week" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                          <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                          {weeklyStackedData.authors.map((a, i) => (
                            <Bar key={a} dataKey={a} stackId="a" fill={COLORS[i % COLORS.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Pie */}
                  {commitsPerAuthorData.length > 1 && (
                    <div className="chart-card">
                      <h3>Contribution Share</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={commitsPerAuthorData} dataKey="commits" nameKey="author"
                            cx="50%" cy="50%" outerRadius={90}
                            label={({ author, percent }) => `${author} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                            {commitsPerAuthorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, color:'#e6edf3' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* ── PR Activity ─────────────────────────────────────────── */}
                {Object.keys(prMetrics).filter(k => k !== '_rateLimited').length > 0 && (() => {
                  const prRows = (activeAssociate
                    ? [activeAssociate]
                    : associateList
                  ).map((login, i) => ({ login, ...prMetrics[login] ?? {}, colorIdx: i }))
                   .filter(r => r.prsOpened != null);
                  if (!prRows.length) return null;
                  const totalPRs = prRows.reduce((s,r) => s + (r.prsOpened ?? 0), 0);
                  return (
                    <>
                      {/* Warning / info note */}
                      {prFetchNote && (
                        <div className="alert alert-warn" style={{ marginTop:8 }}>{prFetchNote}</div>
                      )}
                      {!prFetchNote && totalPRs === 0 && (
                        <div className="alert" style={{ marginTop:8, background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:13 }}>
                          No PRs found for <strong style={{ color:'var(--text)' }}>{prRows.map(r=>r.login).join(', ')}</strong> in {since}–{until} in <code>Azure/ARO-HCP</code>.
                          Verify the GitHub usernames in the mapping table match their GitHub accounts, and that the date range covers their activity.
                        </div>
                      )}
                      {/* PR Stats row */}
                      <div className="stats-grid" style={{ marginTop:8 }}>
                        {[
                          { label:'PRs Opened',    value: prRows.reduce((s,r)=>s+(r.prsOpened??0),0),   color:'var(--accent)' },
                          { label:'PRs Merged',    value: prRows.reduce((s,r)=>s+(r.prsMerged??0),0),   color:'var(--accent2)' },
                          { label:'Reviews Given', value: prRows.reduce((s,r)=>s+(r.prsReviewed??0),0), color:'var(--accent4)' },
                          { label:'Review Comments', value: prRows.reduce((s,r)=>s+(r.reviewComments??0),0), color:'#d2a8ff' },
                          { label:'Avg Cycle Time', value: (() => {
                              const vals = prRows.map(r=>r.avgCycleTimeDays).filter(v=>v!=null);
                              return vals.length ? `${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)}d` : '—';
                            })(), color:'var(--accent5)' },
                          { label:'Churn Rate', tip: PR_CHURN_TIP, value: (() => {
                              const vals = prRows.map(r=>r.churnPct).filter(v=>v!=null);
                              return vals.length ? `${Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)}%` : '—';
                            })(), color:'var(--danger)' },
                        ].map(s => (
                          <div key={s.label} className="stat-card">
                            <div className="label">{s.label}{s.tip && <InfoTip text={s.tip} />}</div>
                            <div className="value" style={{ color:s.color }}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* PR charts */}
                      <div className="charts-grid" style={{ marginTop:8 }}>
                        {/* PRs Opened vs Merged */}
                        <div className="chart-card">
                          <h3>PRs Opened vs Merged</h3>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={prRows} margin={{ top:0, right:8, left:-20, bottom:0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="login" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                              <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                              <Tooltip content={<ChartTooltip />} />
                              <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                              <Bar dataKey="prsOpened" name="Opened" fill="var(--accent)"  radius={[4,4,0,0]} />
                              <Bar dataKey="prsMerged" name="Merged" fill="var(--accent2)" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Reviews given + review comments */}
                        <div className="chart-card">
                          <h3>Code Reviews Given</h3>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={prRows} margin={{ top:0, right:8, left:-20, bottom:0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="login" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                              <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                              <Tooltip content={<ChartTooltip />} />
                              <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                              <Bar dataKey="prsReviewed"    name="PRs Reviewed"    fill="var(--accent4)" radius={[4,4,0,0]} />
                              <Bar dataKey="reviewComments" name="Review Comments" fill="#d2a8ff"         radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* PR Churn: opened vs churned + avg cycle time */}
                        <div className="chart-card full-width">
                          <h3>PR Churn &amp; Cycle Time <InfoTip text={PR_CHURN_TIP} />
                            <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>
                              Lower churn % is better.
                            </span>
                          </h3>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={prRows} margin={{ top:0, right:40, left:-20, bottom:0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="login" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                              <YAxis yAxisId="count" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                              <YAxis yAxisId="days"  orientation="right" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} unit="d" />
                              <Tooltip content={<ChartTooltip />} />
                              <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                              <Bar yAxisId="count" dataKey="prsChurned"      name="PRs Churned"        fill="var(--danger)" radius={[4,4,0,0]} />
                              <Bar yAxisId="days"  dataKey="avgCycleTimeDays" name="Avg Cycle Time (d)" fill="var(--accent5)" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Commits table */}
                <div className="table-card">
                  <div className="table-header">
                    <h3>Commit Log <span className="badge">{filteredCommits.length.toLocaleString()}</span></h3>
                    <input className="input" type="text" placeholder="Search message or author…"
                      value={searchMsg} onChange={e => { setSearchMsg(e.target.value); setGhPage(1); }} style={{ width:260 }} />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>SHA</th><th>Author</th><th>Message</th><th>Date</th></tr></thead>
                      <tbody>
                        {pagedCommits.length === 0 ? (
                          <tr><td colSpan={4} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No commits match current filters</td></tr>
                        ) : pagedCommits.map(c => (
                          <tr key={c.sha}>
                            <td><a className="commit-sha" href={c.url} target="_blank" rel="noreferrer">{c.sha.slice(0,7)}</a></td>
                            <td><div className="commit-author">{c.authorAvatar && <img src={c.authorAvatar} alt="" />}{c.author}</div></td>
                            <td><span className="commit-msg" title={c.message}>{c.message}</span></td>
                            <td className="commit-date">{fmtDate(c.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {Math.ceil(filteredCommits.length / PAGE_SIZE) > 1 && (
                    <div className="pagination">
                      <button className="btn btn-outline" onClick={() => setGhPage(p => Math.max(1,p-1))} disabled={ghPage===1} style={{ padding:'4px 12px' }}>←</button>
                      <span>Page {ghPage} of {Math.ceil(filteredCommits.length / PAGE_SIZE)}</span>
                      <button className="btn btn-outline" onClick={() => setGhPage(p => Math.min(Math.ceil(filteredCommits.length/PAGE_SIZE),p+1))} disabled={ghPage===Math.ceil(filteredCommits.length/PAGE_SIZE)} style={{ padding:'4px 12px' }}>→</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ══ Jira tab ═══════════════════════════════════════════════════════ */}
        {tab === 'jira' && (
          <>
            {backendUp === false && (
              <div className="alert alert-error" style={{ fontFamily:'monospace', whiteSpace:'pre-wrap' }}>
                <div>
                  <strong>Python backend is not running.</strong>{'\n'}
                  Open a terminal and run:{'\n\n'}
                  {'  cd "' + window.location.pathname.split('/')[0] + 'aro-hcp-dashboard/backend"'}{'\n'}
                  {'  pip install -r requirements.txt'}{'\n'}
                  {'  uvicorn main:app --reload --port 8000'}
                </div>
              </div>
            )}
            {jiraError && (
              <div className="alert alert-error">
                {jiraError}
                {(jiraError.includes('403') || jiraError.includes('401')) && (
                  <span style={{ display:'block', marginTop:4, fontSize:12 }}>
                    Token rejected. For Atlassian Cloud go to <strong>account.atlassian.com → Security → API tokens</strong>. For Jira Data Center go to <strong>Profile → Personal Access Tokens</strong>. Make sure the email field is filled in for Cloud.
                  </span>
                )}
                {jiraError.toLowerCase().includes('fetch') && (
                  <span style={{ display:'block', marginTop:4, fontSize:12 }}>
                    Cannot reach the backend — make sure the Python server is running:
                    <code style={{ display:'block', marginTop:4, background:'var(--surface2)', padding:'4px 8px', borderRadius:4 }}>
                      cd backend &amp;&amp; uvicorn main:app --reload --port 8000
                    </code>
                  </span>
                )}
              </div>
            )}
            {!jiraFetched && !jiraLoading && (
              <div className="empty-state">
                <JiraIcon size={40} />
                <p>Enter Jira credentials and click "Fetch Jira"</p>
                <span>Fill the username mapping so issues map back to GitHub contributors</span>
              </div>
            )}
            {jiraLoading && <div className="loading-overlay"><div className="spinner"/>Fetching Jira issues…</div>}

            {jiraFetched && !jiraLoading && (
              <>
                {/* Stats — based on filtered issues */}
                <div className="stats-grid">
                  {[
                    { label:'Total Issues',     value: filteredJiraIssues.length, color:'#2684FF' },
                    { label:'Open / In Flight', value: filteredJiraIssues.filter(i => !i.statusCategory?.toLowerCase().includes('done')).length, color:'var(--accent5)' },
                    { label:'Done',             value: filteredJiraIssues.filter(i => i.statusCategory?.toLowerCase().includes('done')).length, color:'var(--accent2)' },
                    { label:'Avg Cycle Time',   value: (() => {
                        const v = filteredJiraIssues.map(i => i.cycleTime).filter(v => v !== null);
                        return v.length ? `${Math.round(v.reduce((a,b)=>a+b,0)/v.length)}d` : '—';
                      })(), color:'var(--accent4)' },
                    { label:'Total Spillovers', value: filteredJiraIssues.reduce((s,i)=>s+i.spillovers,0), color:'var(--danger)' },
                  ].map(s => (
                    <div key={s.label} className="stat-card">
                      <div className="label">{s.label}</div>
                      <div className="value" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Filters */}
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                  {/* Associate filter */}
                  {associateOptions.length > 0 && (
                    <div className="filters-row" style={{ marginBottom:0 }}>
                      <div className="filter-group">
                        <label>Associate</label>
                        <div className="chip-list">
                          <button
                            className={`chip chip-all ${!activeAssociate ? 'active' : ''}`}
                            onClick={() => { setActiveAssociate(null); setJiraPage(1); }}
                          >All</button>
                          {associateOptions.map((opt, i) => (
                            <button
                              key={opt.github}
                              className={`chip ${activeAssociate === opt.github ? 'active' : ''}`}
                              style={{ borderColor: activeAssociate === opt.github ? COLORS[i % COLORS.length] : undefined }}
                              onClick={() => { setActiveAssociate(prev => prev === opt.github ? null : opt.github); setJiraPage(1); }}
                            >
                              {opt.github}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Status + search row */}
                  <div className="filters-row" style={{ marginBottom:0 }}>
                    <div className="filter-group">
                      <label>Status</label>
                      <div className="chip-list">
                        {['all','open','done'].map(f => (
                          <button key={f} className={`chip ${jiraFilter===f?'active':''}`}
                            onClick={() => { setJiraFilter(f); setJiraPage(1); }}>
                            {f === 'all' ? 'All' : f === 'open' ? 'Open / In-flight' : 'Done'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="filter-group" style={{ marginLeft:'auto' }}>
                      <label>Search</label>
                      <input className="input" type="text" placeholder="Key, summary, assignee…"
                        value={jiraSearch} onChange={e => { setJiraSearch(e.target.value); setJiraPage(1); }} style={{ width:240 }} />
                    </div>
                  </div>
                </div>

                {/* ── Contribution Share charts ── */}
                {jiraContribData.length > 1 && (
                  <div className="charts-grid" style={{ marginBottom: 20 }}>
                    {/* Pie — total issue share */}
                    <div className="chart-card">
                      <h3>Contribution Share
                        <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>by total issues</span>
                      </h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={jiraContribData} dataKey="total" nameKey="label"
                            cx="50%" cy="50%" outerRadius={90}
                            label={({ label, percent }) => `${label} ${(percent*100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {jiraContribData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, color:'#e6edf3' }}
                            formatter={(v, _n, props) => [`${v} issues (${props.payload.done} done, ${props.payload.open} open)`, props.payload.fullLabel]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Pie — done-only share */}
                    {jiraContribData.some(p => p.done > 0) && (
                      <div className="chart-card">
                        <h3>Done Issues Share
                          <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>completed in period</span>
                        </h3>
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={jiraContribData.filter(p => p.done > 0)}
                              dataKey="done" nameKey="label"
                              cx="50%" cy="50%" outerRadius={90}
                              label={({ label, percent }) => `${label} ${(percent*100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {jiraContribData.filter(p => p.done > 0).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, color:'#e6edf3' }}
                              formatter={(v, _n, props) => [`${v} done${props.payload.sp ? ` · ${props.payload.sp} SP` : ''}`, props.payload.fullLabel]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Bar — done vs open stacked */}
                    <div className="chart-card">
                      <h3>Issues by Associate
                        <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>done vs open</span>
                      </h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={jiraContribData} margin={{ top:0, right:16, left:-20, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis dataKey="label" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                          <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                          <Bar dataKey="done" name="Done"        stackId="a" fill="#3fb950" radius={[0,0,0,0]} />
                          <Bar dataKey="open" name="Open/Active" stackId="a" fill="#ffa657" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Story points bar (only if any SP data) */}
                    {jiraContribData.some(p => p.sp > 0) && (
                      <div className="chart-card">
                        <h3>Story Points Completed
                          <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>done issues only</span>
                        </h3>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={jiraContribData} margin={{ top:0, right:16, left:-20, bottom:0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                            <XAxis dataKey="label" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                            <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="sp" name="Story Points" radius={[4,4,0,0]}>
                              {jiraContribData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* Issues table */}
                <div className="table-card">
                  <div className="table-header">
                    <h3>Jira Issues <span className="badge">{filteredJiraIssues.length}</span></h3>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            { label: 'Key',         key: 'key' },
                            { label: 'Summary',     key: 'summary' },
                            { label: 'Assignee',    key: 'assignee' },
                            { label: 'Status',      key: 'status' },
                            { label: 'Priority',    key: 'priority' },
                            { label: 'Days Active', key: 'daysActive' },
                            { label: 'Spillovers',  key: 'spillovers' },
                            { label: 'Cycle Time',  key: 'cycleTime' },
                            { label: 'SP',          key: 'sp' },
                            { label: 'Sprint',      key: 'sprint' },
                            { label: 'GitHub Links', key: null },
                          ].map(({ label, key }) => (
                            <th key={label}
                              onClick={key ? () => handleJiraSort(key) : undefined}
                              style={key ? { cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' } : {}}
                            >
                              {label}
                              {key && (
                                <span style={{ marginLeft: 4, opacity: jiraSortKey === key ? 1 : 0.25, fontSize: 10 }}>
                                  {jiraSortKey === key ? (jiraSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedJira.length === 0 ? (
                          <tr><td colSpan={11} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No issues match current filters</td></tr>
                        ) : pagedJira.map(issue => {
                          const links = remoteLinks[issue.key] ?? [];
                          const isExpanded = expandedIssue === issue.key;
                          return (
                            <>
                              <tr key={issue.key} style={{ cursor: links.length ? 'pointer' : 'default' }}
                                onClick={() => setExpandedIssue(isExpanded ? null : issue.key)}>
                                <td>
                                  <a href={issue.url} target="_blank" rel="noreferrer"
                                    className="commit-sha" onClick={e => e.stopPropagation()}>
                                    {issue.key}
                                  </a>
                                </td>
                                <td><span className="commit-msg" title={issue.summary}>{issue.summary}</span></td>
                                <td style={{ whiteSpace:'nowrap' }}>{issue.assigneeDisplay}</td>
                                <td>
                                  <span style={{ color: statusColor(issue.status), fontWeight:600, fontSize:12 }}>
                                    {issue.status}
                                  </span>
                                </td>
                                <td style={{ whiteSpace:'nowrap' }}>{priorityIcon(issue.priority)} {issue.priority}</td>
                                <td>
                                  {issue.daysInProgress !== null
                                    ? <span className={`days-badge ${issue.daysInProgress > 14 ? 'warn' : ''}`}>{issue.daysInProgress}d</span>
                                    : '—'}
                                </td>
                                <td>
                                  {issue.spillovers > 0
                                    ? <span className="days-badge warn">{issue.spillovers}×</span>
                                    : <span style={{ color:'var(--accent2)' }}>0</span>}
                                </td>
                                <td>{issue.cycleTime !== null ? `${issue.cycleTime}d` : '—'}</td>
                                <td>{issue.storyPoints ?? '—'}</td>
                                <td style={{ fontSize:11, color:'var(--text-muted)', maxWidth:130, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                  {issue.currentSprint?.name ?? '—'}
                                </td>
                                <td>
                                  {links.length > 0
                                    ? <span className="badge" style={{ cursor:'pointer' }}>{links.length} link{links.length>1?'s':''} {isExpanded?'▲':'▼'}</span>
                                    : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}
                                </td>
                              </tr>
                              {/* Expanded GitHub links row */}
                              {isExpanded && links.length > 0 && (
                                <tr key={`${issue.key}-links`} style={{ background:'var(--surface2)' }}>
                                  <td colSpan={11} style={{ padding:'8px 16px' }}>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                      {links.map((l, idx) => (
                                        <a key={idx} href={l.object.url} target="_blank" rel="noreferrer"
                                          className="gh-link-chip">
                                          <GitHubIcon size={13} />
                                          {l.object.title || l.object.url.split('/').slice(-2).join('/')}
                                        </a>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {jiraTotalPages > 1 && (
                    <div className="pagination">
                      <button className="btn btn-outline" onClick={() => setJiraPage(p=>Math.max(1,p-1))} disabled={jiraPage===1} style={{ padding:'4px 12px' }}>←</button>
                      <span>Page {jiraPage} of {jiraTotalPages}</span>
                      <button className="btn btn-outline" onClick={() => setJiraPage(p=>Math.min(jiraTotalPages,p+1))} disabled={jiraPage===jiraTotalPages} style={{ padding:'4px 12px' }}>→</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ══ Performance tab ════════════════════════════════════════════════ */}
        {tab === 'performance' && (
          <>
            {/* ── Disclaimer banner ── */}
            <div style={{
              background: 'linear-gradient(90deg, rgba(210,168,255,0.08), rgba(88,166,255,0.08))',
              border: '1px solid rgba(210,168,255,0.25)',
              borderRadius: 8,
              padding: '12px 18px',
              marginBottom: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1.4, flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 3 }}>
                  This dashboard measures activity signals — not performance.
                </strong>
                Commit counts, issue throughput, and sprint metrics are <em>quantitative proxies</em> that
                provide context for conversations. They do not capture code quality, collaboration, mentoring,
                on-call impact, complexity of work, or other critical contributions.{' '}
                <strong style={{ color: '#d2a8ff' }}>
                  Use this data to inform — never to replace — a holistic, human judgement of an engineer's performance.
                  Managers should exercise their own discretion and contextual knowledge when interpreting any metric shown here.
                </strong>
              </div>
            </div>

            {!ghFetched && !jiraFetched && (
              <div className="empty-state">
                <span style={{ fontSize:40 }}>📊</span>
                <p>Fetch GitHub and/or Jira data first</p>
              </div>
            )}

            {(ghFetched || jiraFetched) && perfData.length === 0 && (
              <div className="alert alert-info">
                No associates matched. Make sure GitHub usernames match the data or set up the username mapping.
              </div>
            )}

            {perfData.length > 0 && (
              <>
                {/* Associate filter chips */}
                <div className="filters-row" style={{ marginBottom:20 }}>
                  <div className="filter-group">
                    <label>View associate</label>
                    <div className="chip-list">
                      <button
                        className={`chip chip-all ${activeAssociate === null ? 'active' : ''}`}
                        onClick={() => setActiveAssociate(null)}
                      >
                        All team
                      </button>
                      {perfData.map((p, i) => (
                        <button
                          key={p.github}
                          className={`chip ${activeAssociate === p.github ? 'active' : ''}`}
                          style={{ borderColor: activeAssociate === p.github ? COLORS[i % COLORS.length] : undefined }}
                          onClick={() => setActiveAssociate(prev => prev === p.github ? null : p.github)}
                        >
                          {p.github}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeAssociate && (
                    <div className="badge" style={{ alignSelf:'center', background:'rgba(88,166,255,0.1)', color:'var(--accent)', padding:'4px 12px', fontSize:12 }}>
                      1:1 view — {activeAssociate}
                    </div>
                  )}
                </div>

                {/* Per-person stat cards */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:24 }}>
                  {perfData.filter(p => !activeAssociate || p.github === activeAssociate).map((p, i) => (
                    <div key={p.github} className={`perf-card ${activeAssociate === p.github ? 'perf-card-focused' : ''}`} style={{ borderColor: COLORS[perfData.indexOf(p) % COLORS.length] }}>
                      <div className="perf-name" style={{ color: COLORS[i % COLORS.length] }}>{p.github}</div>
                      {p.jira !== p.github && <div className="perf-sub">{p.jira} (Jira)</div>}
                      <div className="perf-metrics">
                        <div className="perf-metric"><span>Commits</span><strong>{p.commits}</strong></div>
                        <div className="perf-metric"><span>Active Days</span><strong>{p.activeDays}</strong></div>
                        <div className="perf-metric"><span>Issues Done</span><strong style={{ color:'var(--accent2)' }}>{p.issuesDone}</strong></div>
                        <div className="perf-metric"><span>Issues Open</span><strong style={{ color:'var(--accent5)' }}>{p.issuesOpen}</strong></div>
                        <div className="perf-metric"><span>Avg Cycle</span><strong>{p.avgCycleTime !== null ? `${p.avgCycleTime}d` : '—'}</strong></div>
                        <div className="perf-metric"><span>Spillovers</span><strong style={{ color: p.totalSpillovers>0?'var(--danger)':'var(--accent2)' }}>{p.totalSpillovers}</strong></div>
                        <div className="perf-metric"><span>Story Pts</span><strong style={{ color:'var(--accent4)' }}>{p.totalSP || '—'}</strong></div>
                        {/* PR metrics */}
                        {prMetrics[p.github] && <>
                          <div className="perf-metric" style={{ borderTop:'1px solid var(--border)', gridColumn:'1/-1', paddingTop:4, marginTop:2 }}/>
                          <div className="perf-metric"><span>PRs Merged</span><strong style={{ color:'var(--accent)' }}>{prMetrics[p.github].prsMerged ?? '—'}</strong></div>
                          <div className="perf-metric"><span>Reviews Given</span><strong style={{ color:'var(--accent4)' }}>{prMetrics[p.github].prsReviewed ?? '—'}</strong></div>
                          <div className="perf-metric"><span>Review Comments</span><strong style={{ color:'#d2a8ff' }}>{prMetrics[p.github].reviewComments ?? '—'}</strong></div>
                          <div className="perf-metric"><span>PR Cycle Time</span><strong>{prMetrics[p.github].avgCycleTimeDays != null ? `${prMetrics[p.github].avgCycleTimeDays}d` : '—'}</strong></div>
                          <div className="perf-metric"><span>PR Churn <InfoTip text={PR_CHURN_TIP} /></span><strong style={{ color: (prMetrics[p.github].churnPct??0)>60?'var(--danger)':'inherit' }}>{prMetrics[p.github].churnPct != null ? `${prMetrics[p.github].churnPct}%` : '—'}</strong></div>
                        </>}
                        <div className="perf-metric"><span>Last Commit</span><strong style={{ fontSize:11 }}>{p.lastCommit ? fmtDate(p.lastCommit) : '—'}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts — filtered to selected associate when in 1:1 mode */}
                {(() => {
                  const chartPerf = activeAssociate
                    ? perfData.filter(p => p.github === activeAssociate)
                    : perfData;
                  return (
                <div className="charts-grid">
                  {/* Commits vs Issues Done */}
                  <div className="chart-card">
                    <h3>Commits vs Issues Resolved</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartPerf} margin={{ top:0, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="github" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="commits"     name="Commits"        fill="#58a6ff" radius={[4,4,0,0]} />
                        <Bar dataKey="issuesDone"  name="Issues Resolved" fill="#3fb950" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Cycle time comparison */}
                  <div className="chart-card">
                    <h3>Average Cycle Time (days) &amp; Spillovers</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartPerf} margin={{ top:0, right:16, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="github" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="avgCycleTime"       name="Avg Cycle Time (d)"  fill="#d2a8ff" radius={[4,4,0,0]} />
                        <Bar dataKey="totalSpillovers"    name="Sprint Spillovers"   fill="#f78166" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Radar — metric-centric, one Radar series per person */}
                  {radarShaped.length > 0 && (
                    <div className="chart-card full-width">
                      <h3>Relative Performance Radar
                        <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>
                          each axis normalised to team max = 100
                          {activeAssociate && <> · {activeAssociate}</>}
                        </span>
                      </h3>
                      <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 8px' }}>
                        Shows how each person scores on 5 dimensions relative to the top performer (100 = best in team).
                        <strong style={{ color:'var(--accent2)' }}> Low Spillover</strong> is inverted — 100 means zero sprint spillovers.
                      </p>
                      <ResponsiveContainer width="100%" height={360}>
                        <RadarChart data={radarShaped} margin={{ top:20, right:80, left:80, bottom:20 }}>
                          <PolarGrid stroke="#30363d" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill:'#8b949e', fontSize:12 }} />
                          {(activeAssociate
                            ? perfData.filter(p => p.github === activeAssociate)
                            : perfData
                          ).map((p, i) => (
                            <Radar key={p.github} name={p.github} dataKey={p.github}
                              stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />
                          ))}
                          <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                          <Tooltip
                            contentStyle={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' }}
                            formatter={(v) => [`${v}`, undefined]}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Story points done */}
                  {chartPerf.some(p => p.totalSP > 0) && (
                    <div className="chart-card">
                      <h3>Story Points Completed</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={chartPerf} margin={{ top:0, right:16, left:-20, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis dataKey="github" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                          <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="totalSP" name="Story Points" radius={[4,4,0,0]}>
                            {chartPerf.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                ); })()}

                {/* Summary table */}
                <div className="table-card">
                  <div className="table-header">
                    <h3>Performance Summary {activeAssociate && <span className="badge">{activeAssociate}</span>}</h3>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Associate</th>
                          <th>Commits</th>
                          <th>Active Days</th>
                          <th>Issues Done</th>
                          <th>Issues Open</th>
                          <th>Avg Cycle (d)</th>
                          <th>Spillovers</th>
                          <th>Story Points</th>
                          <th>PRs Merged</th>
                          <th>Reviews Given</th>
                          <th>Review Comments</th>
                          <th>PR Cycle (d)</th>
                          <th>PR Churn <InfoTip text={PR_CHURN_TIP} /></th>
                          <th>Last Commit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeAssociate ? perfData.filter(p => p.github === activeAssociate) : perfData).map((p, i) => (
                          <tr key={p.github}>
                            <td>
                              <div style={{ display:'flex', flexDirection:'column' }}>
                                <strong style={{ color: COLORS[i%COLORS.length] }}>{p.github}</strong>
                                {p.jira !== p.github && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{p.jira}</span>}
                              </div>
                            </td>
                            <td><strong style={{ color:'var(--accent)' }}>{p.commits}</strong></td>
                            <td>{p.activeDays}</td>
                            <td><strong style={{ color:'var(--accent2)' }}>{p.issuesDone}</strong></td>
                            <td>{p.issuesOpen}</td>
                            <td>{p.avgCycleTime !== null ? `${p.avgCycleTime}d` : '—'}</td>
                            <td>
                              <span style={{ color: p.totalSpillovers>0?'var(--danger)':'var(--accent2)', fontWeight:600 }}>
                                {p.totalSpillovers}
                              </span>
                            </td>
                            <td style={{ color:'var(--accent4)', fontWeight:600 }}>{p.totalSP || '—'}</td>
                            {/* PR columns */}
                            <td style={{ color:'var(--accent)', fontWeight:600 }}>{prMetrics[p.github]?.prsMerged ?? '—'}</td>
                            <td style={{ color:'var(--accent4)', fontWeight:600 }}>{prMetrics[p.github]?.prsReviewed ?? '—'}</td>
                            <td style={{ color:'#d2a8ff', fontWeight:600 }}>{prMetrics[p.github]?.reviewComments ?? '—'}</td>
                            <td>{prMetrics[p.github]?.avgCycleTimeDays != null ? `${prMetrics[p.github].avgCycleTimeDays}d` : '—'}</td>
                            <td>
                              {prMetrics[p.github]?.churnPct != null
                                ? <span style={{ color:(prMetrics[p.github].churnPct>60)?'var(--danger)':'inherit', fontWeight:600 }}>{prMetrics[p.github].churnPct}%</span>
                                : '—'}
                            </td>
                            <td className="commit-date">{p.lastCommit ? fmtDate(p.lastCommit) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Work narrative ── */}
                {workSummary.length > 0 && (
                  <div style={{ marginTop: 32 }}>
                    {/* Section header — click to collapse entire section */}
                    <button
                      onClick={() => setWorkSummaryOpen(o => !o)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0 0 12px', marginBottom: workSummaryOpen ? 4 : 0,
                        borderBottom: workSummaryOpen ? '1px solid var(--border)' : 'none',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', transition: 'transform .2s', display: 'inline-block', transform: workSummaryOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Work Summary</span>
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
                        Meaningful Jira issues &amp; notable commits — ancillary items excluded
                      </span>
                      {!workSummaryOpen && (
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                          {workSummary.length} associate{workSummary.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>

                    {workSummaryOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                      {(activeAssociate
                        ? workSummary.filter(p => p.github === activeAssociate)
                        : workSummary
                      ).map((p, personIdx) => {
                        const color = COLORS[perfData.findIndex(d => d.github === p.github) % COLORS.length] || COLORS[personIdx % COLORS.length];
                        const doneIssues = p.jiraItems.filter(i => i.isDone);
                        const openIssues = p.jiraItems.filter(i => !i.isDone);
                        const isCollapsed = !!collapsedPersons[p.github];
                        return (
                          <div key={p.github} style={{
                            background: 'var(--surface)',
                            border: `1px solid var(--border)`,
                            borderLeft: `3px solid ${color}`,
                            borderRadius: 8,
                            overflow: 'hidden',
                          }}>
                            {/* Per-person header — click to collapse that card */}
                            <button
                              onClick={() => togglePerson(p.github)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '12px 16px',
                                borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform .2s' }}>▶</span>
                              <span style={{ fontWeight: 700, fontSize: 14, color }}>{p.github}</span>
                              {p.displayName !== p.github && (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.displayName}</span>
                              )}
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {doneIssues.length} done · {openIssues.length} open · {p.commitItems.length} commit{p.commitItems.length !== 1 ? 's' : ''}
                              </span>
                            </button>

                            {!isCollapsed && (
                            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: p.commitItems.length ? '1fr 1fr' : '1fr', gap: 16 }}>
                              {/* Jira work — all issues, each with status badge */}
                              {p.jiraItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                                    Jira Issues ({p.jiraItems.length})
                                    <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--accent2)' }}>
                                      {doneIssues.length} done
                                    </span>
                                    {openIssues.length > 0 && (
                                      <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--accent5)' }}>
                                        · {openIssues.length} open
                                      </span>
                                    )}
                                  </div>
                                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {/* Done issues first, then open */}
                                    {[...doneIssues, ...openIssues].map(issue => (
                                      <li key={issue.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                                        {/* Status badge */}
                                        <span style={{
                                          flexShrink: 0,
                                          padding: '1px 7px',
                                          borderRadius: 4,
                                          fontSize: 11,
                                          fontWeight: 600,
                                          background: issue.isDone ? 'rgba(63,185,80,0.15)' : 'rgba(255,166,87,0.15)',
                                          color: statusColor(issue.status),
                                          border: `1px solid ${statusColor(issue.status)}40`,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {issue.status}
                                        </span>
                                        {/* Issue key + title + type */}
                                        <span style={{ minWidth: 0 }}>
                                          <a href={issue.url} target="_blank" rel="noreferrer"
                                            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, marginRight: 6 }}>
                                            {issue.key}
                                          </a>
                                          <span style={{ color: 'var(--text)' }}>{issue.title}</span>
                                          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 5 }}>
                                            [{issue.issueType}] {issue.priority && issue.priority !== '—' ? `· ${priorityIcon(issue.priority)}` : ''}
                                          </span>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Notable GitHub commits */}
                              {p.commitItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                    Notable Commits ({p.commitItems.length})
                                  </div>
                                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {p.commitItems.slice(0, 20).map(c => (
                                      <li key={c.sha} style={{ fontSize: 12, lineHeight: 1.4 }}>
                                        <a href={c.url} target="_blank" rel="noreferrer"
                                          style={{ color: 'var(--text)', textDecoration: 'none' }}>
                                          {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title}
                                        </a>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 5 }}>
                                          {fmtDate(c.date)}
                                        </span>
                                      </li>
                                    ))}
                                    {p.commitItems.length > 20 && (
                                      <li style={{ fontSize: 11, color: 'var(--text-muted)', listStyle: 'none' }}>
                                        + {p.commitItems.length - 20} more commits
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                            )}

                            {/* No-data note (shown even when expanded) */}
                            {!isCollapsed && p.jiraItems.length === 0 && p.commitItems.length === 0 && (
                              <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
                                No meaningful work items found in this date range.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
