#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import platform
import queue
import shutil
import statistics
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as element_tree
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import quoteattr

PUBLIC_FEED = "https://api.nuget.org/v3/index.json"
PROJECT_NAME = "Goo.ConsumerPerformance"
FONT_SHA256 = "71ffd45fe736c7d26eeae2d7cb9e62e09b80901ad3df9a564b3662876c717666"
LICENSE_SHA256 = "699a9438baec27664f784dd36c51b128fb3632622ffd2537d69475d2e44eded0"
MODES = ("nativeaot", "trimmed-jit")
SOURCE_FILES = (
    "Program.gs",
    "Goo.ConsumerPerformance.gsproj",
    "Directory.Build.props",
    "Directory.Packages.props",
    "global.json",
    "NuGet.Config",
    "run.py",
    "Assets/VendSans-VariableFont_wght.ttf",
    "Assets/VendSans-OFL.txt",
)
CONTROLLED_GOO_ENVIRONMENT = (
    "GOO_CONSUMER_READY_DELAY_MS",
    "GOO_CONSUMER_RUN_MS",
    "GOO_CONSUMER_STARTUP_DEADLINE_MS",
    "GOO_DEVTOOLS",
    "GOO_DEVTOOLS_DIR",
    "GOO_DEVTOOLS_INPUT",
    "GOO_FRAME_PROFILE",
    "GOO_TEXT_ATLAS_SMOKE",
    "GOO_VK_DIAGNOSTICS",
    "GOO_VK_DISABLE_SWAPCHAIN_MAINTENANCE",
    "GOO_VK_PIPELINE_CACHE",
    "GOO_VK_PIPELINE_CACHE_DIR",
    "GOO_VK_TEXT_ATLAS_BYTES",
)
RECORDED_ENVIRONMENT = (
    "WAYLAND_DISPLAY",
    "DISPLAY",
    "XDG_SESSION_TYPE",
    "XDG_CURRENT_DESKTOP",
    "SDL_VIDEODRIVER",
    "VK_DRIVER_FILES",
    "VK_ICD_FILENAMES",
    "VK_INSTANCE_LAYERS",
    "VK_LAYER_PATH",
    "LIBGL_ALWAYS_SOFTWARE",
    "DOTNET_ROOT",
    "DOTNET_gcServer",
    "DOTNET_GCHeapCount",
    "DOTNET_GCConserveMemory",
    "DOTNET_ReadyToRun",
    "DOTNET_TieredCompilation",
    "DOTNET_EnableDiagnostics",
    "COMPlus_gcServer",
    "COMPlus_GCHeapCount",
    "COMPlus_ReadyToRun",
    "COMPlus_TieredCompilation",
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--rid", required=True)
    parser.add_argument("--package-version", required=True)
    parser.add_argument("--package-source", default=PUBLIC_FEED)
    parser.add_argument("--warm-runs", type=int, default=5)
    parser.add_argument("--idle-runs", type=int, default=5)
    parser.add_argument("--startup-timeout-seconds", type=float, default=30.0)
    parser.add_argument("--startup-hold-seconds", type=float, default=1.5)
    parser.add_argument("--readiness-delay-seconds", type=float, default=0.75)
    parser.add_argument("--idle-settle-seconds", type=float, default=30.0)
    parser.add_argument("--idle-seconds", type=float, default=30.0)
    parser.add_argument("--publish-only", action="store_true")
    args = parser.parse_args()
    if args.warm_runs < 1 or args.idle_runs < 1:
        parser.error("--warm-runs and --idle-runs must be at least 1")
    for name in (
        "startup_timeout_seconds", "startup_hold_seconds", "readiness_delay_seconds",
        "idle_settle_seconds", "idle_seconds",
    ):
        if getattr(args, name) <= 0:
            parser.error("--" + name.replace("_", "-") + " must be positive")
    return args


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_source(value):
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https"):
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("package source URLs must not contain credentials, a query, or a fragment")
        return value, "url"
    if parsed.scheme and not (len(parsed.scheme) == 1 and len(value) > 2 and value[1] == ":"):
        raise ValueError(f"unsupported package source scheme: {parsed.scheme}")
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise ValueError(f"package source is not a directory: {path}")
    return str(path), "directory"


def nuget_config(source, source_kind):
    if source_kind == "url" and source.rstrip("/") == PUBLIC_FEED.rstrip("/"):
        sources = f"    <add key=\"nuget.org\" value={quoteattr(source)} protocolVersion=\"3\" />"
        mapping = ""
    else:
        sources = "\n".join((
            f"    <add key=\"goo-selected\" value={quoteattr(source)} />",
            f"    <add key=\"nuget.org\" value={quoteattr(PUBLIC_FEED)} protocolVersion=\"3\" />",
        ))
        mapping = (
            "\n  <packageSourceMapping>\n"
            "    <packageSource key=\"goo-selected\">\n"
            "      <package pattern=\"Goo\" />\n"
            "    </packageSource>\n"
            "    <packageSource key=\"nuget.org\">\n"
            "      <package pattern=\"*\" />\n"
            "    </packageSource>\n"
            "  </packageSourceMapping>"
        )
    return (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
        "<configuration>\n"
        "  <packageSources>\n"
        "    <clear />\n"
        f"{sources}\n"
        "  </packageSources>"
        f"{mapping}\n"
        "</configuration>\n"
    )


def size_tree(root):
    files = [path for path in root.rglob("*") if path.is_file()]
    return {"bytes": sum(path.stat().st_size for path in files), "files": len(files)}


def optional_command(command, timeout=15):
    executable = shutil.which(command[0])
    if executable is None:
        return None
    try:
        result = subprocess.run(
            [executable, *command[1:]], text=True, capture_output=True,
            timeout=timeout, check=False)
        return {
            "command": [executable, *command[1:]],
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": [executable, *command[1:]], "error": str(error)}


def host_provenance():
    cpu = None
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        for line in cpuinfo.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.lower().startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    return {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "cpu": cpu or platform.processor() or None,
        "nvidiaSmi": optional_command([
            "nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"], 15),
        "vulkanInfo": optional_command(["vulkaninfo", "--summary"], 30),
    }


def copy_entry(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink():
        destination.symlink_to(os.readlink(source))
    else:
        shutil.copy2(source, destination)


def is_symbol(relative):
    return any(part.endswith(".dSYM") for part in relative.parts) or relative.suffix.lower() in (
        ".pdb", ".dbg", ".debug")


def file_record(root, path):
    return {
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def stage_publish(publish, runtime, symbols):
    if runtime.exists() or symbols.exists():
        raise FileExistsError("staging destination already exists")
    runtime.mkdir(parents=True)
    symbols.mkdir(parents=True)
    for source in sorted(publish.rglob("*")):
        if not source.is_file() and not source.is_symlink():
            continue
        relative = source.relative_to(publish)
        destination = symbols / relative if is_symbol(relative) else runtime / relative
        copy_entry(source, destination)
    runtime_files = [file_record(runtime, path) for path in sorted(runtime.rglob("*")) if path.is_file()]
    symbol_files = [file_record(symbols, path) for path in sorted(symbols.rglob("*")) if path.is_file()]
    notices = [
        record for record in runtime_files
        if any(token in Path(record["path"]).name.upper() for token in ("LICENSE", "COPYING", "NOTICE", "OFL"))
    ]
    return {
        "rawPublish": size_tree(publish),
        "runtime": size_tree(runtime),
        "symbols": size_tree(symbols),
        "runtimeFiles": runtime_files,
        "symbolFiles": symbol_files,
        "noticesInRuntime": notices,
    }


def package_identity(cache, package_id, version):
    root = cache / package_id.lower() / version.lower()
    candidates = sorted(root.glob("*.nupkg"))
    if len(candidates) != 1:
        raise RuntimeError(f"expected one restored {package_id} {version} package, found {candidates}")
    package = candidates[0]
    repository = None
    with zipfile.ZipFile(package) as archive:
        nuspecs = [name for name in archive.namelist() if name.lower().endswith(".nuspec")]
        if len(nuspecs) == 1:
            root_element = element_tree.fromstring(archive.read(nuspecs[0]))
            element = next((item for item in root_element.iter() if item.tag.endswith("repository")), None)
            if element is not None:
                repository = {key: element.attrib.get(key) for key in ("type", "url", "commit")}
    return {
        "id": package_id,
        "version": version,
        "path": str(package),
        "sha256": sha256(package),
        "bytes": package.stat().st_size,
        "repository": repository,
    }


def timeout_text(value):
    if value is None:
        return ""
    return value.decode(errors="replace") if isinstance(value, bytes) else value


def read_stream(stream, path, channel, events):
    with path.open("w", encoding="utf-8") as output:
        for line in iter(stream.readline, ""):
            output.write(line)
            output.flush()
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                value = None
            if isinstance(value, dict):
                events.put((channel, time.monotonic_ns(), value))


def terminate(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def proc_memory(pid):
    result = {"pssBytes": None, "privateResidentBytes": None, "rssBytes": None}
    path = Path(f"/proc/{pid}/smaps_rollup")
    if not path.is_file():
        return result
    try:
        values = {}
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            fields = line.split()
            if len(fields) >= 2 and fields[1].isdigit():
                values[fields[0].rstrip(":")] = int(fields[1]) * 1024
        result["pssBytes"] = values.get("Pss")
        private = [values.get(name) for name in ("Private_Clean", "Private_Dirty", "Private_Hugetlb")]
        if all(value is not None for value in private):
            result["privateResidentBytes"] = sum(private)
        result["rssBytes"] = values.get("Rss")
    except OSError:
        pass
    return result


def wait_fixture_event(process, events, records, event_name, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            channel, received, value = events.get(timeout=0.05)
            records.append({"channel": channel, "receivedMonotonicNs": received, "value": value})
            if channel == "stdout" and value.get("kind") == "fixture" and value.get("event") == event_name:
                return value
        except queue.Empty:
            if process.poll() is not None:
                try:
                    channel, received, value = events.get(timeout=0.1)
                    records.append({"channel": channel, "receivedMonotonicNs": received, "value": value})
                    if channel == "stdout" and value.get("kind") == "fixture" and value.get("event") == event_name:
                        return value
                except queue.Empty:
                    return None
    return None


def distribution(values):
    usable = [value for value in values if isinstance(value, (int, float))]
    if not usable:
        return None
    return {
        "count": len(usable),
        "median": statistics.median(usable),
        "min": min(usable),
        "max": max(usable),
    }


def metric_summary(samples, validity, selector):
    observed = [(sample, selector(sample)) for sample in samples]
    valid = [value for sample, value in observed if sample[validity]]
    return {
        "observedCount": sum(isinstance(value, (int, float)) for _, value in observed),
        "validSampleCount": sum(sample[validity] for sample in samples),
        "invalidSamples": [sample["name"] for sample in samples if not sample[validity]],
        "distribution": distribution(valid),
    }


def geometry_assessment(metrics):
    names = (
        "logicalWidth", "logicalHeight", "framebufferWidth",
        "framebufferHeight", "displayScaleX", "displayScaleY",
    )
    tuples = []
    invalid_count = 0
    for value in metrics:
        values = [value.get(name) for name in names]
        if values not in tuples:
            tuples.append(values)
        logical_width, logical_height, framebuffer_width, framebuffer_height, scale_x, scale_y = values
        dimensions_valid = (
            isinstance(logical_width, int) and not isinstance(logical_width, bool)
            and logical_width == 640
            and isinstance(logical_height, int) and not isinstance(logical_height, bool)
            and logical_height == 480
            and isinstance(framebuffer_width, int) and not isinstance(framebuffer_width, bool)
            and framebuffer_width > 0
            and isinstance(framebuffer_height, int) and not isinstance(framebuffer_height, bool)
            and framebuffer_height > 0
            and isinstance(scale_x, (int, float)) and not isinstance(scale_x, bool)
            and scale_x > 0
            and isinstance(scale_y, (int, float)) and not isinstance(scale_y, bool)
            and scale_y > 0
        )
        if not dimensions_valid:
            invalid_count += 1
    stable = bool(metrics) and invalid_count == 0 and len(tuples) == 1
    errors = []
    if not metrics or invalid_count:
        errors.append(
            "missing or invalid 640x480 framebuffer and display-scale metrics: "
            + json.dumps(tuples, separators=(",", ":")))
    elif len(tuples) != 1:
        errors.append(
            "display geometry changed during the sample: "
            + json.dumps(tuples, separators=(",", ":")))
    physical = None
    if stable:
        physical = {
            "framebufferWidth": tuples[0][2],
            "framebufferHeight": tuples[0][3],
            "displayScaleX": tuples[0][4],
            "displayScaleY": tuples[0][5],
        }
    return {
        "valid": stable,
        "emittedCount": len(metrics),
        "invalidTupleCount": invalid_count,
        "observedTuples": tuples,
        "physical": physical,
        "errors": errors,
    }


def comparison_assessment(collections):
    samples = [
        (collection, sample)
        for collection, values in collections.items()
        for sample in values
    ]
    invalid = [
        sample["name"] for _, sample in samples
        if not sample["geometry"]["valid"]
    ]
    admitted = []
    rejected = []
    physical = []
    observed = []
    counts = {}
    for collection, sample in samples:
        for value in sample["geometry"]["observedTuples"]:
            if value not in observed:
                observed.append(value)
        validity = "idleValid" if collection == "idleDiagnosticsOff" else "startupValid"
        is_admitted = sample[validity]
        if is_admitted:
            admitted.append(sample["name"])
            value = sample["geometry"]["physical"]
            if value not in physical:
                physical.append(value)
        else:
            rejected.append(sample["name"])
        key = f"{collection}/{sample['mode']}"
        entry = counts.setdefault(key, {
            "observed": 0,
            "admitted": 0,
            "rejected": 0,
            "geometryValid": 0,
            "geometryInvalid": 0,
        })
        entry["observed"] += 1
        entry["admitted" if is_admitted else "rejected"] += 1
        if sample["geometry"]["valid"]:
            entry["geometryValid"] += 1
        else:
            entry["geometryInvalid"] += 1
    errors = []
    if not admitted:
        errors.append("comparison has no admitted warm, empty-cache, or idle samples")
    elif len(physical) != 1:
        errors.append(
            "comparison requires one physical framebuffer/display-scale workload across admitted samples; observed "
            + json.dumps(physical, separators=(",", ":")))
    return {
        "valid": not errors,
        "errors": errors,
        "observedGeometryTuples": observed,
        "physicalWorkloads": physical,
        "admittedSamples": admitted,
        "rejectedSamples": rejected,
        "invalidGeometrySamples": invalid,
        "counts": counts,
    }


class Benchmark:
    def __init__(self, args):
        self.args = args
        self.root = Path(__file__).resolve().parent
        self.output = args.output.expanduser().resolve()
        self.source, self.source_kind = safe_source(args.package_source)
        if self.output.exists():
            raise FileExistsError(f"output path already exists: {self.output}")
        self.output.mkdir(parents=True)
        self.raw = self.output / "raw"
        self.raw.mkdir()
        self.commands = []
        self.samples = []
        self.failures = []
        self.cache = self.output / "nuget-packages"
        self.cache.mkdir()
        self.http_cache = self.output / "nuget-http-cache"
        self.http_cache.mkdir()
        self.config = self.output / "settings" / "NuGet.Config"
        self.config.parent.mkdir()
        self.config.write_text(nuget_config(self.source, self.source_kind), encoding="utf-8")
        os.chmod(self.config, 0o600)
        self.environment = os.environ.copy()
        for name in CONTROLLED_GOO_ENVIRONMENT:
            self.environment.pop(name, None)
        self.environment.update({
            "NUGET_PACKAGES": str(self.cache),
            "NUGET_HTTP_CACHE_PATH": str(self.http_cache),
            "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
            "DOTNET_NOLOGO": "1",
            "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1",
        })

    def command(self, name, command, timeout=None):
        stdout_path = self.raw / f"{name}.stdout.log"
        stderr_path = self.raw / f"{name}.stderr.log"
        started = time.monotonic_ns()
        timed_out = False
        returncode = None
        stdout = ""
        stderr = ""
        try:
            result = subprocess.run(
                command, cwd=self.root, env=self.environment, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
            returncode = result.returncode
            stdout = result.stdout
            stderr = result.stderr
        except subprocess.TimeoutExpired as error:
            timed_out = True
            stdout = timeout_text(error.stdout)
            stderr = timeout_text(error.stderr)
        ended = time.monotonic_ns()
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        record = {
            "name": name,
            "command": command,
            "cwd": str(self.root),
            "startedMonotonicNs": started,
            "endedMonotonicNs": ended,
            "elapsedSeconds": (ended - started) / 1_000_000_000,
            "returncode": returncode,
            "timedOut": timed_out,
            "stdout": str(stdout_path),
            "stderr": str(stderr_path),
        }
        self.commands.append(record)
        write_json(self.output / "commands.json", self.commands)
        if timed_out:
            raise RuntimeError(f"{name} timed out after {timeout} seconds")
        if returncode != 0:
            raise RuntimeError(f"{name} failed with exit code {returncode}")
        return stdout

    def publish(self):
        project = str(self.root / "Goo.ConsumerPerformance.gsproj")
        sizes = {}
        for mode in MODES:
            publish = self.output / "publish" / mode
            command = [
                "dotnet", "publish", project,
                "-c", "Release", "-r", self.args.rid,
                "--self-contained", "true",
                "--artifacts-path", str(self.output / "build" / mode),
                "--configfile", str(self.config),
                "-p:GooPackageVersion=" + self.args.package_version,
                "-p:TreatWarningsAsErrors=true",
                "-o", str(publish),
            ]
            if mode == "nativeaot":
                command.extend(("-p:PublishAot=true", "-p:StripSymbols=true"))
            else:
                command.extend(("-p:PublishTrimmed=true", "-p:TrimMode=partial"))
            self.command("publish-" + mode, command, timeout=900)
            sizes[mode] = stage_publish(
                publish,
                self.output / "stage" / mode / "runtime",
                self.output / "stage" / mode / "symbols")
            write_json(self.output / "reports" / f"stage-{mode}.json", sizes[mode])
        return sizes

    def executable(self, mode):
        root = self.output / "stage" / mode / "runtime"
        name = PROJECT_NAME + ".exe" if self.args.rid.startswith("win-") else PROJECT_NAME
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"staged executable not found: {path}")
        return path

    def run_sample(self, name, mode, cache_dir, diagnostics, ready_delay, interval):
        sample_root = self.raw / "runs" / name
        sample_root.mkdir(parents=True)
        env = self.environment.copy()
        env.update({
            "GOO_CONSUMER_READY_DELAY_MS": str(round(ready_delay * 1000)),
            "GOO_CONSUMER_RUN_MS": str(round((ready_delay + interval) * 1000)),
            "GOO_CONSUMER_STARTUP_DEADLINE_MS": str(round(self.args.startup_timeout_seconds * 1000)) if diagnostics else "0",
            "GOO_VK_DIAGNOSTICS": "1" if diagnostics else "0",
            "GOO_VK_PIPELINE_CACHE": "1",
            "GOO_VK_PIPELINE_CACHE_DIR": str(cache_dir),
        })
        cache_dir.mkdir(parents=True, exist_ok=True)
        command = [str(self.executable(mode))]
        process = None
        threads = []
        events = queue.Queue()
        records = []
        errors = []
        open_return = None
        first_frame_pump = None
        idle_start = None
        idle_end = None
        memory_start = None
        memory_end = None
        started = time.monotonic_ns()
        startup_deadline = time.monotonic() + self.args.startup_timeout_seconds
        try:
            process = subprocess.Popen(
                command, cwd=self.executable(mode).parent, env=env, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1)
            threads = [
                threading.Thread(
                    target=read_stream,
                    args=(process.stdout, sample_root / "stdout.log", "stdout", events),
                    daemon=True),
                threading.Thread(
                    target=read_stream,
                    args=(process.stderr, sample_root / "stderr.log", "stderr", events),
                    daemon=True),
            ]
            for thread in threads:
                thread.start()
            open_return = wait_fixture_event(
                process, events, records, "window_open_return",
                max(0.0, startup_deadline - time.monotonic()))
            if open_return is None:
                errors.append("Window.Open did not return before the startup timeout")
            else:
                first_frame_pump = wait_fixture_event(
                    process, events, records, "first_frame_pump_return",
                    max(0.0, startup_deadline - time.monotonic()))
                if first_frame_pump is None:
                    errors.append("first-frame submission attempt did not return before the startup timeout")
            if diagnostics and first_frame_pump is not None:
                try:
                    process.wait(timeout=max(0.0, startup_deadline - time.monotonic()) + 5.0)
                except subprocess.TimeoutExpired:
                    errors.append("process did not close after the startup deadline")
            elif not diagnostics and first_frame_pump is not None:
                idle_start = wait_fixture_event(
                    process, events, records, "idle_start", ready_delay + 5.0)
                if idle_start is None:
                    errors.append("window closed before the diagnostics-off idle interval started")
                else:
                    memory_start = proc_memory(process.pid)
                    idle_end = wait_fixture_event(
                        process, events, records, "idle_end", interval + 5.0)
                    if idle_end is None:
                        errors.append("window closed during the diagnostics-off idle interval")
                    else:
                        memory_end = proc_memory(process.pid)
                if process.poll() is None:
                    try:
                        process.wait(timeout=5.0)
                    except subprocess.TimeoutExpired:
                        errors.append("process did not close after the diagnostics-off idle interval")
        except Exception as error:
            errors.append(f"runner error: {type(error).__name__}: {error}")
        finally:
            if process is not None and process.poll() is None:
                terminate(process)
            for thread in threads:
                thread.join(timeout=5.0)
            for stream_name in ("stdout", "stderr"):
                stream = getattr(process, stream_name, None) if process is not None else None
                if stream is not None and not stream.closed:
                    stream.close()
            for thread in threads:
                if thread.is_alive():
                    thread.join(timeout=1.0)
                if thread.is_alive():
                    errors.append("output reader did not stop")
        while True:
            try:
                channel, received, value = events.get_nowait()
                records.append({"channel": channel, "receivedMonotonicNs": received, "value": value})
            except queue.Empty:
                break
        ended = time.monotonic_ns()
        fixtures = [
            record["value"] for record in records
            if record["channel"] == "stdout" and record["value"].get("kind") == "fixture"
        ]
        diagnostics_records = [record["value"] for record in records if record["channel"] == "stderr"]
        with (sample_root / "diagnostics.ndjson").open("w", encoding="utf-8") as stream:
            for value in diagnostics_records:
                stream.write(json.dumps(value, separators=(",", ":")) + "\n")
        metrics = [value for value in fixtures if value.get("event") == "metrics"]
        first_present = next((
            value for value in diagnostics_records
            if value.get("kind") == "live" and value.get("event") == 508
        ), None)
        returncode = process.returncode if process is not None else None
        if returncode != 0:
            errors.append(f"exit {returncode}")
        geometry = geometry_assessment(metrics)
        errors.extend(geometry["errors"])
        window_open_seconds = None
        launch_seconds = None
        if first_present is not None:
            frequency = first_present.get("frequency")
            ticks = first_present.get("ticks")
            origin = first_present.get("originTicks")
            if all(isinstance(value, int) for value in (frequency, ticks, origin)) and frequency > 0:
                window_open_seconds = (ticks - origin) / frequency
                if sys.platform.startswith("linux") and frequency == 1_000_000_000 and ticks >= started:
                    launch_seconds = (ticks - started) / 1_000_000_000
        elif diagnostics:
            errors.append("package instrumentation missing teardown-flushed first-successful-present event 508")
        idle_actual = None
        idle_cpu_seconds = None
        idle_cpu_percent = None
        idle_complete = idle_start is not None and idle_end is not None
        if idle_complete:
            start_frequency = idle_start.get("frequency")
            end_frequency = idle_end.get("frequency")
            start_ticks = idle_start.get("ticks")
            end_ticks = idle_end.get("ticks")
            start_cpu = idle_start.get("processCpuTicks")
            end_cpu = idle_end.get("processCpuTicks")
            if (
                start_frequency == end_frequency
                and isinstance(start_frequency, int) and start_frequency > 0
                and all(isinstance(value, int) for value in (start_ticks, end_ticks))
            ):
                idle_actual = (end_ticks - start_ticks) / start_frequency
            if idle_actual is None or idle_actual <= 0:
                errors.append("diagnostics-off idle interval has no positive completed duration")
            elif not all(isinstance(value, int) for value in (start_cpu, end_cpu)) or end_cpu < start_cpu:
                errors.append("diagnostics-off idle interval has a non-monotonic process CPU counter")
            else:
                idle_cpu_seconds = (end_cpu - start_cpu) / 10_000_000
                idle_cpu_percent = idle_cpu_seconds / idle_actual * 100.0
        workload_valid = (
            returncode == 0 and geometry["valid"] and open_return is not None
            and first_frame_pump is not None and not errors)
        startup_valid = diagnostics and workload_valid and first_present is not None and window_open_seconds is not None
        idle_valid = not diagnostics and workload_valid and idle_complete and idle_actual is not None and idle_actual > 0
        record = {
            "name": name,
            "mode": mode,
            "status": "ok" if not errors else "failed",
            "errors": list(dict.fromkeys(errors)),
            "command": command,
            "returncode": returncode,
            "popenBoundaryMonotonicNs": started,
            "endedMonotonicNs": ended,
            "processLifetimeSeconds": (ended - started) / 1_000_000_000,
            "diagnosticsEnabled": diagnostics,
            "workloadValid": workload_valid,
            "startupValid": startup_valid,
            "idleValid": idle_valid,
            "instrumentation": "available" if first_present is not None else ("missing_event_508" if diagnostics else "disabled"),
            "startupOrigin": "window_open" if first_present is not None else None,
            "windowOpenToFirstPresentSeconds": window_open_seconds,
            "linuxPopenBoundaryToFirstPresentSeconds": launch_seconds,
            "launchOrigin": "immediately_before_subprocess_popen_using_linux_clock_monotonic" if launch_seconds is not None else None,
            "firstFrameSubmissionAttempt": first_frame_pump,
            "firstFrameSubmissionAttemptLimit": "Pump returned after a submission attempt; this is not asynchronous successful presentation",
            "firstPresent": first_present,
            "metrics": metrics[-1] if metrics else None,
            "geometry": geometry,
            "fixtureEvents": fixtures,
            "idle": {
                "requestedSeconds": interval,
                "actualSeconds": idle_actual,
                "processCpuSeconds": idle_cpu_seconds,
                "cpuPercentOneCore": idle_cpu_percent,
                "startMemory": memory_start,
                "endMemory": memory_end,
                "startFixture": idle_start,
                "endFixture": idle_end,
            } if not diagnostics else None,
        }
        write_json(sample_root / "result.json", record)
        self.samples.append(record)
        if errors:
            self.failures.append({"sample": name, "errors": record["errors"]})
        return record

    def measure(self):
        warm_cache = self.output / "caches" / "warm"
        prime = []
        for mode in MODES:
            prime.append(self.run_sample(
                f"prime-{mode}", mode, warm_cache, False,
                self.args.readiness_delay_seconds, self.args.startup_hold_seconds))
        warm = []
        for index in range(self.args.warm_runs):
            order = MODES if index % 2 == 0 else tuple(reversed(MODES))
            for mode in order:
                warm.append(self.run_sample(
                    f"warm-{index + 1:02d}-{mode}", mode, warm_cache, True,
                    self.args.readiness_delay_seconds, self.args.startup_hold_seconds))
        cold = []
        for mode in MODES:
            cold.append(self.run_sample(
                f"empty-cache-{mode}", mode,
                self.output / "caches" / f"empty-{mode}", True,
                self.args.readiness_delay_seconds, self.args.startup_hold_seconds))
        idle = []
        for index in range(self.args.idle_runs):
            order = MODES if index % 2 == 0 else tuple(reversed(MODES))
            for mode in order:
                idle.append(self.run_sample(
                    f"idle-{index + 1:02d}-{mode}", mode, warm_cache, False,
                    self.args.idle_settle_seconds, self.args.idle_seconds))
        return prime, warm, cold, idle


def main():
    args = parse_args()
    benchmark = Benchmark(args)
    font = benchmark.root / "Assets" / "VendSans-VariableFont_wght.ttf"
    license_path = benchmark.root / "Assets" / "VendSans-OFL.txt"
    if sha256(font) != FONT_SHA256 or sha256(license_path) != LICENSE_SHA256:
        raise RuntimeError("benchmark font or license hash does not match the fixture contract")
    source_identity = {
        relative: {
            "sha256": sha256(benchmark.root / relative),
            "bytes": (benchmark.root / relative).stat().st_size,
        }
        for relative in SOURCE_FILES
    }
    options = {
        "rid": args.rid,
        "packageVersion": args.package_version,
        "packageSource": benchmark.source,
        "packageSourceKind": benchmark.source_kind,
        "warmRuns": args.warm_runs,
        "idleRuns": args.idle_runs,
        "startupTimeoutSeconds": args.startup_timeout_seconds,
        "startupHoldSeconds": args.startup_hold_seconds,
        "readinessDelaySeconds": args.readiness_delay_seconds,
        "idleSettleSeconds": args.idle_settle_seconds,
        "idleSeconds": args.idle_seconds,
        "publishOnly": args.publish_only,
    }
    write_json(benchmark.output / "options.json", options)
    benchmark.command("dotnet-info", ["dotnet", "--info"], timeout=60)
    sdk_version = benchmark.command("dotnet-version", ["dotnet", "--version"], timeout=60).strip()
    if sdk_version != "10.0.401":
        raise RuntimeError(f"fixture requires .NET SDK 10.0.401, got {sdk_version!r}")
    sizes = benchmark.publish()
    for mode, stage in sizes.items():
        if not any(record["path"] == "VendSans-OFL.txt" for record in stage["noticesInRuntime"]):
            raise RuntimeError(f"{mode} staged runtime omitted the Vend Sans license")
    packages = {
        "goo": package_identity(benchmark.cache, "Goo", args.package_version),
        "gsharpSdk": package_identity(benchmark.cache, "Gsharp.NET.Sdk", "0.4.591"),
    }
    provenance = {
        "schemaVersion": 1,
        "recordedUtc": datetime.now(timezone.utc).isoformat(),
        "options": options,
        "sdk": {"dotnetVersion": sdk_version, "globalJson": source_identity["global.json"]},
        "restoreConfig": {"path": str(benchmark.config), "sha256": sha256(benchmark.config)},
        "packages": packages,
        "source": source_identity,
        "font": {
            "path": "Assets/VendSans-VariableFont_wght.ttf",
            "sha256": FONT_SHA256,
            "license": "Assets/VendSans-OFL.txt",
            "licenseSha256": LICENSE_SHA256,
        },
        "host": host_provenance(),
        "environment": {
            name: os.environ.get(name) for name in RECORDED_ENVIRONMENT if name in os.environ
        },
        "controlledGooEnvironment": list(CONTROLLED_GOO_ENVIRONMENT),
        "commands": benchmark.commands,
        "sizes": sizes,
        "measurementLimits": {
            "diagnosticStartupOrigin": "Window.Open",
            "firstFramePump": "one public Pump performs a submission attempt before the watcher; it is not successful-present confirmation",
            "linuxLaunchOrigin": "timestamp immediately before subprocess.Popen on CLOCK_MONOTONIC; null elsewhere",
            "event508Availability": "flushed only after teardown and absent from public Goo 0.6.4",
            "diagnosticsOffReadiness": "configured settle after Window.Open returned, not successful-present confirmation",
            "idleCpuBoundary": "GC heap, private bytes, and working set are read before each Process.TotalProcessorTime and Stopwatch boundary; end-getter work and fixture formatting remain in the measured interval",
            "emptyCache": "Goo pipeline cache only; OS and driver caches are not dropped",
            "gcCommittedBytes": "last completed GC snapshot; null when GC index is zero",
            "privateBytes": "virtual committed private bytes, not private resident memory",
            "linuxPssAndPrivateResident": "read from /proc/<pid>/smaps_rollup when available, otherwise null",
            "vulkanDeviceMemory": "Goo tracked allocations, not total process GPU memory",
        },
    }
    write_json(benchmark.output / "provenance.json", provenance)
    if args.publish_only:
        write_json(benchmark.output / "summary.json", {
            "sizes": sizes,
            "measurements": None,
            "failures": [],
        })
        return 0
    prime, warm, cold, idle = benchmark.measure()
    comparison = comparison_assessment({
        "warm": warm,
        "emptyGooCache": cold,
        "idleDiagnosticsOff": idle,
    })
    for sample in (*warm, *cold, *idle):
        sample["comparisonEligible"] = (
            comparison["valid"] and (sample["startupValid"] or sample["idleValid"]))
        sample["startupComparisonValid"] = sample["startupValid"] and comparison["valid"]
        sample["idleComparisonValid"] = sample["idleValid"] and comparison["valid"]
    if not comparison["valid"]:
        benchmark.failures.append({"sample": "comparison", "errors": comparison["errors"]})
    summary = {
        "sizes": sizes,
        "comparison": comparison,
        "warm": {},
        "emptyGooCache": {},
        "idleDiagnosticsOff": {},
    }
    for mode in MODES:
        mode_warm = [sample for sample in warm if sample["mode"] == mode]
        mode_idle = [sample for sample in idle if sample["mode"] == mode]
        summary["warm"][mode] = {
            "windowOpenToFirstPresentSeconds": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: sample["windowOpenToFirstPresentSeconds"]),
            "linuxPopenBoundaryToFirstPresentSeconds": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: sample["linuxPopenBoundaryToFirstPresentSeconds"]),
            "firstPresentManagedHeapBytes": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: None if sample["firstPresent"] is None else sample["firstPresent"].get("managedAllocatedBytes")),
            "firstPresentPrivateBytes": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: None if sample["firstPresent"] is None else sample["firstPresent"].get("privateBytes")),
            "firstPresentWorkingSetBytes": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: None if sample["firstPresent"] is None else sample["firstPresent"].get("workingSetBytes")),
            "firstPresentVulkanTrackedBytes": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: None if sample["firstPresent"] is None else sample["firstPresent"].get("vulkanDeviceMemoryBytes")),
            "firstPresentVulkanObjectCount": metric_summary(
                mode_warm, "startupComparisonValid", lambda sample: None if sample["firstPresent"] is None else sample["firstPresent"].get("vulkanObjectCount")),
        }
        summary["idleDiagnosticsOff"][mode] = {
            "actualSeconds": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["actualSeconds"]),
            "processCpuSeconds": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["processCpuSeconds"]),
            "cpuPercentOneCore": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["cpuPercentOneCore"]),
            "pssBytes": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["startMemory"]["pssBytes"] if sample["idle"]["startMemory"] else None),
            "privateResidentBytes": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["startMemory"]["privateResidentBytes"] if sample["idle"]["startMemory"] else None),
            "gcHeapBytes": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["startFixture"].get("gcHeapBytes") if sample["idle"]["startFixture"] else None),
            "lastGcCommittedBytes": metric_summary(
                mode_idle, "idleComparisonValid", lambda sample: sample["idle"]["startFixture"].get("gcCommittedBytes") if sample["idle"]["startFixture"] else None),
        }
    for sample in cold:
        eligible = sample["startupComparisonValid"]
        summary["emptyGooCache"][sample["mode"]] = {
            "startupValid": eligible,
            "rawStartupValid": sample["startupValid"],
            "comparisonEligible": sample["comparisonEligible"],
            "instrumentation": sample["instrumentation"],
            "windowOpenToFirstPresentSeconds": sample["windowOpenToFirstPresentSeconds"] if eligible else None,
            "linuxPopenBoundaryToFirstPresentSeconds": sample["linuxPopenBoundaryToFirstPresentSeconds"] if eligible else None,
            "errors": sample["errors"] + ([] if comparison["valid"] else comparison["errors"]),
        }
    summary["primeFailures"] = [sample["name"] for sample in prime if not sample["workloadValid"]]
    summary["failures"] = benchmark.failures
    write_json(benchmark.output / "samples.json", benchmark.samples)
    write_json(benchmark.output / "summary.json", summary)
    if benchmark.failures:
        raise RuntimeError(f"benchmark completed with {len(benchmark.failures)} failed samples")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
