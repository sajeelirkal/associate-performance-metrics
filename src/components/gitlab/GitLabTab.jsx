import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { GitLabIcon, ChartTooltip, Pagination, InfoTip } from '../shared';
import { PAGE_SIZE, fmtDate } from '../../utils/helpers';

export default function GitLabTab() {
  const {
    glError, glFetched, glLoading, glCacheTs, glProgress,
    glProjectList, glMRMetrics,
    activeAssociate, setActiveAssociate, associateList,
    ghDisplayName, glDisplayName, ghToGl, handleFetchGitLab,
  } = useAppContext();

  const [glMRListTab, setGlMRListTab] = useState('authored');
  const [glMRListSearch, setGlMRListSearch] = useState('');
  const [glMRListPage, setGlMRListPage] = useState(1);
  const [glStatusFilter, setGlStatusFilter] = useState('all');

  useEffect(() => { setGlMRListPage(1); }, [activeAssociate]);

  const glMRListItems = useMemo(() => {
    const logins = activeAssociate
      ? [ghToGl(activeAssociate)]
      : associateList.map(a => ghToGl(a));
    const allItems = [];
    const seen = new Set();
    for (const login of logins) {
      const m = glMRMetrics[login] || glMRMetrics[login?.toLowerCase()];
      if (!m) continue;
      const items = glMRListTab === 'authored' ? (m.authoredMRs ?? []) : (m.reviewedMRs ?? []);
      for (const mr of items) {
        const key = `${mr.iid}-${mr.url}`;
        if (!seen.has(key)) { seen.add(key); allItems.push({ ...mr, login }); }
      }
    }
    let filtered = allItems;
    if (glStatusFilter !== 'all') {
      filtered = filtered.filter(mr => mr.state === glStatusFilter);
    }
    const q = glMRListSearch.toLowerCase();
    if (q) {
      filtered = filtered.filter(mr => mr.title.toLowerCase().includes(q) || mr.author.toLowerCase().includes(q) || String(mr.iid).includes(q) || (mr.project || '').toLowerCase().includes(q));
    }
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return filtered;
  }, [glMRMetrics, activeAssociate, associateList, ghToGl, glMRListTab, glMRListSearch, glStatusFilter]);

  const pagedGLMRList = useMemo(() => {
    const s = (glMRListPage - 1) * PAGE_SIZE;
    return glMRListItems.slice(s, s + PAGE_SIZE);
  }, [glMRListItems, glMRListPage]);
  const glMRListTotalPages = Math.ceil(glMRListItems.length / PAGE_SIZE);

  return (
    <>
      {glError && (
        <div className="alert alert-error">
          {glError}
          {/vpn|unable to reach|name.?resolution|max retries/i.test(glError) && (
            <div style={{ marginTop:8, fontSize:13, opacity:0.9 }}>
              Tip: If your GitLab instance is behind a corporate VPN, make sure you are connected to the VPN and try again.
            </div>
          )}
        </div>
      )}
      {!glFetched && !glLoading && (
        <div className="empty-state">
          <GitLabIcon size={40} />
          <p>Configure your GitLab token and project in Settings, then click &quot;Fetch GitLab&quot;</p>
        </div>
      )}
      {glLoading && <div className="loading-overlay"><div className="spinner"/>Fetching from {glProjectList.length > 1 ? `${glProjectList.length} GitLab projects` : 'GitLab'}…{glProgress && <span style={{ display:'block', fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{glProgress.phase ? `${glProgress.phase}: ` : ''}{glProgress.completed} / {glProgress.total} projects</span>}</div>}

      {glFetched && !glLoading && glCacheTs && (
        <div className="alert" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:13, marginBottom:8 }}>
          Showing cached data from {new Date(glCacheTs).toLocaleString()}.{' '}
          <button className="btn btn-outline" style={{ padding:'2px 10px', fontSize:12 }} onClick={handleFetchGitLab}>Refresh</button>
        </div>
      )}

      {glFetched && !glLoading && (
        <>
          {associateList.length > 0 && (
            <div className="filters-row">
              <div className="filter-group">
                <label>Filter by associate</label>
                <div className="chip-list">
                  <button
                    className={`chip chip-all ${!activeAssociate ? 'active' : ''}`}
                    onClick={() => setActiveAssociate(null)}
                  >All</button>
                  {associateList.map(gh => (
                    <button
                      key={gh}
                      className={`chip ${activeAssociate?.toLowerCase() === gh?.toLowerCase() ? 'active' : ''}`}
                      onClick={() => setActiveAssociate(prev => prev?.toLowerCase() === gh?.toLowerCase() ? null : gh)}
                    >
                      {ghDisplayName(gh)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {Object.keys(glMRMetrics).length > 0 && (() => {
            const mrAuthors = (activeAssociate ? [activeAssociate] : associateList)
              .map((gh, i) => {
                const gl = ghToGl(gh);
                return { login: gl, displayName: ghDisplayName(gh), ...glMRMetrics[gl], colorIdx: i };
              })
              .filter(a => a.mrsOpened != null);
            if (!mrAuthors.length) return null;
            return (
              <>
                <div className="stats-grid" style={{ marginTop:8 }}>
                  {[
                    { label:'MRs Authored', tip:'Total merge requests authored during the selected period — includes MRs created in-range plus MRs created earlier but merged in-range.', value: mrAuthors.reduce((s,a) => s + (a.mrsOpened ?? 0), 0), color:'#FC6D26' },
                    { label:'MRs Merged', tip:'Merge requests that were successfully merged into the target branch during the selected period.', value: mrAuthors.reduce((s,a) => s + (a.mrsMerged ?? 0), 0), color:'var(--accent2)' },
                    { label:'Reviews Given', tip:'Merge requests where the associate was listed as a reviewer, indicating participation in code review for others\' work.', value: mrAuthors.reduce((s,a) => s + (a.mrsReviewed ?? 0), 0), color:'var(--accent4)' },
                    { label:'Review Notes', tip:'Total discussion notes/comments on MRs the associate reviewed. Higher counts suggest more thorough code review engagement.', value: mrAuthors.reduce((s,a) => s + (a.reviewNotes ?? 0), 0), color:'#d2a8ff' },
                    { label:'Avg Cycle Time', tip:'Average number of days from MR creation to merge. Lower values suggest faster turnaround; very low values on large MRs may indicate insufficient review.', value: (() => {
                      const vals = mrAuthors.map(a => a.avgCycleTimeDays).filter(v => v != null);
                      return vals.length ? `${(vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1)}d` : '—';
                    })(), color:'var(--accent5)' },
                    { label:'Avg Lines/MR', tip:'Average total lines changed (additions + deletions) per merged MR. Helps gauge typical MR size.', value: (() => {
                      const vals = mrAuthors.map(a => a.avgLinesChanged).filter(v => v != null);
                      return vals.length ? Math.round(vals.reduce((a,b) => a+b, 0) / vals.length).toLocaleString() : '—';
                    })(), color:'#f0883e' },
                    { label:'Avg Files/MR', tip:'Average number of files changed per merged MR. Smaller values often indicate more focused, reviewable changes.', value: (() => {
                      const vals = mrAuthors.map(a => a.avgFilesChanged).filter(v => v != null);
                      return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : '—';
                    })(), color:'#f0883e' },
                    { label:'Close Rate', tip:'Percentage of authored MRs that were closed without being merged. A high rate may indicate abandoned work or MRs superseded by newer ones.', value: (() => {
                      const totalOpened = mrAuthors.reduce((s,a) => s + (a.mrsOpened ?? 0), 0);
                      const totalClosed = mrAuthors.reduce((s,a) => {
                        const authored = a.authoredMRs ?? [];
                        return s + authored.filter(mr => mr.state === 'closed').length;
                      }, 0);
                      return totalOpened > 0 ? `${Math.round((totalClosed / totalOpened) * 100)}%` : '—';
                    })(), color:'var(--danger)' },
                  ].map(s => (
                    <div key={s.label} className="stat-card">
                      <div className="label">{s.label}{s.tip && <InfoTip text={s.tip} />}</div>
                      <div className="value" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className="charts-grid" style={{ marginTop:8 }}>
                  <div className="chart-card">
                    <h3>MRs Authored vs Merged</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={mrAuthors} margin={{ top:16, right:8, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="mrsOpened" name="Authored" fill="#FC6D26" radius={[4,4,0,0]}>
                          <LabelList dataKey="mrsOpened" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                        <Bar dataKey="mrsMerged" name="Merged" fill="var(--accent2)" radius={[4,4,0,0]}>
                          <LabelList dataKey="mrsMerged" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-card">
                    <h3>MR Complexity (Merged MRs)</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={mrAuthors} margin={{ top:16, right:50, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis yAxisId="lines" tick={{ fill:'#f0883e', fontSize:10 }} tickLine={false} axisLine={false} allowDecimals={false}
                          label={{ value:'Lines', angle:-90, position:'insideLeft', fill:'#f0883e', fontSize:11, dx:-4 }} />
                        <YAxis yAxisId="files" orientation="right" tick={{ fill:'#d29922', fontSize:10 }} tickLine={false} axisLine={false}
                          label={{ value:'Files', angle:90, position:'insideRight', fill:'#d29922', fontSize:11, dx:4 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar yAxisId="lines" dataKey="avgLinesChanged" name="Avg Lines Changed" fill="#f0883e" radius={[4,4,0,0]}>
                          <LabelList dataKey="avgLinesChanged" position="top" fill="#8b949e" fontSize={10} formatter={v => v != null ? v.toLocaleString() : ''} />
                        </Bar>
                        <Bar yAxisId="files" dataKey="avgFilesChanged" name="Avg Files Changed" fill="#d29922" radius={[4,4,0,0]}>
                          <LabelList dataKey="avgFilesChanged" position="top" fill="#8b949e" fontSize={10} formatter={v => v != null ? v : ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h3>Code Reviews Given</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={mrAuthors} margin={{ top:16, right:8, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="mrsReviewed" name="MRs Reviewed" fill="var(--accent4)" radius={[4,4,0,0]}>
                          <LabelList dataKey="mrsReviewed" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                        <Bar dataKey="reviewNotes" name="Review Notes" fill="#d2a8ff" radius={[4,4,0,0]}>
                          <LabelList dataKey="reviewNotes" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h3>Close Rate &amp; Cycle Time</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={mrAuthors.map(a => {
                        const authored = a.authoredMRs ?? [];
                        const closed = authored.filter(mr => mr.state === 'closed').length;
                        return { ...a, mrsClosed: closed, closeRate: a.mrsOpened > 0 ? Math.round((closed / a.mrsOpened) * 100) : 0 };
                      })} margin={{ top:16, right:40, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis yAxisId="count" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="days" orientation="right" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} unit="d" />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar yAxisId="count" dataKey="mrsClosed" name="MRs Closed" fill="var(--danger)" radius={[4,4,0,0]}>
                          <LabelList dataKey="mrsClosed" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                        <Bar yAxisId="days" dataKey="avgCycleTimeDays" name="Avg Cycle Time (d)" fill="var(--accent5)" radius={[4,4,0,0]}>
                          <LabelList dataKey="avgCycleTimeDays" position="top" fill="#8b949e" fontSize={10} formatter={v => v != null ? `${v}d` : ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            );
          })()}

          {Object.keys(glMRMetrics).length > 0 && (
          <div className="table-card">
            <div className="table-header">
              <h3>
                <span style={{ display:'inline-flex', gap:4 }}>
                  <button className={`btn ${glMRListTab==='authored' ? 'btn-primary' : 'btn-outline'}`} style={{ padding:'4px 12px', fontSize:13 }}
                    onClick={() => { setGlMRListTab('authored'); setGlMRListPage(1); }}>Authored MRs</button>
                  <button className={`btn ${glMRListTab==='reviewed' ? 'btn-primary' : 'btn-outline'}`} style={{ padding:'4px 12px', fontSize:13 }}
                    onClick={() => { setGlMRListTab('reviewed'); setGlMRListPage(1); }}>Reviewed MRs</button>
                </span>
                {' '}<span className="badge">{glMRListItems.length}</span>
              </h3>
              <input className="input" type="text" placeholder="Search title, author, project, or !…"
                value={glMRListSearch} onChange={e => { setGlMRListSearch(e.target.value); setGlMRListPage(1); }} style={{ width:280 }} />
            </div>
            <div className="table-wrap">
              {(() => {
                const isAuthored = glMRListTab === 'authored';
                const isMultiProject = glProjectList.length > 1;
                const colCount = (isAuthored ? 9 : 6) + (isMultiProject ? 1 : 0);
                return (
              <table>
                <thead><tr>
                  <th>MR</th>
                  <th>Title</th>
                  {isMultiProject && <th>Project</th>}
                  <th>Author</th>
                  {!isAuthored && <th>Reviewer</th>}
                  <th style={{ padding:0 }}>
                    <select value={glStatusFilter} onChange={e => { setGlStatusFilter(e.target.value); setGlMRListPage(1); }}
                      style={{ background:'transparent', color:'inherit', border:'none', font:'inherit', fontWeight:600, cursor:'pointer', padding:'8px 4px', width:'100%' }}>
                      <option value="all">Status</option>
                      <option value="opened">Open</option>
                      <option value="merged">Merged</option>
                      <option value="closed">Closed</option>
                    </select>
                  </th>
                  {isAuthored && <th>Code +/−</th>}
                  {isAuthored && <th>Files</th>}
                  <th>Created</th>
                  {isAuthored && <th>Merged</th>}
                </tr></thead>
                <tbody>
                  {pagedGLMRList.length === 0 ? (
                    <tr><td colSpan={colCount} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                      No MRs match current filters
                    </td></tr>
                  ) : pagedGLMRList.map(mr => (
                    <tr key={`${mr.iid}-${mr.login}`}>
                      <td style={{ whiteSpace:'nowrap' }}><a className="commit-sha" href={mr.url} target="_blank" rel="noreferrer">!{mr.iid}</a></td>
                      <td><a className="pr-title-link" href={mr.url} target="_blank" rel="noreferrer">{mr.title}</a></td>
                      {isMultiProject && <td style={{ fontSize:12, whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }} title={mr.project}>{mr.project?.split('/').pop() || '—'}</td>}
                      <td title={mr.author}>{glDisplayName(mr.author)}</td>
                      {!isAuthored && <td title={mr.login}>{glDisplayName(mr.login)}</td>}
                      <td>
                        <span style={{
                          padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600,
                          background: mr.state === 'merged' ? '#8957e5' : mr.state === 'opened' ? '#238636' : '#da3633',
                          color: '#fff',
                        }}>
                          {mr.state}
                        </span>
                      </td>
                      {isAuthored && <td style={{ fontSize:12, whiteSpace:'nowrap' }}>
                        {mr.additions != null ? <><span style={{ color:'#3fb950' }}>+{mr.additions}</span>{' '}<span style={{ color:'#f85149' }}>−{mr.deletions}</span></> : '—'}
                      </td>}
                      {isAuthored && <td>{mr.changedFiles ?? '—'}</td>}
                      <td className="commit-date">{fmtDate(mr.createdAt)}</td>
                      {isAuthored && <td className="commit-date">{mr.mergedAt ? fmtDate(mr.mergedAt) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
                );
              })()}
            </div>
            <Pagination page={glMRListPage} totalPages={glMRListTotalPages} onPageChange={setGlMRListPage} />
          </div>
          )}
        </>
      )}
    </>
  );
}
