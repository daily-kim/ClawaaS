"""SQLite connection helpers and schema initialization for ClawaaS API."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from app.config import get_settings

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    linux_user TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'created',
    port INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def _sqlite_path_from_url(database_url: str) -> str:
    return database_url.removeprefix("sqlite+aiosqlite:///")


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with get_connection() as db:
        await db.executescript(_SCHEMA)
        await db.commit()


@asynccontextmanager
async def get_connection() -> AsyncIterator[aiosqlite.Connection]:
    """Yield an aiosqlite connection for request-scoped work."""
    settings = get_settings()
    database_path = _sqlite_path_from_url(settings.database_url)
    connection = await aiosqlite.connect(database_path)
    connection.row_factory = aiosqlite.Row
    try:
        yield connection
    finally:
        await connection.close()
