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

from services.shared import GH_CLIENT_ID, GH_CLIENT_SECRET
from routers import github, jira, gitlab

logging.basicConfig(level=logging.DEBUG,
                    format="%(asctime)s %(levelname)-8s %(message)s")

app = FastAPI(title="Associate Performance Metrics — Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
