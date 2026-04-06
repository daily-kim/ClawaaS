from __future__ import annotations

import asyncio
import re
import shlex
from collections.abc import AsyncIterator
from pathlib import Path

from app.config import get_settings


def _project_root() -> Path:
    configured = get_settings().project_root
    if configured:
        return Path(configured)
    # Auto-detect: apps/api/app/provisioner.py → ClawaaS/
    return Path(__file__).resolve().parent.parent.parent.parent


async def _run_command(command: str) -> str:
    process = await asyncio.create_subprocess_exec(
        "bash",
        "-lc",
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(stderr.decode().strip() or stdout.decode().strip())
    return stdout.decode().strip()


async def create_linux_user(uuid: str) -> str:
    """Create the dedicated Linux user for an agent UUID."""
    script_path = _project_root() / "ops/runtime/create_linux_user.sh"
    await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(uuid)}"
    )
    return f"oc_u_{uuid.replace('-', '')[:8]}"


async def render_config(
    linux_user: str,
    port_registry: str = "/var/lib/clawaas/port-registry.json",
) -> int:
    """Render the per-user OpenClaw config, fix ownership, and return the allocated port."""
    settings = get_settings()
    script_path = _project_root() / "ops/runtime/render_openclaw_config.py"
    output_path = f"/home/{linux_user}/.openclaw/openclaw.json"

    # Pass LLM env vars through sudo so render script can build models section
    env_parts = []
    if settings.llm_api_url:
        env_parts.append(f"CLAWAAS_LLM_API_URL={shlex.quote(settings.llm_api_url)}")
    if settings.llm_model:
        env_parts.append(f"CLAWAAS_LLM_MODEL={shlex.quote(settings.llm_model)}")

    await _run_command(
        " ".join(
            [
                "sudo",
                *env_parts,
                "python3",
                shlex.quote(str(script_path)),
                shlex.quote(linux_user),
                shlex.quote(output_path),
                f"--port-registry={shlex.quote(port_registry)}",
            ]
        )
    )

    # Write actual CLAWAAS_API_KEY into gateway.env if configured
    if settings.api_key:
        env_path = f"/home/{linux_user}/.openclaw/gateway.env"
        await _run_command(
            f"sudo bash -c {shlex.quote(f'echo CLAWAAS_API_KEY={settings.api_key} >> {env_path}')}"
        )

    await _run_command(
        " ".join(
            [
                "sudo",
                "chown",
                "-R",
                shlex.quote(f"{linux_user}:{linux_user}"),
                shlex.quote(f"/home/{linux_user}/.openclaw"),
            ]
        )
    )
    # Read port from generated gateway.env (via sudo since home is 700)
    env_content = await _run_command(
        f"sudo cat /home/{shlex.quote(linux_user)}/.openclaw/gateway.env"
    )
    match = re.search(r"CLAWAAS_GATEWAY_PORT=(\d+)", env_content)
    return int(match.group(1)) if match else 18800


async def start_gateway(linux_user: str) -> None:
    """Start the agent gateway for a Linux user."""
    script_path = _project_root() / "ops/runtime/start_gateway.sh"
    await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
    )


async def stop_gateway(linux_user: str) -> None:
    """Stop the agent gateway for a Linux user."""
    script_path = _project_root() / "ops/runtime/stop_gateway.sh"
    await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
    )


async def inject_container_certs(linux_user: str) -> None:
    """Inject host CA certs into the OpenShell k3s container (for TLS proxies)."""
    script_path = _project_root() / "ops/runtime/inject_container_certs.sh"
    try:
        await _run_command(
            f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
        )
    except RuntimeError:
        pass  # Non-fatal: sandbox may still work without extra certs


async def bootstrap_agent(linux_user: str) -> str:
    """Run the bootstrap script for a Linux user."""
    script_path = _project_root() / "ops/runtime/bootstrap_agent.sh"
    return await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
    )


async def stream_gateway_logs(linux_user: str, since: str = "10m") -> AsyncIterator[str]:
    """Stream gateway journal logs as SSE events."""
    unit = f"openclaw-gateway@{linux_user}.service"
    process = await asyncio.create_subprocess_exec(
        "sudo", "journalctl", "-u", unit,
        f"--since={since} ago", "--follow", "--no-pager", "-o", "short-iso",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            yield f"data: {line.decode().rstrip()}\n\n"
    finally:
        process.terminate()
        await process.wait()


async def delete_agent(linux_user: str) -> None:
    """Delete all resources for a Linux user (gateway, home, port registry)."""
    script_path = _project_root() / "ops/runtime/delete_agent.sh"
    await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
    )


async def _find_sandbox_workspace(agent_id: str) -> str:
    """Locate the sandbox PVC workspace path for an agent inside the OpenShell container."""
    # PVC directory names contain the agent UUID (with truncated/modified hyphens)
    # Search inside the k3s storage for a matching workspace PVC
    try:
        output = await _run_command(
            "sudo docker exec openshell-cluster-openshell "
            f"find /var/lib/rancher/k3s/storage -maxdepth 1 -type d "
            f"-name '*workspace-openclaw*{shlex.quote(agent_id[:8])}*'"
        )
        if output.strip():
            return output.strip().splitlines()[0]
    except RuntimeError:
        pass
    raise RuntimeError(f"Sandbox workspace not found for agent {agent_id}")


async def list_files(agent_id: str, linux_user: str, rel_path: str = ".") -> list[dict[str, object]]:
    """List files in the agent's sandbox workspace directory."""
    try:
        workspace = await _find_sandbox_workspace(agent_id)
    except RuntimeError:
        # Fallback to host workspace
        workspace = f"/home/{linux_user}/workspace"
        target = f"{workspace}/{rel_path}"
        output = await _run_command(
            f"sudo -u {shlex.quote(linux_user)} "
            f"find {shlex.quote(target)} -maxdepth 1 -mindepth 1 "
            f"-printf '%y %s %f\\n' 2>/dev/null | sort -k3"
        )
        return _parse_find_output(output)

    target = f"{workspace}/{rel_path}"
    output = await _run_command(
        f"sudo docker exec openshell-cluster-openshell "
        f"find {shlex.quote(target)} -maxdepth 1 -mindepth 1 "
        f"-printf '%y %s %f\\n' 2>/dev/null | sort -k3"
    )
    return _parse_find_output(output)


def _parse_find_output(output: str) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for line in output.strip().splitlines():
        if not line:
            continue
        parts = line.split(" ", 2)
        if len(parts) < 3:
            continue
        kind, size, name = parts
        entries.append({
            "name": name,
            "type": "dir" if kind == "d" else "file",
            "size": int(size) if kind != "d" else None,
        })
    return entries


async def read_file(agent_id: str, linux_user: str, rel_path: str) -> str:
    """Read a file from the agent's sandbox workspace."""
    try:
        workspace = await _find_sandbox_workspace(agent_id)
    except RuntimeError:
        workspace = f"/home/{linux_user}/workspace"
        target = f"{workspace}/{rel_path}"
        return await _run_command(
            f"sudo -u {shlex.quote(linux_user)} cat {shlex.quote(target)}"
        )

    target = f"{workspace}/{rel_path}"
    return await _run_command(
        f"sudo docker exec openshell-cluster-openshell cat {shlex.quote(target)}"
    )


async def write_file(agent_id: str, linux_user: str, rel_path: str, content: str) -> None:
    """Write content to a file in the agent's sandbox workspace."""
    try:
        workspace = await _find_sandbox_workspace(agent_id)
    except RuntimeError:
        workspace = f"/home/{linux_user}/workspace"
        target = f"{workspace}/{rel_path}"
        process = await asyncio.create_subprocess_exec(
            "sudo", "-u", linux_user, "tee", target,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate(content.encode())
        if process.returncode != 0:
            raise RuntimeError(stderr.decode().strip())
        return

    target = f"{workspace}/{rel_path}"
    process = await asyncio.create_subprocess_exec(
        "sudo", "docker", "exec", "-i", "openshell-cluster-openshell",
        "tee", target,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate(content.encode())
    if process.returncode != 0:
        raise RuntimeError(stderr.decode().strip())


async def run_agent_turn(linux_user: str, session_id: str, message: str) -> str:
    """Run one agent turn as the provisioned Linux user."""
    home = f"/home/{linux_user}"
    return await _run_command(
        " ".join(
            [
                "sudo",
                "-u",
                shlex.quote(linux_user),
                "env",
                f"HOME={shlex.quote(home)}",
                f"OPENCLAW_HOME={shlex.quote(home)}",
                f"TMPDIR={shlex.quote(f'{home}/.openclaw/tmp')}",
                "openclaw",
                "agent",
                "--session-id",
                shlex.quote(session_id),
                "--message",
                shlex.quote(message),
                "--json",
                "--timeout",
                "120",
            ]
        )
    )
