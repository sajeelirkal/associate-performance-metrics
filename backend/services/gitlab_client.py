"""GitLab REST + GraphQL client: pagination, diff stats, header helpers."""

import logging
import time

from fastapi import HTTPException

from .shared import SESSION, GITLAB_SSL_VERIFY

log = logging.getLogger(__name__)


def gl_headers(token: str) -> dict:
    return {"PRIVATE-TOKEN": token, "Accept": "application/json"}


_GL_RETRYABLE = {429, 500, 502, 503}


def gl_paginate(url: str, headers: dict, params: dict,
                max_items: int = 1000) -> tuple[list, bool]:
    """Generic paginated GET against GitLab API v4.

    Returns (results, truncated) where truncated is True when max_items was hit.
    Retries transient errors (429/5xx) up to 3 times with exponential backoff.
    """
    results: list = []
    page = 1
    while True:
        p = {**params, "per_page": 100, "page": page}
        r = None
        for attempt in range(3):
            r = SESSION.get(url, headers=headers, params=p,
                            timeout=30, verify=GITLAB_SSL_VERIFY)
            if r.status_code not in _GL_RETRYABLE or attempt == 2:
                break
            wait = 2 ** attempt
            log.warning("GitLab %s returned %s, retrying in %ds (attempt %d)",
                        url, r.status_code, wait, attempt + 1)
            time.sleep(wait)
        if not r.ok:
            raise HTTPException(status_code=r.status_code,
                                detail=f"GitLab API error: {r.text[:400]}")
        batch = r.json()
        if not isinstance(batch, list) or not batch:
            break
        results.extend(batch)
        if len(batch) < 100:
            break
        if len(results) >= max_items:
            log.warning("GitLab paginate hit max_items=%d for %s", max_items, url)
            return results[:max_items], True
        page += 1
    return results, False


def gl_fetch_diff_stats(
    gl_url: str, headers: dict, project_path: str, iids: list[int],
) -> dict[int, dict]:
    """Batch-fetch additions/deletions/changed-files for MRs via GitLab GraphQL.

    Returns {iid: {"additions": N, "deletions": N, "changedFiles": N}}.
    Falls back gracefully to empty dict on any failure.
    """
    if not iids:
        return {}

    gql_url = f"{gl_url.rstrip('/')}/api/graphql"
    gql_headers = {**headers, "Content-Type": "application/json"}
    result: dict[int, dict] = {}
    BATCH = 25

    for start in range(0, len(iids), BATCH):
        chunk = iids[start:start + BATCH]
        fragments = []
        for i, iid in enumerate(chunk):
            fragments.append(
                f'mr{i}: mergeRequest(iid: "{iid}") {{'
                f'  iid diffStatsSummary {{ additions deletions changes }}'
                f'}}'
            )
        query = (
            f'{{ project(fullPath: "{project_path}") {{ '
            + " ".join(fragments)
            + " } }"
        )
        try:
            r = SESSION.post(
                gql_url,
                headers=gql_headers,
                json={"query": query},
                timeout=30,
                verify=GITLAB_SSL_VERIFY,
            )
            if not r.ok:
                log.warning("GitLab GraphQL %s returned %s", gql_url, r.status_code)
                continue
            body = r.json()
            if body.get("errors"):
                log.warning("GitLab GraphQL errors: %s", body["errors"][:3])
            data = body.get("data", {}).get("project", {})
            for i, iid in enumerate(chunk):
                mr_data = data.get(f"mr{i}")
                if mr_data and mr_data.get("diffStatsSummary"):
                    stats = mr_data["diffStatsSummary"]
                    if i == 0 and start == 0:
                        log.info("GitLab GraphQL diffStatsSummary sample for iid=%s: %s", iid, stats)
                    result[iid] = {
                        "additions": stats.get("additions", 0),
                        "deletions": stats.get("deletions", 0),
                        "changedFiles": stats.get("changes", 0),
                    }
        except Exception as exc:
            log.warning("GitLab GraphQL batch failed: %s", exc)

    return result
