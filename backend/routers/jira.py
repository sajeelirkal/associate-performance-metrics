"""Jira endpoints: connection test, user resolution, issue search, remote links."""

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from jira import JIRAError

from services.shared import SESSION, http_500
from services.jira_client import (
    is_cloud, make_auth_headers, make_jira,
    search_cloud, search_dc,
    resolve_to_account_id,
    ISSUE_FIELDS_BASE, SP_CANDIDATE_FIELDS,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["jira"])


@router.get("/test")
def test_connection(
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    url = f"{x_jira_url.rstrip('/')}/rest/api/2/myself"
    log.info("Testing %s (cloud=%s)", url, bool(x_jira_email))
    try:
        r = SESSION.get(
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


@router.get("/resolve-user")
def resolve_user(
    query:        str = Query(...),
    x_jira_url:   str = Header(...),
    x_jira_token: str = Header(...),
    x_jira_email: Optional[str] = Header(None),
):
    """Search Jira for a user by email, display name, or username."""
    auth = make_auth_headers(x_jira_token, x_jira_email)
    cloud = bool(x_jira_email) or is_cloud(x_jira_url)

    if cloud:
        search_url = f"{x_jira_url.rstrip('/')}/rest/api/3/user/search"
        params_key = "query"
    else:
        search_url = f"{x_jira_url.rstrip('/')}/rest/api/2/user/search"
        params_key = "username"

    log.info("Resolving user query=%r (cloud=%s)", query, cloud)

    def _search(q: str):
        r = SESSION.get(
            search_url,
            params={params_key: q, "maxResults": 10},
            headers=auth,
            timeout=15,
        )
        log.debug("user/search status=%s body=%s", r.status_code, r.text[:400])
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


@router.get("/issues")
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

    cloud = bool(x_jira_email) or is_cloud(x_jira_url)

    try:
        resolved = [resolve_to_account_id(x_jira_url, x_jira_token, x_jira_email, u) for u in user_list]
        log.info("username mapping: %s → %s (cloud=%s)", user_list, resolved, cloud)

        user_jql = ", ".join(f'"{u}"' for u in resolved)

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

        sp_extras = set(SP_CANDIDATE_FIELDS)
        if sp_field:
            sp_extras.add(sp_field)
        issue_fields = ISSUE_FIELDS_BASE + sorted(sp_extras)

        if cloud:
            auth = make_auth_headers(x_jira_token, x_jira_email)
            all_issues = search_cloud(x_jira_url, auth, jql, issue_fields)
        else:
            jira = make_jira(x_jira_url, x_jira_token)
            all_issues = search_dc(jira, jql, issue_fields)

        if all_issues:
            sample = all_issues[0].get("fields", {})
            all_cf_keys = [k for k in sample.keys() if k.startswith("customfield_")]
            log.debug("First issue (%s) has %d customfield_ keys: %s",
                      all_issues[0].get("key"), len(all_cf_keys), all_cf_keys[:15])
            sp_found = 0
            for iss in all_issues:
                f = iss.get("fields", {})
                for cid in SP_CANDIDATE_FIELDS:
                    if f.get(cid) is not None:
                        sp_found += 1
                        log.debug("  SP hit: %s.%s = %s", iss.get("key"), cid, f.get(cid))
                        break
            log.debug("Issues with SP values: %d / %d", sp_found, len(all_issues))

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


@router.get("/remotelinks")
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
