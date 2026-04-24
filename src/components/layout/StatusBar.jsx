import { format } from 'date-fns';
import { useAppContext } from '../../context/AppContext';
import { GitHubIcon, JiraIcon, CalendarIcon, GitLabIcon } from '../shared';

export default function StatusBar() {
  const {
    sinceDate, untilDate, associates, associateList, userMapping,
    activeAssociate, setActiveAssociate, ghDisplayName,
    handleFetchAll, handleFetchGitHub, handleFetchGitLab, handleFetchJira,
    fetchAllLoading, ghLoading, glLoading, jiraLoading,
    ghError, glError, jiraError,
    switchTab,
  } = useAppContext();

  return (
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
            👤 {ghDisplayName(activeAssociate)}
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
          className={`btn btn-outline${glError ? ' btn-error-outline' : ''}`}
          onClick={handleFetchGitLab}
          disabled={fetchAllLoading}
          style={{ padding:'4px 12px', fontSize:12, display:'flex', alignItems:'center', gap:4 }}
          title={glError ? `GitLab error — click to retry` : 'Fetch GitLab only'}
        >
          {glLoading
            ? <><span className="spinner" style={{ width:11, height:11, borderWidth:2 }}/></>
            : <GitLabIcon size={13}/>}
          {glError ? '⚠ GitLab' : 'GitLab'}
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
  );
}
