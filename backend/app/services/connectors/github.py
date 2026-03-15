"""GitHub connector — OAuth2 + repository documentation sync."""

from __future__ import annotations

import logging
import os
import uuid
import tempfile
import base64
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests as http_requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import ConnectedAccount, Document
from app.services.connectors.base import BaseConnector
from app.services.ingestion import ingest_document
from app.services.session_store import session_store

logger = logging.getLogger(__name__)

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API = "https://api.github.com"

# File extensions we consider as documentation
DOC_EXTENSIONS = {".md", ".txt", ".rst", ".adoc"}
# Also match common doc filenames regardless of extension
DOC_FILENAMES = {"README", "CHANGELOG", "CONTRIBUTING", "LICENSE", "ARCHITECTURE"}

MAX_REPOS = 100
MAX_FILES_PER_REPO = 1000


class GitHubConnector(BaseConnector):
    def get_auth_url(self, user_id: str) -> str:
        state = str(uuid.uuid4())
        session_store.set_verifier(state, user_id)

        params = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
            "scope": "repo",
            "state": state,
        }
        return f"{GITHUB_AUTH_URL}?{urlencode(params)}"

    def resolve_user_from_state(self, state: str) -> str:
        user_id = session_store.get_verifier(state)
        if not user_id:
            raise ValueError("Invalid or expired OAuth state.")
        return user_id

    def handle_callback(self, code: str, user_id: str, db: Session) -> dict:
        resp = http_requests.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )

        if resp.status_code != 200:
            raise ValueError(f"GitHub token exchange failed: {resp.text}")

        data = resp.json()
        access_token = data.get("access_token")
        if not access_token:
            raise ValueError(f"GitHub auth failed: {data.get('error_description', 'unknown')}")

        existing = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="github")
            .first()
        )

        if existing:
            existing.access_token = access_token
            existing.refresh_token = ""
        else:
            account = ConnectedAccount(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="github",
                access_token=access_token,
                refresh_token="",
                token_expiry=None,
            )
            db.add(account)

        db.commit()
        return {"status": "connected", "provider": "github"}

    def _get_token(self, user_id: str, db: Session) -> str:
        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="github")
            .first()
        )
        if not account:
            raise ValueError("GitHub not connected for this user.")
        return account.access_token

    def _headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def fetch_documents(self, user_id: str, db: Session) -> list[dict]:
        """List documentation files from user's recent repos."""
        token = self._get_token(user_id, db)

        # Fetch recent repos
        resp = http_requests.get(
            f"{GITHUB_API}/user/repos",
            headers=self._headers(token),
            params={
                "sort": "pushed",
                "direction": "desc",
                "per_page": MAX_REPOS,
                "type": "all",
            },
        )

        if resp.status_code != 200:
            raise ValueError(f"GitHub API error: {resp.text}")

        repos = resp.json()
        all_files = []

        for repo in repos:
            owner = repo["owner"]["login"]
            repo_name = repo["name"]
            full_name = repo["full_name"]

            try:
                doc_files = self._list_repo_docs(owner, repo_name, token)
                for f in doc_files[:MAX_FILES_PER_REPO]:
                    # Encode file ID as owner/repo/path for unique identification
                    file_id = f"{full_name}/{f['path']}"
                    all_files.append({
                        "id": file_id,
                        "name": f"[{repo_name}] {f['path']}",
                        "mimeType": "github_file",
                        "modifiedTime": repo.get("pushed_at", ""),
                        "size": str(f.get("size", 0)) + " bytes",
                    })
            except Exception as exc:
                logger.warning("Failed to list docs for %s: %s", full_name, exc)
                continue

        return all_files

    def _list_repo_docs(self, owner: str, repo: str, token: str) -> list[dict]:
        """List documentation files in a repo's root and /docs directory."""
        doc_files = []

        # Check root directory
        root_files = self._list_directory(owner, repo, "", token)
        for f in root_files:
            if self._is_doc_file(f):
                doc_files.append(f)

        # Check /docs directory if it exists
        docs_files = self._list_directory(owner, repo, "docs", token)
        for f in docs_files:
            if self._is_doc_file(f):
                doc_files.append(f)

        return doc_files

    def _list_directory(self, owner: str, repo: str, path: str, token: str) -> list[dict]:
        """List files in a specific directory of a repo."""
        url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}" if path else f"{GITHUB_API}/repos/{owner}/{repo}/contents"

        resp = http_requests.get(url, headers=self._headers(token))
        if resp.status_code != 200:
            return []

        contents = resp.json()
        if not isinstance(contents, list):
            return []

        return [
            {"path": item["path"], "size": item.get("size", 0), "sha": item["sha"]}
            for item in contents
            if item["type"] == "file"
        ]

    def _is_doc_file(self, file_info: dict) -> bool:
        """Check if a file is a documentation file."""
        path = file_info["path"]
        name = os.path.basename(path)
        stem = os.path.splitext(name)[0]
        ext = os.path.splitext(name)[1].lower()

        return ext in DOC_EXTENSIONS or stem.upper() in DOC_FILENAMES

    def sync_documents(self, user_id: str, db: Session) -> dict:
        all_files = self.fetch_documents(user_id, db)
        return self._sync_files(user_id, all_files, db)

    def sync_selected(self, user_id: str, file_ids: list[str], db: Session) -> dict:
        all_files = self.fetch_documents(user_id, db)
        selected = [f for f in all_files if f["id"] in file_ids]
        return self._sync_files(user_id, selected, db)

    def _sync_files(self, user_id: str, files: list[dict], db: Session) -> dict:
        token = self._get_token(user_id, db)

        existing_filenames = {
            d.filename
            for d in db.query(Document).filter_by(user_id=user_id).all()
        }

        synced = []
        errors = []

        for file_info in files:
            file_id = file_info["id"]
            # file_id format: owner/repo/path
            parts = file_id.split("/", 2)
            if len(parts) < 3:
                errors.append(f"{file_info['name']}: invalid file ID")
                continue

            owner, repo, path = parts[0], parts[1], parts[2]
            display_name = file_info["name"]
            fname = f"github-{repo}-{os.path.basename(path)}"

            if fname in existing_filenames:
                errors.append(f"{fname}: already exists")
                continue

            tmp_path = None
            try:
                content = self._download_file(owner, repo, path, token)
                if not content.strip():
                    errors.append(f"{display_name}: file is empty")
                    continue

                ext = os.path.splitext(path)[1].lower()
                file_type = "txt"  # Default; md renders as text too
                if ext == ".md":
                    file_type = "txt"
                elif ext == ".txt":
                    file_type = "txt"
                elif ext == ".rst":
                    file_type = "txt"

                tmp = tempfile.NamedTemporaryFile(
                    delete=False, suffix=".txt", dir=str(settings.UPLOAD_DIR),
                    mode="w", encoding="utf-8",
                )
                tmp.write(content)
                tmp.close()
                tmp_path = tmp.name

                result = ingest_document(
                    file_path=tmp_path,
                    filename=fname,
                    file_type=file_type,
                    user_id=user_id,
                )

                db_doc = Document(
                    id=result["document_id"],
                    user_id=user_id,
                    filename=result["filename"],
                    file_type=file_type,
                    chunk_count=str(result["chunk_count"]),
                    is_encrypted="TRUE",
                    encrypted_dek=result.get("encrypted_dek"),
                    s3_uri=result.get("s3_uri"),
                )
                db.add(db_doc)
                db.commit()
                synced.append(fname)
                logger.info("Synced GitHub file: %s/%s/%s", owner, repo, path)

            except Exception as exc:
                logger.exception("Failed to sync GitHub file %s", display_name)
                errors.append(f"{display_name}: {str(exc)}")
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="github")
            .first()
        )
        if account:
            account.last_synced_at = datetime.now(timezone.utc)
            db.commit()

        return {
            "synced_count": len(synced),
            "new_documents": synced,
            "errors": errors,
        }

    def _download_file(self, owner: str, repo: str, path: str, token: str) -> str:
        """Download a file's content from GitHub."""
        url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
        resp = http_requests.get(url, headers=self._headers(token))

        if resp.status_code != 200:
            raise ValueError(f"Failed to download {path}: {resp.status_code}")

        data = resp.json()
        content_b64 = data.get("content", "")
        encoding = data.get("encoding", "")

        if encoding == "base64":
            return base64.b64decode(content_b64).decode("utf-8", errors="replace")
        else:
            return content_b64


github_connector = GitHubConnector()
