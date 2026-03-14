"""Google Drive connector — OAuth2 + file sync."""

from __future__ import annotations

import io
import logging
import os
import uuid
import tempfile
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import ConnectedAccount, Document
from app.services.connectors.base import BaseConnector
from app.services.ingestion import ingest_document

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

SUPPORTED_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "application/json": "json",
}

GOOGLE_EXPORT_MAP = {
    "application/vnd.google-apps.document": {
        "export_mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ext": "docx",
    },
}

MAX_FILES_PER_SYNC = 50


def _build_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )


class GoogleDriveConnector(BaseConnector):

    def __init__(self):
        self._pending_verifiers: dict[str, str] = {}

    def get_auth_url(self, user_id: str) -> str:
        flow = _build_flow()
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            state=user_id,
        )
        if hasattr(flow, "code_verifier") and flow.code_verifier:
            self._pending_verifiers[user_id] = flow.code_verifier
        return auth_url

    def handle_callback(self, code: str, user_id: str, db: Session) -> dict:
        flow = _build_flow()
        code_verifier = self._pending_verifiers.pop(user_id, None)
        flow.fetch_token(code=code, code_verifier=code_verifier)
        creds = flow.credentials

        existing = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="google_drive")
            .first()
        )

        if existing:
            existing.access_token = creds.token
            existing.refresh_token = creds.refresh_token or existing.refresh_token
            existing.token_expiry = creds.expiry
        else:
            account = ConnectedAccount(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="google_drive",
                access_token=creds.token,
                refresh_token=creds.refresh_token or "",
                token_expiry=creds.expiry,
            )
            db.add(account)

        db.commit()
        return {"status": "connected", "provider": "google_drive"}

    def _get_credentials(self, user_id: str, db: Session) -> Credentials:
        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="google_drive")
            .first()
        )
        if not account:
            raise ValueError("Google Drive not connected for this user.")

        creds = Credentials(
            token=account.access_token,
            refresh_token=account.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )

        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            account.access_token = creds.token
            account.token_expiry = creds.expiry
            db.commit()

        return creds

    def fetch_documents(self, user_id: str, db: Session) -> list[dict]:
        creds = self._get_credentials(user_id, db)
        service = build("drive", "v3", credentials=creds)

        all_mime_types = list(SUPPORTED_MIME_TYPES.keys()) + list(GOOGLE_EXPORT_MAP.keys())
        mime_query = " or ".join(f"mimeType='{m}'" for m in all_mime_types)
        query = f"({mime_query}) and trashed=false"

        results = (
            service.files()
            .list(
                q=query,
                pageSize=MAX_FILES_PER_SYNC,
                fields="files(id,name,mimeType,modifiedTime,size)",
                orderBy="modifiedTime desc",
            )
            .execute()
        )

        return results.get("files", [])

    def sync_documents(self, user_id: str, db: Session) -> dict:
        creds = self._get_credentials(user_id, db)
        service = build("drive", "v3", credentials=creds)
        drive_files = self.fetch_documents(user_id, db)

        existing_filenames = {
            d.filename
            for d in db.query(Document).filter_by(user_id=user_id).all()
        }

        synced = []
        errors = []

        for file_info in drive_files:
            fname = file_info["name"]
            mime = file_info["mimeType"]

            if fname in existing_filenames:
                continue

            try:
                tmp_path = self._download_file(service, file_info)
                file_type = SUPPORTED_MIME_TYPES.get(mime) or GOOGLE_EXPORT_MAP.get(mime, {}).get("ext")

                if not file_type:
                    continue

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
                logger.info("Synced Drive file: %s", fname)

            except Exception as exc:
                logger.exception("Failed to sync Drive file %s", fname)
                errors.append(f"{fname}: {str(exc)}")
            finally:
                if "tmp_path" in locals() and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="google_drive")
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

    def sync_selected(self, user_id: str, file_ids: list[str], db: Session) -> dict:
        creds = self._get_credentials(user_id, db)
        service = build("drive", "v3", credentials=creds)

        all_files = self.fetch_documents(user_id, db)
        selected = [f for f in all_files if f["id"] in file_ids]

        existing_filenames = {
            d.filename
            for d in db.query(Document).filter_by(user_id=user_id).all()
        }

        synced = []
        errors = []

        for file_info in selected:
            fname = file_info["name"]
            mime = file_info["mimeType"]

            if fname in existing_filenames:
                errors.append(f"{fname}: already exists")
                continue

            try:
                tmp_path = self._download_file(service, file_info)
                file_type = SUPPORTED_MIME_TYPES.get(mime) or GOOGLE_EXPORT_MAP.get(mime, {}).get("ext")

                if not file_type:
                    errors.append(f"{fname}: unsupported type")
                    continue

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
                logger.info("Synced Drive file: %s", fname)

            except Exception as exc:
                logger.exception("Failed to sync Drive file %s", fname)
                errors.append(f"{fname}: {str(exc)}")
            finally:
                if "tmp_path" in locals() and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        account = (
            db.query(ConnectedAccount)
            .filter_by(user_id=user_id, provider="google_drive")
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

    def _download_file(self, service, file_info: dict) -> str:
        file_id = file_info["id"]
        mime = file_info["mimeType"]
        name = file_info["name"]

        if mime in GOOGLE_EXPORT_MAP:
            export_mime = GOOGLE_EXPORT_MAP[mime]["export_mime"]
            ext = GOOGLE_EXPORT_MAP[mime]["ext"]
            request = service.files().export_media(fileId=file_id, mimeType=export_mime)
        else:
            ext = SUPPORTED_MIME_TYPES.get(mime, "bin")
            request = service.files().get_media(fileId=file_id)

        suffix = f".{ext}"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=str(settings.UPLOAD_DIR))
        fh = io.FileIO(tmp.name, "wb")
        downloader = MediaIoBaseDownload(fh, request)

        done = False
        while not done:
            _, done = downloader.next_chunk()

        fh.close()
        return tmp.name


google_drive_connector = GoogleDriveConnector()
