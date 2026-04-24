import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { fetchContributors, fetchPRMetrics, fetchMultiRepoContributors, fetchMultiRepoPRMetrics } from '../github';
import {
  fetchJiraIssues, fetchRemoteLinksForIssues, normaliseIssue, resolveJiraUser,
} from '../jira';
import {
  testGitLabConnection, fetchGitLabMRMetrics, fetchMultiProjectMRMetrics,
} from '../gitlab';
import {
  DEMO_CONTRIBUTORS, DEMO_JIRA_ISSUES, DEMO_MAPPINGS, DEMO_PR_METRICS,
} from '../demoData';
import {
  GH_CACHE_KEY, JIRA_CACHE_KEY, GL_CACHE_KEY,
  normAssociateKey, loadCache, saveCache,
  stripPRListsForCache, stripMRListsForCache, clearAllCaches,
} from '../utils/cache';
import { currentQuarterStart, looksLikeId, cleanDisplayName } from '../utils/helpers';

const AppContext = createContext(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  // ── Navigation ──
  const [tab, setTab] = useState('home');
  const [backendUp, setBackendUp] = useState(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);

  const switchTab = useCallback(async (t) => {
    setTab(t);
    if (t === 'jira' || t === 'gitlab' || t === 'performance' || t === 'settings') {
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
  const [token, setToken] = useState(() => localStorage.getItem('gh_token') || '');
  const [ghRepo, setGhRepo] = useState(() => localStorage.getItem('gh_repo') || '');
  const [associates, setAssociates] = useState(() => localStorage.getItem('gh_associates') || '');
  const [sinceDate, setSinceDate] = useState(() => currentQuarterStart());
  const [untilDate, setUntilDate] = useState(() => new Date());
  const since = useMemo(() => format(sinceDate, 'yyyy-MM-dd'), [sinceDate]);
  const until = useMemo(() => format(untilDate, 'yyyy-MM-dd'), [untilDate]);

  const [activeAssociate, setActiveAssociate] = useState(null);

  // ── Jira config ──
  const [jiraBase, setJiraBase] = useState(() => localStorage.getItem('jira_base') || '');
  const [jiraEmail, setJiraEmail] = useState(() => localStorage.getItem('jira_email') || '');
  const [jiraApiKey, setJiraApiKey] = useState(() => localStorage.getItem('jira_key') || '');

  // ── Mapping ──
  const [mappings, setMappings] = useState(() => {
    try {
      const stored = localStorage.getItem('user_mapping');
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : [];
    } catch { return []; }
  });

  const addMappingRow = () => setMappings(m => [...m, { github: '', gitlab: '', jira: '', jiraDisplay: '' }]);
  const removeMappingRow = (i) => setMappings(m => m.filter((_, idx) => idx !== i));
  const updateMapping = (i, field, val) =>
    setMappings(m => m.map((row, idx) => {
      if (idx !== i) return row;
      return field === 'jira' ? { ...row, jira: val, jiraDisplay: '' } : { ...row, [field]: val };
    }));

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
  const [prMetrics, setPrMetrics] = useState({});
  const [prFetchNote, setPrFetchNote] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghProgress, setGhProgress] = useState(null);
  const [ghError, setGhError] = useState(null);
  const [ghFetched, setGhFetched] = useState(false);
  const [ghCacheTs, setGhCacheTs] = useState(null);
  const [ghOAuthSuccess, setGhOAuthSuccess] = useState(false);
  const [cacheClearMsg, setCacheClearMsg] = useState(null);

  // ── GitLab config ──
  const [glUrl, setGlUrl] = useState(() => localStorage.getItem('gl_url') || '');
  const [glToken, setGlToken] = useState(() => localStorage.getItem('gl_token') || '');
  const [glProject, setGlProject] = useState(() => localStorage.getItem('gl_project') || '');

  // ── GitLab state ──
  const [glMRMetrics, setGlMRMetrics] = useState({});
  const [glLoading, setGlLoading] = useState(false);
  const [glProgress, setGlProgress] = useState(null);
  const [glError, setGlError] = useState(null);
  const [glFetched, setGlFetched] = useState(false);
  const [glCacheTs, setGlCacheTs] = useState(null);
  const [glTestStatus, setGlTestStatus] = useState(null);
  const [glTestMsg, setGlTestMsg] = useState('');

  // ── Jira state ──
  const [jiraIssues, setJiraIssues] = useState([]);
  const [remoteLinks, setRemoteLinks] = useState({});
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState(null);
  const [jiraFetched, setJiraFetched] = useState(false);
  const [jiraCacheTs, setJiraCacheTs] = useState(null);
  const [jiraTestStatus, setJiraTestStatus] = useState(null);
  const [jiraTestMsg, setJiraTestMsg] = useState('');
  const [spField, setSpField] = useState(() => localStorage.getItem('jira_sp_field') || '');

  // ── Persist to localStorage ──
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#github_token=')) {
      const t = hash.slice('#github_token='.length);
      if (t) {
        setToken(t);
        localStorage.setItem('gh_token', t);
        setGhOAuthSuccess(true);
        setTab('settings');
        setTimeout(() => setGhOAuthSuccess(false), 5000);
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const params = new URLSearchParams(window.location.search);
    const ghErr = params.get('github_error');
    if (ghErr) {
      setGhError(`GitHub OAuth failed: ${ghErr}`);
      setTab('settings');
      params.delete('github_error');
      const newSearch = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
    }
  }, []);

  useEffect(() => { localStorage.setItem('gh_token', token); }, [token]);
  useEffect(() => { localStorage.setItem('gh_repo', ghRepo); }, [ghRepo]);
  useEffect(() => { localStorage.setItem('gh_associates', associates); }, [associates]);
  useEffect(() => { localStorage.setItem('jira_base', jiraBase); }, [jiraBase]);
  useEffect(() => { localStorage.setItem('jira_email', jiraEmail); }, [jiraEmail]);
  useEffect(() => { localStorage.setItem('jira_key', jiraApiKey); }, [jiraApiKey]);
  useEffect(() => { localStorage.setItem('gl_url', glUrl); }, [glUrl]);
  useEffect(() => { localStorage.setItem('gl_token', glToken); }, [glToken]);
  useEffect(() => { localStorage.setItem('gl_project', glProject); }, [glProject]);
  useEffect(() => { localStorage.setItem('jira_sp_field', spField); }, [spField]);

  const [mappingSaved, setMappingSaved] = useState(false);
  useEffect(() => {
    localStorage.setItem('user_mapping', JSON.stringify(mappings));
    setMappingSaved(true);
    const t = setTimeout(() => setMappingSaved(false), 2000);
    return () => clearTimeout(t);
  }, [mappings]);

  // ── Restore caches on load ──
  useEffect(() => {
    const dateBounds = { since, until };
    const ghKey = `${ghRepo}|${normAssociateKey(associates)}`;
    const ghCache = loadCache(GH_CACHE_KEY, ghKey, dateBounds);
    if (ghCache) {
      setContributors(ghCache.contributors ?? []);
      setPrMetrics(ghCache.prMetrics ?? {});
      setGhCacheTs(ghCache.ts);
      setGhFetched(true);
      if (ghCache.since) setSinceDate(parseISO(ghCache.since));
      if (ghCache.until) setUntilDate(parseISO(ghCache.until));
    }

    const savedMapping = (() => { try { return JSON.parse(localStorage.getItem('user_mapping') || '[]'); } catch { return []; } })();
    const assocList = (associates || '').split(',').map(s => s.trim()).filter(Boolean);
    const jiraUsers = savedMapping.length
      ? savedMapping.map(m => m.jira).filter(Boolean)
      : assocList;
    const jiraKey = `${jiraBase}|${normAssociateKey(jiraUsers.join(','))}`;
    const jCache = loadCache(JIRA_CACHE_KEY, jiraKey, dateBounds);
    if (jCache) {
      setJiraIssues(jCache.issues ?? []);
      setRemoteLinks(jCache.remoteLinks ?? {});
      setJiraCacheTs(jCache.ts);
      setJiraFetched(true);
      if (!ghCache) {
        if (jCache.since) setSinceDate(parseISO(jCache.since));
        if (jCache.until) setUntilDate(parseISO(jCache.until));
      }
    }

    const glKey = `${glUrl}|${glProject}|${normAssociateKey(associates)}`;
    const glCache = loadCache(GL_CACHE_KEY, glKey, dateBounds);
    if (glCache) {
      setGlMRMetrics(glCache.mrMetrics ?? {});
      setGlCacheTs(glCache.ts);
      setGlFetched(true);
      if (!ghCache && !jCache) {
        if (glCache.since) setSinceDate(parseISO(glCache.since));
        if (glCache.until) setUntilDate(parseISO(glCache.until));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export / Import config ──
  const handleExportConfig = useCallback(() => {
    const config = {
      ghRepo, jiraBase, jiraEmail, glUrl, glProject, mappings, ghAssociates: associates,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'team-dashboard-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [ghRepo, jiraBase, jiraEmail, glUrl, glProject, mappings, associates]);

  const handleImportConfig = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const cfg = JSON.parse(ev.target.result);
        if (cfg.ghRepo) setGhRepo(cfg.ghRepo);
        if (cfg.jiraBase) setJiraBase(cfg.jiraBase);
        if (cfg.jiraEmail) setJiraEmail(cfg.jiraEmail);
        if (cfg.glUrl) setGlUrl(cfg.glUrl);
        if (cfg.glProject) setGlProject(cfg.glProject);
        if (Array.isArray(cfg.mappings) && cfg.mappings.length) setMappings(cfg.mappings);
        if (cfg.ghAssociates) setAssociates(cfg.ghAssociates);
      } catch { alert('Invalid config file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // ── Derived data ──
  const userMapping = useMemo(
    () => mappings.filter(r => r.github?.trim() && r.jira?.trim()),
    [mappings]
  );

  const associateList = useMemo(() => {
    if (userMapping.length > 0) return userMapping.map(r => r.github.trim());
    return associates.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  }, [userMapping, associates]);

  const ghRepoList = useMemo(() =>
    (ghRepo || '').split(',').map(r => r.trim()).filter(Boolean), [ghRepo]);
  const glProjectList = useMemo(() =>
    (glProject || '').split(',').map(p => p.trim()).filter(Boolean), [glProject]);

  const ghRepoRows = useMemo(() => {
    const list = (ghRepo || '').split(',').map(r => r.trim());
    return list.length > 0 && list.some(Boolean) ? list : [''];
  }, [ghRepo]);
  const setGhRepoRow = useCallback((i, val) => {
    const rows = [...ghRepoRows];
    rows[i] = val;
    setGhRepo(rows.join(', '));
  }, [ghRepoRows]);
  const addGhRepoRow = useCallback(() => {
    setGhRepo(ghRepoRows.join(', ') + ', ');
  }, [ghRepoRows]);
  const removeGhRepoRow = useCallback((i) => {
    const rows = ghRepoRows.filter((_, j) => j !== i);
    setGhRepo(rows.length ? rows.join(', ') : '');
  }, [ghRepoRows]);

  const glProjectRows = useMemo(() => {
    const list = (glProject || '').split(',').map(p => p.trim());
    return list.length > 0 && list.some(Boolean) ? list : [''];
  }, [glProject]);
  const setGlProjectRow = useCallback((i, val) => {
    const rows = [...glProjectRows];
    rows[i] = val;
    setGlProject(rows.join(', '));
  }, [glProjectRows]);
  const addGlProjectRow = useCallback(() => {
    setGlProject(glProjectRows.join(', ') + ', ');
  }, [glProjectRows]);
  const removeGlProjectRow = useCallback((i) => {
    const rows = glProjectRows.filter((_, j) => j !== i);
    setGlProject(rows.length ? rows.join(', ') : '');
  }, [glProjectRows]);

  const jiraUsernames = useMemo(() => {
    if (userMapping.length) return userMapping.map(m => m.jira).filter(Boolean);
    return associateList;
  }, [userMapping, associateList]);

  const associateOptions = useMemo(() => {
    if (userMapping.length) return userMapping.filter(r => r.github);
    return associateList.map(g => ({ github: g, jira: g }));
  }, [userMapping, associateList]);

  const glUsernames = useMemo(() => {
    if (userMapping.length) return userMapping.map(m => m.gitlab || m.github).filter(Boolean);
    return associateList;
  }, [userMapping, associateList]);

  const ghDisplayName = useCallback((ghLogin) => {
    if (!ghLogin) return '';
    const row = userMapping.find(m => m.github?.toLowerCase() === ghLogin.toLowerCase());
    const fromDisplay = cleanDisplayName(row?.jiraDisplay);
    if (fromDisplay) return fromDisplay;
    if (row?.jira && !looksLikeId(row.jira)) return row.jira;
    return ghLogin;
  }, [userMapping]);

  const glDisplayName = useCallback((glUsername) => {
    if (!glUsername) return '';
    const row = userMapping.find(m =>
      m.gitlab?.toLowerCase() === glUsername.toLowerCase() ||
      m.github?.toLowerCase() === glUsername.toLowerCase()
    );
    const fromDisplay = cleanDisplayName(row?.jiraDisplay);
    if (fromDisplay) return fromDisplay;
    if (row?.jira && !looksLikeId(row.jira)) return row.jira;
    return glUsername;
  }, [userMapping]);

  const ghToGl = useCallback((ghLogin) => {
    const row = userMapping.find(m => m.github?.toLowerCase() === ghLogin?.toLowerCase());
    return row?.gitlab || ghLogin;
  }, [userMapping]);

  const applyQuickRange = (days) => {
    setSinceDate(subDays(new Date(), days));
    setUntilDate(new Date());
  };

  // ── Jira helpers ──
  const issueMatchesAssignee = useCallback((issue, jiraValue) => {
    if (!jiraValue) return false;
    const v = jiraValue.toLowerCase();
    const tokens = new Set([v]);
    if (v.includes('@')) tokens.add(v.split('@')[0]);
    const jiraName = issue.assigneeJira?.toLowerCase() ?? '';
    const jiraEmailLocal = issue.assigneeEmail?.toLowerCase() ?? '';
    const emailLocal = jiraEmailLocal.includes('@') ? jiraEmailLocal.split('@')[0] : jiraEmailLocal;
    return tokens.has(jiraName) || tokens.has(jiraEmailLocal) || tokens.has(emailLocal);
  }, []);

  const jiraByAssignee = useMemo(() => {
    const index = new Map();
    for (const issue of jiraIssues) {
      const keys = [];
      const name = issue.assigneeJira?.toLowerCase();
      const email = issue.assigneeEmail?.toLowerCase();
      if (name) keys.push(name);
      if (email) {
        keys.push(email);
        const local = email.split('@')[0];
        if (local) keys.push(local);
      }
      for (const k of keys) {
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(issue);
      }
    }
    return index;
  }, [jiraIssues]);

  const getIssuesForAssignee = useCallback((jiraValue) => {
    if (!jiraValue) return [];
    const v = jiraValue.toLowerCase();
    const direct = jiraByAssignee.get(v);
    if (direct) return direct;
    if (v.includes('@')) {
      const local = v.split('@')[0];
      return jiraByAssignee.get(local) ?? [];
    }
    return [];
  }, [jiraByAssignee]);

  // ── Fetch GitHub ──
  const handleFetchGitHub = useCallback(async () => {
    setGhError(null); setGhLoading(true); setGhFetched(false); setGhProgress(null);
    try {
      const isMulti = ghRepoList.length > 1;
      const mkProgress = (phase) => isMulti
        ? (p) => setGhProgress({ ...p, phase })
        : undefined;

      const contribs = await (
        isMulti ? fetchMultiRepoContributors(token, ghRepoList, { onProgress: mkProgress('contributors') })
                : fetchContributors(token, ghRepoList[0])
      );

      if (isMulti) {
        setGhProgress({ completed: 0, total: ghRepoList.length, phase: 'PR metrics' });
      }

      const prMeta = await (
        isMulti ? fetchMultiRepoPRMetrics(token, ghRepoList, associateList, since, until, { onProgress: mkProgress('PR metrics') })
                : fetchPRMetrics(token, ghRepoList[0], associateList, since, until)
      ).catch(() => ({}));
      const relevantLogins = new Set(associateList.map(a => a.toLowerCase()));
      setContributors(
        associateList.length > 0
          ? contribs.filter(c => relevantLogins.has(c.login.toLowerCase()))
          : contribs.slice(0, 20)
      );

      const loginMap = new Map();
      for (const assoc of associateList) {
        const byContrib = contribs.find(c => c.login.toLowerCase() === assoc.toLowerCase());
        if (byContrib) {
          loginMap.set(assoc.toLowerCase(), byContrib.login);
        }
      }

      const needsRefetch = [];
      for (const assoc of associateList) {
        const resolved = loginMap.get(assoc.toLowerCase());
        const entry = prMeta[assoc] || prMeta[assoc.toLowerCase()];
        const hasZeroPRs = entry && entry.prsOpened === 0 && entry.prsMerged === 0 && entry.prsReviewed === 0;
        if (resolved && resolved.toLowerCase() !== assoc.toLowerCase() && (hasZeroPRs || !entry)) {
          needsRefetch.push({ original: assoc, resolved });
        }
      }

      let mergedPr = { ...prMeta };
      if (needsRefetch.length > 0 && !prMeta._rateLimited) {
        const resolvedLogins = needsRefetch.map(r => r.resolved);
        try {
          const retried = isMulti
            ? await fetchMultiRepoPRMetrics(token, ghRepoList, resolvedLogins, since, until)
            : await fetchPRMetrics(token, ghRepoList[0], resolvedLogins, since, until);
          for (const { original, resolved } of needsRefetch) {
            if (retried[resolved] || retried[resolved.toLowerCase()]) {
              mergedPr[original] = retried[resolved] || retried[resolved.toLowerCase()];
            }
          }
          if (retried._rateLimited) mergedPr._rateLimited = true;
        } catch { /* non-fatal retry */ }
      }

      const normalizedPr = {};
      for (const [k, v] of Object.entries(mergedPr)) {
        const nk = k === '_rateLimited' ? k : k.toLowerCase();
        const existing = normalizedPr[nk];
        if (!existing || existing._rateLimited || (v && !v._rateLimited && (v.prsOpened || v.prsMerged || v.prsReviewed))) {
          normalizedPr[nk] = v;
        }
      }
      setPrMetrics(normalizedPr);

      const filteredContribs = associateList.length > 0
        ? contribs.filter(c => relevantLogins.has(c.login.toLowerCase()))
        : contribs.slice(0, 20);
      const cachePayload = {
        key: `${ghRepo}|${normAssociateKey(associates)}`,
        ts: Date.now(), since, until,
        contributors: filteredContribs,
      };
      saveCache(GH_CACHE_KEY,
        { ...cachePayload, prMetrics: normalizedPr },
        { ...cachePayload, prMetrics: stripPRListsForCache(normalizedPr) },
      );
      setGhCacheTs(null);

      if (mergedPr._rateLimited) {
        setPrFetchNote('⚠ GitHub search rate limit reached — PR data may be incomplete. Connect via OAuth or wait a minute and re-fetch.');
      } else if (!token) {
        setPrFetchNote('ℹ No GitHub token — unauthenticated requests have a very low rate limit (10/min). Connect GitHub for full PR data.');
      } else {
        setPrFetchNote('');
      }
      setGhFetched(true);
    } catch (e) { setGhError(e.message); }
    finally { setGhLoading(false); setGhProgress(null); }
  }, [token, ghRepo, ghRepoList, associateList, since, until, associates]);

  // ── Jira test ──
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
      try { data = JSON.parse(text); } catch {}
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

  // ── Jira fetch ──
  const handleFetchJira = useCallback(async () => {
    setJiraError(null); setJiraLoading(true); setJiraFetched(false);
    try {
      const raw = await fetchJiraIssues(jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until, spField);
      const issues = raw.map(i => normaliseIssue(i, spField));
      setJiraIssues(issues);
      const keys = issues.map(i => i.key);
      const jiraCacheData = (links) => ({
        key: `${jiraBase}|${normAssociateKey(jiraUsernames.join(','))}`,
        ts: Date.now(), since, until,
        issues, remoteLinks: links,
      });
      fetchRemoteLinksForIssues(jiraBase, jiraApiKey, jiraEmail, keys)
        .then(links => {
          setRemoteLinks(links);
          saveCache(JIRA_CACHE_KEY, jiraCacheData(links));
        })
        .catch(() => {
          saveCache(JIRA_CACHE_KEY, jiraCacheData({}));
        });
      setJiraCacheTs(null);
      setJiraFetched(true);
    } catch (e) { setJiraError(e.message); }
    finally { setJiraLoading(false); }
  }, [jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until, spField]);

  // ── GitLab test ──
  const handleTestGitLab = useCallback(async () => {
    setGlTestStatus(null); setGlTestMsg(''); setGlError(null);
    try {
      const data = await testGitLabConnection(glUrl, glToken);
      setGlTestStatus('ok');
      setGlTestMsg(`Connected as: ${data.user}`);
    } catch (e) {
      setGlTestStatus('error');
      setGlTestMsg(e.message);
    }
  }, [glUrl, glToken]);

  // ── GitLab fetch ──
  const handleFetchGitLab = useCallback(async () => {
    setGlError(null); setGlLoading(true); setGlFetched(false); setGlProgress(null);
    try {
      const isMulti = glProjectList.length > 1;
      const mkProgress = (phase) => isMulti
        ? (p) => setGlProgress({ ...p, phase })
        : undefined;
      const mrMeta = await (
        isMulti ? fetchMultiProjectMRMetrics(glUrl, glToken, glProjectList, glUsernames, since, until, { onProgress: mkProgress('merge requests') })
                : fetchGitLabMRMetrics(glUrl, glToken, glProjectList[0], glUsernames, since, until)
      ).catch(() => ({}));
      setGlMRMetrics(mrMeta);
      const glCachePayload = {
        key: `${glUrl}|${glProject}|${normAssociateKey(associates)}`,
        ts: Date.now(), since, until,
      };
      saveCache(GL_CACHE_KEY,
        { ...glCachePayload, mrMetrics: mrMeta },
        { ...glCachePayload, mrMetrics: stripMRListsForCache(mrMeta) },
      );
      setGlCacheTs(null);
      setGlFetched(true);
    } catch (e) { setGlError(e.message); }
    finally { setGlLoading(false); setGlProgress(null); }
  }, [glUrl, glToken, glProject, glProjectList, glUsernames, associates, since, until]);

  // ── Fetch all ──
  const fetchAllLoading = ghLoading || jiraLoading || glLoading;

  const handleFetchAll = useCallback(async () => {
    await Promise.allSettled([handleFetchGitHub(), handleFetchJira(), handleFetchGitLab()]);
  }, [handleFetchGitHub, handleFetchJira, handleFetchGitLab]);

  // ── Demo ──
  const handleLoadDemo = useCallback(() => {
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
    setTab('github');
  }, []);

  const handleClearDemo = useCallback(() => {
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

  // ── Performance data ──
  const perfData = useMemo(() => {
    const people = userMapping.length > 0 ? userMapping : associateList.map(g => ({ github: g, jira: g }));

    return people.map(({ github, jira, gitlab, jiraDisplay }) => {
      const ghPr = prMetrics[github?.toLowerCase()] ?? {};
      const glName = gitlab || github;
      const myGlMR = glMRMetrics[glName] || {};

      const myIssues = getIssuesForAssignee(jira);
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

      const totalSpillovers = myIssues.reduce((s, i) => s + i.spillovers, 0);
      const totalSP = doneIssues.reduce((s, i) => s + (i.storyPoints || 0), 0);

      const totalComments = myIssues.reduce((s, i) => s + (i.commentCount ?? 0), 0);
      const jiraTokens = new Set([jira?.toLowerCase()].filter(Boolean));
      if (jira?.includes('@')) jiraTokens.add(jira.split('@')[0].toLowerCase());
      const commentsGiven = myIssues.reduce((s, i) =>
        s + (i.comments ?? []).filter(c => {
          const cId = c.authorId?.toLowerCase() ?? '';
          const cEmail = c.authorEmail?.toLowerCase() ?? '';
          const cLocal = cEmail.includes('@') ? cEmail.split('@')[0] : cEmail;
          return jiraTokens.has(cId) || jiraTokens.has(cEmail) || jiraTokens.has(cLocal);
        }).length, 0);
      const statusChanges = myIssues.reduce((s, i) => s + (i.statusTransitions?.length ?? 0), 0);

      return {
        github, jira,
        displayName: cleanDisplayName(jiraDisplay) || (!looksLikeId(jira) ? jira : null) || github,
        ghPRsOpened: ghPr.prsOpened ?? 0,
        ghPRsMerged: ghPr.prsMerged ?? 0,
        ghPRsReviewed: ghPr.prsReviewed ?? 0,
        ghAvgCycleTime: ghPr.avgCycleTimeDays ?? null,
        glMRsOpened: myGlMR.mrsOpened ?? 0,
        glMRsMerged: myGlMR.mrsMerged ?? 0,
        glMRsReviewed: myGlMR.mrsReviewed ?? 0,
        glAvgCycleTime: myGlMR.avgCycleTimeDays ?? null,
        glAvgLinesChanged: myGlMR.avgLinesChanged ?? null,
        glAvgFilesChanged: myGlMR.avgFilesChanged ?? null,
        issuesTotal: myIssues.length,
        issuesDone: doneIssues.length,
        issuesOpen: openIssues.length,
        avgCycleTime,
        avgDaysInProgress,
        totalSpillovers,
        totalSP,
        totalComments,
        commentsGiven,
        statusChanges,
      };
    }).filter(p => p.ghPRsOpened > 0 || p.ghPRsMerged > 0 || p.ghPRsReviewed > 0 || p.glMRsOpened > 0 || p.glMRsMerged > 0 || p.glMRsReviewed > 0 || p.issuesTotal > 0);
  }, [userMapping, associateList, prMetrics, glMRMetrics, getIssuesForAssignee]);

  const workSummary = useMemo(() => {
    const people = userMapping.length > 0 ? userMapping : associateList.map(g => ({ github: g, jira: g }));

    return people.map(({ github, jira, gitlab, jiraDisplay }) => {
      const myIssues = getIssuesForAssignee(jira);
      const jiraItems = myIssues.map(i => ({
        key: i.key, url: i.url, title: i.summary, status: i.status,
        isDone: i.statusCategory?.toLowerCase().includes('done'),
        type: 'jira', issueType: i.issueType, priority: i.priority,
      }));

      const ghPr = prMetrics[github?.toLowerCase()];
      const prItems = (ghPr?.authoredPRs ?? []).map(pr => ({
        id: `#${pr.number}`, url: pr.url, title: pr.title, date: pr.createdAt, state: pr.state, type: 'github-pr',
      }));

      const glName = gitlab || github;
      const glMr = glMRMetrics[glName] || glMRMetrics[glName?.toLowerCase()];
      const mrItems = (glMr?.authoredMRs ?? []).map(mr => ({
        id: `!${mr.iid}`, url: mr.url, title: mr.title, date: mr.createdAt, state: mr.state, type: 'gitlab-mr',
      }));

      const displayName = cleanDisplayName(jiraDisplay) || github;
      return { github, jira, displayName, jiraItems, prItems, mrItems };
    }).filter(p => p.jiraItems.length > 0 || p.prItems.length > 0 || p.mrItems.length > 0);
  }, [userMapping, associateList, prMetrics, glMRMetrics, getIssuesForAssignee]);

  const radarShaped = useMemo(() => {
    const src = activeAssociate ? perfData.filter(p => p.github?.toLowerCase() === activeAssociate.toLowerCase()) : perfData;
    if (!src.length) return [];
    const maxPRs = Math.max(...perfData.map(p => p.ghPRsMerged + p.glMRsMerged), 1);
    const maxDone = Math.max(...perfData.map(p => p.issuesDone), 1);
    const maxReviews = Math.max(...perfData.map(p => p.ghPRsReviewed + p.glMRsReviewed), 1);
    const maxSP = Math.max(...perfData.map(p => p.totalSP), 1);
    const normed = src.map(p => ({
      name: p.github,
      'PRs Merged': Math.round(((p.ghPRsMerged + p.glMRsMerged) / maxPRs) * 100),
      'Issues Done': Math.round((p.issuesDone / maxDone) * 100),
      'Reviews Given': Math.round(((p.ghPRsReviewed + p.glMRsReviewed) / maxReviews) * 100),
      'Story Points': Math.round((p.totalSP / maxSP) * 100),
      'Low Spillover': p.totalSpillovers === 0 ? 100 : Math.max(0, 100 - p.totalSpillovers * 20),
    }));
    const metrics = ['PRs Merged', 'Issues Done', 'Reviews Given', 'Story Points', 'Low Spillover'];
    return metrics.map(m => {
      const row = { subject: m };
      normed.forEach(p => { row[p.name] = p[m]; });
      return row;
    });
  }, [perfData, activeAssociate]);

  const value = {
    tab, setTab, switchTab, backendUp, oauthAvailable,
    sinceDate, setSinceDate, untilDate, setUntilDate, since, until, applyQuickRange,
    token, setToken, ghRepo, setGhRepo, associates, setAssociates,
    ghRepoList, ghRepoRows, setGhRepoRow, addGhRepoRow, removeGhRepoRow,
    glUrl, setGlUrl, glToken, setGlToken, glProject, setGlProject,
    glProjectList, glProjectRows, setGlProjectRow, addGlProjectRow, removeGlProjectRow,
    jiraBase, setJiraBase, jiraEmail, setJiraEmail, jiraApiKey, setJiraApiKey, spField, setSpField,
    mappings, setMappings, addMappingRow, removeMappingRow, updateMapping,
    userMapping, lookupState, setLookupState, lookupJiraUser, mappingSaved,
    activeAssociate, setActiveAssociate,
    associateList, associateOptions, jiraUsernames, glUsernames,
    ghDisplayName, glDisplayName, ghToGl,
    contributors, setContributors, prMetrics, setPrMetrics, prFetchNote, setPrFetchNote,
    demoMode, setDemoMode,
    ghLoading, ghProgress, ghError, setGhError, ghFetched, ghCacheTs, setGhCacheTs,
    ghOAuthSuccess, cacheClearMsg, setCacheClearMsg,
    glMRMetrics, setGlMRMetrics, glLoading, glProgress, glError, glFetched, glCacheTs, setGlCacheTs,
    glTestStatus, setGlTestStatus, glTestMsg, setGlTestMsg,
    jiraIssues, remoteLinks, jiraLoading, jiraError, jiraFetched, jiraCacheTs, setJiraCacheTs,
    jiraTestStatus, setJiraTestStatus, jiraTestMsg, setJiraTestMsg,
    issueMatchesAssignee, jiraByAssignee, getIssuesForAssignee,
    handleFetchGitHub, handleFetchJira, handleFetchGitLab, handleFetchAll, fetchAllLoading,
    handleTestJira, handleTestGitLab,
    handleExportConfig, handleImportConfig,
    handleLoadDemo, handleClearDemo,
    perfData, workSummary, radarShaped,
    clearAllCaches,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
