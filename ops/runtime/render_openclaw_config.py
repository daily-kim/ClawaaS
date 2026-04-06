#!/usr/bin/env python3
"""
Render a per-user OpenClaw configuration (openclaw.json) for the OpenShell remote backend.

Port allocation: sequential from a port registry file to avoid collisions.
Fallback: 18800 + user_id hash if no registry available.

Usage:
    python3 render_openclaw_config.py <linux-user> <output-path> [--llm-api-url=URL] [--port-registry=PATH]

Output path must be under /home/<linux-user>/ for safety.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BASE_GATEWAY_PORT = 18800
DEFAULT_LLM_API_URL = os.environ.get("CLAWAAS_LLM_API_URL", "")
DEFAULT_LLM_MODEL = os.environ.get("CLAWAAS_LLM_MODEL", "")
DEFAULT_PORT_REGISTRY = "/var/lib/clawaas/port-registry.json"


def allocate_port(linux_user: str, registry_path: str = DEFAULT_PORT_REGISTRY) -> int:
    """Allocate a unique port for the user, persisted in a registry file."""
    registry = {}
    reg_path = Path(registry_path)

    if reg_path.exists():
        registry = json.loads(reg_path.read_text(encoding="utf-8"))

    if linux_user in registry:
        return registry[linux_user]

    # Find next available port — step by 10 because each gateway uses
    # multiple ports (main, main+2 for browser control, etc.)
    used_ports = set(registry.values())
    port = BASE_GATEWAY_PORT
    while port in used_ports:
        port += 10

    registry[linux_user] = port
    reg_path.parent.mkdir(parents=True, exist_ok=True)
    reg_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

    return port


def render_config(
    linux_user: str,
    port: int,
    llm_api_url: str = "",
    llm_model: str = "",
) -> dict:
    """Build a per-user OpenClaw config matching the official schema.

    Schema reference: `openclaw config schema`
    - gateway.port: unique per user
    - agents.defaults.workspace: per-user workspace
    - agents.defaults.sandbox: OpenShell backend in remote mode
    - plugins.entries.openshell: OpenShell plugin config
    - models.providers.litellm: LiteLLM-compatible LLM endpoint
    """
    home_dir = Path("/home") / linux_user

    config: dict = {
        "gateway": {
            "port": port,
        },
        "agents": {
            "defaults": {
                "workspace": str(home_dir / "workspace"),
                "sandbox": {
                    "mode": "all",
                    "backend": "openshell",
                    "scope": "session",
                    "workspaceAccess": "rw",
                },
            },
        },
        "plugins": {
            "entries": {
                "openshell": {
                    "enabled": True,
                    "config": {
                        "from": "openclaw",
                        "mode": "remote",
                        "command": "openshell",
                    },
                },
            },
        },
    }

    if llm_api_url and llm_model:
        config["models"] = {
            "mode": "replace",
            "providers": {
                "litellm": {
                    "baseUrl": llm_api_url,
                    "apiKey": {
                        "source": "env",
                        "provider": "default",
                        "id": "CLAWAAS_API_KEY",
                    },
                    "api": "openai-completions",
                    "auth": "api-key",
                    "models": [
                        {
                            "id": llm_model,
                            "name": llm_model,
                        },
                    ],
                },
            },
        }

    return config


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(
            f"Usage: {argv[0]} <linux-user> <output-path> [--llm-api-url=URL] [--port-registry=PATH]",
            file=sys.stderr,
        )
        return 1

    linux_user = argv[1]
    output_path_str = argv[2]
    llm_api_url = DEFAULT_LLM_API_URL
    llm_model = DEFAULT_LLM_MODEL
    port_registry = DEFAULT_PORT_REGISTRY

    for arg in argv[3:]:
        if arg.startswith("--llm-api-url="):
            llm_api_url = arg.split("=", 1)[1]
        elif arg.startswith("--llm-model="):
            llm_model = arg.split("=", 1)[1]
        elif arg.startswith("--port-registry="):
            port_registry = arg.split("=", 1)[1]

    # Safety: output path must be under /home/<linux_user>/
    output_path = Path(output_path_str).resolve()
    allowed_base = Path("/home") / linux_user
    if not str(output_path).startswith(str(allowed_base) + "/"):
        print(f"Error: output path must be under {allowed_base}", file=sys.stderr)
        return 1

    port = allocate_port(linux_user, port_registry)
    config = render_config(linux_user, port, llm_api_url, llm_model)
    payload = json.dumps(config, indent=2) + "\n"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(payload, encoding="utf-8")

    # Write gateway.env for systemd EnvironmentFile
    env_path = output_path.parent / "gateway.env"
    env_lines = [f"CLAWAAS_GATEWAY_PORT={port}"]
    # CLAWAAS_API_KEY must be set by the operator (or via FastAPI provisioner)
    # Include placeholder so the env file structure is ready
    env_lines.append("# CLAWAAS_API_KEY=<set-by-operator>")
    env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    print(f"Config written to {output_path} (port: {port})")
    print(f"Env file written to {env_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
