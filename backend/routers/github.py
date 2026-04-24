"""GitHub OAuth endpoints: login redirect and callback token exchange."""

import logging
from typing import Optional

import requests
from fastapi import APIRouter, Query
from fastapi import HTTPException
from fastapi.responses import RedirectResponse

from services.shared import (
    SESSION, GH_CLIENT_ID, GH_CLIENT_SECRET, GH_SCOPE, FRONTEND_ORIGIN,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/github", tags=["github"])


@router.get("/login")
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


@router.get("/callback")
def github_callback(code: str = Query(...), error: Optional[str] = Query(None)):
    """Exchange short-lived code for token, redirect to frontend with token as fragment."""
    if error:
        log.warning("GitHub OAuth error: %s", error)
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?github_error={error}")

    if not GH_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="GITHUB_CLIENT_SECRET not set.")

    log.info("Exchanging OAuth code for token")
    try:
        resp = SESSION.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id":     GH_CLIENT_ID,
                "client_secret": GH_CLIENT_SECRET,
                "code":          code,
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
    except requests.exceptions.ConnectionError as exc:
        log.error("Cannot reach github.com for token exchange: %s", exc)
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/?github_error=connection_failed")

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
    return RedirectResponse(url=f"{FRONTEND_ORIGIN}/#github_token={token}")
