"""
Purpose: Stub application models for users, sessions, agents, and runtime instances.
TODO: Replace dataclass placeholders with persisted models and validation rules once the schema is finalized.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4


Timestamp = datetime
AgentStatus = Literal["created", "bootstrapping", "ready", "error"]
RuntimeStatus = Literal["stopped", "starting", "ready", "error"]


@dataclass(slots=True)
class User:
    """Represent an authenticated ClawaaS user."""

    id: UUID = field(default_factory=uuid4)
    email: str = ""
    password_hash: str = ""
    linux_username: str = ""
    created_at: Timestamp = field(default_factory=datetime.utcnow)


@dataclass(slots=True)
class Session:
    """Represent a login session or token issue event."""

    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    token_id: str = ""
    created_at: Timestamp = field(default_factory=datetime.utcnow)
    revoked_at: Timestamp | None = None


@dataclass(slots=True)
class Agent:
    """Represent a user-owned agent that chats through a dedicated runtime."""

    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    name: str = ""
    status: AgentStatus = "created"
    created_at: Timestamp = field(default_factory=datetime.utcnow)


@dataclass(slots=True)
class RuntimeInstance:
    """Represent the runtime state behind a user or agent."""

    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    agent_id: UUID = field(default_factory=uuid4)
    linux_username: str = ""
    gateway_port: int = 18800
    status: RuntimeStatus = "stopped"
    created_at: Timestamp = field(default_factory=datetime.utcnow)
