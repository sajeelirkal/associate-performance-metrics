"""Tests for the FastAPI backend endpoints using TestClient."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from services.shared import is_network_error
from services.jira_client import is_cloud, make_auth_headers
from services.gitlab_client import gl_fetch_diff_stats


client = TestClient(app)


# ── Helper functions ─────────────────────────────────────────────────────────

class TestIsCloud:
    def test_atlassian_cloud_url(self):
        assert is_cloud("https://myorg.atlassian.net") is True
        assert is_cloud("https://MYORG.ATLASSIAN.NET/rest/api") is True

    def test_datacenter_url(self):
        assert is_cloud("https://jira.internal.com") is False
        assert is_cloud("https://jira.company.org:8080") is False


class TestMakeAuthHeaders:
    def test_cloud_basic_auth(self):
        headers = make_auth_headers("mytoken", "user@example.com")
        assert "Basic" in headers["Authorization"]
        assert headers["Accept"] == "application/json"

    def test_dc_bearer_auth(self):
        headers = make_auth_headers("mytoken")
        assert headers["Authorization"] == "Bearer mytoken"
        assert headers["Accept"] == "application/json"

    def test_dc_bearer_no_email(self):
        headers = make_auth_headers("tok", None)
        assert headers["Authorization"] == "Bearer tok"


class TestIsNetworkError:
    def test_dns_errors(self):
        assert is_network_error(Exception("NameResolutionError: host not found")) is True
        assert is_network_error(Exception("nodename nor servname provided")) is True
        assert is_network_error(Exception("getaddrinfo failed")) is True

    def test_connection_errors(self):
        assert is_network_error(Exception("Max retries exceeded with url")) is True
        assert is_network_error(Exception("ConnectionError: refused")) is True
        assert is_network_error(Exception("NewConnectionError")) is True
        assert is_network_error(Exception("Failed to establish a new connection")) is True

    def test_non_network_errors(self):
        assert is_network_error(Exception("KeyError: 'data'")) is False
        assert is_network_error(Exception("ValueError: invalid literal")) is False


# ── Health endpoint ──────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self):
        res = client.get("/api/health")
        assert res.status_code == 200

    def test_returns_status_ok(self):
        data = client.get("/api/health").json()
        assert data["status"] == "ok"

    def test_includes_oauth_configured(self):
        data = client.get("/api/health").json()
        assert isinstance(data["github_oauth_configured"], bool)


# ── Jira connection test ─────────────────────────────────────────────────────

class TestJiraTest:
    def test_missing_headers_returns_422(self):
        res = client.get("/api/test")
        assert res.status_code == 422

    @patch("routers.jira.SESSION")
    def test_valid_connection(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.ok = True
        mock_resp.text = '{"displayName":"Alice"}'
        mock_resp.json.return_value = {"displayName": "Alice"}
        mock_session.get.return_value = mock_resp

        res = client.get("/api/test", headers={
            "X-Jira-Url": "https://test.atlassian.net",
            "X-Jira-Token": "fake-token",
        })
        assert res.status_code == 200
        assert res.json()["user"] == "Alice"

    @patch("routers.jira.SESSION")
    def test_auth_failure_returns_upstream_status(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.ok = False
        mock_resp.text = "Unauthorized"
        mock_session.get.return_value = mock_resp

        res = client.get("/api/test", headers={
            "X-Jira-Url": "https://test.atlassian.net",
            "X-Jira-Token": "bad-token",
        })
        assert res.status_code == 401


# ── GitHub OAuth ─────────────────────────────────────────────────────────────

class TestGitHubOAuth:
    def test_login_without_config_returns_503(self):
        with patch("routers.github.GH_CLIENT_ID", ""):
            res = client.get("/api/github/login", follow_redirects=False)
            assert res.status_code == 503
            assert "not configured" in res.json()["detail"]

    def test_login_with_config_redirects(self):
        with patch("routers.github.GH_CLIENT_ID", "test_client_id"):
            res = client.get("/api/github/login", follow_redirects=False)
            assert res.status_code == 307
            assert "github.com/login/oauth/authorize" in res.headers["location"]
            assert "client_id=test_client_id" in res.headers["location"]

    def test_callback_with_error_redirects(self):
        res = client.get("/api/github/callback", params={
            "code": "abc", "error": "access_denied",
        }, follow_redirects=False)
        assert res.status_code == 307
        assert "github_error=access_denied" in res.headers["location"]

    def test_callback_without_secret_returns_503(self):
        with patch("routers.github.GH_CLIENT_SECRET", ""):
            res = client.get("/api/github/callback", params={
                "code": "abc",
            }, follow_redirects=False)
            assert res.status_code == 503


# ── GitLab test ──────────────────────────────────────────────────────────────

class TestGitLabTest:
    def test_missing_headers_returns_422(self):
        res = client.get("/api/gitlab/test")
        assert res.status_code == 422

    @patch("routers.gitlab.SESSION")
    def test_valid_connection(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"username": "testuser", "name": "Test User"}
        mock_session.get.return_value = mock_resp

        res = client.get("/api/gitlab/test", headers={
            "X-GitLab-Url": "https://gitlab.example.com",
            "X-GitLab-Token": "glpat-fake",
        })
        assert res.status_code == 200
        assert res.json()["user"] == "Test User"

    @patch("routers.gitlab.SESSION")
    def test_invalid_token(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_resp.text = "401 Unauthorized"
        mock_session.get.return_value = mock_resp

        res = client.get("/api/gitlab/test", headers={
            "X-GitLab-Url": "https://gitlab.example.com",
            "X-GitLab-Token": "bad-token",
        })
        assert res.status_code == 401


# ── GitLab MRs ───────────────────────────────────────────────────────────────

class TestGitLabMRs:
    def test_missing_headers_returns_422(self):
        res = client.get("/api/gitlab/mrs", params={
            "authors": "user1",
            "since": "2025-01-01",
            "until": "2025-06-01",
        })
        assert res.status_code == 422

    def test_empty_authors_returns_empty(self):
        res = client.get("/api/gitlab/mrs", params={
            "authors": "",
        }, headers={
            "X-GitLab-Url": "https://gitlab.example.com",
            "X-GitLab-Token": "tok",
            "X-GitLab-Project": "group/project",
        })
        assert res.status_code == 200
        assert res.json()["metrics"] == {}

    @patch("routers.gitlab.gl_fetch_diff_stats", return_value={})
    @patch("routers.gitlab.gl_paginate")
    def test_single_author_metrics(self, mock_paginate, mock_diff):
        sample_mr = {
            "iid": 42,
            "title": "Fix bug",
            "web_url": "https://gitlab.com/mr/42",
            "state": "merged",
            "author": {"username": "alice"},
            "created_at": "2025-03-01T10:00:00Z",
            "merged_at": "2025-03-02T10:00:00Z",
            "closed_at": None,
            "updated_at": "2025-03-02T10:00:00Z",
            "references": {"full": "group/project!42"},
        }
        mock_paginate.return_value = ([sample_mr], False)

        res = client.get("/api/gitlab/mrs", params={
            "authors": "alice",
            "since": "2025-01-01",
            "until": "2025-12-31",
        }, headers={
            "X-GitLab-Url": "https://gitlab.example.com",
            "X-GitLab-Token": "tok",
            "X-GitLab-Project": "group/project",
        })
        assert res.status_code == 200
        data = res.json()
        assert "alice" in data["metrics"]
        m = data["metrics"]["alice"]
        assert m["mrsMerged"] >= 1
        assert isinstance(m["authoredMRs"], list)


# ── Jira issues ──────────────────────────────────────────────────────────────

class TestJiraIssues:
    def test_missing_headers_returns_422(self):
        res = client.get("/api/issues", params={
            "usernames": "user1",
            "since": "2025-01-01",
            "until": "2025-06-01",
        })
        assert res.status_code == 422


# ── Jira resolve-user ────────────────────────────────────────────────────────

class TestResolveUser:
    def test_missing_headers_returns_422(self):
        res = client.get("/api/resolve-user", params={"query": "alice"})
        assert res.status_code == 422

    @patch("routers.jira.SESSION")
    def test_resolves_user(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.text = '[{"accountId":"123","displayName":"Alice","emailAddress":"alice@co.com"}]'
        mock_resp.json.return_value = [
            {"accountId": "123", "displayName": "Alice", "emailAddress": "alice@co.com"}
        ]
        mock_session.get.return_value = mock_resp

        res = client.get("/api/resolve-user", params={"query": "alice"}, headers={
            "X-Jira-Url": "https://myorg.atlassian.net",
            "X-Jira-Token": "tok",
            "X-Jira-Email": "admin@co.com",
        })
        assert res.status_code == 200
        users = res.json()
        assert len(users) == 1
        assert users[0]["username"] == "123"
        assert users[0]["displayName"] == "Alice"


# ── GitLab GraphQL diff stats ────────────────────────────────────────────────

class TestGlFetchDiffStats:
    def test_empty_iids_returns_empty(self):
        result = gl_fetch_diff_stats("https://gl.com", {}, "proj", [])
        assert result == {}

    @patch("services.gitlab_client.SESSION")
    def test_parses_graphql_response(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.json.return_value = {
            "data": {
                "project": {
                    "mr0": {
                        "iid": "10",
                        "diffStatsSummary": {
                            "additions": 5, "deletions": 3, "changes": 2
                        },
                    }
                }
            }
        }
        mock_session.post.return_value = mock_resp

        result = gl_fetch_diff_stats(
            "https://gl.com", {"PRIVATE-TOKEN": "tok"}, "group/proj", [10]
        )
        assert 10 in result
        assert result[10]["additions"] == 5
        assert result[10]["deletions"] == 3
        assert result[10]["changedFiles"] == 2

    @patch("services.gitlab_client.SESSION")
    def test_handles_graphql_error_gracefully(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 500
        mock_session.post.return_value = mock_resp

        result = gl_fetch_diff_stats(
            "https://gl.com", {}, "group/proj", [1, 2, 3]
        )
        assert result == {}
