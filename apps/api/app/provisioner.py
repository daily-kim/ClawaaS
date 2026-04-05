from __future__ import annotations

import asyncio
import re
import shlex
from pathlib import Path

from app.config import get_settings


def _project_root() -> Path:
    return Path(get_settings().project_root)


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
    script_path = _project_root() / "ops/runtime/render_openclaw_config.py"
    output_path = f"/home/{linux_user}/.openclaw/openclaw.json"
    await _run_command(
        " ".join(
            [
                "sudo",
                "python3",
                shlex.quote(str(script_path)),
                shlex.quote(linux_user),
                shlex.quote(output_path),
                f"--port-registry={shlex.quote(port_registry)}",
            ]
        )
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


async def bootstrap_agent(linux_user: str) -> str:
    """Run the bootstrap script for a Linux user."""
    script_path = _project_root() / "ops/runtime/bootstrap_agent.sh"
    return await _run_command(
        f"sudo bash {shlex.quote(str(script_path))} {shlex.quote(linux_user)}"
    )


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
