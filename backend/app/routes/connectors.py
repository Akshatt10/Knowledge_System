"""Connector routes — OAuth flows, listing, sync, disconnect."""

from __future__ import annotations

import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import ConnectedAccount, User
from app.models.schemas import ConnectedAccountResponse, ConnectorListResponse, SyncResponse
from app.services.auth import get_current_user, get_db
from app.services.connectors.google_drive import google_drive_connector
from app.services.connectors.notion import notion_connector
from app.services.connectors.slack import slack_connector
from app.services.connectors.github import github_connector

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Connectors"])


class SelectiveSyncRequest(BaseModel):
    file_ids: list[str]


# ── Google Drive ───────────────────────────────────────────────────────

@router.get("/google/auth")
def google_auth_redirect(current_user: User = Depends(get_current_user)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured.")
    url = google_drive_connector.get_auth_url(current_user.id)
    return {"auth_url": url}


@router.get("/google/callback")
def google_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        google_drive_connector.handle_callback(code=code, user_id=state, db=db)
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=connected")
    except Exception as exc:
        logger.exception("Google OAuth callback failed")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=error&message={str(exc)}")


@router.get("/google/files")
def list_drive_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        files = google_drive_connector.fetch_documents(user_id=current_user.id, db=db)
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/google/sync", response_model=SyncResponse)
def sync_google_drive(
    body: SelectiveSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = google_drive_connector.sync_selected(
            user_id=current_user.id,
            file_ids=body.file_ids,
            db=db,
        )
        return SyncResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Google Drive sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")


# ── Notion ─────────────────────────────────────────────────────────────

@router.get("/notion/auth")
def notion_auth_redirect(current_user: User = Depends(get_current_user)):
    if not settings.NOTION_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured.")
    url = notion_connector.get_auth_url(current_user.id)
    return {"auth_url": url}


@router.get("/notion/callback")
def notion_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        user_id = notion_connector.resolve_user_from_state(state)
        notion_connector.handle_callback(code=code, user_id=user_id, db=db)
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=notion_connected")
    except Exception as exc:
        logger.exception("Notion OAuth callback failed")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=error&message={str(exc)}")


@router.get("/notion/files")
def list_notion_pages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        files = notion_connector.fetch_documents(user_id=current_user.id, db=db)
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/notion/sync", response_model=SyncResponse)
def sync_notion(
    body: SelectiveSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = notion_connector.sync_selected(
            user_id=current_user.id,
            file_ids=body.file_ids,
            db=db,
        )
        return SyncResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Notion sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")


# ── Slack ──────────────────────────────────────────────────────────────

@router.get("/slack/auth")
def slack_auth_redirect(current_user: User = Depends(get_current_user)):
    if not settings.SLACK_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Slack OAuth not configured.")
    url = slack_connector.get_auth_url(current_user.id)
    return {"auth_url": url}


@router.get("/slack/callback")
def slack_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        user_id = slack_connector.resolve_user_from_state(state)
        slack_connector.handle_callback(code=code, user_id=user_id, db=db)
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=slack_connected")
    except Exception as exc:
        logger.exception("Slack OAuth callback failed")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=error&message={str(exc)}")


@router.get("/slack/files")
def list_slack_channels(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        files = slack_connector.fetch_documents(user_id=current_user.id, db=db)
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/slack/sync", response_model=SyncResponse)
def sync_slack(
    body: SelectiveSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = slack_connector.sync_selected(
            user_id=current_user.id,
            file_ids=body.file_ids,
            db=db,
        )
        return SyncResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Slack sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")


# ── GitHub ─────────────────────────────────────────────────────────────

@router.get("/github/auth")
def github_auth_redirect(current_user: User = Depends(get_current_user)):
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured.")
    url = github_connector.get_auth_url(current_user.id)
    return {"auth_url": url}


@router.get("/github/callback")
def github_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        user_id = github_connector.resolve_user_from_state(state)
        github_connector.handle_callback(code=code, user_id=user_id, db=db)
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=github_connected")
    except Exception as exc:
        logger.exception("GitHub OAuth callback failed")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/connectors?status=error&message={str(exc)}")


@router.get("/github/files")
def list_github_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        files = github_connector.fetch_documents(user_id=current_user.id, db=db)
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/github/sync", response_model=SyncResponse)
def sync_github(
    body: SelectiveSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = github_connector.sync_selected(
            user_id=current_user.id,
            file_ids=body.file_ids,
            db=db,
        )
        return SyncResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("GitHub sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(exc)}")


# ── Common ─────────────────────────────────────────────────────────────

@router.get("", response_model=ConnectorListResponse)
def list_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = (
        db.query(ConnectedAccount)
        .filter_by(user_id=current_user.id)
        .all()
    )
    return ConnectorListResponse(
        accounts=[
            ConnectedAccountResponse(
                id=a.id,
                provider=a.provider,
                connected_at=a.connected_at.isoformat() if a.connected_at else "",
                last_synced_at=a.last_synced_at.isoformat() if a.last_synced_at else None,
            )
            for a in accounts
        ]
    )


@router.delete("/{account_id}")
def disconnect_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = (
        db.query(ConnectedAccount)
        .filter_by(id=account_id, user_id=current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Connected account not found.")

    db.delete(account)
    db.commit()
    return {"message": "Account disconnected successfully.", "account_id": account_id}


