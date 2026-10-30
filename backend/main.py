"""
Associate Performance Metrics — Backend
Start: uvicorn main:app --reload --port 8000

Supports Jira Data Center (Bearer PAT), Atlassian Cloud (Basic Auth
with email + API token), GitLab self-managed (PRIVATE-TOKEN),
and GitHub OAuth.
"""

import logging
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from services.shared import GH_CLIENT_ID, GH_CLIENT_SECRET, FRONTEND_ORIGINS
from routers import github, jira, gitlab

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-8s %(message)s")

app = FastAPI(title="Associate Performance Metrics — Backend")


@app.middleware("http")
async def reject_untrusted_origins(request, call_next):
    """Reject browser requests from origins outside the allowlist.

    CORS only hides responses; this stops the request from running at all.
    Non-browser clients (curl, the Vite proxy) send no Origin and still work.
    """
    origin = request.headers.get("origin")
    if origin and origin not in FRONTEND_ORIGINS:
        return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=[
        "Content-Type",
        "X-Jira-Url", "X-Jira-Token", "X-Jira-Email",
        "X-GitLab-Url", "X-GitLab-Token", "X-GitLab-Project",
    ],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "github_oauth_configured": bool(GH_CLIENT_ID and GH_CLIENT_SECRET),
    }


app.include_router(github.router)
app.include_router(jira.router)
app.include_router(gitlab.router)
