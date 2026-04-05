"""
Purpose: Authentication route stubs for signup, login, logout, and current-user lookup.
TODO: Implement password hashing, JWT session issuance, and persistent user/session storage.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel


router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    """Payload for creating a new user."""

    email: str
    password: str


class LoginRequest(BaseModel):
    """Payload for authenticating an existing user."""

    email: str
    password: str


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest) -> dict[str, object]:
    """Create a user record and return a placeholder response."""
    return {
        "todo": "Implement signup flow.",
        "path": "/auth/signup",
        "email": payload.email,
    }


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(payload: LoginRequest) -> dict[str, object]:
    """Authenticate a user and return a placeholder response."""
    return {
        "todo": "Implement login flow.",
        "path": "/auth/login",
        "email": payload.email,
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout() -> dict[str, str]:
    """Revoke the current session."""
    return {
        "todo": "Implement logout flow.",
        "path": "/auth/logout",
    }



# GET /me is mounted at app level (no /auth prefix) — see main.py
me_router = APIRouter(tags=["auth"])


@me_router.get("/me", status_code=status.HTTP_200_OK)
async def me() -> dict[str, str]:
    """Return the current authenticated user."""
    return {
        "todo": "Implement current-user lookup.",
        "path": "/me",
    }
