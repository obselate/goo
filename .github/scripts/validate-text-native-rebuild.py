#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def target_snapshot(value):
    target = value["buildEvidence"]["target"]
    platform = {"linux": "linux", "win": "windows", "osx": "macos", "android": "android"}[target.split("-")[0]]
    unrelated = {"linux", "windows", "macos", "android"} - {platform}
    snapshot = dict(value)
    snapshot["outputs"] = {target: value["outputs"][target]}
    for section in ("build", "buildEvidence"):
        snapshot[section] = {key: item for key, item in value[section].items() if key not in unrelated}
        if "environments" in snapshot[section]:
            snapshot[section]["environments"] = {target: value[section]["environments"][target]}
    return snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("recorded", type=Path)
    parser.add_argument("rebuilt", type=Path)
    args = parser.parse_args()
    recorded = target_snapshot(json.loads(args.recorded.read_text()))
    rebuilt = target_snapshot(json.loads(args.rebuilt.read_text()))
    if recorded != rebuilt:
        changed = sorted(key for key in recorded.keys() | rebuilt.keys() if recorded.get(key) != rebuilt.get(key))
        raise SystemExit(f"Native rebuild provenance differs in target-relevant fields: {changed}")
    print(f"Native rebuild provenance OK: {recorded['buildEvidence']['target']}")


if __name__ == "__main__":
    main()
