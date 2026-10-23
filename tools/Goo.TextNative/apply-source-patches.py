import argparse
import hashlib
import json
import re
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
    parser.add_argument("--patch-name", default="cpal-linear-light", choices=("cpal-linear-light", "stb-gif-two-back"))
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    patches = manifest.get("build", {}).get("sourcePatches")
    if not isinstance(patches, list) or {patch["name"] for patch in patches} != {"cpal-linear-light", "stb-gif-two-back"}:
        raise SystemExit("expected HarfBuzz CPAL and stb_image GIF source patches")
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

    original = source_path.read_text(encoding="utf-8")
    if args.patch_name == "cpal-linear-light":
        if "srgb8_to_linear_q15" in original:
            raise SystemExit("CPAL source patch already applied")
        if original.count("color_to_q15_rgba (hb_color_t color, int16_t out[4])") != 1:
            raise SystemExit("CPAL source shape drift")
        if original.count("color_to_q15_rgba (color, o + 8);") != 1:
            raise SystemExit("CPAL solid call shape drift")
        if original.count("color_to_q15_rgba (stops[i].color, p + 4);") != 1:
            raise SystemExit("CPAL stop call shape drift")

    patch_text = patch_path.read_text(encoding="utf-8")
    run_patch(["patch", "--dry-run", "--batch", "--fuzz=0", "-p1"], patch_text, args.source_root)
    run_patch(["patch", "--batch", "--fuzz=0", "-p1"], patch_text, args.source_root)

    patched = source_path.read_text(encoding="utf-8")
    if sha256(source_path) != patch["patchedSha256"]:
        raise SystemExit("patched source SHA-256 drift")
    if args.patch_name == "stb-gif-two-back":
        print(f"Applied {patch['name']} {patch['sha256']} to {patch['upstreamPath']}")
        return
    if patched.count("static const uint16_t srgb8_to_linear_q15[256] = {") != 1:
        raise SystemExit("CPAL lookup shape drift")
    lookup = re.search(
        r"static const uint16_t srgb8_to_linear_q15\[256\] = \{\n(.*?)\n\};",
        patched,
        re.DOTALL,
    )
    if lookup is None or len(re.findall(r"\b\d+\b", lookup.group(1))) != 256:
        raise SystemExit("CPAL lookup entry count drift")
    if patched.count("color_to_q15_rgba (hb_color_t color, hb_bool_t is_foreground, int16_t out[4])") != 1:
        raise SystemExit("CPAL foreground signature drift")
    if patched.count("color_to_q15_rgba (color, is_foreground, o + 8);") != 1:
        raise SystemExit("CPAL solid conversion drift")
    if patched.count("color_to_q15_rgba (stops[i].color, stops[i].is_foreground, p + 4);") != 1:
        raise SystemExit("CPAL stop conversion drift")
    if patched.count("out[3] = color_to_q15 (hb_color_get_alpha (color));") != 1:
        raise SystemExit("CPAL alpha conversion drift")
    print(f"Applied {patch['name']} {patch['sha256']} to {patch['upstreamPath']}")


if __name__ == "__main__":
    main()
