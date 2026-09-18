import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


root = Path(__file__).resolve().parents[1]
manifest = root / ".mcp.json"
arguments = ["run", "--project", str(root), "--locked", "python", str(root / "scripts/server.py")]


def read_config():
    if not manifest.exists():
        return {}
    try:
        value = json.loads(manifest.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read {manifest}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{manifest} must contain a JSON object")
    servers = value.get("mcpServers", {})
    if not isinstance(servers, dict):
        raise ValueError("mcpServers must be a JSON object")
    server = servers.get("goo", {})
    if not isinstance(server, dict):
        raise ValueError("mcpServers.goo must be a JSON object")
    environment = server.get("env", {})
    if not isinstance(environment, dict):
        raise ValueError("mcpServers.goo.env must be a JSON object")
    return value


def configured(config):
    server = config.get("mcpServers", {}).get("goo", {})
    return server.get("command") == "uv" and server.get("args") == arguments


def status(config):
    issues = []
    if not configured(config):
        issues.append("The Goo MCP command paths do not match this plugin source.")
    return {
        "configured": not issues,
        "pluginRoot": str(root),
        "manifest": str(manifest),
        "issues": issues,
        "actions": [] if not issues else [f"Run `{sys.executable} {Path(__file__).resolve()}` before installing or reinstalling the plugin."],
    }


def write_config(config):
    servers = config.setdefault("mcpServers", {})
    server = servers.setdefault("goo", {})
    environment = server.setdefault("env", {})
    server["command"] = "uv"
    server["args"] = arguments
    environment.setdefault("UV_PROJECT_ENVIRONMENT", str(Path.home() / ".cache/goo-agent-tools/runtime-venv"))
    data = json.dumps(config, indent=2) + "\n"
    mode = manifest.stat().st_mode if manifest.exists() else None
    with tempfile.NamedTemporaryFile("w", dir=root, prefix=".mcp.", suffix=".tmp", delete=False) as temporary:
        temporary.write(data)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    if mode is not None:
        temporary_path.chmod(mode)
    temporary_path.replace(manifest)


def main():
    parser = argparse.ArgumentParser(description="Configure or verify the Goo MCP manifest.")
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    try:
        config = read_config()
        if options.check:
            result = status(config)
            print(json.dumps(result, indent=2))
            return 0 if result["configured"] else 1
        write_config(config)
    except (OSError, ValueError) as error:
        print(f"configure.py: {error}", file=sys.stderr)
        return 1
    print(f"Configured local MCP source: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
