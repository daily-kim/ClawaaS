from __future__ import annotations

import secrets
from typing import Any

import bcrypt
from fastapi import Header, HTTPException, status

from app.db import get_connection


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_session_token() -> str:
    """Create a new opaque bearer token."""
    return secrets.token_urlsafe(32)


def _extract_bearer_token(authorization: str | None) -> str:
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        )
    return token


async def get_current_user(authorization: str = Header(None)) -> dict[str, Any]:
    """Resolve the authenticated user from a non-expired bearer session."""
    token = _extract_bearer_token(authorization)
    async with get_connection() as connection:
        cursor = await connection.execute(
            """
            SELECT users.id, users.email, users.password_hash, users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.id = ? AND sessions.expires_at > datetime('now')
            """,
            (token,),
        )
        row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return dict(row)
