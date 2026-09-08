import datetime
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path("/tmp/goo-chart-update-20260908")
repo = pathlib.Path("/home/xaz/Projects/goo-gsharp")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def manifest(directory):
    return {
        str(path.relative_to(directory)): {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(directory.rglob("*"))
        if path.is_file()
    }


baseline = "373f9891719f78361bba3eb37b32ce0dfd634c1c"
candidate = "d1e10d48e38cf3b621858a0b2cddd1ff4cbfdfdb"
source_scope = ["Goo", "apps/Goo.Gallery", "tests/Goo.AsyncReadbackSmoke"]
name_status = subprocess.check_output(
    ["git", "diff", "--name-status", baseline, candidate, "--", *source_scope],
    cwd=repo,
    text=True,
).splitlines()
source_patch = subprocess.check_output(
    ["git", "diff", "--binary", baseline, candidate, "--", *source_scope],
    cwd=repo,
)

publish_command = (
    "env SLANG_SDK=/tmp/goo-gpu-toolchain/slang-2026.16 "
    "dotnet publish apps/Goo.Gallery/Goo.Gallery.gsproj -c Release -r linux-x64 "
    "-p:PublishAot=true -p:OptimizationPreference=Speed -p:EventSourceSupport=true "
    "-p:GooLinuxSdlPath=/usr/lib/libSDL3.so -o {output}"
)

data = {
    "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "purpose": "matched read-only chart collection binaries",
    "runs_performed_by_preparer": False,
    "sources": {
        "baseline_commit": baseline,
        "candidate_commit": candidate,
        "extraction": "git archive into isolated non-worktree directories",
        "production_source_delta_scope": source_scope,
        "production_source_delta_name_status": name_status,
        "production_source_delta_sha256": hashlib.sha256(source_patch).hexdigest(),
    },
    "overlay": {
        "harness_manifest": manifest(root / "overlays" / "harness"),
        "diagnostics_patch": {
            "path": "overlays/residency-diagnostics-only.patch",
            "sha256": sha256(root / "overlays" / "residency-diagnostics-only.patch"),
            "scope": [
                "Vulkan allocator snapshot",
                "clip frame capacity snapshot",
                "primitive frame capacity snapshot",
                "text frame capacity snapshot",
            ],
        },
        "fixture_path_adaptation": "GooTestFixturesProps resolves inside each isolated archive",
        "prototype_policy_environment_variables_present": False,
        "excluded_environment_variables": [
            "GOO_REVIEW_SMALL_IMAGE_STAGING",
            "GOO_REVIEW_CLIP_INCREMENTAL",
        ],
    },
    "toolchain": {
        "dotnet_sdk": "10.0.302",
        "slang": "2026.16",
        "runtime_identifier": "linux-x64",
        "layout_engine": "Yoga default",
        "publish_aot": True,
        "optimization_preference": "Speed",
        "event_source_support": True,
        "sdl_source": "/usr/lib/libSDL3.so",
        "sdl_sha256": sha256(pathlib.Path("/usr/lib/libSDL3.so")),
    },
    "builds": {
        "baseline": {
            "command": publish_command.format(output=str(root / "published-baseline")),
            "working_directory": str(root / "baseline"),
            "exit_code": 0,
            "executable": "Goo.AsyncReadbackSmoke",
            "manifest": manifest(root / "published-baseline"),
        },
        "candidate": {
            "command": publish_command.format(output=str(root / "published-candidate")),
            "working_directory": str(root / "candidate"),
            "exit_code": 0,
            "executable": "Goo.AsyncReadbackSmoke",
            "manifest": manifest(root / "published-candidate"),
        },
    },
}

(root / "overlays" / "provenance.json").write_text(
    json.dumps(data, indent=2, sort_keys=True) + "\n"
)
