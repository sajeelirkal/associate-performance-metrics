"""Shared session, config, and error helpers used across all routers/services."""

import logging
import os
import traceback
from typing import Optional

import requests
from fastapi import HTTPException


log = logging.getLogger(__name__)


for _var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
             "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"):
    os.environ.pop(_var, None)

# Always connect directly: trust_env=False makes requests ignore proxy env vars and .netrc.
SESSION = requests.Session()
SESSION.trust_env = False


# ── Config ────────────────────────────────────────────────────────────────────

GH_CLIENT_ID     = os.environ.get("GITHUB_CLIENT_ID", "")
GH_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GH_SCOPE         = "read:user,public_repo"
FRONTEND_ORIGIN  = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
# Browser origins allowed to call the API directly. Vite's proxy makes normal
# requests same-origin, so this only affects cross-origin callers.
FRONTEND_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("FRONTEND_ORIGINS", FRONTEND_ORIGIN).split(",")
    if origin.strip()
]
GITLAB_SSL_VERIFY = os.environ.get("GITLAB_SSL_VERIFY", "false").lower() in ("1", "true", "yes")


# ── Error helpers ─────────────────────────────────────────────────────────────

def is_network_error(e: Exception) -> bool:
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
    if is_network_error(e):
        return HTTPException(
            status_code=503,
            detail=(
                "Unable to reach the server. If this host is behind a VPN, "
                "please make sure you are connected and try again."
            ),
        )
    return HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\n\n{tb}")
