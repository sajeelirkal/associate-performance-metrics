import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { fetchMultiRepoContributors, fetchMultiRepoPRMetrics } from '../github';
import {
  fetchJiraIssues, fetchRemoteLinksForIssues, normaliseIssue, resolveJiraUser, testJiraConnection,
} from '../jira';
import {
  testGitLabConnection, fetchMultiProjectMRMetrics,
} from '../gitlab';
import {
  DEMO_CONTRIBUTORS, DEMO_JIRA_ISSUES, DEMO_MAPPINGS, DEMO_PR_METRICS,
} from '../demoData';
import {
  GH_CACHE_KEY, JIRA_CACHE_KEY, GL_CACHE_KEY,
  normAssociateKey, loadCache, saveCache,
  stripListsForCache, clearAllCaches,
} from '../utils/cache';
import { currentQuarterStart, looksLikeId, cleanDisplayName, levelSeniority } from '../utils/helpers';
import { usePersistentState } from '../components/shared';

const AppContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
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
    if (!['home', 'github'].includes(t)) {
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
  const [token, setToken] = usePersistentState('gh_token', '', { storage: 'session' });
  const [ghRepo, setGhRepo] = usePersistentState('gh_repo', '');
  const [associates, setAssociates] = usePersistentState('gh_associates', '');
  const [sinceDate, setSinceDate] = useState(() => currentQuarterStart());
  const [untilDate, setUntilDate] = useState(() => new Date());
  const since = useMemo(() => format(sinceDate, 'yyyy-MM-dd'), [sinceDate]);
  const until = useMemo(() => format(untilDate, 'yyyy-MM-dd'), [untilDate]);

  const [activeAssociate, setActiveAssociate] = useState(null);

  // ── Jira config ──
  const [jiraBase, setJiraBase] = usePersistentState('jira_base', '');
  const [jiraEmail, setJiraEmail] = usePersistentState('jira_email', '');
  const [jiraApiKey, setJiraApiKey] = usePersistentState('jira_key', '', { storage: 'session' });

  // ── Mapping ──
  const [mappings, setMappings] = usePersistentState('user_mapping', [], {
    json: true,
    validate: Array.isArray,
  });

  const addMappingRow = () => setMappings(m => [...m, { github: '', gitlab: '', jira: '', jiraDisplay: '', level: '' }]);
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
  const [glUrl, setGlUrl] = usePersistentState('gl_url', '');
  const [glToken, setGlToken] = usePersistentState('gl_token', '', { storage: 'session' });
  const [glProject, setGlProject] = usePersistentState('gl_project', '');

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

  // ── Persistence and OAuth callback ──
  useEffect(() => {
    // Credentials moved to sessionStorage; clear copies left by older builds.
    for (const key of ['gh_token', 'jira_key', 'gl_token']) {
      try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    }

    const hash = window.location.hash;
    if (hash.startsWith('#github_token=')) {
      const t = hash.slice('#github_token='.length);
      if (t) {
        setToken(t);
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

  const [mappingSaved, setMappingSaved] = useState(false);
  useEffect(() => {
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

  // Editable rows for a comma-separated list state (repos, projects).
  const useCsvRows = (value, setValue) => {
    const rows = useMemo(() => {
      const list = (value || '').split(',').map(r => r.trim());
      return list.length > 0 && list.some(Boolean) ? list : [''];
    }, [value]);
    const setRow = useCallback((i, val) => {
      const next = [...rows];
      next[i] = val;
      setValue(next.join(', '));
    }, [rows, setValue]);
    const addRow = useCallback(() => {
      setValue(rows.join(', ') + ', ');
    }, [rows, setValue]);
    const removeRow = useCallback((i) => {
      const next = rows.filter((_, j) => j !== i);
      setValue(next.length ? next.join(', ') : '');
    }, [rows, setValue]);
    return { rows, setRow, addRow, removeRow };
  };

  const { rows: ghRepoRows, setRow: setGhRepoRow, addRow: addGhRepoRow, removeRow: removeGhRepoRow } = useCsvRows(ghRepo, setGhRepo);
  const { rows: glProjectRows, setRow: setGlProjectRow, addRow: addGlProjectRow, removeRow: removeGlProjectRow } = useCsvRows(glProject, setGlProject);

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

  const displayNameFromMapping = useCallback((matcher) => {
    const row = userMapping.find(matcher);
    const fromDisplay = cleanDisplayName(row?.jiraDisplay);
    if (fromDisplay) return fromDisplay;
    if (row?.jira && !looksLikeId(row.jira)) return row.jira;
    return null;
  }, [userMapping]);

  const ghDisplayName = useCallback((ghLogin) => {
    if (!ghLogin) return '';
    return displayNameFromMapping(m => m.github?.toLowerCase() === ghLogin.toLowerCase()) || ghLogin;
  }, [displayNameFromMapping]);

  const glDisplayName = useCallback((glUsername) => {
    if (!glUsername) return '';
    return displayNameFromMapping(m =>
      m.gitlab?.toLowerCase() === glUsername.toLowerCase() ||
      m.github?.toLowerCase() === glUsername.toLowerCase()
    ) || glUsername;
  }, [displayNameFromMapping]);

  const ghToGl = useCallback((ghLogin) => {
    const row = userMapping.find(m => m.github?.toLowerCase() === ghLogin?.toLowerCase());
    return row?.gitlab || ghLogin;
  }, [userMapping]);

  const applyQuickRange = (days) => {
    setSinceDate(subDays(new Date(), days));
    setUntilDate(new Date());
  };

  // ── Jira helpers ──
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
      // The multi-repo fetchers handle a single repo too.
      const mkProgress = (phase) => (p) => setGhProgress({ ...p, phase });
      const contribs = await fetchMultiRepoContributors(token, ghRepoList, { onProgress: mkProgress('contributors') });
      setGhProgress({ completed: 0, total: ghRepoList.length, phase: 'PR metrics' });
      const prMeta = await fetchMultiRepoPRMetrics(token, ghRepoList, associateList, since, until, { onProgress: mkProgress('PR metrics') })
        .catch(() => ({}));
      const relevantLogins = new Set(associateList.map(a => a.toLowerCase()));
      const filteredContribs = associateList.length > 0
        ? contribs.filter(c => relevantLogins.has(c.login.toLowerCase()))
        : contribs.slice(0, 20);
      setContributors(filteredContribs);

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
          const retried = await fetchMultiRepoPRMetrics(token, ghRepoList, resolvedLogins, since, until);
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

      const cachePayload = {
        key: `${ghRepo}|${normAssociateKey(associates)}`,
        ts: Date.now(), since, until,
        contributors: filteredContribs,
      };
      saveCache(GH_CACHE_KEY,
        { ...cachePayload, prMetrics: normalizedPr },
        { ...cachePayload, prMetrics: stripListsForCache(normalizedPr, ['authoredPRs', 'reviewedPRs']) },
      );
      setGhCacheTs(null);

      if (mergedPr._rateLimited) {
        setPrFetchNote('⚠ GitHub rate limit reached — PR data may be incomplete. Wait a minute and re-fetch.');
      } else if (!token) {
        setPrFetchNote('ℹ No GitHub token — PR metrics need a GitHub connection. Connect GitHub in Settings to load them.');
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
      const data = await testJiraConnection(jiraBase, jiraApiKey, jiraEmail);
      setJiraTestStatus('ok');
      setJiraTestMsg(`Connected as: ${data.user}`);
    } catch (e) {
      setJiraTestStatus('error');
      setJiraTestMsg(e.message);
    }
  }, [jiraBase, jiraEmail, jiraApiKey]);

  // ── Jira fetch ──
  const handleFetchJira = useCallback(async () => {
    setJiraError(null); setJiraLoading(true); setJiraFetched(false);
    try {
      const raw = await fetchJiraIssues(jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until);
      const issues = raw.map(i => normaliseIssue(i));
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
  }, [jiraBase, jiraApiKey, jiraEmail, jiraUsernames, since, until]);

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
      const mrMeta = await fetchMultiProjectMRMetrics(glUrl, glToken, glProjectList, glUsernames, since, until,
        { onProgress: (p) => setGlProgress({ ...p, phase: 'merge requests' }) }).catch(() => ({}));
      setGlMRMetrics(mrMeta);
      const glCachePayload = {
        key: `${glUrl}|${glProject}|${normAssociateKey(associates)}`,
        ts: Date.now(), since, until,
      };
      saveCache(GL_CACHE_KEY,
        { ...glCachePayload, mrMetrics: mrMeta },
        { ...glCachePayload, mrMetrics: stripListsForCache(mrMeta, ['authoredMRs', 'reviewedMRs']) },
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

    return people.map(({ github, jira, gitlab, jiraDisplay, level }) => {
      const ghPr = prMetrics[github?.toLowerCase()] ?? {};
      const glName = gitlab || github;
      const myGlMR = glMRMetrics[glName] || {};

      const myIssues = getIssuesForAssignee(jira);
      const isDone = (i) => {
        const cat = i.statusCategory?.toLowerCase() || '';
        const st = i.status?.toLowerCase() || '';
        return cat.includes('done') || st === 'closed' || st === 'resolved';
      };
      const doneIssues = myIssues.filter(isDone);
      const openIssues = myIssues.filter(i => !isDone(i));

      const avgCycleTime = (() => {
        const valid = doneIssues.map(i => i.cycleTime).filter(v => v !== null);
        return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      })();

      const totalSpillovers = myIssues.reduce((s, i) => s + i.spillovers, 0);
      const totalSP = doneIssues.reduce((s, i) => s + (i.storyPoints || 0), 0);

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
        github, jira, level: level || '',
        displayName: cleanDisplayName(jiraDisplay) || (!looksLikeId(jira) ? jira : null) || github,
        ghPRsOpened: ghPr.prsOpened ?? 0,
        ghPRsMerged: ghPr.prsMerged ?? 0,
        ghPRsClosedUnmerged: ghPr.prsClosedUnmerged ?? 0,
        ghPRsReviewed: ghPr.prsReviewed ?? 0,
        ghAvgCycleTime: ghPr.avgCycleTimeDays ?? null,
        glMRsOpened: myGlMR.mrsOpened ?? 0,
        glMRsMerged: myGlMR.mrsMerged ?? 0,
        glMRsClosedUnmerged: myGlMR.mrsClosedUnmerged ?? 0,
        glMRsReviewed: myGlMR.mrsReviewed ?? 0,
        glAvgCycleTime: myGlMR.avgCycleTimeDays ?? null,
        glAvgLinesChanged: myGlMR.avgLinesChanged ?? null,
        glAvgFilesChanged: myGlMR.avgFilesChanged ?? null,
        issuesTotal: myIssues.length,
        issuesDone: doneIssues.length,
        issuesOpen: openIssues.length,
        avgCycleTime,
        totalSpillovers,
        totalSP,
        commentsGiven,
        statusChanges,
      };
    }).filter(p => p.ghPRsOpened > 0 || p.ghPRsMerged > 0 || p.ghPRsReviewed > 0 || p.glMRsOpened > 0 || p.glMRsMerged > 0 || p.glMRsReviewed > 0 || p.issuesTotal > 0)
      .sort((a, b) => levelSeniority(a.level) - levelSeniority(b.level));
  }, [userMapping, associateList, prMetrics, glMRMetrics, getIssuesForAssignee]);

  const workSummary = useMemo(() => {
    const people = userMapping.length > 0 ? userMapping : associateList.map(g => ({ github: g, jira: g }));

    return people.map(({ github, jira, gitlab, jiraDisplay, level }) => {
      const myIssues = getIssuesForAssignee(jira);
      const jiraItems = myIssues.map(i => ({
        key: i.key, url: i.url, title: i.summary, status: i.status,
        isDone: i.statusCategory?.toLowerCase().includes('done') || i.status?.toLowerCase() === 'closed' || i.status?.toLowerCase() === 'resolved',
        type: 'jira', issueType: i.issueType, priority: i.priority,
        resolutionDate: i.resolutionDate || null,
        description: i.description || '',
        comments: (i.comments ?? []).filter(c => c.body).slice(0, 5),
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
      return { github, jira, displayName, level: level || '', jiraItems, prItems, mrItems };
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
    token, setToken, associates, setAssociates,
    ghRepoList, ghRepoRows, setGhRepoRow, addGhRepoRow, removeGhRepoRow,
    glUrl, setGlUrl, glToken, setGlToken,
    glProjectList, glProjectRows, setGlProjectRow, addGlProjectRow, removeGlProjectRow,
    jiraBase, setJiraBase, jiraEmail, setJiraEmail, jiraApiKey, setJiraApiKey,
    mappings, setMappings, addMappingRow, removeMappingRow, updateMapping,
    userMapping, lookupState, setLookupState, lookupJiraUser, mappingSaved,
    activeAssociate, setActiveAssociate,
    associateList, associateOptions,
    ghDisplayName, glDisplayName, ghToGl,
    contributors, prMetrics, prFetchNote,
    demoMode,
    ghLoading, ghProgress, ghError, ghFetched, ghCacheTs, setGhCacheTs,
    ghOAuthSuccess, cacheClearMsg, setCacheClearMsg,
    glMRMetrics, glLoading, glProgress, glError, glFetched, glCacheTs, setGlCacheTs,
    glTestStatus, glTestMsg,
    jiraIssues, remoteLinks, jiraLoading, jiraError, jiraFetched, jiraCacheTs, setJiraCacheTs,
    jiraTestStatus, jiraTestMsg,
    getIssuesForAssignee,
    handleFetchGitHub, handleFetchJira, handleFetchGitLab, handleFetchAll, fetchAllLoading,
    handleTestJira, handleTestGitLab,
    handleExportConfig, handleImportConfig,
    handleLoadDemo, handleClearDemo,
    perfData, workSummary, radarShaped,
    clearAllCaches,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
