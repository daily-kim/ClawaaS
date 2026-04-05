#!/usr/bin/env python3
"""
Purpose: Render a per-user OpenClaw configuration for the OpenShell remote backend.
TODO: Load a validated template file, emit exact OpenClaw config schema, and add strict config validation before restart.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_GATEWAY_PORT = 18800


def derive_port(linux_user: str) -> int:
    """Derive a stable port as 18800 + a bounded offset from the Linux username."""
    offset = sum(ord(character) for character in linux_user) % 1000
    return BASE_GATEWAY_PORT + offset


def render_config(linux_user: str) -> dict[str, object]:
    """Build a placeholder per-user config payload."""
    port = derive_port(linux_user)
    home_dir = Path("/home") / linux_user
    return {
        "comment": "TODO: Replace this placeholder config with the exact OpenClaw schema.",
        "linux_user": linux_user,
        "gateway": {
            "mode": "remote",
            "port": port,
            "host": "127.0.0.1",
        },
        "openshell": {
            "backend": "openshell",
            "workspace": str(home_dir / "workspace"),
        },
        "paths": {
            "home": str(home_dir),
            "openclaw_home": str(home_dir / ".openclaw"),
        },
    }


def main(argv: list[str]) -> int:
    """Render a config JSON document to stdout or an output path."""
    if len(argv) not in {2, 3}:
        print(f"Usage: {argv[0]} <linux-user> [output-path]", file=sys.stderr)
        return 1

    linux_user = argv[1]
    config = render_config(linux_user)
    payload = json.dumps(config, indent=2) + "\n"

    if len(argv) == 3:
        output_path = Path(argv[2]).resolve()
        allowed_base = Path("/home")
        if not str(output_path).startswith(str(allowed_base) + "/"):
            print(f"Error: output path must be under {allowed_base}", file=sys.stderr)
            return 1
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
