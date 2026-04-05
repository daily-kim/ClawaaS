"""
Purpose: Agent lifecycle and chat route stubs for the ClawaaS API.
TODO: Wire these handlers to database persistence, runtime provisioning scripts, and gateway chat proxying.
"""

from __future__ import annotations

from fastapi import APIRouter, Path, status
from pydantic import BaseModel


router = APIRouter(prefix="/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    """Payload for creating a user-owned agent."""

    name: str


class BootstrapAgentRequest(BaseModel):
    """Payload for triggering the bootstrap turn."""

    bootstrap_message: str


class ChatRequest(BaseModel):
    """Payload for a chat turn routed through the user's gateway."""

    message: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_agent(payload: CreateAgentRequest) -> dict[str, object]:
    """Create an agent placeholder."""
    return {
        "todo": "Implement agent creation.",
        "path": "/agents",
        "name": payload.name,
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_agents() -> dict[str, object]:
    """List all agents for the current user."""
    return {
        "todo": "Implement agent listing.",
        "path": "/agents",
        "items": [],
    }


@router.get("/{id}", status_code=status.HTTP_200_OK)
async def get_agent(id: str = Path(..., description="Agent identifier")) -> dict[str, str]:
    """Fetch a single agent placeholder."""
    return {
        "todo": "Implement single-agent lookup.",
        "path": f"/agents/{id}",
        "id": id,
    }


@router.post("/{id}/bootstrap", status_code=status.HTTP_202_ACCEPTED)
async def bootstrap_agent(
    payload: BootstrapAgentRequest,
    id: str = Path(..., description="Agent identifier"),
) -> dict[str, str]:
    """Trigger a bootstrap turn for an agent."""
    return {
        "todo": "Implement bootstrap orchestration.",
        "path": f"/agents/{id}/bootstrap",
        "id": id,
        "bootstrap_message": payload.bootstrap_message,
    }


@router.post("/{id}/chat", status_code=status.HTTP_200_OK)
async def chat_with_agent(
    payload: ChatRequest,
    id: str = Path(..., description="Agent identifier"),
) -> dict[str, str]:
    """Proxy a chat turn to an agent runtime."""
    return {
        "todo": "Implement chat proxying.",
        "path": f"/agents/{id}/chat",
        "id": id,
        "message": payload.message,
    }
