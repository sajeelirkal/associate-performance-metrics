"""
Associate Performance Metrics — Jira + GitLab backend
Start: uvicorn main:app --reload --port 8000

Supports both Jira Data Center (Bearer PAT) and Atlassian Cloud (Basic Auth
with email + API token).  Pass X-Jira-Email to enable Cloud mode.

GitLab self-managed instances (e.g. behind VPN) are accessed via PRIVATE-TOKEN
header.  All GitLab calls are proxied through this backend so the browser never
needs VPN-level connectivity.
"""

import base64
import logging
import os
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote as url_quote

from dotenv import load_dotenv

# Load backend/.env automatically so GITHUB_CLIENT_ID etc. are available
load_dotenv(Path(__file__).parent / ".env")

import requests
from requests.adapters import HTTPAdapter
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from jira import JIRA, JIRAError

# ── Proxy bypass ──────────────────────────────────────────────────────────────
# macOS system proxy (PAC / SystemConfiguration) is injected at the OS level
# and overrides trust_env=False in some urllib3 versions.  The only 100%
# reliable fix is a custom HTTPAdapter that forces proxies={} at send() time,
# which is the very last moment before urllib3 decides whether to use a
# ProxyManager or a direct PoolManager.
class _DirectAdapter(HTTPAdapter):
    """Completely bypasses all proxy detection — always connects directly."""
    def send(self, request, stream=False, timeout=None,
             verify=True, cert=None, proxies=None):
        return super().send(request, stream=stream, timeout=timeout,
                            verify=verify, cert=cert, proxies={})

# Clear proxy env vars so urllib3 doesn't pick them up via getproxies()
for _var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
             "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"):
    os.environ.pop(_var, None)

# Shared session — the custom adapter ensures proxies={} for every request
_SESSION = requests.Session()
_SESSION.trust_env = False
_SESSION.mount("http://",  _DirectAdapter())
_SESSION.mount("https://", _DirectAdapter())

logging.basicConfig(level=logging.DEBUG,
                    format="%(asctime)s %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Associate Performance Metrics — Jira Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_cloud(url: str) -> bool:
    return "atlassian.net" in url.lower()


def make_auth_headers(token: str, email: Optional[str] = None) -> dict:
    """Return the correct Authorization header for Cloud (Basic) or DC (Bearer)."""
    if email:
        creds = base64.b64encode(f"{email}:{token}".encode()).decode()
        return {"Authorization": f"Basic {creds}", "Accept": "application/json"}
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def make_jira(url: str, token: str, email: Optional[str] = None) -> JIRA:
    if email:
        j = JIRA(server=url, basic_auth=(email, token),
                 get_server_info=False, options={"verify": True})
    else:
        j = JIRA(server=url, token_auth=token, get_server_info=False,
                 options={"verify": True, "headers": {"Authorization": f"Bearer {token}"}})
    # Patch the jira library's internal session with the same direct adapter
    j._session.trust_env = False
    j._session.mount("http://",  _DirectAdapter())
    j._session.mount("https://", _DirectAdapter())
    return j


def _is_network_error(e: Exception) -> bool:
    """Detect DNS / connection errors that typically mean VPN is not connected."""
    msg = str(e).lower()
    return any(k in msg for k in (
        "nameresolutionerror", "name or service not known",
        "nodename nor servname", "getaddrinfo failed",
        "max retries exceeded", "connectionerror",
        "newconnectionerror", "failed to establish",
        "no route to host", "network is unreachable",
    ))


def http_500(e: Exception) -> HTTPException:
    tb = traceback.format_exc()
    log.error(tb)
    if _is_network_error(e):
        return HTTPException(
            status_code=503,
            detail=(
                "Unable to reach the server. If this host is behind a VPN "
                "(e.g. Red Hat VPN), please make sure you are connected to "
                "the VPN and try again."
            ),
        )
    return HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\n\n{tb}")


# ── GitHub OAuth config ───────────────────────────────────────────────────────
# Set these in your environment before starting uvicorn:
#   export GITHUB_CLIENT_ID=your_client_id
#   export GITHUB_CLIENT_SECRET=your_client_secret
GH_CLIENT_ID     = os.environ.get("GITHUB_CLIENT_ID", "")
GH_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GH_SCOPE         = "read:user,public_repo"
# Frontend origin — where to redirect after OAuth completes
FRONTEND_ORIGIN  = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

# GitLab — self-managed instances often use internal CAs
GITLAB_SSL_VERIFY = os.environ.get("GITLAB_SSL_VERIFY", "false").lower() in ("1", "true", "yes")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "github_oauth_configured": bool(GH_CLIENT_ID and GH_CLIENT_SECRET),
    }


# ── GitHub OAuth ──────────────────────────────────────────────────────────────
@app.get("/api/github/login")
def github_login():
    """Redirect browser to GitHub's OAuth authorization page."""
    if not GH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env vars.",
        )
    auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GH_CLIENT_ID}"
        f"&scope={GH_SCOPE}"
        "&allow_signup=false"
    )
    log.info("Redirecting to GitHub OAuth: %s", auth_url)
    return RedirectResponse(url=auth_url)


@app.get("/api/github/callback")
def github_callback(code: str = Query(...), error: Optional[str] = Query(None)):
    """GitHub redirects here with a short-lived code. Exchange it for a token
    and redirect back to the frontend, passing the token as a URL fragment
    so it is never sent to any server."""
    if error:
        log.warning("GitHub OAuth error: %s", error)
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?github_error={error}")

    if not GH_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="GITHUB_CLIENT_SECRET not set.")

    log.info("Exchanging OAuth code for token")
    resp = _SESSION.post(
        "https://github.com/login/oauth/access_token",
        json={
            "client_id":     GH_CLIENT_ID,
            "client_secret": GH_CLIENT_SECRET,
            "code":          code,
        },
        headers={"Accept": "application/json"},
        timeout=15,
    )

    if not resp.ok:
        log.error("Token exchange failed: %s %s", resp.status_code, resp.text)
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?github_error=token_exchange_failed")

    data = resp.json()
    token = data.get("access_token", "")
    if not token:
        err = data.get("error_description") or data.get("error") or "no_token"
        log.error("No token in response: %s", data)
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?github_error={err}")

    log.info("OAuth token obtained successfully")
    # Pass the token as a URL fragment — never hits any server
    return RedirectResponse(url=f"{FRONTEND_ORIGIN}/#github_token={token}")


# ── Test — uses raw requests so we can see the exact HTTP response ────────────
@app.get("/api/test")
def test_connection(
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    url = f"{x_jira_url.rstrip('/')}/rest/api/2/myself"
    log.info("Testing %s (cloud=%s)", url, bool(x_jira_email))
    try:
        r = _SESSION.get(
            url,
            headers=make_auth_headers(x_jira_token, x_jira_email),
            timeout=15,
        )
        log.info("Response %s: %s", r.status_code, r.text[:300])
        if r.status_code == 200:
            data = r.json()
            return {"status": "ok", "user": data.get("displayName") or data.get("name", "unknown")}
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Jira returned {r.status_code}: {r.text[:400]}",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise http_500(e)


# ── Resolve a single user: email / display-name → Jira username / accountId ──
@app.get("/api/resolve-user")
def resolve_user(
    query:        str = Query(...),
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    """Search Jira for a user by email, display name, or username.
    Returns [{username, displayName, email}] where username is accountId on
    Atlassian Cloud and name on Data Center."""
    auth = make_auth_headers(x_jira_token, x_jira_email)
    cloud = bool(x_jira_email) or _is_cloud(x_jira_url)

    # Cloud uses /rest/api/3/user/search?query=  — DC uses /rest/api/2/user/search?username=
    if cloud:
        search_url = f"{x_jira_url.rstrip('/')}/rest/api/3/user/search"
        params_key = "query"
    else:
        search_url = f"{x_jira_url.rstrip('/')}/rest/api/2/user/search"
        params_key = "username"

    log.info("Resolving user query=%r (cloud=%s)", query, cloud)

    def _search(q: str):
        r = _SESSION.get(
            search_url,
            params={params_key: q, "maxResults": 10},
            headers=auth,
            timeout=15,
        )
        log.info("user/search status=%s body=%s", r.status_code, r.text[:400])
        if not r.ok:
            raise HTTPException(status_code=r.status_code,
                                detail=f"Jira user search failed: {r.text[:300]}")
        return r.json()

    try:
        users = _search(query)
        if not users and "@" in query:
            users = _search(query.split("@")[0])

        return [
            {
                # On Cloud accountId is the identifier used in JQL; on DC it's name
                "username":    u.get("accountId") or u.get("name", ""),
                "displayName": u.get("displayName", ""),
                "email":       u.get("emailAddress", ""),
            }
            for u in users
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise http_500(e)


def _resolve_to_account_id(jira_url: str, token: str, email: Optional[str], value: str) -> str:
    """For Atlassian Cloud: if value looks like an email, resolve to accountId.
    For Data Center: resolve email → username.  Falls back to the original value."""
    if "@" not in value:
        return value

    cloud = bool(email) or _is_cloud(jira_url)
    auth = make_auth_headers(token, email)

    if cloud:
        url = f"{jira_url.rstrip('/')}/rest/api/3/user/search"
        param_key = "query"
        id_key = "accountId"
    else:
        url = f"{jira_url.rstrip('/')}/rest/api/2/user/search"
        param_key = "username"
        id_key = "name"

    try:
        r = _SESSION.get(
            url,
            params={param_key: value, "maxResults": 5},
            headers=auth,
            timeout=10,
        )
        if r.ok:
            users = r.json()
            for u in users:
                if u.get("emailAddress", "").lower() == value.lower():
                    resolved = u.get(id_key) or value
                    log.info("Resolved %r → %r", value, resolved)
                    return resolved
            if users:
                resolved = users[0].get(id_key) or value
                log.info("Resolved %r → %r (first result)", value, resolved)
                return resolved
    except Exception as e:
        log.warning("Could not resolve %r: %s", value, e)
    return value


# ── Issues ────────────────────────────────────────────────────────────────────

ISSUE_FIELDS_BASE = [
    "summary", "status", "priority", "assignee", "issuetype",
    "created", "updated", "resolutiondate",
    "customfield_10020",  # sprint
    "labels", "fixVersions", "components",
    "comment",
]

# Well-known custom field IDs for story points across Jira instances
SP_CANDIDATE_FIELDS = [
    "customfield_10028",     # "Story Points" (Red Hat / common)
    "story_points",          # native field (newer Jira Cloud)
    "customfield_10016",     # "Story point estimate" (Jira Cloud default)
    "customfield_10506",     # "DEV Story Points"
    "customfield_10510",     # "DOC Story Points"
    "customfield_10572",     # "QE Story Points"
    "customfield_10977",     # "Original story points"
    "customfield_10004",     # some instances
    "customfield_12310243",  # Red Hat Jira (legacy)
]


def _search_cloud(base_url: str, auth_headers: dict, jql: str, issue_fields: list = None) -> list:
    """Paginate through Atlassian Cloud GET /rest/api/3/search/jql with explicit fields."""
    url = f"{base_url.rstrip('/')}/rest/api/3/search/jql"
    fields_list = issue_fields or ISSUE_FIELDS_BASE
    all_issues: list = []
    next_page_token: Optional[str] = None

    while True:
        params: dict = {
            "jql": jql,
            "maxResults": 50,
            "fields": ",".join(fields_list),
            "expand": "changelog",
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token

        log.info("Cloud search GET %s fields=%s", url, params["fields"][:120])
        r = _SESSION.get(url, params=params, headers=auth_headers, timeout=30)
        log.info("Cloud search response: %s", r.status_code)
        if not r.ok:
            log.error("Cloud search error body: %s", r.text[:500])
            raise HTTPException(status_code=r.status_code,
                                detail=f"Jira search failed: {r.text[:400]}")

        page = r.json()
        batch = page.get("issues", [])
        all_issues.extend(batch)
        log.debug("cloud search got=%d total_so_far=%d", len(batch), len(all_issues))

        next_page_token = page.get("nextPageToken")
        if not batch or not next_page_token or len(all_issues) >= 500:
            break

    return all_issues


def _search_dc(jira: JIRA, jql: str, issue_fields: list = None) -> list:
    """Paginate through Jira Data Center /rest/api/2/search."""
    fields_list = issue_fields or ISSUE_FIELDS_BASE
    all_issues: list = []
    start = 0

    while True:
        page = jira.search_issues(
            jql,
            startAt=start,
            maxResults=50,
            expand="changelog",
            fields=fields_list,
            json_result=True,
        )
        batch = page.get("issues", [])
        total = page.get("total", 0)
        log.debug("dc search startAt=%d got=%d total=%d", start, len(batch), total)

        all_issues.extend(batch)
        start += len(batch)

        if not batch or start >= total or len(all_issues) >= 500:
            break

    return all_issues


@app.get("/api/issues")
def get_issues(
    usernames: str           = Query(...),
    since:     Optional[str] = Query(None),
    until:     Optional[str] = Query(None),
    sp_field:  Optional[str] = Query(None),
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    user_list = [u.strip() for u in usernames.split(",") if u.strip()]
    if not user_list:
        return {"issues": [], "total": 0}

    cloud = bool(x_jira_email) or _is_cloud(x_jira_url)

    try:
        # Resolve emails → accountId (Cloud) or username (DC)
        resolved = [_resolve_to_account_id(x_jira_url, x_jira_token, x_jira_email, u) for u in user_list]
        log.info("username mapping: %s → %s (cloud=%s)", user_list, resolved, cloud)

        user_jql = ", ".join(f'"{u}"' for u in resolved)

        # Use resolutiondate for Done issues (avoids post-migration updated-date noise)
        # and created date for open/in-progress issues.
        # Both clauses are OR-ed so a single query fetches everything in one pass.
        if since or until:
            s = since.replace("-", "/") if since else None
            u = until.replace("-", "/") if until else None

            done_clauses = ['statusCategory = Done']
            open_clauses = ['statusCategory != Done']

            if s:
                done_clauses.append(f'resolutiondate >= "{s}"')
                open_clauses.append(f'created >= "{s}"')
            if u:
                done_clauses.append(f'resolutiondate <= "{u}"')
                open_clauses.append(f'created <= "{u}"')

            done_part = " AND ".join(done_clauses)
            open_part = " AND ".join(open_clauses)
            date_filter = f"(({done_part}) OR ({open_part}))"
            jql = f"assignee in ({user_jql}) AND {date_filter}"
        else:
            jql = f"assignee in ({user_jql})"

        jql += " ORDER BY updated DESC"
        log.info("JQL: %s", jql)

        # Build fields list: base fields + all candidate SP fields so we
        # capture story points regardless of which custom field ID is used
        sp_extras = set(SP_CANDIDATE_FIELDS)
        if sp_field:
            sp_extras.add(sp_field)
        issue_fields = ISSUE_FIELDS_BASE + sorted(sp_extras)

        if cloud:
            auth = make_auth_headers(x_jira_token, x_jira_email)
            all_issues = _search_cloud(x_jira_url, auth, jql, issue_fields)
        else:
            jira = make_jira(x_jira_url, x_jira_token)
            all_issues = _search_dc(jira, jql, issue_fields)

        # Log story points across all issues for debugging
        if all_issues:
            sample = all_issues[0].get("fields", {})
            all_cf_keys = [k for k in sample.keys() if k.startswith("customfield_")]
            log.info("First issue (%s) has %d customfield_ keys: %s",
                     all_issues[0].get("key"), len(all_cf_keys), all_cf_keys[:15])
            sp_found = 0
            for iss in all_issues:
                f = iss.get("fields", {})
                for cid in SP_CANDIDATE_FIELDS:
                    if f.get(cid) is not None:
                        sp_found += 1
                        log.info("  SP hit: %s.%s = %s", iss.get("key"), cid, f.get(cid))
                        break
            log.info("Issues with SP values: %d / %d", sp_found, len(all_issues))

        log.info("Returning %d issues (sp_field=%s)", len(all_issues), sp_field or "auto")
        return {"issues": all_issues, "total": len(all_issues), "spField": sp_field}

    except JIRAError as e:
        log.error("JIRAError %s: %s", e.status_code, e.text)
        raise HTTPException(status_code=e.status_code or 502,
                            detail=str(e.text or e))
    except HTTPException:
        raise
    except Exception as e:
        raise http_500(e)


# ── Remote links ──────────────────────────────────────────────────────────────
@app.get("/api/remotelinks")
def get_remote_links(
    keys: str = Query(...),
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    issue_keys = [k.strip() for k in keys.split(",") if k.strip()]
    if not issue_keys:
        return {}

    try:
        jira = make_jira(x_jira_url, x_jira_token, x_jira_email)
        result: dict = {}
        for key in issue_keys:
            try:
                links = jira.remote_links(key)
                result[key] = [
                    lnk.raw for lnk in links
                    if "github.com" in (lnk.raw.get("object", {}).get("url", ""))
                ]
            except Exception as inner:
                log.warning("Remote links skipped %s: %s", key, inner)
                result[key] = []
        return result

    except JIRAError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e.text or e))
    except Exception as e:
        raise http_500(e)


# ═══════════════════════════════════════════════════════════════════════════════
# ── GitLab integration ────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

def _gl_headers(token: str) -> dict:
    return {"PRIVATE-TOKEN": token, "Accept": "application/json"}


def _gl_paginate(url: str, headers: dict, params: dict, max_items: int = 1000) -> list:
    """Generic paginated GET against GitLab API v4."""
    results: list = []
    page = 1
    while True:
        p = {**params, "per_page": 100, "page": page}
        r = _SESSION.get(url, headers=headers, params=p,
                         timeout=30, verify=GITLAB_SSL_VERIFY)
        if not r.ok:
            raise HTTPException(status_code=r.status_code,
                                detail=f"GitLab API error: {r.text[:400]}")
        batch = r.json()
        if not isinstance(batch, list) or not batch:
            break
        results.extend(batch)
        if len(batch) < 100 or len(results) >= max_items:
            break
        page += 1
    return results[:max_items]


@app.get("/api/gitlab/test")
def gitlab_test(
    x_gitlab_url:   str = Header(...),
    x_gitlab_token: str = Header(...),
):
    """Verify GitLab credentials by calling /api/v4/user."""
    url = f"{x_gitlab_url.rstrip('/')}/api/v4/user"
    log.info("Testing GitLab at %s", url)
    try:
        r = _SESSION.get(url, headers=_gl_headers(x_gitlab_token),
                         timeout=15, verify=GITLAB_SSL_VERIFY)
        log.info("GitLab test status=%s", r.status_code)
        if r.ok:
            data = r.json()
            return {"status": "ok", "user": data.get("name") or data.get("username", "unknown")}
        raise HTTPException(status_code=r.status_code,
                            detail=f"GitLab returned {r.status_code}: {r.text[:400]}")
    except HTTPException:
        raise
    except Exception as e:
        raise http_500(e)


@app.get("/api/gitlab/commits")
def gitlab_commits(
    authors:   str           = Query(""),
    since:     Optional[str] = Query(None),
    until:     Optional[str] = Query(None),
    x_gitlab_url:     str = Header(...),
    x_gitlab_token:   str = Header(...),
    x_gitlab_project: str = Header(...),
):
    """Fetch commits from a GitLab project, optionally filtered by author(s) and date range."""
    encoded_proj = url_quote(x_gitlab_project, safe="")
    base = f"{x_gitlab_url.rstrip('/')}/api/v4/projects/{encoded_proj}/repository/commits"
    headers = _gl_headers(x_gitlab_token)
    author_list = [a.strip() for a in authors.split(",") if a.strip()]

    all_commits: list = []
    seen_shas: set = set()

    targets = author_list if author_list else [None]
    for author in targets:
        params: dict = {}
        if author:
            params["author"] = author
        if since:
            params["since"] = f"{since}T00:00:00Z"
        if until:
            params["until"] = f"{until}T23:59:59Z"

        try:
            batch = _gl_paginate(base, headers, params, max_items=500)
        except HTTPException:
            raise
        except Exception as e:
            log.warning("GitLab commits for author=%s failed: %s", author, e)
            continue

        for c in batch:
            sha = c.get("id", "")
            if sha in seen_shas:
                continue
            seen_shas.add(sha)

            web_url = c.get("web_url", "")
            if not web_url:
                web_url = (
                    f"{x_gitlab_url.rstrip('/')}/{x_gitlab_project}/-/commit/{sha}"
                )

            all_commits.append({
                "sha":         sha,
                "author":      c.get("author_name", "unknown"),
                "authorEmail": c.get("author_email", ""),
                "message":     (c.get("title") or c.get("message", "")).split("\n")[0],
                "date":        c.get("authored_date") or c.get("created_at", ""),
                "url":         web_url,
            })

    all_commits.sort(key=lambda x: x["date"], reverse=True)
    log.info("Returning %d GitLab commits", len(all_commits))
    return {"commits": all_commits, "total": len(all_commits)}


@app.get("/api/gitlab/mrs")
def gitlab_mrs(
    authors:   str           = Query(""),
    since:     Optional[str] = Query(None),
    until:     Optional[str] = Query(None),
    x_gitlab_url:     str = Header(...),
    x_gitlab_token:   str = Header(...),
    x_gitlab_project: str = Header(...),
):
    """Compute per-author MR metrics from a GitLab project."""
    encoded_proj = url_quote(x_gitlab_project, safe="")
    mr_base = f"{x_gitlab_url.rstrip('/')}/api/v4/projects/{encoded_proj}/merge_requests"
    headers = _gl_headers(x_gitlab_token)
    author_list = [a.strip() for a in authors.split(",") if a.strip()]
    if not author_list:
        return {"metrics": {}}

    metrics: dict = {}

    for author in author_list:
        params_opened: dict = {"author_username": author, "state": "all"}
        params_merged: dict = {"author_username": author, "state": "merged"}
        params_reviewed: dict = {"reviewer_username": author, "state": "all"}

        if since:
            params_opened["created_after"] = f"{since}T00:00:00Z"
            params_merged["merged_after"] = f"{since}T00:00:00Z"
            params_reviewed["created_after"] = f"{since}T00:00:00Z"
        if until:
            params_opened["created_before"] = f"{until}T23:59:59Z"
            params_merged["merged_before"] = f"{until}T23:59:59Z"
            params_reviewed["created_before"] = f"{until}T23:59:59Z"

        try:
            opened  = _gl_paginate(mr_base, headers, params_opened, max_items=300)
            merged  = _gl_paginate(mr_base, headers, params_merged, max_items=300)
            reviewed = _gl_paginate(mr_base, headers, params_reviewed, max_items=300)
        except Exception as e:
            log.warning("GitLab MR fetch for %s failed: %s", author, e)
            metrics[author] = {
                "mrsOpened": 0, "mrsMerged": 0, "mrsReviewed": 0,
                "avgCycleTimeDays": None, "reviewNotes": 0,
            }
            continue

        cycle_times = []
        for mr in merged:
            created = mr.get("created_at")
            merged_at = mr.get("merged_at")
            if created and merged_at:
                try:
                    c_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    m_dt = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
                    cycle_times.append((m_dt - c_dt).total_seconds() / 86400)
                except (ValueError, TypeError):
                    pass

        avg_cycle = (
            round(sum(cycle_times) / len(cycle_times), 1)
            if cycle_times else None
        )

        # Count notes (review comments) on the author's opened MRs
        review_notes = 0
        for mr in opened[:50]:
            notes_url = f"{mr_base}/{mr['iid']}/notes"
            try:
                notes = _gl_paginate(notes_url, headers, {"sort": "asc"}, max_items=100)
                review_notes += sum(
                    1 for n in notes
                    if not n.get("system", False)
                    and (n.get("author", {}).get("username", "") != author)
                )
            except Exception:
                pass

        metrics[author] = {
            "mrsOpened":        len(opened),
            "mrsMerged":        len(merged),
            "mrsReviewed":      len(reviewed),
            "avgCycleTimeDays": avg_cycle,
            "reviewNotes":      review_notes,
        }

    log.info("GitLab MR metrics for %d authors", len(metrics))
    return {"metrics": metrics}
