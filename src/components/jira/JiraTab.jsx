import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList,
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { GitHubIcon, JiraIcon, ChartTooltip, Pagination } from '../shared';
import {
  COLORS, PAGE_SIZE, statusColor, priorityIcon,
  EXCLUDED_RESOLUTIONS, PRIORITY_ORDER, cleanDisplayName, looksLikeId,
} from '../../utils/helpers';

export default function JiraTab() {
  const {
    backendUp, jiraError, jiraFetched, jiraLoading, jiraCacheTs,
    jiraIssues, remoteLinks, handleFetchJira,
    activeAssociate, setActiveAssociate,
    associateOptions, userMapping, associateList,
    ghDisplayName, getIssuesForAssignee,
  } = useAppContext();

  const [jiraSearch, setJiraSearch] = useState('');
  const [jiraFilter, setJiraFilter] = useState('all');
  const [jiraResFilter, setJiraResFilter] = useState('all');
  const [jiraPage, setJiraPage] = useState(1);
  const [expandedIssue, setExpandedIssue] = useState(null);
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

  const filteredJiraIssues = useMemo(() => {
    let source = jiraIssues;
    if (activeAssociate) {
      const row = userMapping.find(m => m.github.toLowerCase() === activeAssociate.toLowerCase());
      const jiraVal = row?.jira || activeAssociate;
      source = getIssuesForAssignee(jiraVal);
    }
    return source.filter(i => {
      if (jiraFilter === 'open' && i.statusCategory?.toLowerCase().includes('done')) return false;
      if (jiraFilter === 'done' && !i.statusCategory?.toLowerCase().includes('done')) return false;
      if (jiraResFilter === 'exclude-obsolete' && i.resolution && EXCLUDED_RESOLUTIONS.has(i.resolution.toLowerCase())) return false;
      if (jiraSearch) {
        const q = jiraSearch.toLowerCase();
        return i.key.toLowerCase().includes(q) ||
               i.summary.toLowerCase().includes(q) ||
               i.assigneeDisplay.toLowerCase().includes(q) ||
               i.status.toLowerCase().includes(q) ||
               (i.resolution && i.resolution.toLowerCase().includes(q));
      }
      return true;
    });
  }, [jiraIssues, jiraFilter, jiraResFilter, jiraSearch, activeAssociate, userMapping, getIssuesForAssignee]);

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
        case 'resolution':  av = a.resolution ?? ''; bv = b.resolution ?? ''; break;
        case 'priority':    av = PRIORITY_ORDER[a.priority] ?? 99; bv = PRIORITY_ORDER[b.priority] ?? 99; break;
        case 'daysActive':  av = a.daysInProgress ?? -1; bv = b.daysInProgress ?? -1; break;
        case 'spillovers':  av = a.spillovers;     bv = b.spillovers;     break;
        case 'cycleTime':   av = a.cycleTime ?? -1; bv = b.cycleTime ?? -1; break;
        case 'comments':    av = a.commentCount ?? 0; bv = b.commentCount ?? 0; break;
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

  const jiraContribData = useMemo(() => {
    const people = userMapping.length > 0
      ? userMapping
      : associateList.map(g => ({ github: g, jira: g, jiraDisplay: '' }));
    const activePeople = activeAssociate
      ? people.filter(p => p.github.toLowerCase() === activeAssociate.toLowerCase())
      : people;

    return activePeople
      .map(({ github, jira, jiraDisplay }) => {
        const allMine = getIssuesForAssignee(jira);
        const idSet = new Set(filteredJiraIssues.map(i => i.key));
        const mine = allMine.filter(i => idSet.has(i.key));
        const done = mine.filter(i => i.statusCategory?.toLowerCase().includes('done')).length;
        const open = mine.length - done;
        const sp = mine.filter(i => i.statusCategory?.toLowerCase().includes('done'))
                        .reduce((s, i) => s + (i.storyPoints || 0), 0);
        const firstIssue = mine[0] || allMine[0];
        const rawAssigneeName = cleanDisplayName(firstIssue?.assigneeDisplay) || cleanDisplayName(jiraDisplay) || github;
        const assigneeName = (rawAssigneeName && rawAssigneeName !== '—') ? rawAssigneeName : github;
        const assigneeEmail = firstIssue?.assigneeEmail || '';
        const shortLabel = assigneeName;
        const fullLabel = (!looksLikeId(assigneeEmail) && assigneeEmail) ? `${shortLabel} (${assigneeEmail})` : shortLabel;
        return { name: github, label: shortLabel, fullLabel, email: assigneeEmail, total: mine.length, done, open, sp };
      })
      .filter(p => p.total > 0);
  }, [filteredJiraIssues, userMapping, associateList, activeAssociate, getIssuesForAssignee]);

  return (
    <>
      {backendUp === false && (
        <div className="alert alert-error" style={{ fontFamily:'monospace', whiteSpace:'pre-wrap' }}>
          <div>
            <strong>Python backend is not running.</strong>{'\n'}
            Open a terminal and run:{'\n\n'}
            {'  cd "' + window.location.pathname.split('/')[0] + 'associate-performance-metrics/backend"'}{'\n'}
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

      {jiraFetched && !jiraLoading && jiraCacheTs && (
        <div className="alert" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:13, marginBottom:8 }}>
          Showing cached data from {new Date(jiraCacheTs).toLocaleString()}.{' '}
          <button className="btn btn-outline" style={{ padding:'2px 10px', fontSize:12 }} onClick={handleFetchJira}>Refresh</button>
        </div>
      )}

      {jiraFetched && !jiraLoading && (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
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
                        className={`chip ${activeAssociate?.toLowerCase() === opt.github?.toLowerCase() ? 'active' : ''}`}
                        style={{ borderColor: activeAssociate?.toLowerCase() === opt.github?.toLowerCase() ? COLORS[i % COLORS.length] : undefined }}
                        onClick={() => { setActiveAssociate(prev => prev?.toLowerCase() === opt.github?.toLowerCase() ? null : opt.github); setJiraPage(1); }}
                      >
                        {ghDisplayName(opt.github)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
              <div className="filter-group">
                <label>Resolution</label>
                <div className="chip-list">
                  {['all','exclude-obsolete'].map(f => (
                    <button key={f} className={`chip ${jiraResFilter===f?'active':''}`}
                      onClick={() => { setJiraResFilter(f); setJiraPage(1); }}>
                      {f === 'all' ? 'All' : 'Exclude Non-actionable'}
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
              { label:'Total Comments',  value: filteredJiraIssues.reduce((s,i)=>s+(i.commentCount??0),0), color:'#d2a8ff' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="label">{s.label}</div>
                <div className="value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {jiraContribData.length > 0 && (
            <div className="charts-grid" style={{ marginBottom: 20 }}>
              {jiraContribData.length > 1 && (
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
              )}

              {jiraContribData.length > 1 && jiraContribData.some(p => p.done > 0) && (
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

              <div className="chart-card">
                <h3>Issues by Associate
                  <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>done vs open</span>
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={jiraContribData} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="label" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                    <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                    <Bar dataKey="done" name="Done" stackId="a" fill="#3fb950" radius={[0,0,0,0]}>
                      <LabelList dataKey="done" position="inside" fill="#fff" fontSize={10} formatter={v => v || ''} />
                    </Bar>
                    <Bar dataKey="open" name="Open/Active" stackId="a" fill="#ffa657" radius={[4,4,0,0]}>
                      <LabelList dataKey="open" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {jiraContribData.some(p => p.sp > 0) && (
                <div className="chart-card">
                  <h3>Story Points Completed
                    <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>done issues only</span>
                  </h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={jiraContribData} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                      <XAxis dataKey="label" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                      <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="sp" name="Story Points" radius={[4,4,0,0]}>
                        {jiraContribData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        <LabelList dataKey="sp" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

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
                      { label: 'Resolution',  key: 'resolution' },
                      { label: 'Priority',    key: 'priority' },
                      { label: 'Days Active', key: 'daysActive' },
                      { label: 'Spillovers',  key: 'spillovers' },
                      { label: 'Cycle Time',  key: 'cycleTime' },
                      { label: 'Comments',    key: 'comments' },
                      { label: 'Status Flow', key: null },
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
                    <tr><td colSpan={14} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No issues match current filters</td></tr>
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
                          <td style={{ whiteSpace:'nowrap', fontSize:12 }}>
                            {issue.resolution
                              ? <span style={{ color: EXCLUDED_RESOLUTIONS.has(issue.resolution.toLowerCase()) ? '#f85149' : 'var(--accent2)', fontWeight:500 }}>{issue.resolution}</span>
                              : <span style={{ color:'var(--text-muted)' }}>—</span>}
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
                          <td>
                            {(issue.commentCount ?? 0) > 0
                              ? <span className="badge" style={{ background:'rgba(210,168,255,0.15)', color:'#d2a8ff' }}>{issue.commentCount}</span>
                              : <span style={{ color:'var(--text-muted)' }}>0</span>}
                          </td>
                          <td style={{ fontSize:11, whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }}
                              title={issue.statusTransitions?.map(t => `${t.from} → ${t.to}`).join(', ')}>
                            {issue.statusTransitions?.length > 0
                              ? (() => {
                                  const steps = [issue.statusTransitions[0].from, ...issue.statusTransitions.map(t => t.to)];
                                  const unique = steps.filter((s, i) => i === 0 || s !== steps[i-1]);
                                  return unique.map((s, i) => (
                                    <span key={i}>
                                      {i > 0 && <span style={{ color:'var(--text-muted)', margin:'0 2px' }}>→</span>}
                                      <span style={{ color: statusColor(s), fontWeight: 500 }}>{s}</span>
                                    </span>
                                  ));
                                })()
                              : <span style={{ color:'var(--text-muted)' }}>—</span>}
                          </td>
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
                        {isExpanded && links.length > 0 && (
                          <tr key={`${issue.key}-links`} style={{ background:'var(--surface2)' }}>
                            <td colSpan={14} style={{ padding:'8px 16px' }}>
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
            <Pagination page={jiraPage} totalPages={jiraTotalPages} onPageChange={setJiraPage} />
          </div>
        </>
      )}
    </>
  );
}
