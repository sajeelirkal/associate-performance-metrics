import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { GitHubIcon, ChartTooltip, Pagination, InfoTip } from '../shared';
import { COLORS, PAGE_SIZE, PR_CHURN_TIP, fmtDate } from '../../utils/helpers';

export default function GitHubTab() {
  const {
    ghError, ghFetched, ghLoading, ghCacheTs, ghProgress,
    ghRepoList, contributors, prMetrics, prFetchNote,
    activeAssociate, setActiveAssociate, associateList,
    ghDisplayName, handleFetchGitHub, since, until,
  } = useAppContext();

  const [prListSearch, setPrListSearch] = useState('');
  const [prListPage, setPrListPage] = useState(1);
  const [prListTab, setPrListTab] = useState('authored');

  useEffect(() => { setPrListPage(1); }, [activeAssociate]);

  const prListItems = useMemo(() => {
    const logins = activeAssociate
      ? [activeAssociate.toLowerCase()]
      : associateList.map(a => a.toLowerCase());
    const allItems = [];
    const seen = new Set();
    for (const login of logins) {
      const m = prMetrics[login];
      if (!m) continue;
      const items = prListTab === 'authored' ? (m.authoredPRs ?? []) : (m.reviewedPRs ?? []);
      for (const pr of items) {
        const key = `${pr.repo || ''}#${pr.number}`;
        if (!seen.has(key)) { seen.add(key); allItems.push({ ...pr, login }); }
      }
    }
    const q = prListSearch.toLowerCase();
    const filtered = q
      ? allItems.filter(pr => pr.title.toLowerCase().includes(q) || pr.author.toLowerCase().includes(q) || String(pr.number).includes(q) || (pr.repo || '').toLowerCase().includes(q))
      : allItems;
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return filtered;
  }, [prMetrics, activeAssociate, associateList, prListTab, prListSearch]);

  const prListRateLimited = useMemo(() => {
    const logins = activeAssociate
      ? [activeAssociate.toLowerCase()]
      : associateList.map(a => a.toLowerCase());
    return logins.some(l => prMetrics[l]?._rateLimited);
  }, [prMetrics, activeAssociate, associateList]);

  const pagedPRList = useMemo(() => {
    const s = (prListPage - 1) * PAGE_SIZE;
    return prListItems.slice(s, s + PAGE_SIZE);
  }, [prListItems, prListPage]);
  const prListTotalPages = Math.ceil(prListItems.length / PAGE_SIZE);

  return (
    <>
      {ghError && <div className="alert alert-error">{ghError}</div>}
      {!ghFetched && !ghLoading && (
        <div className="empty-state">
          <GitHubIcon />
          <p>Enter your GitHub token and click "Fetch GitHub"</p>
        </div>
      )}
      {ghLoading && <div className="loading-overlay"><div className="spinner"/>Fetching from {ghRepoList.length > 1 ? `${ghRepoList.length} GitHub repos` : ghRepoList[0] || 'GitHub'}…{ghProgress && <span style={{ display:'block', fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{ghProgress.phase ? `${ghProgress.phase}: ` : ''}{ghProgress.completed} / {ghProgress.total} repos</span>}</div>}

      {ghFetched && !ghLoading && ghCacheTs && (
        <div className="alert" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:13, marginBottom:8 }}>
          Showing cached data from {new Date(ghCacheTs).toLocaleString()}.{' '}
          <button className="btn btn-outline" style={{ padding:'2px 10px', fontSize:12 }} onClick={handleFetchGitHub}>Refresh</button>
        </div>
      )}

      {ghFetched && !ghLoading && (
        <>
          {contributors.length > 0 && (
            <div className="filters-row">
              <div className="filter-group">
                <label>Filter by contributor</label>
                <div className="chip-list">
                  <button
                    className={`chip chip-all ${!activeAssociate ? 'active' : ''}`}
                    onClick={() => setActiveAssociate(null)}
                  >All</button>
                  {contributors.map((c) => {
                    const normalized = associateList.find(a => a.toLowerCase() === c.login.toLowerCase()) || c.login;
                    return (
                    <button
                      key={c.login}
                      className={`chip ${activeAssociate?.toLowerCase() === c.login.toLowerCase() ? 'active' : ''}`}
                      onClick={() => {
                        setActiveAssociate(prev => prev?.toLowerCase() === normalized.toLowerCase() ? null : normalized);
                      }}
                    >
                      {c.avatarUrl && <img src={c.avatarUrl} alt="" />}
                      {ghDisplayName(c.login)}
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {Object.keys(prMetrics).filter(k => k !== '_rateLimited').length > 0 && (() => {
            const prRows = (activeAssociate
              ? [activeAssociate]
              : associateList
            ).map((login, i) => ({ login, displayName: ghDisplayName(login), ...prMetrics[login?.toLowerCase()] ?? {}, colorIdx: i }))
             .filter(r => r.prsOpened != null);
            if (!prRows.length) return null;
            const totalPRs = prRows.reduce((s,r) => s + (r.prsOpened ?? 0), 0);
            return (
              <>
                {prFetchNote && (
                  <div className="alert alert-warn" style={{ marginTop:8 }}>{prFetchNote}</div>
                )}
                {!prFetchNote && totalPRs === 0 && (
                  <div className="alert" style={{ marginTop:8, background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:13 }}>
                    No PRs found for <strong style={{ color:'var(--text)' }}>{prRows.map(r=>r.displayName).join(', ')}</strong> in {since}–{until} in <code>{ghRepoList.join(', ')}</code>.
                    Verify the GitHub usernames in the mapping table match their GitHub accounts, and that the date range covers their activity.
                  </div>
                )}
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
                    { label:'Avg Lines/PR', value: (() => {
                        const vals = prRows.map(r=>r.avgLinesChanged).filter(v=>v!=null);
                        return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length).toLocaleString() : '—';
                      })(), color:'#f0883e' },
                    { label:'Avg Files/PR', value: (() => {
                        const vals = prRows.map(r=>r.avgFilesChanged).filter(v=>v!=null);
                        return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '—';
                      })(), color:'#f0883e' },
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

                <div className="charts-grid" style={{ marginTop:8 }}>
                  <div className="chart-card">
                    <h3>PRs Opened vs Merged</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={prRows} margin={{ top:16, right:8, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="prsOpened" name="Opened" fill="var(--accent)" radius={[4,4,0,0]}>
                          <LabelList dataKey="prsOpened" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                        <Bar dataKey="prsMerged" name="Merged" fill="var(--accent2)" radius={[4,4,0,0]}>
                          <LabelList dataKey="prsMerged" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card">
                    <h3>PR Complexity (Merged PRs)</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={prRows} margin={{ top:16, right:50, left:0, bottom:0 }}>
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
                      <BarChart data={prRows} margin={{ top:16, right:8, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar dataKey="prsReviewed" name="PRs Reviewed" fill="var(--accent4)" radius={[4,4,0,0]}>
                          <LabelList dataKey="prsReviewed" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                        <Bar dataKey="reviewComments" name="Review Comments" fill="#d2a8ff" radius={[4,4,0,0]}>
                          <LabelList dataKey="reviewComments" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="chart-card full-width">
                    <h3>PR Churn &amp; Cycle Time <InfoTip text={PR_CHURN_TIP} />
                      <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>
                        Lower churn % is better.
                      </span>
                    </h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={prRows} margin={{ top:16, right:40, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                        <YAxis yAxisId="count" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="days" orientation="right" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} unit="d" />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                        <Bar yAxisId="count" dataKey="prsChurned" name="PRs Churned" fill="var(--danger)" radius={[4,4,0,0]}>
                          <LabelList dataKey="prsChurned" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
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

          <div className="table-card">
            <div className="table-header">
              <h3>
                <span style={{ display:'inline-flex', gap:4 }}>
                  <button className={`btn ${prListTab==='authored' ? 'btn-primary' : 'btn-outline'}`} style={{ padding:'4px 12px', fontSize:13 }}
                    onClick={() => { setPrListTab('authored'); setPrListPage(1); }}>Authored PRs</button>
                  <button className={`btn ${prListTab==='reviewed' ? 'btn-primary' : 'btn-outline'}`} style={{ padding:'4px 12px', fontSize:13 }}
                    onClick={() => { setPrListTab('reviewed'); setPrListPage(1); }}>Reviewed PRs</button>
                </span>
                {' '}<span className="badge">{prListItems.length}</span>
              </h3>
              <input className="input" type="text" placeholder="Search title, author, repo, or #…"
                value={prListSearch} onChange={e => { setPrListSearch(e.target.value); setPrListPage(1); }} style={{ width:280 }} />
            </div>
            {prListRateLimited && (
              <div style={{ padding:'6px 14px', fontSize:12, color:'var(--accent5)', background:'rgba(210,168,255,0.08)', borderBottom:'1px solid var(--border)' }}>
                ⚠ GitHub rate limit reached — PR data may be incomplete for some associates.
              </div>
            )}
            <div className="table-wrap">
              {(() => {
                const isAuthored = prListTab === 'authored';
                const isMultiRepo = ghRepoList.length > 1;
                const prColCount = (isAuthored ? 8 : 6) + (isMultiRepo ? 1 : 0);
                return (
              <table>
                <thead><tr>
                  <th>#</th>
                  <th>Title</th>
                  {isMultiRepo && <th>Repo</th>}
                  <th>Author</th>
                  {!isAuthored && <th>Reviewer</th>}
                  <th>Status</th>
                  {isAuthored && <th>+/−</th>}
                  {isAuthored && <th>Files</th>}
                  <th>Created</th>
                  {isAuthored && <th>Merged</th>}
                </tr></thead>
                <tbody>
                  {pagedPRList.length === 0 ? (
                    <tr><td colSpan={prColCount} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                      No PRs match current filters
                    </td></tr>
                  ) : pagedPRList.map(pr => (
                    <tr key={`${pr.number}-${pr.login}-${pr.repo}`}>
                      <td><a className="commit-sha" href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a></td>
                      <td><a className="pr-title-link" href={pr.url} target="_blank" rel="noreferrer">{pr.title}</a></td>
                      {isMultiRepo && <td style={{ fontSize:12, whiteSpace:'nowrap', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis' }} title={pr.repo}>{pr.repo?.split('/').pop() || '—'}</td>}
                      <td title={pr.author}>{ghDisplayName(pr.author)}</td>
                      {!isAuthored && <td title={pr.login}>{ghDisplayName(pr.login)}</td>}
                      <td>
                        <span style={{
                          padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:600,
                          background: pr.state === 'merged' ? '#8957e5' : pr.state === 'open' ? '#238636' : '#da3633',
                          color: '#fff',
                        }}>
                          {pr.state}
                        </span>
                      </td>
                      {isAuthored && <td style={{ fontSize:12, whiteSpace:'nowrap' }}>
                        {pr.additions != null ? <><span style={{ color:'#3fb950' }}>+{pr.additions}</span>{' '}<span style={{ color:'#f85149' }}>−{pr.deletions}</span></> : '—'}
                      </td>}
                      {isAuthored && <td>{pr.changedFiles ?? '—'}</td>}
                      <td className="commit-date">{fmtDate(pr.createdAt)}</td>
                      {isAuthored && <td className="commit-date">{pr.mergedAt ? fmtDate(pr.mergedAt) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
                );
              })()}
            </div>
            <Pagination page={prListPage} totalPages={prListTotalPages} onPageChange={setPrListPage} />
          </div>
        </>
      )}
    </>
  );
}
