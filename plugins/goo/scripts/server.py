import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP, Image
from mcp.types import ToolAnnotations

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "reference"
MANIFEST = json.loads((BUNDLE / "manifest.json").read_text())
READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)
mcp = FastMCP("Goo", instructions="Author standalone G# Goo desktop apps. Use current checkout docs when available. Inspect running apps through Goo DevTools. This is not s&box Goo.")


def source(repository: str) -> Path:
    chosen = repository or os.environ.get("GOO_SOURCE_ROOT", "")
    if not chosen:
        return BUNDLE
    root = Path(chosen).expanduser().resolve()
    if not (root / "Goo/Goo.gsproj").is_file():
        raise ValueError("Expected a standalone Goo checkout containing Goo/Goo.gsproj")
    return root


def document(root: Path, path: str) -> Path:
    if path not in MANIFEST["files"]:
        raise ValueError("Unknown document. Use goo_context to list document paths.")
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Document resolves outside the selected source root")
    return target


@mcp.tool(annotations=READ)
def goo_context(repository: str = "") -> dict:
    """List available API guides, template files, source provenance and runtime tool setup. Pass a Goo checkout for current docs."""
    root = source(repository)
    return {"source": str(root), "bundled": root == BUNDLE, "bundleCommit": MANIFEST["commit"], "documents": sorted(MANIFEST["files"]), "runtime": "Install Goo.DevTools 0.5.3 and launch with goo dev --project App.gsproj. Snapshot/capture require the app PID. GOO_CLI may specify a goo executable or built Goo.DevTools.Cli.dll."}


@mcp.tool(annotations=READ)
def goo_search(query: str, repository: str = "", limit: int = 8) -> dict:
    """Search API and DevTools documentation by symbols or terms. Returns bounded excerpts, document paths and line numbers."""
    terms = re.findall(r"[\w]+", query.casefold())
    if not terms or len(query) > 256 or not 1 <= limit <= 20:
        raise ValueError("Supply a query of 1-256 characters and a limit of 1-20")
    root = source(repository)
    matches = []
    for relative in MANIFEST["files"]:
        if not relative.endswith(".md"):
            continue
        lines = document(root, relative).read_text().splitlines()
        starts = [0] + [i for i, line in enumerate(lines) if i and line.startswith("## ")]
        for start, end in zip(starts, starts[1:] + [len(lines)]):
            body = "\n".join(lines[start:end])
            folded = body.casefold()
            if not all(term in folded for term in terms):
                continue
            heading = lines[start] if start < len(lines) else ""
            hit = next((i for i in range(start, end) if any(term in lines[i].casefold() for term in terms)), start)
            score = sum(10 for term in terms if term in heading.casefold()) + sum(min(folded.count(term), 5) for term in terms)
            matches.append((score, {"path": relative, "section": heading, "line": hit + 1, "excerpt": "\n".join(lines[max(start, hit - 2):min(end, hit + 18)])[:2400]}))
    matches.sort(key=lambda match: (-match[0], match[1]["path"], match[1]["line"]))
    return {"source": str(root), "total": len(matches), "results": [item for _, item in matches[:limit]]}


@mcp.tool(annotations=READ)
def goo_read(path: str, repository: str = "", line: int = 1, count: int = 120) -> dict:
    """Read a bounded range from a document returned by goo_context or goo_search, with its content hash."""
    if line < 1 or not 1 <= count <= 240:
        raise ValueError("line must be positive and count must be 1-240")
    root = source(repository)
    data = document(root, path).read_bytes()
    lines = data.decode().splitlines()
    return {"source": str(root), "path": path, "sha256": hashlib.sha256(data).hexdigest(), "totalLines": len(lines), "line": line, "text": "\n".join(lines[line - 1:line - 1 + count])}


@mcp.tool(annotations=READ)
def goo_starter(name: str = "HelloGoo", repository: str = "") -> dict:
    """Return the official typed-Cell counter starter as named files. The caller writes them into a new application directory."""
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", name):
        raise ValueError("Use a simple identifier starting with an ASCII letter, up to 64 characters")
    root = source(repository)
    files = {}
    for filename in ("Program.gs", "GooStarter.gsproj"):
        content = document(root, "templates/Goo.Templates/content/" + filename).read_text()
        if filename.endswith(".gsproj"):
            content = content.replace("</Project>", '  <ItemGroup>\n    <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />\n  </ItemGroup>\n</Project>')
        files[filename.replace("GooStarter", name)] = content.replace("GooStarter", name)
    return {"source": str(root), "files": files, "build": f"dotnet build {name}.gsproj", "run": f"goo dev --project {name}.gsproj"}


def cli() -> list[str]:
    executable = os.environ.get("GOO_CLI") or shutil.which("goo") or str(Path.home() / ".dotnet/tools/goo")
    if not Path(executable).is_file():
        raise ValueError("Install Goo.DevTools or set GOO_CLI to its executable or built CLI DLL")
    return ["dotnet", executable] if executable.lower().endswith(".dll") else [executable]


def target(pid: int, window: str) -> list[str]:
    if pid <= 0:
        raise ValueError("Provide the positive PID of the intended running Goo application")
    return ["--pid", str(pid)] + (["--window", window] if window else [])


def run(arguments: list[str]) -> str:
    result = subprocess.run(cli() + arguments, capture_output=True, text=True, timeout=25)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout)[-6000:])
    return result.stdout


@mcp.tool(annotations=READ)
def goo_snapshot(pid: int, window: str = "") -> dict:
    """Read the current Goo diagnostic snapshot, including layout. Check payload.full: false means the runtime returned a delta, not a complete tree. Requires GOO_DEVTOOLS=1."""
    output = run(["attach", "--once", "--json", "--command", "snapshot", "--wait", "3"] + target(pid, window))
    messages = [json.loads(line) for line in output.splitlines() if line.strip()]
    response = next((message for message in reversed(messages) if message.get("id")), None)
    if response is None or response.get("ok") is False or response.get("error") or response.get("type") == "error":
        raise ValueError(f"Snapshot failed: {str(response)[:3000]}")
    return response


@mcp.tool(annotations=READ)
def goo_capture(pid: int, window: str = "") -> Image:
    """Return an actual PNG screenshot from a live Goo window as MCP image content. Requires diagnostics enabled."""
    with tempfile.TemporaryDirectory(prefix="goo-capture-") as directory:
        path = Path(directory) / "frame.png"
        run(["capture", "--output", str(path), "--wait", "10"] + target(pid, window))
        data = path.read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Goo CLI did not produce a PNG")
        return Image(data=data, format="png")


if __name__ == "__main__":
    mcp.run(transport="stdio")
