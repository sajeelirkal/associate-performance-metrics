import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, Cell, LabelList,
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { ChartTooltip, InfoTip } from '../shared';
import { COLORS, PR_CHURN_TIP, statusColor, priorityIcon } from '../../utils/helpers';

export default function PerformanceTab() {
  const {
    ghFetched, glFetched, jiraFetched,
    perfData, workSummary, radarShaped,
    prMetrics, activeAssociate, setActiveAssociate,
    ghDisplayName,
  } = useAppContext();

  const [workSummaryOpen, setWorkSummaryOpen] = useState(true);
  const [collapsedPersons, setCollapsedPersons] = useState({});
  const togglePerson = (github) =>
    setCollapsedPersons(s => ({ ...s, [github]: !s[github] }));

  return (
    <>
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
          PR/MR activity, issue throughput, and sprint metrics are <em>quantitative proxies</em> that
          provide context for conversations. They do not capture code quality, collaboration, mentoring,
          on-call impact, complexity of work, or other critical contributions.{' '}
          <strong style={{ color: '#d2a8ff' }}>
            Use this data to inform — never to replace — a holistic, human judgement of an engineer's performance.
            Managers should exercise their own discretion and contextual knowledge when interpreting any metric shown here.
          </strong>
        </div>
      </div>

      {!ghFetched && !glFetched && !jiraFetched && (
        <div className="empty-state">
          <span style={{ fontSize:40 }}>📊</span>
          <p>Fetch GitHub, GitLab, and/or Jira data first</p>
        </div>
      )}

      {(ghFetched || glFetched || jiraFetched) && perfData.length === 0 && (
        <div className="alert alert-info">
          No associates matched. Make sure GitHub usernames match the data or set up the username mapping.
        </div>
      )}

      {perfData.length > 0 && (
        <>
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
                    className={`chip ${activeAssociate?.toLowerCase() === p.github?.toLowerCase() ? 'active' : ''}`}
                    style={{ borderColor: activeAssociate?.toLowerCase() === p.github?.toLowerCase() ? COLORS[i % COLORS.length] : undefined }}
                    onClick={() => setActiveAssociate(prev => prev?.toLowerCase() === p.github?.toLowerCase() ? null : p.github)}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>
            {activeAssociate && (
              <div className="badge" style={{ alignSelf:'center', background:'rgba(88,166,255,0.1)', color:'var(--accent)', padding:'4px 12px', fontSize:12 }}>
                1:1 view — {ghDisplayName(activeAssociate)}
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:24 }}>
            {perfData.filter(p => !activeAssociate || p.github?.toLowerCase() === activeAssociate.toLowerCase()).map((p, i) => {
              const pr = prMetrics[p.github?.toLowerCase()];
              return (
              <div key={p.github} className={`perf-card ${activeAssociate?.toLowerCase() === p.github?.toLowerCase() ? 'perf-card-focused' : ''}`} style={{ borderColor: COLORS[perfData.indexOf(p) % COLORS.length] }}>
                <div className="perf-name" style={{ color: COLORS[i % COLORS.length] }}>{p.displayName}</div>
                {p.displayName !== p.github && <div className="perf-sub">{p.github} (GitHub)</div>}
                <div className="perf-metrics">
                  {pr && <>
                    <div className="perf-metric"><span>GH PRs Merged</span><strong style={{ color:'var(--accent)' }}>{pr.prsMerged ?? '—'}</strong></div>
                    <div className="perf-metric"><span>GH Reviews Given</span><strong style={{ color:'var(--accent4)' }}>{pr.prsReviewed ?? '—'}</strong></div>
                    <div className="perf-metric"><span>GH Review Comments</span><strong style={{ color:'#d2a8ff' }}>{pr.reviewComments ?? '—'}</strong></div>
                    <div className="perf-metric"><span>GH PR Cycle Time</span><strong>{pr.avgCycleTimeDays != null ? `${pr.avgCycleTimeDays}d` : '—'}</strong></div>
                    <div className="perf-metric"><span>Avg Lines/PR</span><strong style={{ color:'#f0883e' }}>{pr.avgLinesChanged != null ? pr.avgLinesChanged.toLocaleString() : '—'}</strong></div>
                    <div className="perf-metric"><span>Avg Files/PR</span><strong style={{ color:'#d29922' }}>{pr.avgFilesChanged != null ? pr.avgFilesChanged : '—'}</strong></div>
                    <div className="perf-metric"><span>PR Churn <InfoTip text={PR_CHURN_TIP} /></span><strong style={{ color: (pr.churnPct??0)>60?'var(--danger)':'inherit' }}>{pr.churnPct != null ? `${pr.churnPct}%` : '—'}</strong></div>
                  </>}
                  {p.glMRsOpened > 0 && <>
                    {pr && <div className="perf-metric" style={{ borderTop:'1px solid var(--border)', gridColumn:'1/-1', paddingTop:4, marginTop:2 }}/>}
                    <div className="perf-metric"><span>GL MRs Merged</span><strong style={{ color:'#FC6D26' }}>{p.glMRsMerged}</strong></div>
                    <div className="perf-metric"><span>GL Reviews Given</span><strong style={{ color:'#FC6D26' }}>{p.glMRsReviewed}</strong></div>
                    <div className="perf-metric"><span>GL MR Cycle Time</span><strong>{p.glAvgCycleTime != null ? `${p.glAvgCycleTime}d` : '—'}</strong></div>
                    <div className="perf-metric"><span>GL Avg Lines/MR</span><strong style={{ color:'#f0883e' }}>{p.glAvgLinesChanged != null ? p.glAvgLinesChanged.toLocaleString() : '—'}</strong></div>
                    <div className="perf-metric"><span>GL Avg Files/MR</span><strong style={{ color:'#d29922' }}>{p.glAvgFilesChanged != null ? p.glAvgFilesChanged : '—'}</strong></div>
                  </>}
                  <div className="perf-metric" style={{ borderTop:'1px solid var(--border)', gridColumn:'1/-1', paddingTop:4, marginTop:2 }}/>
                  <div className="perf-metric"><span>Issues Done</span><strong style={{ color:'var(--accent2)' }}>{p.issuesDone}</strong></div>
                  <div className="perf-metric"><span>Issues Open</span><strong style={{ color:'var(--accent5)' }}>{p.issuesOpen}</strong></div>
                  <div className="perf-metric"><span>Avg Cycle</span><strong>{p.avgCycleTime !== null ? `${p.avgCycleTime}d` : '—'}</strong></div>
                  <div className="perf-metric"><span>Spillovers</span><strong style={{ color: p.totalSpillovers>0?'var(--danger)':'var(--accent2)' }}>{p.totalSpillovers}</strong></div>
                  <div className="perf-metric"><span>Story Pts</span><strong style={{ color:'var(--accent4)' }}>{p.totalSP || '—'}</strong></div>
                  <div className="perf-metric"><span>Jira Comments</span><strong style={{ color:'#d2a8ff' }}>{p.commentsGiven ?? '—'}</strong></div>
                  <div className="perf-metric"><span>Status Changes</span><strong>{p.statusChanges ?? '—'}</strong></div>
                </div>
              </div>
              );
            })}
          </div>

          {(() => {
            const chartPerf = activeAssociate
              ? perfData.filter(p => p.github?.toLowerCase() === activeAssociate.toLowerCase())
              : perfData;
            return (
          <div className="charts-grid">
            <div className="chart-card">
              <h3>PRs/MRs Merged vs Issues Resolved</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartPerf.map(p => ({ ...p, totalMerged: p.ghPRsMerged + p.glMRsMerged }))} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                  <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                  <Bar dataKey="totalMerged" name="PRs/MRs Merged" fill="#58a6ff" radius={[4,4,0,0]}>
                    <LabelList dataKey="totalMerged" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                  </Bar>
                  <Bar dataKey="issuesDone" name="Issues Resolved" fill="#3fb950" radius={[4,4,0,0]}>
                    <LabelList dataKey="issuesDone" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3>Average Cycle Time (days) &amp; Spillovers</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartPerf} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                  <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                  <Bar dataKey="avgCycleTime" name="Avg Cycle Time (d)" fill="#d2a8ff" radius={[4,4,0,0]}>
                    <LabelList dataKey="avgCycleTime" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                  </Bar>
                  <Bar dataKey="totalSpillovers" name="Sprint Spillovers" fill="#f78166" radius={[4,4,0,0]}>
                    <LabelList dataKey="totalSpillovers" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {radarShaped.length > 0 && (
              <div className="chart-card full-width">
                <h3>Relative Performance Radar
                  <span style={{ fontSize:12, fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>
                    each axis normalised to team max = 100
                    {activeAssociate && <> · {ghDisplayName(activeAssociate)}</>}
                  </span>
                </h3>
                <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 8px' }}>
                  Shows how each person scores on 5 PR/MR &amp; Jira dimensions relative to the top performer (100 = best in team).
                  <strong style={{ color:'var(--accent2)' }}> Low Spillover</strong> is inverted — 100 means zero sprint spillovers.
                </p>
                <ResponsiveContainer width="100%" height={360}>
                  <RadarChart data={radarShaped} margin={{ top:20, right:80, left:80, bottom:20 }}>
                    <PolarGrid stroke="#30363d" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill:'#8b949e', fontSize:12 }} />
                    {(activeAssociate
                      ? perfData.filter(p => p.github?.toLowerCase() === activeAssociate.toLowerCase())
                      : perfData
                    ).map((p, i) => (
                      <Radar key={p.github} name={p.displayName || p.github} dataKey={p.github}
                        stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />
                    ))}
                    <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                    <Tooltip
                      contentStyle={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, fontSize:12, color:'#e6edf3' }}
                      formatter={(v, name) => [`${v}`, name]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartPerf.some(p => p.totalSP > 0) && (
              <div className="chart-card">
                <h3>Story Points Completed</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartPerf} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                    <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="totalSP" name="Story Points" radius={[4,4,0,0]}>
                      {chartPerf.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                      <LabelList dataKey="totalSP" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartPerf.some(p => (p.commentsGiven ?? 0) > 0 || (p.statusChanges ?? 0) > 0) && (
              <div className="chart-card">
                <h3>Jira Engagement</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartPerf} margin={{ top:16, right:16, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="displayName" tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} />
                    <YAxis tick={{ fill:'#8b949e', fontSize:11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize:12, color:'#8b949e' }} />
                    <Bar dataKey="commentsGiven" name="Comments Given" fill="#d2a8ff" radius={[4,4,0,0]}>
                      <LabelList dataKey="commentsGiven" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                    </Bar>
                    <Bar dataKey="statusChanges" name="Status Transitions" fill="#79c0ff" radius={[4,4,0,0]}>
                      <LabelList dataKey="statusChanges" position="top" fill="#8b949e" fontSize={10} formatter={v => v || ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          ); })()}

          <div className="table-card">
            <div className="table-header">
              <h3>Performance Summary {activeAssociate && <span className="badge">{ghDisplayName(activeAssociate)}</span>}</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Associate</th>
                    <th>GH PRs Merged</th>
                    <th>GL MRs Merged</th>
                    <th>Reviews</th>
                    <th>GH Avg Lines/PR</th>
                    <th>GL Avg Lines/MR</th>
                    <th>Avg Files</th>
                    <th>PR Churn <InfoTip text={PR_CHURN_TIP} /></th>
                    <th>Issues Done</th>
                    <th>Issues Open</th>
                    <th>Avg Cycle (d)</th>
                    <th>Spillovers</th>
                    <th>Jira Comments</th>
                    <th>Story Points</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeAssociate ? perfData.filter(p => p.github?.toLowerCase() === activeAssociate.toLowerCase()) : perfData).map((p, i) => {
                    const pr = prMetrics[p.github?.toLowerCase()];
                    return (
                    <tr key={p.github}>
                      <td>
                        <div style={{ display:'flex', flexDirection:'column' }}>
                          <strong style={{ color: COLORS[i%COLORS.length] }}>{p.displayName}</strong>
                          {p.displayName !== p.github && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{p.github}</span>}
                        </div>
                      </td>
                      <td style={{ color:'var(--accent)', fontWeight:600 }}>{pr?.prsMerged ?? '—'}</td>
                      <td style={{ color:'#FC6D26', fontWeight:600 }}>{p.glMRsMerged ?? '—'}</td>
                      <td style={{ color:'var(--accent4)', fontWeight:600 }}>{(pr?.prsReviewed ?? 0) + (p.glMRsReviewed ?? 0)}</td>
                      <td style={{ color:'#f0883e', fontWeight:600 }}>{pr?.avgLinesChanged != null ? pr.avgLinesChanged.toLocaleString() : '—'}</td>
                      <td style={{ color:'#f0883e', fontWeight:600 }}>{p.glAvgLinesChanged != null ? p.glAvgLinesChanged.toLocaleString() : '—'}</td>
                      <td style={{ color:'#d29922', fontWeight:600 }}>{(() => { const gh = pr?.avgFilesChanged; const gl = p.glAvgFilesChanged; if (gh != null && gl != null) return `${gh} / ${gl}`; return gh ?? gl ?? '—'; })()}</td>
                      <td>
                        {pr?.churnPct != null
                          ? <span style={{ color:(pr.churnPct>60)?'var(--danger)':'inherit', fontWeight:600 }}>{pr.churnPct}%</span>
                          : '—'}
                      </td>
                      <td><strong style={{ color:'var(--accent2)' }}>{p.issuesDone}</strong></td>
                      <td>{p.issuesOpen}</td>
                      <td>{p.avgCycleTime !== null ? `${p.avgCycleTime}d` : '—'}</td>
                      <td>
                        <span style={{ color: p.totalSpillovers>0?'var(--danger)':'var(--accent2)', fontWeight:600 }}>
                          {p.totalSpillovers}
                        </span>
                      </td>
                      <td style={{ color:'#d2a8ff', fontWeight:600 }}>{p.commentsGiven ?? '—'}</td>
                      <td style={{ color:'var(--accent4)', fontWeight:600 }}>{p.totalSP ?? '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {workSummary.length > 0 && (
            <div style={{ marginTop: 32 }}>
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
                  Jira issues &amp; authored PRs/MRs
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
                  ? workSummary.filter(p => p.github?.toLowerCase() === activeAssociate.toLowerCase())
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
                        <span style={{ fontWeight: 700, fontSize: 14, color }}>{p.displayName}</span>
                        {p.displayName !== p.github && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.github}</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          {doneIssues.length} done · {openIssues.length} open{p.prItems.length > 0 ? ` · ${p.prItems.length} PR${p.prItems.length !== 1 ? 's' : ''}` : ''}{p.mrItems.length > 0 ? ` · ${p.mrItems.length} MR${p.mrItems.length !== 1 ? 's' : ''}` : ''}
                        </span>
                      </button>

                      {!isCollapsed && (
                      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: (p.prItems.length || p.mrItems.length) ? '1fr 1fr' : '1fr', gap: 16 }}>
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
                              {[...doneIssues, ...openIssues].map(issue => (
                                <li key={issue.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
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

                        {(p.prItems.length > 0 || p.mrItems.length > 0) && (
                          <div>
                            {p.prItems.length > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                Authored PRs ({p.prItems.length})
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: p.mrItems.length ? 12 : 0 }}>
                                {p.prItems.slice(0, 20).map(pr => (
                                  <li key={pr.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
                                    <a href={pr.url} target="_blank" rel="noreferrer"
                                      style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, marginRight: 6 }}>
                                      {pr.id}
                                    </a>
                                    <span style={{ color: 'var(--text)' }}>
                                      {pr.title.length > 80 ? pr.title.slice(0, 80) + '…' : pr.title}
                                    </span>
                                    <span style={{
                                      marginLeft: 6, padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                      background: pr.state === 'merged' ? '#8957e5' : pr.state === 'open' ? '#238636' : '#da3633',
                                      color: '#fff',
                                    }}>
                                      {pr.state}
                                    </span>
                                  </li>
                                ))}
                                {p.prItems.length > 20 && (
                                  <li style={{ fontSize: 11, color: 'var(--text-muted)', listStyle: 'none' }}>
                                    + {p.prItems.length - 20} more PRs
                                  </li>
                                )}
                              </ul>
                            </>
                            )}
                            {p.mrItems.length > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#FC6D26', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                Authored MRs ({p.mrItems.length})
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {p.mrItems.slice(0, 20).map(mr => (
                                  <li key={mr.id} style={{ fontSize: 12, lineHeight: 1.4 }}>
                                    <a href={mr.url} target="_blank" rel="noreferrer"
                                      style={{ color: '#FC6D26', textDecoration: 'none', fontWeight: 600, marginRight: 6 }}>
                                      {mr.id}
                                    </a>
                                    <span style={{ color: 'var(--text)' }}>
                                      {mr.title.length > 80 ? mr.title.slice(0, 80) + '…' : mr.title}
                                    </span>
                                    <span style={{
                                      marginLeft: 6, padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                      background: mr.state === 'merged' ? '#8957e5' : mr.state === 'opened' ? '#238636' : '#da3633',
                                      color: '#fff',
                                    }}>
                                      {mr.state}
                                    </span>
                                  </li>
                                ))}
                                {p.mrItems.length > 20 && (
                                  <li style={{ fontSize: 11, color: 'var(--text-muted)', listStyle: 'none' }}>
                                    + {p.mrItems.length - 20} more MRs
                                  </li>
                                )}
                              </ul>
                            </>
                            )}
                          </div>
                        )}
                      </div>
                      )}

                      {!isCollapsed && p.jiraItems.length === 0 && p.prItems.length === 0 && p.mrItems.length === 0 && (
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
  );
}
