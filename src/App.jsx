import { AppProvider, useAppContext } from './context/AppContext';
import { GitHubIcon, JiraIcon, GitLabIcon } from './components/shared';
import StatusBar from './components/layout/StatusBar';
import HomePage from './components/home/HomePage';
import GitHubTab from './components/github/GitHubTab';
import GitLabTab from './components/gitlab/GitLabTab';
import JiraTab from './components/jira/JiraTab';
import PerformanceTab from './components/performance/PerformanceTab';
import SettingsPage from './components/settings/SettingsPage';
import './App.css';

function AppShell() {
  const {
    tab, setTab, switchTab,
    demoMode, jiraTestStatus, jiraTestMsg,
    sinceDate, untilDate,
  } = useAppContext();

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={() => setTab('home')} style={{ cursor:'pointer' }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3"  y="18" width="5" height="10" rx="1.5" fill="#58a6ff" opacity="0.9"/>
            <rect x="10" y="12" width="5" height="16" rx="1.5" fill="#3fb950" opacity="0.9"/>
            <rect x="17" y="7"  width="5" height="21" rx="1.5" fill="#d2a8ff" opacity="0.9"/>
            <rect x="24" y="14" width="5" height="14" rx="1.5" fill="#ffa657" opacity="0.9"/>
            <polyline points="5.5,22 12.5,15 19.5,9 26.5,17" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
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
        {tab !== 'home' && (
        <nav className="tab-nav">
          {[
            { id: 'github',      label: 'GitHub',      icon: <GitHubIcon size={15} /> },
            { id: 'gitlab',      label: 'GitLab',      icon: <GitLabIcon size={15} /> },
            { id: 'jira',        label: 'Jira',         icon: <JiraIcon size={15} /> },
            { id: 'performance', label: 'Performance',  icon: <span style={{fontSize:14}}>📊</span> },
            { id: 'settings',    label: 'Settings',     icon: <span style={{fontSize:14}}>⚙️</span> },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        )}
      </header>

      <main className={tab === 'home' ? 'main main-home' : 'main'}>
        {tab === 'home' && <HomePage />}

        {demoMode && tab !== 'settings' && tab !== 'home' && (
          <div style={{ background:'linear-gradient(90deg,#6e40c9,#d2a8ff)', color:'#fff', padding:'6px 20px', fontSize:12, display:'flex', alignItems:'center', gap:12 }}>
            <span>🎭 <strong>Demo Mode</strong> — synthetic data only, no real GitHub or Jira connections.</span>
            <button onClick={() => setTab('settings')} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', borderRadius:6, color:'#fff', padding:'2px 10px', cursor:'pointer', fontSize:12 }}>
              Exit Demo
            </button>
          </div>
        )}

        {tab !== 'settings' && tab !== 'home' && <StatusBar />}

        {jiraTestStatus && tab !== 'settings' && (
          <div className={`alert ${jiraTestStatus === 'ok' ? 'alert-info' : 'alert-error'}`} style={{ marginBottom:16 }}>
            {jiraTestStatus === 'ok' ? '✓ ' : '✗ '}{jiraTestMsg}
          </div>
        )}

        {tab === 'settings' && <SettingsPage />}
        {tab === 'github' && <GitHubTab />}
        {tab === 'gitlab' && <GitLabTab />}
        {tab === 'jira' && <JiraTab />}
        {tab === 'performance' && <PerformanceTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
