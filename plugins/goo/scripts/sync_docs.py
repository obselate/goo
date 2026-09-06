import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
plugin = Path(__file__).resolve().parents[1]
if not (root / "Goo/Goo.gsproj").is_file():
    raise SystemExit("Expected a standalone Goo checkout containing Goo/Goo.gsproj")
paths = [root / "README.md", root / "CONTRIBUTING.md"]
paths += sorted((root / "docs/api").glob("*.md"))
paths += sorted((root / "docs/devtools").glob("*.md"))
paths += [root / "templates/Goo.Templates/content" / name for name in ("Program.gs", "GooStarter.gsproj")]
output = plugin / "reference"
output.mkdir(exist_ok=True)
manifest = {"repository": "https://github.com/obselate/goo", "commit": subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(), "files": {}}
for path in paths:
    relative = path.relative_to(root).as_posix()
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, target)
    manifest["files"][relative] = hashlib.sha256(path.read_bytes()).hexdigest()
for path in output.rglob("*"):
    if path.is_file() and path.name != "manifest.json" and path.relative_to(output).as_posix() not in manifest["files"]:
        path.unlink()
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Synced {len(paths)} files at {manifest['commit']}. SHA-256 hashes identify the actual working files.")
