# Associate Performance Metrics

A full-stack engineering team performance dashboard that aggregates activity data from **GitHub** and **Jira** into a unified view for 1:1s and team reviews.

---

## Features

- **GitHub tab** — commits, contributors, PR activity (opened / merged / reviewed), PR churn & cycle time charts
- **Jira tab** — issues, sprint spillovers, cycle time, story points, GitHub commit links, per-associate filtering
- **Performance tab** — unified metrics across GitHub and Jira, relative radar chart, 1:1 associate view, full summary table
- **Settings tab** — GitHub OAuth / PAT, Jira Cloud / Data Center config, date range picker, GitHub↔Jira username mapping, single Fetch All button
- **Demo mode** — one-click synthetic data with a clear performance spread for presentations

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Recharts, react-datepicker |
| Backend | Python FastAPI, `jira` library |
| Auth | GitHub OAuth (+ PAT fallback), Jira PAT / Basic Auth |

---

## Quick Start

### 1. Frontend
```bash
npm install
npm run dev        # http://localhost:5173
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env   # or create backend/.env manually

uvicorn main:app --reload --port 8000
```

### 3. backend/.env
```env
# GitHub OAuth (optional — PAT input in Settings is the fallback)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Create the GitHub OAuth App at https://github.com/settings/developers:
- **Homepage URL**: `http://localhost:5173`
- **Callback URL**: `http://localhost:8000/api/github/callback`

---

## Configuration (in-app Settings tab)

| Field | Description |
|---|---|
| GitHub token | OAuth flow or manual PAT |
| Jira URL | `https://your-org.atlassian.net` or `https://issues.redhat.com` |
| Jira API Token | PAT (Data Center) or API token (Cloud) |
| Jira Email | Only required for Jira Cloud (Basic Auth) |
| Date range | Calendar picker with quick presets |
| Username mapping | GitHub login ↔ Jira username/email table |

---

## Notes

> **Disclaimer**: This dashboard measures *activity*, not performance. Metrics should be interpreted with context and managerial discretion.
