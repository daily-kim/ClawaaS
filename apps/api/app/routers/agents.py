from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, status
from pydantic import BaseModel

from app import provisioner
from app.auth_utils import get_current_user
from app.db import get_connection


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


def _agent_linux_user(agent_id: str) -> str:
    return f"oc_u_{agent_id.replace('-', '')[:8]}"



async def _get_owned_agent(agent_id: str, user_id: str) -> dict[str, object]:
    async with get_connection() as connection:
        cursor = await connection.execute(
            """
            SELECT id, user_id, linux_user, name, status, port, created_at
            FROM agents
            WHERE id = ? AND user_id = ?
            """,
            (agent_id, user_id),
        )
        row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return dict(row)


async def _bootstrap_agent_task(agent_id: str, linux_user: str) -> None:
    next_status = "ready"
    try:
        await provisioner.bootstrap_agent(linux_user)
    except Exception:
        next_status = "error"
    async with get_connection() as connection:
        await connection.execute(
            "UPDATE agents SET status = ? WHERE id = ?",
            (next_status, agent_id),
        )
        await connection.commit()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: CreateAgentRequest,
    background_tasks: BackgroundTasks,
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    """Create and provision the current user's single agent."""
    async with get_connection() as connection:
        existing_cursor = await connection.execute(
            "SELECT id FROM agents WHERE user_id = ?",
            (user["id"],),
        )
        existing_agent = await existing_cursor.fetchone()
        if existing_agent is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has an agent",
            )

        agent_id = str(uuid4())
        linux_user = _agent_linux_user(agent_id)
        await connection.execute(
            """
            INSERT INTO agents (id, user_id, linux_user, name, status)
            VALUES (?, ?, ?, ?, 'created')
            """,
            (agent_id, user["id"], linux_user, payload.name),
        )
        await connection.commit()

    try:
        created_linux_user = await provisioner.create_linux_user(agent_id)
        if created_linux_user != linux_user:
            raise RuntimeError(
                f"Provisioned linux user mismatch: expected {linux_user}, got {created_linux_user}"
            )
        port = await provisioner.render_config(linux_user)
        await provisioner.start_gateway(linux_user)
    except Exception as exc:
        async with get_connection() as connection:
            await connection.execute(
                "UPDATE agents SET status = 'error' WHERE id = ?",
                (agent_id,),
            )
            await connection.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    async with get_connection() as connection:
        await connection.execute(
            """
            UPDATE agents
            SET status = 'bootstrapping', port = ?
            WHERE id = ?
            """,
            (port, agent_id),
        )
        await connection.commit()

    background_tasks.add_task(_bootstrap_agent_task, agent_id, linux_user)
    return {
        "id": agent_id,
        "user_id": user["id"],
        "linux_user": linux_user,
        "name": payload.name,
        "status": "bootstrapping",
        "port": port,
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_agents(
    user: dict[str, object] = Depends(get_current_user),
) -> list[dict[str, object]]:
    """List the current user's agents."""
    async with get_connection() as connection:
        cursor = await connection.execute(
            """
            SELECT id, user_id, linux_user, name, status, port, created_at
            FROM agents
            WHERE user_id = ?
            ORDER BY created_at ASC
            """,
            (user["id"],),
        )
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.get("/{id}", status_code=status.HTTP_200_OK)
async def get_agent(
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    """Fetch a single agent owned by the current user."""
    return await _get_owned_agent(id, str(user["id"]))


@router.post("/{id}/bootstrap", status_code=status.HTTP_202_ACCEPTED)
async def bootstrap_agent(
    payload: BootstrapAgentRequest,
    background_tasks: BackgroundTasks,
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    """Trigger agent bootstrap in the background."""
    _ = payload
    agent = await _get_owned_agent(id, str(user["id"]))
    async with get_connection() as connection:
        await connection.execute(
            "UPDATE agents SET status = 'bootstrapping' WHERE id = ?",
            (id,),
        )
        await connection.commit()
    background_tasks.add_task(_bootstrap_agent_task, id, str(agent["linux_user"]))
    return {"ok": True, "id": id, "status": "bootstrapping"}


@router.post("/{id}/chat", status_code=status.HTTP_200_OK)
async def chat_with_agent(
    payload: ChatRequest,
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, str]:
    """Run a chat turn against an owned agent."""
    agent = await _get_owned_agent(id, str(user["id"]))
    if agent["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Agent not ready (status: {agent['status']})",
        )
    response = await provisioner.run_agent_turn(
        str(agent["linux_user"]),
        str(agent["id"]),
        payload.message,
    )
    return {"response": response}
