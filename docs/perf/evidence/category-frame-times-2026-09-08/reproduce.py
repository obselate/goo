import argparse
import csv
from decimal import Decimal, InvalidOperation
import gzip
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ANALYSIS_SCRIPTS = [
    "analyze_pairs.py",
    "analyze_review_breakdown.py",
    "analyze_scheduler.py",
    "plot_results.py",
    "expected-binaries.json",
]
EXPECTED_OUTPUTS = [
    "category-results.json",
    "benchmark-numbers.csv",
    "scheduler-results.json",
    "scheduler-numbers.csv",
]
ROUND_VARIANTS = ["0-baseline", "1-candidate", "2-candidate", "3-baseline"]


def decompress_log(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(source, "rb") as stream:
        destination.write_bytes(stream.read())


def rewrite_manifest_logs(value, destination: Path):
    if isinstance(value, list):
        for item in value:
            rewrite_manifest_logs(item, destination)
    elif isinstance(value, dict) and "log" in value:
        value["log"] = str(destination / Path(value["log"]).name)
    return value


def copy_manifest(source: Path, destination: Path, log_destination: Path) -> None:
    value = json.loads(source.read_text())
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(rewrite_manifest_logs(value, log_destination), indent=2) + "\n")


def unpack_review_runs(source: Path, target: Path) -> None:
    if not source.is_dir():
        raise FileNotFoundError(source)
    for name in ROUND_VARIANTS:
        folder = source / name
        if not folder.is_dir():
            raise FileNotFoundError(folder)
        destination = target / name
        destination.mkdir(parents=True)
        for archive in sorted(folder.glob("*.log.gz")):
            decompress_log(archive, destination / archive.name[:-3])
        manifest = folder / "runs.json"
        if not manifest.is_file():
            raise FileNotFoundError(manifest)
        copy_manifest(manifest, destination / manifest.name, destination)


def unpack_scheduler_runs(source: Path, target: Path) -> None:
    if not source.is_dir():
        raise FileNotFoundError(source)
    target.mkdir(parents=True, exist_ok=True)
    directories = sorted(path for path in source.iterdir() if path.is_dir())
    if directories:
        for folder in directories:
            destination = target / folder.name
            destination.mkdir(parents=True)
            for archive in sorted(folder.glob("*.log.gz")):
                decompress_log(archive, destination / archive.name[:-3])
            for manifest in sorted(folder.glob("*.json")):
                copy_manifest(manifest, destination / manifest.name, destination)
        return
    for archive in sorted(source.glob("*.log.gz")):
        log = target / archive.name[:-3]
        decompress_log(archive, log)
        manifest = source / (archive.name[:-7] + ".json")
        if not manifest.is_file():
            raise FileNotFoundError(manifest)
        copy_manifest(manifest, target / manifest.name, target)


def copy_expected(source: Path, target: Path) -> dict[str, Path]:
    expected = target / "_expected"
    expected.mkdir()
    paths = {}
    for name in EXPECTED_OUTPUTS:
        candidates = [source / name, source / (name + ".expected"), source / ("expected-" + name)]
        archived = next((path for path in candidates if path.is_file()), None)
        if archived is None:
            raise FileNotFoundError(f"archived expected output for {name}")
        destination = expected / name
        shutil.copy2(archived, destination)
        paths[name] = destination
    return paths


def numeric_equal(left, right) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return Decimal(str(left)) == Decimal(str(right))
    if isinstance(left, dict) and isinstance(right, dict):
        return set(left) == set(right) and all(numeric_equal(left[key], right[key]) for key in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(numeric_equal(a, b) for a, b in zip(left, right))
    return left == right


def compare_aggregate_json(actual: Path, expected: Path) -> None:
    actual_value = json.loads(actual.read_text())
    expected_value = json.loads(expected.read_text())
    if "aggregate" not in actual_value or "aggregate" not in expected_value:
        raise ValueError(f"missing aggregate in {actual.name}")
    if not numeric_equal(actual_value["aggregate"], expected_value["aggregate"]):
        raise ValueError(f"aggregate mismatch: {actual.name}")


def numeric_cell(value: str):
    try:
        return Decimal(value)
    except InvalidOperation:
        return value


def compare_csv(actual: Path, expected: Path) -> None:
    with actual.open(newline="") as actual_stream, expected.open(newline="") as expected_stream:
        actual_rows = list(csv.reader(actual_stream))
        expected_rows = list(csv.reader(expected_stream))
    actual_normalized = [[numeric_cell(value) for value in row] for row in actual_rows]
    expected_normalized = [[numeric_cell(value) for value in row] for row in expected_rows]
    if actual_normalized != expected_normalized:
        raise ValueError(f"numeric CSV mismatch: {actual.name}")


def run(script: Path, target: Path) -> None:
    subprocess.run(
        [sys.executable, str(script)],
        cwd=target,
        check=True,
        stdout=subprocess.DEVNULL,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="goo-category-reproduce-") as directory:
        target = Path(directory)
        for name in ANALYSIS_SCRIPTS:
            shutil.copy2(source / name, target / name)
        expected = copy_expected(source, target)
        unpack_review_runs(source / "runs", target / "runs")
        unpack_scheduler_runs(source / "scheduler-runs", target / "scheduler-runs")
        run(target / "analyze_pairs.py", target)
        run(target / "analyze_scheduler.py", target)
        run(target / "plot_results.py", target)
        compare_aggregate_json(target / "category-results.json", expected["category-results.json"])
        compare_aggregate_json(target / "scheduler-results.json", expected["scheduler-results.json"])
        compare_csv(target / "benchmark-numbers.csv", expected["benchmark-numbers.csv"])
        compare_csv(target / "scheduler-numbers.csv", expected["scheduler-numbers.csv"])
        if args.output is not None:
            args.output.mkdir(parents=True, exist_ok=True)
            for name in ["category-frame-times.png", "category-frame-times.svg"]:
                shutil.copy2(target / name, args.output / name)


if __name__ == "__main__":
    main()
