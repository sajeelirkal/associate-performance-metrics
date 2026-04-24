"""Jira API wrapper: auth, search (Cloud + DC), user resolution."""

import base64
import logging
from typing import Optional

from fastapi import HTTPException
from jira import JIRA

from .shared import SESSION, _DirectAdapter, is_network_error

log = logging.getLogger(__name__)


# ── Auth ──────────────────────────────────────────────────────────────────────

def is_cloud(url: str) -> bool:
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
    j._session.trust_env = False
    j._session.mount("http://",  _DirectAdapter())
    j._session.mount("https://", _DirectAdapter())
    return j


# ── Search ────────────────────────────────────────────────────────────────────

ISSUE_FIELDS_BASE = [
    "summary", "status", "priority", "assignee", "issuetype",
    "created", "updated", "resolution", "resolutiondate",
    "customfield_10020",  # sprint
    "labels", "fixVersions", "components",
    "comment",
]

SP_CANDIDATE_FIELDS = [
    "customfield_10028",
    "story_points",
    "customfield_10016",
    "customfield_10506",
    "customfield_10510",
    "customfield_10572",
    "customfield_10977",
    "customfield_10004",
    "customfield_12310243",
]


def search_cloud(base_url: str, auth_headers: dict, jql: str,
                  issue_fields: list = None) -> list:
    """Paginate through Atlassian Cloud GET /rest/api/3/search/jql."""
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
        r = SESSION.get(url, params=params, headers=auth_headers, timeout=30)
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


def search_dc(jira: JIRA, jql: str, issue_fields: list = None) -> list:
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


# ── User resolution ───────────────────────────────────────────────────────────

def resolve_to_account_id(jira_url: str, token: str, email: Optional[str],
                           value: str) -> str:
    """Resolve email → accountId (Cloud) or username (DC). Falls back to value."""
    if "@" not in value:
        return value

    cloud = bool(email) or is_cloud(jira_url)
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
        r = SESSION.get(
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
