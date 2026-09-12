#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools/Goo.TextNative"))
from provenance import target_snapshot


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
