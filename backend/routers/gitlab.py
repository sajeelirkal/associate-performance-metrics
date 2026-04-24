"""GitLab endpoints: connection test and MR metrics."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional
from urllib.parse import quote as url_quote

from fastapi import APIRouter, Header, HTTPException, Query

from services.shared import SESSION, GITLAB_SSL_VERIFY, http_500
from services.gitlab_client import gl_headers, gl_paginate, gl_fetch_diff_stats

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gitlab", tags=["gitlab"])


@router.get("/test")
def gitlab_test(
    x_gitlab_url:   str = Header(...),
    x_gitlab_token: str = Header(...),
):
    """Verify GitLab credentials by calling /api/v4/user."""
    url = f"{x_gitlab_url.rstrip('/')}/api/v4/user"
    log.info("Testing GitLab at %s", url)
    try:
        r = SESSION.get(url, headers=gl_headers(x_gitlab_token),
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


@router.get("/mrs")
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
    headers = gl_headers(x_gitlab_token)
    author_list = [a.strip() for a in authors.split(",") if a.strip()]
    if not author_list:
        return {"metrics": {}}

    since_dt = datetime.fromisoformat(f"{since}T00:00:00+00:00") if since else None
    until_dt = datetime.fromisoformat(f"{until}T23:59:59+00:00") if until else None

    def _parse_dt(iso_str):
        if not iso_str:
            return None
        try:
            return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    def _in_range(dt):
        if dt is None:
            return False
        if since_dt and dt < since_dt:
            return False
        if until_dt and dt > until_dt:
            return False
        return True

    author_data: dict = {}
    all_unique_iids: set = set()
    author_set_lower = {a.lower() for a in author_list}

    # Per-author: {username_lower: {iid: mr}} — MRs where user appears in
    # the `reviewers` list or was assigned via reviewer_username API.
    reviewed_by: dict[str, dict[int, dict]] = {a.lower(): {} for a in author_list}

    for author in author_list:
        params_created: dict = {"author_username": author, "state": "all", "scope": "all"}
        params_merged:  dict = {"author_username": author, "state": "merged", "scope": "all"}
        params_reviewed: dict = {"reviewer_username": author, "state": "all", "scope": "all"}

        if since:
            params_created["created_after"] = f"{since}T00:00:00Z"
            params_merged["merged_after"] = f"{since}T00:00:00Z"
            params_reviewed["created_after"] = f"{since}T00:00:00Z"
        if until:
            params_created["created_before"] = f"{until}T23:59:59Z"
            params_merged["merged_before"] = f"{until}T23:59:59Z"
            params_reviewed["created_before"] = f"{until}T23:59:59Z"

        try:
            with ThreadPoolExecutor(max_workers=3) as pool:
                f_created  = pool.submit(gl_paginate, mr_base, headers, params_created, 300)
                f_merged   = pool.submit(gl_paginate, mr_base, headers, params_merged, 300)
                f_reviewed = pool.submit(gl_paginate, mr_base, headers, params_reviewed, 300)
                raw_created, trunc_c   = f_created.result()
                raw_merged, trunc_m    = f_merged.result()
                raw_reviewed, trunc_r  = f_reviewed.result()
        except Exception as e:
            log.warning("GitLab MR fetch for %s failed: %s", author, e)
            author_data[author] = None
            continue

        truncated = trunc_c or trunc_m or trunc_r

        created_in_range = [
            mr for mr in raw_created
            if _in_range(_parse_dt(mr.get("created_at")))
        ]
        merged_in_range = [
            mr for mr in raw_merged
            if _in_range(_parse_dt(mr.get("merged_at")))
        ]

        # MRs from the reviewer_username API (formal reviewer assignment)
        reviewed_formal = [
            mr for mr in raw_reviewed
            if _in_range(_parse_dt(mr.get("created_at")))
        ]
        for mr in reviewed_formal:
            iid = mr.get("iid")
            if iid:
                reviewed_by[author.lower()][iid] = mr

        # Also scan the `reviewers` array embedded in every MR response:
        # if any tracked author appears as a reviewer on this MR (and isn't
        # the MR's own author), count it as a review for that person.
        mr_author_lower = author.lower()
        for mr in created_in_range + merged_in_range:
            iid = mr.get("iid")
            if not iid:
                continue
            for reviewer in mr.get("reviewers") or []:
                rname = (reviewer.get("username") or "").lower()
                if rname in author_set_lower and rname != mr_author_lower:
                    reviewed_by[rname][iid] = mr

        seen_iids: set = set()
        all_authored: list = []
        for mr in created_in_range:
            iid = mr.get("iid")
            if iid not in seen_iids:
                seen_iids.add(iid)
                all_authored.append(mr)
        for mr in merged_in_range:
            iid = mr.get("iid")
            if iid not in seen_iids:
                seen_iids.add(iid)
                all_authored.append(mr)

        cycle_times = []
        for mr in merged_in_range:
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

        author_iids = {mr.get("iid") for mr in all_authored if mr.get("iid")}
        all_unique_iids |= author_iids

        author_data[author] = {
            "all_authored": all_authored,
            "merged_in_range": merged_in_range,
            "avg_cycle": avg_cycle,
            "truncated": truncated,
        }

    # Collect all reviewed IIDs into the unique set for diff stats
    for user_reviews in reviewed_by.values():
        all_unique_iids |= set(user_reviews.keys())

    diff_stats = gl_fetch_diff_stats(
        x_gitlab_url, headers, x_gitlab_project,
        list(all_unique_iids),
    )

    def _map_mr(mr, ds, project=x_gitlab_project):
        ref = mr.get("references", {}).get("full", "")
        iid = mr["iid"]
        stats = ds.get(iid, {})
        return {
            "iid":          iid,
            "title":        mr.get("title", ""),
            "url":          mr.get("web_url", ""),
            "state":        "merged" if mr.get("merged_at") else mr.get("state", "opened"),
            "author":       mr.get("author", {}).get("username", ""),
            "createdAt":    mr.get("created_at"),
            "mergedAt":     mr.get("merged_at"),
            "closedAt":     mr.get("closed_at"),
            "updatedAt":    mr.get("updated_at"),
            "additions":    stats.get("additions"),
            "deletions":    stats.get("deletions"),
            "changedFiles": stats.get("changedFiles"),
            "project":      ref.rsplit("!", 1)[0] if ref else project,
        }

    metrics: dict = {}
    for author in author_list:
        ad = author_data.get(author)
        user_reviewed = list(reviewed_by.get(author.lower(), {}).values())

        if ad is None:
            metrics[author] = {
                "mrsOpened": 0, "mrsMerged": 0, "mrsReviewed": len(user_reviewed),
                "avgCycleTimeDays": None,
                "authoredMRs": [],
                "reviewedMRs": [_map_mr(mr, diff_stats) for mr in user_reviewed],
            }
            continue

        entry = {
            "mrsOpened":        len(ad["all_authored"]),
            "mrsMerged":        len(ad["merged_in_range"]),
            "mrsReviewed":      len(user_reviewed),
            "avgCycleTimeDays": ad["avg_cycle"],
            "authoredMRs":      [_map_mr(mr, diff_stats) for mr in ad["all_authored"]],
            "reviewedMRs":      [_map_mr(mr, diff_stats) for mr in user_reviewed],
        }
        if ad["truncated"]:
            entry["_truncated"] = True
        metrics[author] = entry

    log.info("GitLab MR metrics for %d authors", len(metrics))
    return {"metrics": metrics}
