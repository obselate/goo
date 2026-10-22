import argparse
import json
import math
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description="Headless DataGrid CPU frame benchmark using Goo's frame recorder. No paint or presentation is measured.")
parser.add_argument("--widgets-project", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--skip-build", action="store_true")
parser.add_argument("--repeats", type=int, default=3)
args = parser.parse_args()
here = Path(__file__).resolve().parent
cache = Path.home() / ".cache/goo-fix/GridPerf"
args.output.mkdir(parents=True, exist_ok=True)
env = os.environ | {"NUGET_PACKAGES": str(cache / "nuget"), "DOTNET_GCHeapHardLimit": "0x180000000", "DOTNET_TieredCompilation": "0"}
limit = ["flock", str(cache.parent / "heavy.lock"), "systemd-run", "--user", "--scope", "-q", "-p", "CPUQuota=400%", "-p", "MemoryMax=12G", "-p", "IOWeight=50", "nice", "-n", "15", "ionice", "-c3"]
if not args.skip_build:
    with (args.output / "build.log").open("w") as output:
        subprocess.run(limit + ["dotnet", "build", str(here / "GridScroll.gsproj"), "-c", "Release", "-m:2", "-nodeReuse:false", "-p:UseSharedCompilation=false", f"-p:WidgetsProject={args.widgets_project.resolve()}", f"-p:CustomAfterMicrosoftCommonTargets={here / 'References.targets'}", "-p:IncludeTestFixtures=true", f"-p:GooTestFixturesProps={here / 'Frames.props'}"], env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
results = {}
for wrapped in (False, True):
    for pattern in ("wheel", "thumb"):
        frames = []
        stages = {}
        for repeat in range(args.repeats):
            path = args.output / f"{pattern}-wrap{int(wrapped)}-{repeat}.jsonl"
            with path.open("w") as output:
                subprocess.run(limit + ["dotnet", str(here / "bin/Release/net10.0/GridScroll.dll"), "10000", pattern, "wrap" if wrapped else "fixed"], env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
            for line in path.read_text().splitlines():
                if not line.startswith('{"stage":'):
                    continue
                item = json.loads(line)
                if item["stage"] == "Frame":
                    frames.append(item)
                total = stages.setdefault(item["stage"], {"ms": 0, "bytes": 0})
                total["ms"] += item["ms"]
                total["bytes"] += item["bytes"]
        ordered = sorted(frame["ms"] for frame in frames)
        result = {f"p{percentile}_ms": ordered[math.ceil(len(ordered) * percentile / 100) - 1] for percentile in (50, 95, 99)}
        result |= {"frames": len(frames), "bytes_per_frame": sum(frame["bytes"] for frame in frames) / len(frames), "gcs": sum(frame["gc"] for frame in frames), "stages_per_frame": {name: {key: value / len(frames) for key, value in total.items()} for name, total in stages.items()}}
        results[f"{pattern}-wrap{int(wrapped)}"] = result
(args.output / "summary.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
