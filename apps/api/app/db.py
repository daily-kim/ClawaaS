"""
Purpose: Provide SQLite connection helpers for the ClawaaS API.
TODO: Define schema initialization, migrations, and transaction helpers.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from app.config import get_settings


def _sqlite_path_from_url(database_url: str) -> str:
    """Translate a basic sqlite URL into a filesystem path for aiosqlite."""
    return database_url.removeprefix("sqlite+aiosqlite:///")


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
