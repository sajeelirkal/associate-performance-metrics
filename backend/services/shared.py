"""Shared session, config, and error helpers used across all routers/services."""

import logging
import os
import traceback
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from fastapi import HTTPException


log = logging.getLogger(__name__)


class _DirectAdapter(HTTPAdapter):
    """Completely bypasses all proxy detection — always connects directly."""
    def send(self, request, stream=False, timeout=None,
             verify=True, cert=None, proxies=None):
        return super().send(request, stream=stream, timeout=timeout,
                            verify=verify, cert=cert, proxies={})


for _var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
             "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"):
    os.environ.pop(_var, None)

SESSION = requests.Session()
SESSION.trust_env = False
SESSION.mount("http://",  _DirectAdapter())
SESSION.mount("https://", _DirectAdapter())


# ── Config ────────────────────────────────────────────────────────────────────

GH_CLIENT_ID     = os.environ.get("GITHUB_CLIENT_ID", "")
GH_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GH_SCOPE         = "read:user,public_repo"
FRONTEND_ORIGIN  = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
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
