import { useAppContext } from '../../context/AppContext';
import { GitHubIcon, JiraIcon, GitLabIcon, CalendarIcon } from '../shared';
import { COLORS, QUICK_RANGES, buildQuarterRanges } from '../../utils/helpers';
import { clearAllCaches } from '../../utils/cache';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';

const QUARTER_RANGES = buildQuarterRanges();

export default function SettingsPage() {
  const {
    sinceDate, setSinceDate, untilDate, setUntilDate, applyQuickRange,
    token, setToken, ghRepo, oauthAvailable, backendUp,
    ghOAuthSuccess, ghRepoRows, setGhRepoRow, addGhRepoRow, removeGhRepoRow,
    associates, setAssociates, associateList, userMapping,
    jiraBase, setJiraBase, jiraEmail, setJiraEmail, jiraApiKey, setJiraApiKey,
    jiraTestStatus, jiraTestMsg, handleTestJira,
    glUrl, setGlUrl, glToken, setGlToken,
    glProjectRows, setGlProjectRow, addGlProjectRow, removeGlProjectRow,
    glTestStatus, glTestMsg, handleTestGitLab,
    mappings, setMappings, addMappingRow, removeMappingRow, updateMapping,
    lookupState, setLookupState, lookupJiraUser, mappingSaved,
    handleExportConfig, handleImportConfig,
    handleFetchAll, handleFetchGitHub, handleFetchGitLab, handleFetchJira,
    fetchAllLoading, ghLoading, glLoading, jiraLoading,
    ghFetched, glFetched, jiraFetched,
    ghError, glError, jiraError,
    demoMode, handleLoadDemo, handleClearDemo,
    cacheClearMsg, setCacheClearMsg,
    setGhCacheTs, setJiraCacheTs, setGlCacheTs,
  } = useAppContext();

  return (
    <div className="settings-page">
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

      <section className="settings-section">
        <h2 className="settings-section-title"><GitHubIcon size={16}/> GitHub</h2>
        {ghOAuthSuccess && (
          <div className="alert alert-info" style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            ✓ Successfully connected with GitHub!
          </div>
        )}
        <div className="settings-grid">
          <div className="field">
            <label>GitHub Authentication</label>
            {oauthAvailable && (
              <a
                href="/api/github/login"
                className="btn btn-primary"
                style={{ display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', marginBottom:10, width:'fit-content' }}
              >
                <GitHubIcon size={16}/> {token ? '↻ Re-connect with GitHub' : 'Connect with GitHub'}
              </a>
            )}
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
            <label>Repositories</label>
            {ghRepoRows.map((repo, i) => (
              <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}>
                <input className="input" type="text" placeholder="org/repository" value={repo}
                  style={{ flex:1 }}
                  onChange={e => setGhRepoRow(i, e.target.value)} />
                {(ghRepoRows.length > 1 || repo) && (
                  <button className="btn btn-outline" style={{ padding:'4px 10px', fontSize:12, flexShrink:0 }}
                    onClick={() => removeGhRepoRow(i)} title="Remove repo">✕</button>
                )}
              </div>
            ))}
            <button className="btn btn-outline" style={{ padding:'3px 12px', fontSize:12, alignSelf:'flex-start', marginTop:2 }}
              onClick={addGhRepoRow}>
              + Add repo
            </button>
            <span className="token-hint">Each row is an <code>org/repository</code> path — data from all repos is merged.</span>
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

      <section className="settings-section">
        <h2 className="settings-section-title"><JiraIcon size={16}/> Atlassian / Jira</h2>
        <div className="settings-grid">
          <div className="field">
            <label>Jira Base URL</label>
            <input className="input" type="text" placeholder="https://your-org.atlassian.net" value={jiraBase} onChange={e => setJiraBase(e.target.value)} />
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

      <section className="settings-section">
        <h2 className="settings-section-title"><GitLabIcon size={16}/> GitLab</h2>
        <div className="settings-grid">
          <div className="field">
            <label>GitLab Base URL</label>
            <input className="input" type="text" placeholder="https://gitlab.example.com" value={glUrl} onChange={e => setGlUrl(e.target.value)} />
            <span className="token-hint">Self-managed instances behind VPN are supported — ensure you are connected before fetching</span>
          </div>
          <div className="field">
            <label>Personal Access Token</label>
            <input className="input" type="password" placeholder="glpat-…" value={glToken} onChange={e => setGlToken(e.target.value)} />
            <span className="token-hint">
              Create at <strong>GitLab → Preferences → Access Tokens</strong> with <code>read_api</code> scope
            </span>
          </div>
          <div className="field">
            <label>Project Paths</label>
            {glProjectRows.map((proj, i) => (
              <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}>
                <input className="input" type="text" placeholder="group/project" value={proj}
                  style={{ flex:1 }}
                  onChange={e => setGlProjectRow(i, e.target.value)} />
                {(glProjectRows.length > 1 || proj) && (
                  <button className="btn btn-outline" style={{ padding:'4px 10px', fontSize:12, flexShrink:0 }}
                    onClick={() => removeGlProjectRow(i)} title="Remove project">✕</button>
                )}
              </div>
            ))}
            <button className="btn btn-outline" style={{ padding:'3px 12px', fontSize:12, alignSelf:'flex-start', marginTop:2 }}
              onClick={addGlProjectRow}>
              + Add project
            </button>
            <span className="token-hint">Each row is a project path as shown in the URL — data from all projects is merged.</span>
          </div>
          <div className="field" style={{ alignSelf:'end' }}>
            <button className="btn btn-outline" onClick={handleTestGitLab} style={{ marginBottom:8, width:'100%' }}>
              Test Connection
            </button>
            {glTestStatus && (
              <div className={`alert ${glTestStatus === 'ok' ? 'alert-info' : 'alert-error'}`} style={{ marginTop:8 }}>
                {glTestStatus === 'ok' ? '✓ ' : '✗ '}{glTestMsg}
                {glTestStatus !== 'ok' && /vpn|unable to reach|name.?resolution|max retries/i.test(glTestMsg) && (
                  <div style={{ marginTop:6, fontSize:13, opacity:0.9 }}>
                    Tip: If your GitLab instance is behind a corporate VPN, make sure you are connected and try again.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="mapping-section" className="settings-section">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <h2 className="settings-section-title" style={{ margin:0 }}>GitHub ↔ GitLab ↔ Jira Username Mapping</h2>
            {mappingSaved && (
              <span style={{ fontSize:12, color:'var(--accent2)', fontWeight:500, transition:'opacity .3s' }}>✓ Saved</span>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
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
          <div className="mapping-header" style={{ gridTemplateColumns:'1fr 1fr 1fr auto auto' }}>
            <span>GitHub Username</span>
            <span>GitLab Username</span>
            <span>Jira Username</span>
            <span/>
            <span/>
          </div>
          {mappings.map((row, i) => {
            const ls = lookupState[i] || {};
            const resolved = !!row.jiraDisplay;
            return (
              <div key={i} style={{ display:'contents' }}>
                <div className="mapping-row" style={{ gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto auto', gap:8, alignItems:'start', padding:'6px 16px' }}>
                  <input className="input" placeholder="github-login" value={row.github}
                    onChange={e => updateMapping(i,'github',e.target.value)} />
                  <input className="input" placeholder="gitlab-login (optional)" value={row.gitlab || ''}
                    onChange={e => updateMapping(i,'gitlab',e.target.value)} />
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
                        return (
                          <button
                            key={u.username}
                            className="btn btn-outline"
                            style={{ fontSize:12, padding:'4px 12px', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}
                            onClick={() => {
                              setMappings(m => m.map((r, idx) => idx === i
                                ? { ...r, jira: u.username, jiraDisplay: u.displayName || u.username }
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

      <section className="settings-section">
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleFetchAll}
            disabled={fetchAllLoading}
            style={{ flex:'1 1 200px', justifyContent:'center', padding:'10px', fontSize:14 }}
          >
            {fetchAllLoading
              ? <><span className="spinner" style={{ width:15, height:15, borderWidth:2 }}/> Fetching all…</>
              : <>↻ Fetch All  <span style={{ opacity:.6, fontSize:12, fontWeight:400 }}>(GitHub + GitLab + Jira)</span></>}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleFetchGitHub}
            disabled={fetchAllLoading}
            style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            title="Fetch only GitHub data"
          >
            {ghLoading
              ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2 }}/> GitHub…</>
              : <><GitHubIcon size={14}/> {ghFetched && !ghError ? '↻ Re-fetch GitHub' : 'Fetch GitHub'}</>}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleFetchGitLab}
            disabled={fetchAllLoading}
            style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            title="Fetch only GitLab data"
          >
            {glLoading
              ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2 }}/> GitLab…</>
              : <><GitLabIcon size={14}/> {glFetched && !glError ? '↻ Re-fetch GitLab' : 'Fetch GitLab'}</>}
          </button>
          <button
            className="btn btn-outline"
            onClick={handleFetchJira}
            disabled={fetchAllLoading}
            style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            title="Fetch only Jira data"
          >
            {jiraLoading
              ? <><span className="spinner" style={{ width:13, height:13, borderWidth:2 }}/> Jira…</>
              : <><JiraIcon size={14}/> {jiraFetched && !jiraError ? '↻ Re-fetch Jira' : 'Fetch Jira'}</>}
          </button>
          <button
            className="btn btn-error-outline"
            onClick={() => {
              clearAllCaches();
              setGhCacheTs(null); setJiraCacheTs(null); setGlCacheTs(null);
              setCacheClearMsg('success');
              setTimeout(() => setCacheClearMsg(null), 3000);
            }}
            style={{ flex:'1 1 140px', justifyContent:'center', padding:'10px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            title="Remove all cached GitHub, Jira, and GitLab data"
          >
            {cacheClearMsg === 'success' ? '✓ Cache cleared' : '🗑 Clear Cache'}
          </button>
        </div>

        <div style={{ marginTop:10, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          {ghFetched && !ghError   && <span className="status-pill" style={{ color:'var(--accent2)' }}>✓ GitHub fetched</span>}
          {glFetched && !glError   && <span className="status-pill" style={{ color:'#FC6D26' }}>✓ GitLab fetched</span>}
          {jiraFetched && !jiraError && <span className="status-pill" style={{ color:'#2684FF' }}>✓ Jira fetched</span>}
          {demoMode && <span className="status-pill" style={{ color:'#d2a8ff' }}>🎭 Demo mode active</span>}
          {ghError   && <span className="status-pill" style={{ color:'var(--danger)' }}>✗ GitHub error — use Fetch GitHub to retry</span>}
          {glError   && <span className="status-pill" style={{ color:'var(--danger)' }}>✗ GitLab error — use Fetch GitLab to retry</span>}
          {jiraError && <span className="status-pill" style={{ color:'var(--danger)' }}>✗ Jira error — use Fetch Jira to retry</span>}
        </div>

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
  );
}
