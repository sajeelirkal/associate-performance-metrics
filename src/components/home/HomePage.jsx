import { useAppContext } from '../../context/AppContext';
import { GitHubIcon, JiraIcon, GitLabIcon } from '../shared';

export default function HomePage() {
  const { switchTab, handleLoadDemo } = useAppContext();

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <h1 className="hero-title">
            Team Performance<br />
            <span className="hero-accent">Metrics Dashboard</span>
          </h1>
          <p className="hero-subtitle">
            Unified visibility into your team's engineering activity across GitHub, GitLab, and Jira.
            Track pull requests, merge requests, code reviews, sprint health, and more — all in one place.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => switchTab('settings')}>
              Get Started
            </button>
            <button className="btn btn-outline btn-lg" onClick={handleLoadDemo}>
              View Demo
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <svg width="320" height="220" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="320" height="220" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1"/>
            <rect x="20" y="160" width="36" height="40" rx="4" fill="#58a6ff" opacity="0.8"/>
            <rect x="68" y="120" width="36" height="80" rx="4" fill="#3fb950" opacity="0.8"/>
            <rect x="116" y="80" width="36" height="120" rx="4" fill="#d2a8ff" opacity="0.8"/>
            <rect x="164" y="100" width="36" height="100" rx="4" fill="#ffa657" opacity="0.8"/>
            <rect x="212" y="60" width="36" height="140" rx="4" fill="#58a6ff" opacity="0.6"/>
            <rect x="260" y="40" width="36" height="160" rx="4" fill="#3fb950" opacity="0.6"/>
            <polyline points="38,155 86,115 134,75 182,95 230,55 278,35" stroke="#58a6ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7"/>
            <circle cx="38" cy="155" r="4" fill="#58a6ff"/>
            <circle cx="86" cy="115" r="4" fill="#3fb950"/>
            <circle cx="134" cy="75" r="4" fill="#d2a8ff"/>
            <circle cx="182" cy="95" r="4" fill="#ffa657"/>
            <circle cx="230" cy="55" r="4" fill="#58a6ff" opacity="0.7"/>
            <circle cx="278" cy="35" r="4" fill="#3fb950" opacity="0.7"/>
            <text x="160" y="20" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="inherit">Team Activity Overview</text>
          </svg>
        </div>
      </section>

      <section className="features-grid">
        {[
          { icon: <GitHubIcon size={28} />, title: 'GitHub Analytics', desc: 'Commits, PRs, code reviews, churn rates, and cycle time analysis per contributor.', color: '#58a6ff', tab: 'github' },
          { icon: <GitLabIcon size={28} />, title: 'GitLab Integration', desc: 'Merge requests, commit tracking, review notes, and activity breakdowns across projects.', color: '#FC6D26', tab: 'gitlab' },
          { icon: <JiraIcon size={28} />, title: 'Jira Tracking', desc: 'Sprint health, issue lifecycle, story points, comments, and status transition history.', color: '#2684FF', tab: 'jira' },
          { icon: <span style={{fontSize:28}}>📊</span>, title: 'Performance View', desc: 'Cross-platform comparisons with radar charts, engagement metrics, and team summaries.', color: '#d2a8ff', tab: 'performance' },
        ].map(f => (
          <div key={f.title} className="feature-card" onClick={() => switchTab(f.tab)}>
            <div className="feature-icon" style={{ color: f.color }}>{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
            <span className="feature-link" style={{ color: f.color }}>Explore →</span>
          </div>
        ))}
      </section>

      <section className="home-highlights">
        <div className="highlight-card">
          <div className="highlight-number" style={{ color:'var(--accent)' }}>3</div>
          <div className="highlight-label">Platforms Unified</div>
          <div className="highlight-sub">GitHub · GitLab · Jira</div>
        </div>
        <div className="highlight-card">
          <div className="highlight-number" style={{ color:'var(--accent2)' }}>15+</div>
          <div className="highlight-label">Metrics Tracked</div>
          <div className="highlight-sub">Commits · PRs · Reviews · Sprint Health</div>
        </div>
        <div className="highlight-card">
          <div className="highlight-number" style={{ color:'var(--accent4)' }}>Real-time</div>
          <div className="highlight-label">Data Analysis</div>
          <div className="highlight-sub">Live API integration with your tools</div>
        </div>
      </section>

      <section className="home-cta">
        <h2>Ready to get started?</h2>
        <p>Configure your integrations in Settings, or try the demo to explore with sample data.</p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={() => switchTab('settings')}>
            Open Settings
          </button>
        </div>
      </section>
    </div>
  );
}
