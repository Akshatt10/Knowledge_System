"""Slack connector — OAuth2 + channel history sync."""

from __future__ import annotations

import logging
import os
import uuid
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests as http_requests
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import ConnectedAccount, Document
from app.services.connectors.base import BaseConnector
from app.services.ingestion import ingest_document
from app.services.session_store import session_store

logger = logging.getLogger(__name__)

SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize"
SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"

# Bot token scopes needed
BOT_SCOPES = "channels:read,channels:history,groups:read,groups:history,users:read"

MAX_MESSAGES_PER_CHANNEL = 200


class SlackConnector(BaseConnector):
    def get_auth_url(self, user_id: str) -> str:
        state = str(uuid.uuid4())
        session_store.set_verifier(state, user_id)

        params = {
            "client_id": settings.SLACK_CLIENT_ID,
            "scope": BOT_SCOPES,
            "redirect_uri": settings.SLACK_REDIRECT_URI,
            "state": state,
        }
        return f"{SLACK_AUTH_URL}?{urlencode(params)}"

    def resolve_user_from_state(self, state: str) -> str:
        user_id = session_store.get_verifier(state)
        if not user_id:
            raise ValueError("Invalid or expired OAuth state.")
        return user_id

    def handle_callback(self, code: str, user_id: str, db: Session) -> dict:
        resp = http_requests.post(
            SLACK_TOKEN_URL,
            data={
                "client_id": settings.SLACK_CLIENT_ID,
                "client_secret": settings.SLACK_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.SLACK_REDIRECT_URI,
            },
        )

        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack token exchange failed: {data.get('error', 'unknown')}")

        access_token = data["access_token"]
        team_name = data.get("team", {}).get("name", "Slack Workspace")

        existing = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="slack")
            .first()
        )

        if existing:
            existing.access_token = access_token
            existing.refresh_token = team_name
        else:
            account = ConnectedAccount(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="slack",
                access_token=access_token,
                refresh_token=team_name,  # Store team name in refresh_token field
                token_expiry=None,
            )
            db.add(account)

        db.commit()
        return {"status": "connected", "provider": "slack"}

    def _get_client(self, user_id: str, db: Session) -> WebClient:
        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="slack")
            .first()
        )
        if not account:
            raise ValueError("Slack not connected for this user.")
        return WebClient(token=account.access_token)

    def fetch_documents(self, user_id: str, db: Session) -> list[dict]:
        """List public channels as importable 'documents'."""
        client = self._get_client(user_id, db)

        try:
            result = client.conversations_list(
                types="public_channel,private_channel",
                limit=50,
                exclude_archived=True,
            )
        except SlackApiError as e:
            raise ValueError(f"Slack API error: {e.response['error']}")

        channels = result.get("channels", [])
        items = []
        for ch in channels:
            items.append({
                "id": ch["id"],
                "name": f"#{ch['name']}",
                "mimeType": "slack_channel",
                "modifiedTime": "",
                "size": str(ch.get("num_members", 0)) + " members",
            })
        return items

    def sync_documents(self, user_id: str, db: Session) -> dict:
        all_channels = self.fetch_documents(user_id, db)
        return self._sync_channels(user_id, all_channels, db)

    def sync_selected(self, user_id: str, file_ids: list[str], db: Session) -> dict:
        all_channels = self.fetch_documents(user_id, db)
        selected = [ch for ch in all_channels if ch["id"] in file_ids]
        return self._sync_channels(user_id, selected, db)

    def _sync_channels(self, user_id: str, channels: list[dict], db: Session) -> dict:
        client = self._get_client(user_id, db)

        existing_filenames = {
            d.filename
            for d in db.query(Document).filter_by(user_id=user_id).all()
        }

        synced = []
        errors = []

        for channel in channels:
            channel_name = channel["name"].lstrip("#")
            fname = f"slack-{channel_name}.txt"

            if fname in existing_filenames:
                errors.append(f"{fname}: already exists")
                continue

            tmp_path = None
            try:
                # Fetch message history
                try:
                    history = client.conversations_history(
                        channel=channel["id"],
                        limit=MAX_MESSAGES_PER_CHANNEL,
                    )
                except SlackApiError as e:
                    if e.response["error"] == "not_in_channel":
                        # Try to join first, then retry
                        try:
                            client.conversations_join(channel=channel["id"])
                            history = client.conversations_history(
                                channel=channel["id"],
                                limit=MAX_MESSAGES_PER_CHANNEL,
                            )
                        except SlackApiError:
                            errors.append(f"#{channel_name}: cannot access channel")
                            continue
                    else:
                        raise

                messages = history.get("messages", [])
                if not messages:
                    errors.append(f"#{channel_name}: no messages")
                    continue

                # Reverse to chronological order
                messages.reverse()

                # Format messages
                text = self._format_messages(messages, channel_name)

                # Write to temp file
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
                logger.info("Synced Slack channel: #%s", channel_name)

            except Exception as exc:
                logger.exception("Failed to sync Slack channel #%s", channel_name)
                errors.append(f"#{channel_name}: {str(exc)}")
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="slack")
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

    def _format_messages(self, messages: list[dict], channel_name: str) -> str:
        """Convert Slack messages to readable text."""
        lines = [f"Slack Channel: #{channel_name}", f"Messages: {len(messages)}", "=" * 60, ""]

        for msg in messages:
            user = msg.get("user", "unknown")
            text = msg.get("text", "")
            ts = msg.get("ts", "")

            # Convert timestamp
            try:
                dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
                time_str = dt.strftime("%Y-%m-%d %H:%M")
            except (ValueError, OSError):
                time_str = ts

            lines.append(f"[{time_str}] {user}: {text}")

        return "\n".join(lines)


slack_connector = SlackConnector()
