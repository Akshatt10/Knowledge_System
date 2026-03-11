import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.models.database import User
from app.services.auth import (
    get_db, 
    verify_password, 
    get_password_hash, 
    create_access_token
)
from app.config import settings

router = APIRouter()

_google_sso_verifiers: dict[str, str] = {}


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str


@router.post("/register", response_model=Token)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists.",
        )

    if len(user_in.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters.",
        )

    hashed_password = get_password_hash(user_in.password)
    user_id = str(uuid.uuid4())
    role = "USER"

    db_user = User(
        id=user_id,
        email=user_in.email,
        hashed_password=hashed_password,
        role=role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": db_user.id, "role": db_user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": db_user.role}


@router.post("/login", response_model=Token)
def login(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No account found with this email.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}


@router.get("/google")
def google_sso_redirect():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google SSO not configured.")

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=[
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
        ],
        redirect_uri=settings.GOOGLE_REDIRECT_URI.replace("/connectors/", "/auth/"),
    )

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state="sso_login",
    )

    if hasattr(flow, "code_verifier") and flow.code_verifier:
        _google_sso_verifiers["sso_login"] = flow.code_verifier

    return {"auth_url": auth_url}


@router.get("/google/callback")
def google_sso_callback(code: str, state: str = "sso_login", db: Session = Depends(get_db)):
    from google_auth_oauthlib.flow import Flow
    import requests as http_requests

    try:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=[
                "openid",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
            ],
            redirect_uri=settings.GOOGLE_REDIRECT_URI.replace("/connectors/", "/auth/"),
        )

        code_verifier = _google_sso_verifiers.pop(state, None)
        flow.fetch_token(code=code, code_verifier=code_verifier)
        creds = flow.credentials

        userinfo = http_requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
        ).json()

        email = userinfo.get("email")
        if not email:
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?sso_error=no_email")

        user = db.query(User).filter(User.email == email).first()

        if not user:
            user = User(
                id=str(uuid.uuid4()),
                email=email,
                hashed_password=get_password_hash(str(uuid.uuid4())),
                role="USER",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.id, "role": user.role},
            expires_delta=access_token_expires
        )

        from urllib.parse import urlencode as _urlencode

        params = _urlencode({
            "sso_token": access_token,
            "sso_role": user.role,
            "sso_email": email,
        })
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?{params}")

    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Google SSO callback failed")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?sso_error={str(exc)}")

