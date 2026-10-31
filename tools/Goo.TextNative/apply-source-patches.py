import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_patch(args, patch_text, source_root):
    result = subprocess.run(
        args,
        cwd=source_root,
        input=patch_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    if result.returncode != 0:
        raise SystemExit(result.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--patch-name", required=True, choices=("stb-gif-two-back", "stb-png-empty-idat"))
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    patches = manifest.get("build", {}).get("sourcePatches")
    if not isinstance(patches, list) or {patch["name"] for patch in patches} != {"stb-gif-two-back", "stb-png-empty-idat"}:
        raise SystemExit("expected stb_image GIF and PNG source patches")
    patch = next(patch for patch in patches if patch["name"] == args.patch_name)
    if not shutil.which("patch"):
        raise SystemExit("required command missing: patch")

    repo_root = manifest_path.parents[2]
    patch_path = repo_root / patch["path"]
    source_path = args.source_root / patch["upstreamPath"]
    if not patch_path.is_file():
        raise SystemExit(f"source patch missing: {patch_path}")
    if not source_path.is_file():
        raise SystemExit(f"upstream source missing: {source_path}")
    if sha256(patch_path) != patch["sha256"]:
        raise SystemExit("source patch SHA-256 drift")
    if sha256(source_path) != patch["upstreamSha256"]:
        raise SystemExit("upstream source SHA-256 drift")

    patch_text = patch_path.read_text(encoding="utf-8")
    run_patch(["patch", "--dry-run", "--batch", "--fuzz=0", "-p1"], patch_text, args.source_root)
    run_patch(["patch", "--batch", "--fuzz=0", "-p1"], patch_text, args.source_root)

    if sha256(source_path) != patch["patchedSha256"]:
        raise SystemExit("patched source SHA-256 drift")
    print(f"Applied {patch['name']} {patch['sha256']} to {patch['upstreamPath']}")


if __name__ == "__main__":
    main()
