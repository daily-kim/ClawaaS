from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.auth_utils import (
    _extract_bearer_token,
    create_session_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db import get_connection


router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    """Payload for creating a new user."""

    email: str
    password: str


class LoginRequest(BaseModel):
    """Payload for authenticating an existing user."""

    email: str
    password: str


def _expires_at_24h() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=24)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest) -> dict[str, object]:
    """Create a user and return the initial bearer token."""
    user_id = str(uuid4())
    password_hash = hash_password(payload.password)
    token = create_session_token()
    async with get_connection() as connection:
        existing_cursor = await connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (payload.email,),
        )
        existing_user = await existing_cursor.fetchone()
        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        await connection.execute(
            """
            INSERT INTO users (id, email, password_hash)
            VALUES (?, ?, ?)
            """,
            (user_id, payload.email, password_hash),
        )
        await connection.execute(
            """
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES (?, ?, ?)
            """,
            (token, user_id, _expires_at_24h()),
        )
        await connection.commit()
    return {"token": token, "user": {"id": user_id, "email": payload.email}}


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(payload: LoginRequest) -> dict[str, object]:
    """Authenticate a user and return a fresh bearer token."""
    async with get_connection() as connection:
        cursor = await connection.execute(
            """
            SELECT id, email, password_hash
            FROM users
            WHERE email = ?
            """,
            (payload.email,),
        )
        user = await cursor.fetchone()
        if user is None or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        token = create_session_token()
        await connection.execute(
            """
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES (?, ?, ?)
            """,
            (token, user["id"], _expires_at_24h()),
        )
        await connection.commit()
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    _: dict[str, object] = Depends(get_current_user),
    authorization: str = Header(None),
) -> dict[str, bool]:
    """Delete the current bearer session."""
    token = _extract_bearer_token(authorization)
    async with get_connection() as connection:
        await connection.execute("DELETE FROM sessions WHERE id = ?", (token,))
        await connection.commit()
    return {"ok": True}


me_router = APIRouter(tags=["auth"])


@me_router.get("/me", status_code=status.HTTP_200_OK)
async def me(user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
    """Return the current authenticated user."""
    return {
        "id": user["id"],
        "email": user["email"],
        "created_at": user["created_at"],
    }
