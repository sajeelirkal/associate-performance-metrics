<p align="center">
  <img src="docs/screenshots/home.png" alt="Associate Performance Metrics — Home" width="100%" />
</p>

<h1 align="center">Associate Performance Metrics</h1>

<p align="center">
  A full-stack engineering team performance dashboard that aggregates activity data from <strong>GitHub</strong>, <strong>GitLab</strong>, and <strong>Jira</strong> into a unified view for 1:1s and team reviews.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/FastAPI-0.135-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
</p>

---

## Features

- **GitHub Tab** — Commits, contributors, PR activity (opened / merged / reviewed), PR churn & cycle time charts, PR complexity metrics (avg lines/files per PR), browsable authored & reviewed PR lists with search and pagination, weekly commit breakdowns, and contribution share
- **GitLab Tab** — Merge requests, commit tracking, review notes, and activity breakdowns across projects
- **Jira Tab** — Issues, sprint spillovers, cycle time, story points, status transitions, per-associate filtering, and search
- **Performance Tab** — Unified metrics across all platforms, per-associate scorecards, relative radar chart, 1:1 associate deep-dive, and full summary table with PR complexity data
- **Work Summary & CSV Export** — Per-associate work summary combining commits and Jira issues, exportable as CSV for offline review
- **Settings Tab** — GitHub OAuth / PAT, Jira Cloud & Data Center config, GitLab self-managed support, date range picker, GitHub-Jira username mapping, single "Fetch All" button
- **Performance Ranking** *(planned)* — Configurable composite scoring with preset profiles (Balanced, Code Output, Review Focus, Delivery Speed, Custom) and individual slider adjustments for ranking weights
- **Multi-Repository Support** — Configure multiple GitHub repositories and GitLab projects via add/remove row inputs; data from all repos/projects is merged into a single unified view
- **Parallel Fetching** — Bounded-concurrency workers (5 for GitHub, 3 for GitLab) fetch repos/projects in parallel with phased progress UI; inactive repos are skipped for PR metrics; authenticated requests use reduced API throttle
- **Smart Caching** — localStorage-based caching with 12-hour TTL and 4 MB size guard per entry; cache banners show data freshness with one-click refresh; Clear Cache button in Settings
- **Demo Mode** — One-click synthetic data with a realistic performance spread for presentations and evaluation

---

## Screenshots

<details>
<summary><strong>GitHub Analytics</strong> — Commit activity, contribution share, PR complexity, browsable PR list</summary>
<br />
<img src="docs/screenshots/github.png" alt="GitHub Tab" width="100%" />
<br /><br />
<img src="docs/screenshots/github-charts.png" alt="GitHub Charts" width="100%" />
</details>

<details>
<summary><strong>Jira Tracking</strong> — Issues, cycle time, story points, sprint health</summary>
<br />
<img src="docs/screenshots/jira.png" alt="Jira Tab" width="100%" />
</details>

<details>
<summary><strong>Performance View</strong> — Cross-platform scorecards, radar charts, team summaries</summary>
<br />
<img src="docs/screenshots/performance.png" alt="Performance Tab" width="100%" />
<br /><br />
<img src="docs/screenshots/performance-details.png" alt="Performance Details" width="100%" />
</details>

<details>
<summary><strong>Settings</strong> — Integration config, OAuth, date range, username mapping, multi-repo inputs, cache controls</summary>
<br />
<img src="docs/screenshots/settings.png" alt="Settings Tab" width="100%" />
</details>

---

## Tech Stack

| Layer    | Technology                                         |
| -------- | -------------------------------------------------- |
| Frontend | React 19, Vite 7, Recharts, react-datepicker, Lucide icons |
| Backend  | Python 3.13, FastAPI, `jira` library, `requests`   |
| Auth     | GitHub OAuth (+ PAT fallback), Jira PAT / Basic Auth |
| Infra    | Docker, Docker Compose, Podman compatible          |

---

## Getting Started

### Option 1: Docker / Docker Compose (Recommended)

The fastest way to get up and running — no local Node.js or Python installation required.

**1. Configure environment variables**

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials
```

**2. Start both services**

```bash
docker compose up --build
```

The app will be available at **http://localhost:5173** with the API on port 8000.

> **Using Podman?** Podman Desktop works as a drop-in replacement. If `podman compose` is not available, you can run the containers individually — see [Running with Podman](#running-with-podman) below.

**3. Stop the services**

```bash
docker compose down
```

#### Docker Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│   Frontend (Vite)    │────▶│   Backend (FastAPI)   │
│   Node 22 Alpine     │     │   Python 3.13 Slim    │
│   Port 5173          │     │   Port 8000           │
└──────────────────────┘     └──────────────────────┘
         │                              │
    Volume mounts               Volume mounts
    for hot reload              for live reload
```

Both containers use volume mounts so code changes are reflected immediately without rebuilding.

---

### Option 2: Local Development

#### 1. Frontend

```bash
npm install
npm run dev          # http://localhost:5173
```

#### 2. Backend

```bash
cd backend
pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env

uvicorn main:app --reload --port 8000
```

---

### Running with Podman

If you use Podman Desktop without the compose plugin:

```bash
# Start the Podman machine (first time only)
podman machine start

# Build images
podman build -t apm-backend -f backend/Dockerfile backend/
podman build -t apm-frontend -f Dockerfile .

# Create a pod and run both containers
podman pod create --name apm-pod -p 5173:5173 -p 8000:8000

podman run -d --name apm-backend --pod apm-pod \
  --env-file backend/.env \
  -v ./backend:/app:Z \
  apm-backend

podman run -d --name apm-frontend --pod apm-pod \
  -e API_TARGET=http://localhost:8000 \
  -v ./src:/app/src:Z \
  -v ./public:/app/public:Z \
  -v ./index.html:/app/index.html:Z \
  -v ./vite.config.js:/app/vite.config.js:Z \
  apm-frontend
```

To stop and clean up:

```bash
podman pod stop apm-pod && podman pod rm apm-pod
```

---

## Configuration

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) and create a new OAuth App
2. Set the following values:
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:8000/api/github/callback`
3. Add the Client ID and Secret to `backend/.env`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

> **Note:** OAuth is optional. You can also use a [Personal Access Token](https://github.com/settings/tokens/new?scopes=public_repo&description=Team+Performance+Metrics) directly in the Settings tab.

### Environment Variables

| Variable              | Required | Default                    | Description                                      |
| --------------------- | -------- | -------------------------- | ------------------------------------------------ |
| `GITHUB_CLIENT_ID`    | No       | —                          | GitHub OAuth App client ID                       |
| `GITHUB_CLIENT_SECRET`| No       | —                          | GitHub OAuth App client secret                   |
| `GH_SCOPE`            | No       | `read:user,repo`           | GitHub OAuth scopes                              |
| `FRONTEND_ORIGIN`     | No       | `http://localhost:5173`    | Frontend URL for OAuth redirects                 |
| `GITLAB_SSL_VERIFY`   | No       | `false`                    | SSL verification for self-managed GitLab         |
| `API_TARGET`          | No       | `http://localhost:8000`    | Backend URL (used by Vite proxy in Docker)        |

### In-App Settings

All integration configuration is done through the **Settings** tab in the UI:

| Field             | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| GitHub token      | OAuth flow or manual PAT                                     |
| Repositories      | One or more `org/repository` entries via add/remove row inputs (data is merged across repos) |
| Jira URL          | `https://your-org.atlassian.net` (Cloud) or Data Center URL |
| Jira API Token    | PAT (Data Center) or API token (Cloud)                       |
| Jira Email        | Only required for Jira Cloud (Basic Auth)                    |
| GitLab URL        | Self-managed instance URL                                    |
| GitLab Token      | Personal Access Token with `read_api` scope                  |
| Project Paths     | One or more GitLab project paths via add/remove row inputs (data is merged across projects) |
| Date range        | Calendar picker with quick presets                            |
| Username mapping  | GitHub login <-> Jira username/email mapping table            |
| Clear Cache       | Purges all cached GitHub, Jira, and GitLab data from localStorage |

---

## Caching

Fetched data from GitHub, Jira, and GitLab is automatically stored in the browser's `localStorage` to avoid redundant API calls on page refresh.

| Behaviour        | Detail                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **TTL**          | Cached entries expire after **12 hours** and are silently discarded on next load              |
| **Size guard**   | Entries exceeding **4 MB** are skipped to stay within `localStorage` quota limits             |
| **Cache banner** | When cached data is loaded a banner shows the timestamp with a **Refresh** button             |
| **Clear Cache**  | A dedicated button in Settings purges all cached data instantly                               |
| **Key normalisation** | Cache keys normalise associate lists (trim, lowercase, sort) so reordering inputs doesn't invalidate the cache |
| **PR list stripping** | Large PR detail arrays are removed before caching GitHub data to reduce storage footprint |

---

## Multi-Repository Support

The dashboard supports fetching data from **multiple GitHub repositories** and **multiple GitLab projects** simultaneously. In the Settings tab, use the **+ Add repo / + Add project** buttons to create additional input rows. Data from all configured repos/projects is merged into a single unified view across commits, contributors, and PR/MR metrics.

---

## Performance Optimizations

When working with many repositories (40+), several optimizations keep fetch times manageable:

| Optimisation | Detail |
| --- | --- |
| **Parallel fetching** | A bounded-concurrency `pMap` helper processes up to **5 GitHub repos** or **3 GitLab projects** in parallel instead of sequentially |
| **Reduced throttle** | Authenticated GitHub requests use a **1.2 s** search delay (down from 2.2 s for unauthenticated) |
| **Inactive-repo skip** | After fetching commits, repos with zero activity in the date range are excluded from the expensive PR metrics fetch |
| **Phased progress UI** | The loading overlay shows which phase is running (contributors → commits → PR metrics) with a monotonic `completed / total` counter |

---

## Performance Ranking (Planned)

> **Future improvement** — not yet implemented.

The Performance tab will support a **configurable composite score** to rank associates, with adjustable per-metric weights saved across sessions.

| Preset | Focus |
| --- | --- |
| **Balanced** | Equal emphasis on all metrics |
| **Code Output** | Heavier weight on commits and PRs merged |
| **Review Focus** | Prioritises PR reviews and review comments |
| **Delivery Speed** | Emphasises cycle time and merge rate |
| **Custom** | Fully manual slider control |

Each factor (commits, PRs opened, PRs merged, PRs reviewed, review comments, cycle time, churn %) will have an individual weight slider (0–100). Changing any slider will automatically switch the preset to **Custom**. Weights will be persisted in `localStorage`.

---

## Project Structure

```
associate-performance-metrics/
├── src/                    # React frontend source
│   ├── App.jsx             # Main application component
│   ├── App.css             # Styles
│   ├── github.js           # GitHub API integration
│   ├── gitlab.js           # GitLab API integration
│   ├── jira.js             # Jira API integration
│   └── demoData.js         # Demo mode synthetic data
├── backend/
│   ├── main.py             # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   ├── .env.example        # Environment template
│   └── Dockerfile          # Backend container
├── Dockerfile              # Frontend container
├── docker-compose.yml      # Multi-service orchestration
├── vite.config.js          # Vite dev server + proxy config
├── package.json            # Node.js dependencies
└── docs/screenshots/       # Application screenshots
```

---

## Disclaimer

> This dashboard measures **activity signals**, not performance. Commit counts, issue throughput, and sprint metrics are quantitative proxies that provide context for conversations. They do not capture code quality, collaboration, mentoring, on-call impact, complexity of work, or other critical contributions. **Use this data to inform — never to replace — a holistic, human judgement of an engineer's performance.**
