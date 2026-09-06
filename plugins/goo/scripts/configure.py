import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config = {"mcpServers": {"goo": {"command": "uv", "args": ["run", "--project", str(root), "--locked", "python", str(root / "scripts/server.py")], "env": {"UV_PROJECT_ENVIRONMENT": str(Path.home() / ".cache/goo-agent-tools/runtime-venv")}}}}
(root / ".mcp.json").write_text(json.dumps(config, indent=2) + "\n")
print(f"Configured local MCP source: {root}")
