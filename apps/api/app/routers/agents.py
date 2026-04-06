from __future__ import annotations

import json
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import provisioner
from app.auth_utils import get_current_user
from app.db import get_connection


router = APIRouter(prefix="/agents", tags=["agents"])


def _bootstrap_reply_text(agent_name: str) -> str:
    display_name = agent_name.strip() or "이 에이전트"
    return (
        f"안녕하세요! 당신만의 개인비서 {display_name} 입니다.👋\n"
        "작업환경 구성을 마쳤고, 바로 일을 시작할 준비가 되어 있어요.\n\n"
        "코드 수정, 파일 확인, 로그 분석, 문제 원인 파악처럼\n"
        "구체적인 작업도 바로 도와드릴 수 있고,\n"
        "어디서부터 시작할지 함께 정리하는 것도 가능합니다. ✨\n\n"
        "원하는 작업이나 지금 상황을 편하게 알려주세요.\n"
        "바로 같이 시작해볼게요. 🚀"
    )


def _extract_chat_text(raw: str) -> str:
    """Best-effort extraction of assistant-visible text from mixed CLI output."""
    parsed_objects = _extract_json_objects(raw)

    for parsed in reversed(parsed_objects):
        result = parsed.get("result")
        if not isinstance(result, dict):
            continue
        payloads = result.get("payloads")
        if not isinstance(payloads, list):
            continue
        texts = [
            payload.get("text", "").strip()
            for payload in payloads
            if isinstance(payload, dict) and isinstance(payload.get("text"), str)
        ]
        joined = "\n".join(text for text in texts if text)
        if joined:
            return joined

    lines = [line.strip() for line in raw.splitlines()]
    for line in reversed(lines):
        if not line:
            continue
        if line == "READY":
            continue
        if line.startswith("[") and "]" in line:
            continue
        if "openclaw-gateway@" in line or line.startswith("Starting ") or line.startswith("Started "):
            continue
        if "Config overwrite:" in line or "Config write anomaly:" in line:
            continue
        return line

    return raw.strip()


def _extract_json_objects(raw: str) -> list[dict[str, object]]:
    decoder = json.JSONDecoder()
    parsed_objects: list[dict[str, object]] = []

    for index, char in enumerate(raw):
        if char != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(raw[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            parsed_objects.append(parsed)

    return parsed_objects


def _strip_stream_noise(raw: str) -> str:
    text = raw.strip()
    if text.startswith("Response:"):
        text = text.split("Response:", 1)[1].strip()
    return text


def _extract_event_text(parsed: dict[str, object]) -> str:
    result = parsed.get("result")
    if isinstance(result, dict):
        payloads = result.get("payloads")
        if isinstance(payloads, list):
            texts = [
                payload.get("text", "").strip()
                for payload in payloads
                if isinstance(payload, dict) and isinstance(payload.get("text"), str)
            ]
            joined = "\n".join(text for text in texts if text)
            if joined:
                return joined

    for key in ("summary", "status", "message", "detail"):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    if isinstance(result, dict):
        for key in ("summary", "status", "message", "detail"):
            value = result.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    return ""


def _classify_stream_event(parsed: dict[str, object], fallback: str = "") -> str:
    text = f"{_extract_event_text(parsed)} {fallback}".lower()
    if isinstance(parsed.get("result"), dict):
        payloads = parsed["result"].get("payloads")
        if isinstance(payloads, list):
            if any(
                isinstance(payload, dict) and isinstance(payload.get("text"), str) and payload.get("text", "").strip()
                for payload in payloads
            ):
                return "message"
    if any(token in text for token in ("tool", "call", "function", "exec", "running", "command")):
        return "tool"
    return "status"


def _extract_chat_summary(raw: str) -> str:
    parsed_objects = _extract_json_objects(raw)
    for parsed in reversed(parsed_objects):
        summary = _extract_event_text(parsed)
        if summary:
            return summary

    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    for line in reversed(lines):
        cleaned = _strip_stream_noise(line)
        if cleaned and cleaned != "READY":
            return cleaned
    return ""


def _normalize_stream_line(raw: str) -> dict[str, str] | None:
    cleaned = _strip_stream_noise(raw)
    if not cleaned:
        return None

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        if cleaned == "READY":
            return None
        if cleaned.startswith("[") and "]" in cleaned:
            return None
        if "openclaw-gateway@" in cleaned:
            return None
        return {"kind": "status", "text": cleaned}

    if not isinstance(parsed, dict):
        return None

    text = _extract_event_text(parsed)
    if not text:
        text = cleaned
    return {"kind": _classify_stream_event(parsed, cleaned), "text": text}


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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
            SELECT id, user_id, linux_user, name, status, port, bootstrap_text, created_at
            FROM agents
            WHERE id = ? AND user_id = ?
            """,
            (agent_id, user_id),
        )
        row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return dict(row)


async def _bootstrap_agent_task(agent_id: str, linux_user: str, agent_name: str) -> None:
    try:
        bootstrap_reply_text = _bootstrap_reply_text(agent_name)
        bootstrap_prompt = (
            "작업 공간 초기화 단계입니다.\n"
            "먼저 작업 공간 루트에 MEMORY.md 파일이 없으면 반드시 생성하세요.\n"
            "MEMORY.md에는 이 에이전트가 이후 작업 중 메모를 남길 수 있다는 짧은 안내 한두 문장만 적으면 충분합니다.\n"
            "그 다음 다른 질문이나 설명 없이 아래 한국어 문구만 그대로 답하세요.\n\n"
            f"{bootstrap_reply_text}"
        )
        response = await provisioner.bootstrap_agent(linux_user, bootstrap_prompt)
        bootstrap_text = _extract_chat_text(response) or bootstrap_reply_text
        next_status = "ready"
    except Exception:
        bootstrap_text = None
        next_status = "error"
    async with get_connection() as connection:
        await connection.execute(
            "UPDATE agents SET status = ?, bootstrap_text = ? WHERE id = ?",
            (next_status, bootstrap_text, agent_id),
        )
        await connection.commit()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: CreateAgentRequest,
    background_tasks: BackgroundTasks,
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    """Create and provision an agent for the current user."""
    async with get_connection() as connection:
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

    background_tasks.add_task(_bootstrap_agent_task, agent_id, linux_user, payload.name)
    return {
        "id": agent_id,
        "user_id": user["id"],
        "linux_user": linux_user,
        "name": payload.name,
        "status": "bootstrapping",
        "port": port,
        "bootstrap_text": None,
    }


@router.get("", status_code=status.HTTP_200_OK)
async def list_agents(
    user: dict[str, object] = Depends(get_current_user),
) -> list[dict[str, object]]:
    """List the current user's agents."""
    async with get_connection() as connection:
        cursor = await connection.execute(
            """
            SELECT id, user_id, linux_user, name, status, port, bootstrap_text, created_at
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


@router.get("/{id}/files")
async def list_agent_files(
    id: str = Path(..., description="Agent identifier"),
    path: str = Query(default="."),
    user: dict[str, object] = Depends(get_current_user),
) -> list[dict[str, object]]:
    """List files in the agent's workspace."""
    agent = await _get_owned_agent(id, str(user["id"]))
    if agent["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace not initialized yet (status: {agent['status']})",
        )
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")
    return await provisioner.list_files(str(agent["id"]), str(agent["linux_user"]), path)


@router.get("/{id}/files/read")
async def read_agent_file(
    id: str = Path(..., description="Agent identifier"),
    path: str = Query(...),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, str]:
    """Read a file from the agent's workspace."""
    agent = await _get_owned_agent(id, str(user["id"]))
    if agent["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace not initialized yet (status: {agent['status']})",
        )
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        content = await provisioner.read_file(str(agent["id"]), str(agent["linux_user"]), path)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"path": path, "content": content}


class WriteFileRequest(BaseModel):
    path: str
    content: str


@router.put("/{id}/files/write")
async def write_agent_file(
    payload: WriteFileRequest,
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, str]:
    """Write a file in the agent's workspace."""
    agent = await _get_owned_agent(id, str(user["id"]))
    if agent["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace not initialized yet (status: {agent['status']})",
        )
    if ".." in payload.path:
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        await provisioner.write_file(str(agent["id"]), str(agent["linux_user"]), payload.path, payload.content)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": "written", "path": payload.path}


@router.get("/{id}/logs")
async def stream_agent_logs(
    id: str = Path(..., description="Agent identifier"),
    since: str = Query(default="10m"),
    user: dict[str, object] = Depends(get_current_user),
) -> StreamingResponse:
    """Stream gateway journal logs as SSE."""
    agent = await _get_owned_agent(id, str(user["id"]))
    return StreamingResponse(
        provisioner.stream_gateway_logs(str(agent["linux_user"]), since=since),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_agent(
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, str]:
    """Delete an agent and all its resources."""
    agent = await _get_owned_agent(id, str(user["id"]))

    if agent["status"] == "deleting":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already deleting",
        )

    async with get_connection() as connection:
        await connection.execute(
            "UPDATE agents SET status = 'deleting' WHERE id = ?", (id,)
        )
        await connection.commit()

    try:
        await provisioner.delete_agent(str(agent["linux_user"]))
    except Exception as exc:
        async with get_connection() as connection:
            await connection.execute(
                "UPDATE agents SET status = 'error' WHERE id = ?", (id,)
            )
            await connection.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    async with get_connection() as connection:
        await connection.execute("DELETE FROM agents WHERE id = ?", (id,))
        await connection.commit()

    return {"ok": "deleted", "id": id}


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
            "UPDATE agents SET status = 'bootstrapping', bootstrap_text = NULL WHERE id = ?",
            (id,),
        )
        await connection.commit()
    background_tasks.add_task(_bootstrap_agent_task, id, str(agent["linux_user"]), str(agent["name"]))
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
    text = _extract_chat_text(response)
    summary = _extract_chat_summary(response)
    return {
        "response": response,
        "text": text,
        "summary": summary,
        "had_reply": bool(text.strip()),
    }


@router.post("/{id}/chat/stream")
async def stream_chat_with_agent(
    payload: ChatRequest,
    id: str = Path(..., description="Agent identifier"),
    user: dict[str, object] = Depends(get_current_user),
) -> StreamingResponse:
    """Stream a chat turn as SSE updates."""
    agent = await _get_owned_agent(id, str(user["id"]))
    if agent["status"] != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Agent not ready (status: {agent['status']})",
        )

    async def event_stream() -> AsyncIterator[str]:
        seen_updates: set[tuple[str, str]] = set()
        captured_lines: list[str] = []
        exit_code = 0
        stderr_text = ""

        async for item in provisioner.stream_agent_turn(
            str(agent["linux_user"]),
            str(agent["id"]),
            payload.message,
        ):
            item_type = str(item.get("type"))
            if item_type == "line":
                line = str(item.get("line", ""))
                captured_lines.append(line)
                normalized = _normalize_stream_line(line)
                if normalized is None:
                    continue
                signature = (normalized["kind"], normalized["text"])
                if signature in seen_updates:
                    continue
                seen_updates.add(signature)
                yield _sse("update", normalized)
                continue

            if item_type == "exit":
                exit_code = int(item.get("returncode", 0))
                stderr_text = str(item.get("stderr", ""))

        combined = "\n".join(line for line in captured_lines if line.strip())
        final_text = _extract_chat_text(combined)
        summary = _extract_chat_summary(combined)
        recoverable = bool(summary.strip()) or bool(final_text.strip())

        if exit_code != 0 and not recoverable:
            yield _sse("error", {"detail": stderr_text or "Agent turn failed"})
            return

        yield _sse(
            "done",
            {
                "text": final_text,
                "summary": summary,
                "had_reply": bool(final_text.strip()),
                "exit_code": exit_code,
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
