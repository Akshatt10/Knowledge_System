"""Notion connector — OAuth2 + page sync."""

from __future__ import annotations

import logging
import os
import uuid
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import ConnectedAccount, Document
from app.services.connectors.base import BaseConnector
from app.services.ingestion import ingest_document

logger = logging.getLogger(__name__)

NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

MAX_PAGES_PER_SYNC = 50


class NotionConnector(BaseConnector):

    def __init__(self):
        self._pending_states: dict[str, str] = {}

    def get_auth_url(self, user_id: str) -> str:
        state = str(uuid.uuid4())
        self._pending_states[state] = user_id

        params = {
            "client_id": settings.NOTION_CLIENT_ID,
            "redirect_uri": settings.NOTION_REDIRECT_URI,
            "response_type": "code",
            "owner": "user",
            "state": state,
        }
        return f"{NOTION_AUTH_URL}?{urlencode(params)}"

    def resolve_user_from_state(self, state: str) -> str:
        user_id = self._pending_states.pop(state, None)
        if not user_id:
            raise ValueError("Invalid or expired OAuth state.")
        return user_id

    def handle_callback(self, code: str, user_id: str, db: Session) -> dict:
        resp = requests.post(
            NOTION_TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.NOTION_REDIRECT_URI,
            },
            auth=(settings.NOTION_CLIENT_ID, settings.NOTION_CLIENT_SECRET),
            headers={"Content-Type": "application/json"},
        )

        if resp.status_code != 200:
            raise ValueError(f"Notion token exchange failed: {resp.text}")

        data = resp.json()
        access_token = data["access_token"]

        existing = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="notion")
            .first()
        )

        if existing:
            existing.access_token = access_token
            existing.refresh_token = ""
        else:
            account = ConnectedAccount(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="notion",
                access_token=access_token,
                refresh_token="",
                token_expiry=None,
            )
            db.add(account)

        db.commit()
        return {"status": "connected", "provider": "notion"}

    def _get_token(self, user_id: str, db: Session) -> str:
        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="notion")
            .first()
        )
        if not account:
            raise ValueError("Notion not connected for this user.")
        return account.access_token

    def _headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

    def fetch_documents(self, user_id: str, db: Session) -> list[dict]:
        token = self._get_token(user_id, db)
        resp = requests.post(
            f"{NOTION_API}/search",
            json={
                "filter": {"property": "object", "value": "page"},
                "page_size": MAX_PAGES_PER_SYNC,
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
            },
            headers=self._headers(token),
        )

        if resp.status_code != 200:
            raise ValueError(f"Notion search failed: {resp.text}")

        pages = resp.json().get("results", [])
        result = []
        for page in pages:
            title = self._extract_title(page)
            result.append({
                "id": page["id"],
                "name": title or "Untitled",
                "mimeType": "notion_page",
                "modifiedTime": page.get("last_edited_time", ""),
            })
        return result

    def _extract_title(self, page: dict) -> str:
        props = page.get("properties", {})
        for prop in props.values():
            if prop.get("type") == "title":
                title_parts = prop.get("title", [])
                return "".join(t.get("plain_text", "") for t in title_parts)
        return ""

    def _get_page_text(self, page_id: str, token: str) -> str:
        blocks = []
        url = f"{NOTION_API}/blocks/{page_id}/children?page_size=100"

        while url:
            resp = requests.get(url, headers=self._headers(token))
            if resp.status_code != 200:
                break
            data = resp.json()
            blocks.extend(data.get("results", []))
            url = None
            if data.get("has_more"):
                cursor = data.get("next_cursor")
                url = f"{NOTION_API}/blocks/{page_id}/children?page_size=100&start_cursor={cursor}"

        lines = []
        for block in blocks:
            btype = block.get("type", "")
            content = block.get(btype, {})

            if "rich_text" in content:
                text = "".join(t.get("plain_text", "") for t in content["rich_text"])
                if btype.startswith("heading"):
                    text = f"\n## {text}\n"
                lines.append(text)
            elif btype == "bulleted_list_item" or btype == "numbered_list_item":
                text = "".join(t.get("plain_text", "") for t in content.get("rich_text", []))
                lines.append(f"• {text}")
            elif btype == "to_do":
                checked = "✓" if content.get("checked") else "○"
                text = "".join(t.get("plain_text", "") for t in content.get("rich_text", []))
                lines.append(f"{checked} {text}")
            elif btype == "code":
                text = "".join(t.get("plain_text", "") for t in content.get("rich_text", []))
                lang = content.get("language", "")
                lines.append(f"```{lang}\n{text}\n```")
            elif btype == "divider":
                lines.append("---")

        return "\n".join(lines)

    def sync_documents(self, user_id: str, db: Session) -> dict:
        all_pages = self.fetch_documents(user_id, db)
        return self._sync_pages(user_id, all_pages, db)

    def sync_selected(self, user_id: str, file_ids: list[str], db: Session) -> dict:
        all_pages = self.fetch_documents(user_id, db)
        selected = [p for p in all_pages if p["id"] in file_ids]
        return self._sync_pages(user_id, selected, db)

    def _sync_pages(self, user_id: str, pages: list[dict], db: Session) -> dict:
        token = self._get_token(user_id, db)

        existing_filenames = {
            d.filename
            for d in db.query(Document).filter_by(user_id=user_id).all()
        }

        synced = []
        errors = []

        for page in pages:
            title = page["name"]
            fname = f"{title}.txt"

            if fname in existing_filenames:
                errors.append(f"{fname}: already exists")
                continue

            tmp_path = None
            try:
                text = self._get_page_text(page["id"], token)
                if not text.strip():
                    errors.append(f"{title}: page is empty")
                    continue

                tmp = tempfile.NamedTemporaryFile(
                    delete=False, suffix=".txt", dir=str(settings.UPLOAD_DIR),
                    mode="w", encoding="utf-8",
                )
                tmp.write(text)
                tmp.close()
                tmp_path = tmp.name

                result = ingest_document(
                    file_path=tmp_path,
                    filename=fname,
                    file_type="txt",
                    user_id=user_id,
                )

                db_doc = Document(
                    id=result["document_id"],
                    user_id=user_id,
                    filename=result["filename"],
                    file_type="txt",
                    chunk_count=str(result["chunk_count"]),
                    is_encrypted="TRUE",
                    encrypted_dek=result.get("encrypted_dek"),
                    s3_uri=result.get("s3_uri"),
                )
                db.add(db_doc)
                db.commit()
                synced.append(fname)
                logger.info("Synced Notion page: %s", title)

            except Exception as exc:
                logger.exception("Failed to sync Notion page %s", title)
                errors.append(f"{title}: {str(exc)}")
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="notion")
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


notion_connector = NotionConnector()
