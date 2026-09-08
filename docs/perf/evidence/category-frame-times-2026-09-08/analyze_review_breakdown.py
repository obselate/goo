#!/usr/bin/env python3
"""Analyze Gallery review CPU/GPU/memory logs without adding nested stages."""
from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from pathlib import Path
from typing import Any

ROOT = Path("/tmp/goo-consumer-review-20260908")
DEFAULT_LOGS = [ROOT / "breakdown-baseline-0.log", ROOT / "callback-dither-first.log"]
CPU_PREFIX = "gallery-review-cpu-raw,"
GPU_PREFIX = "gallery-review-raw,"


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    xs = sorted(values)
    pos = (len(xs) - 1) * p
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return xs[lo]
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def summary(values: list[float]) -> dict[str, float | int | None]:
    return {
        "n": len(values),
        "median": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "mean": statistics.fmean(values) if values else None,
    }


def parse_kv_line(line: str) -> dict[str, str]:
    return dict(part.split("=", 1) for part in line.strip().split(",")[1:] if "=" in part)


def parse_log(path: Path) -> dict[str, Any]:
    summaries: dict[str, dict[str, str]] = {}
    clocks: dict[str, str] = {}
    memory: dict[str, dict[str, dict[str, int]]] = {}
    smaps: dict[str, dict[str, dict[str, int]]] = {}
    cpu_rows: dict[str, list[dict[str, str]]] = {}
    gpu_rows: dict[str, list[dict[str, str]]] = {}
    cpu_header: list[str] | None = None
    gpu_header: list[str] | None = None
    smaps_state: str | None = None
    smaps_phase: str | None = None
    smaps_values: dict[str, int] = {}

    def finish_smaps() -> None:
        nonlocal smaps_state, smaps_phase, smaps_values
        if smaps_state is not None and smaps_phase is not None:
            smaps.setdefault(smaps_state, {})[smaps_phase] = dict(smaps_values)
        smaps_state = None
        smaps_phase = None
        smaps_values = {}

    with path.open(errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if line.startswith("gallery-review-clock,"):
                kv = parse_kv_line(line)
                if "stopwatch_frequency" in kv:
                    clocks["frequency"] = kv["stopwatch_frequency"]
                continue
            if line.startswith("gallery-review-summary,"):
                kv = parse_kv_line(line)
                if "state" in kv:
                    summaries[kv["state"]] = kv
                continue
            if line.startswith("gallery-review-memory,"):
                kv = parse_kv_line(line)
                state, phase = kv.get("state"), kv.get("phase")
                if state and phase:
                    memory.setdefault(state, {})[phase] = {
                        k: int(v) for k, v in kv.items() if k.endswith("_B")
                    }
                continue
            if line.startswith("gallery-review-smaps,state=") and line.endswith(",begin"):
                finish_smaps()
                kv = parse_kv_line(line)
                smaps_state, smaps_phase = kv.get("state"), kv.get("phase")
                smaps_values = {}
                continue
            if line.startswith("gallery-review-smaps,state=") and line.endswith(",end"):
                finish_smaps()
                continue
            if smaps_state is not None:
                if ":" in line and line.split(":", 1)[0] in {
                    "Rss", "Pss", "Pss_Dirty", "Pss_Anon", "Pss_File", "Pss_Shmem",
                }:
                    key, value = line.split(":", 1)
                    fields = value.strip().split()
                    if fields and fields[0].isdigit():
                        smaps_values[key] = int(fields[0]) * 1024  # smaps reports kB
                continue
            if line.startswith(CPU_PREFIX):
                if line == CPU_PREFIX + "state,index,frame_id,valid":
                    cpu_header = next(csv.reader([line[len(CPU_PREFIX):]]))
                    continue
                if cpu_header is None:
                    cpu_header = next(csv.reader([line[len(CPU_PREFIX):]]))
                    continue
                fields = next(csv.reader([line[len(CPU_PREFIX):]]))
                row = dict(zip(cpu_header, fields))
                cpu_rows.setdefault(row["state"], []).append(row)
                continue
            if line.startswith(GPU_PREFIX):
                if line == GPU_PREFIX + "state,index,frame_id,host_wall_ticks,current_thread_allocated_delta_B,draw_delta,pipeline_delta,descriptor_delta,upload_ns,upload_scope_count,upload_dropped_scope_count,upload_valid,main_ns,main_scope_count,main_dropped_scope_count,main_valid,effects_ns,effects_scope_count,effects_dropped_scope_count,effects_valid,offscreen_ns,offscreen_scope_count,offscreen_dropped_scope_count,offscreen_valid":
                    gpu_header = next(csv.reader([line[len(GPU_PREFIX):]]))
                    continue
                if gpu_header is None:
                    gpu_header = next(csv.reader([line[len(GPU_PREFIX):]]))
                    continue
                fields = next(csv.reader([line[len(GPU_PREFIX):]]))
                row = dict(zip(gpu_header, fields))
                gpu_rows.setdefault(row["state"], []).append(row)
                continue
    finish_smaps()
    return {
        "file": str(path),
        "name": path.name,
        "frequency": int(clocks.get("frequency", "1000000000")),
        "summaries": summaries,
        "memory": memory,
        "smaps": smaps,
        "cpu_rows": cpu_rows,
        "gpu_rows": gpu_rows,
    }


CPU_STAGES = [
    "frame", "events", "input", "tree", "motion", "reconcile", "build", "diff",
    "style_resolve", "transitions", "layout", "input_tree", "render", "target_begin",
    "paint", "canvas_flush", "target_flush", "present",
]
GPU_STAGES = ["upload", "main", "effects", "offscreen"]

# The profiler records these stages inclusively. Keep this hierarchy in the evidence
# so consumers do not add children to parents as if they were independent time.
NESTING = {
    "tree": "outer; includes motion/reconcile and tree work",
    "reconcile": "inclusive; includes build/style_resolve/diff",
    "render": "outer; includes target_begin/paint/present",
    "main": "outer GPU pass; includes effect/offscreen scopes when present",
    "effects": "detail GPU scope; may have multiple scopes",
    "offscreen": "detail GPU scope; may have multiple scopes",
}


def int_values(rows: list[dict[str, str]], key: str) -> list[int]:
    return [int(row[key]) for row in rows if row.get(key, "") != ""]


def analyze_state(run: dict[str, Any], state: str) -> dict[str, Any]:
    cpus = run["cpu_rows"].get(state, [])
    gpus = run["gpu_rows"].get(state, [])
    freq = run["frequency"]
    s = run["summaries"].get(state, {})
    cpu: dict[str, Any] = {}
    for stage in CPU_STAGES:
        ns = int_values(cpus, stage + "_ns")
        alloc = int_values(cpus, stage + "_alloc_B")
        calls = int_values(cpus, stage + "_calls")
        cpu[stage] = {
            "time_ns": summary(ns),
            "alloc_B": summary(alloc),
            "calls": summary(calls),
            "nesting": NESTING.get(stage, "independent/leaf or separate stage"),
        }
    gpu: dict[str, Any] = {}
    for stage in GPU_STAGES:
        ns = int_values(gpus, stage + "_ns")
        scopes = int_values(gpus, stage + "_scope_count")
        dropped = int_values(gpus, stage + "_dropped_scope_count")
        valid = int_values(gpus, stage + "_valid")
        gpu[stage] = {
            "time_ms": summary([v / 1_000_000 for v in ns]),
            "scope_count": summary(scopes),
            "dropped_scope_count": summary(dropped),
            "valid_count": sum(valid),
            "nesting": NESTING.get(stage, "independent/leaf or separate stage"),
        }

    host_ns = int_values(gpus, "host_wall_ticks")
    alloc_delta = int_values(gpus, "current_thread_allocated_delta_B")
    events_ns = int_values(cpus, "events_ns")
    process_ns_frame = int(s.get("process_cpu_ns", "0")) / max(1, int(s.get("measured", "1")))
    mem = run["memory"].get(state, {})
    mem_summary = run["summaries"].get(state, {})
    smaps = run["smaps"].get(state, {})

    memory_fields = [
        "managed_allocated_delta_B", "allocator_peak_B", "device_peak_B", "cache_peak_B",
        "text_peak_B", "layer_peak_B", "image_peak_B", "gc_total_memory_start_B",
        "gc_total_memory_end_B", "gc_total_memory_after_gc_B", "gc_heap_size_start_B",
        "gc_heap_size_end_B", "gc_heap_size_after_gc_B", "gc_committed_start_B",
        "gc_committed_end_B", "gc_committed_after_gc_B", "gc_total_allocated_start_B",
        "gc_total_allocated_end_B", "gc_total_allocated_after_gc_B",
    ]
    memory_counters = {k: int(mem_summary[k]) for k in memory_fields if k in mem_summary}
    memory_counters["gc_total_memory_delta_B"] = (
        memory_counters.get("gc_total_memory_end_B", 0) - memory_counters.get("gc_total_memory_start_B", 0)
    )
    memory_counters["gc_committed_delta_B"] = (
        memory_counters.get("gc_committed_end_B", 0) - memory_counters.get("gc_committed_start_B", 0)
    )
    memory_counters["gc_total_allocated_delta_B"] = (
        memory_counters.get("gc_total_allocated_end_B", 0) - memory_counters.get("gc_total_allocated_start_B", 0)
    )
    smaps_bytes = {
        phase: {key + "_B": value for key, value in values.items()}
        for phase, values in smaps.items()
    }
    return {
        "file": run["name"],
        "state": state,
        "sample_counts": {"cpu": len(cpus), "gpu": len(gpus), "expected": int(s.get("measured", "0"))},
        "host_ms": summary([v * 1000 / freq for v in host_ns]),
        "process_cpu_ms_per_frame": process_ns_frame / 1_000_000,
        "wait_events_us": summary([v / 1000 for v in events_ns]),
        "input_us": summary([v / 1000 for v in int_values(cpus, "input_ns")]),
        "gpu": gpu,
        "cpu": cpu,
        "frame_alloc_B": summary(alloc_delta),
        "memory_counters": memory_counters,
        "smaps_B": smaps_bytes,
        "summary": mem_summary,
        "memory_samples": mem,
    }


def flatten_rows(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for result in results:
        base = {"file": result["file"], "state": result["state"]}
        for kind, stages, metric in [
            ("cpu_time", CPU_STAGES, "time_ns"),
            ("cpu_alloc", CPU_STAGES, "alloc_B"),
        ]:
            for stage in stages:
                item = result["cpu"][stage][metric]
                rows.append({**base, "kind": kind, "stage": stage, "unit": "ns" if metric == "time_ns" else "B", "median": item["median"], "p95": item["p95"], "mean": item["mean"], "n": item["n"], "nesting": result["cpu"][stage]["nesting"]})
        for stage in GPU_STAGES:
            item = result["gpu"][stage]["time_ms"]
            rows.append({**base, "kind": "gpu_time", "stage": stage, "unit": "ms", "median": item["median"], "p95": item["p95"], "mean": item["mean"], "n": item["n"], "nesting": result["gpu"][stage]["nesting"]})
    return rows


def fmt(value: Any, digits: int = 2) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def write_outputs(runs: list[dict[str, Any]], out_prefix: Path) -> None:
    results: list[dict[str, Any]] = []
    for run in runs:
        states = sorted(set(run["summaries"]) | set(run["cpu_rows"]) | set(run["gpu_rows"]))
        results.extend(analyze_state(run, state) for state in states)
    payload = {
        "logs": [{"name": run["name"], "frequency": run["frequency"]} for run in runs],
        "profiler_semantics": {
            "cpu": "Tree contains Motion/Reconcile; Reconcile contains Build/StyleResolve/Diff; Render contains TargetBegin/Paint/Present.",
            "gpu": "Main is the outer pass; Effects and Offscreen are nested detail scopes and must not be added to Main.",
            "host": "host_ms measures the ForceRender wall interval; paced Thread.Sleep occurs before that interval.",
            "allocation": "cpu stage alloc_B is per-thread inclusive stage attribution; frame_alloc_B is fixture-thread delta and is separate.",
        },
        "states": results,
    }
    (out_prefix.with_suffix(".json")).write_text(json.dumps(payload, indent=2) + "\n")
    flat = flatten_rows(results)
    with out_prefix.with_suffix(".csv").open("w", newline="") as f:
        fields = ["file", "state", "kind", "stage", "unit", "median", "p95", "mean", "n", "nesting"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(flat)

    baseline = next((r for r in results if r["file"] == "breakdown-baseline-0.log" and r["state"] == "shader-dither"), None)
    callback = next((r for r in results if r["file"] == "callback-dither-first.log" and r["state"] == "shader-dither"), None)
    lines: list[str] = []
    lines.append("Gallery review breakdown evidence")
    lines.append("")
    lines.append("Inputs: breakdown-baseline-0.log (opening + three shader states) and callback-dither-first.log (shader-dither only). Each state has 500 valid samples after 120 warmup frames, with one submission/presentation per sample.")
    lines.append("")
    lines.append("Profiler reading: Tree is an outer CPU stage containing Motion and Reconcile; Reconcile contains Build, StyleResolve, and Diff; Render is an outer CPU stage containing TargetBegin, Paint, and Present. Main is the outer GPU pass; Effects and Offscreen are nested GPU scopes. Values below are reported individually and are not summed.")
    lines.append("")
    lines.append("State | host p50/p95 ms | event wait p50/p95 us | GPU Main p50/p95 ms | Effects p50/p95 ms | Offscreen p50/p95 ms | process CPU ms/frame")
    lines.append("--- | ---: | ---: | ---: | ---: | ---: | ---:")
    for r in results:
        lines.append(f"{r['file']} / {r['state']} | {fmt(r['host_ms']['median'])}/{fmt(r['host_ms']['p95'])} | {fmt(r['wait_events_us']['median'])}/{fmt(r['wait_events_us']['p95'])} | {fmt(r['gpu']['main']['time_ms']['median'])}/{fmt(r['gpu']['main']['time_ms']['p95'])} | {fmt(r['gpu']['effects']['time_ms']['median'])}/{fmt(r['gpu']['effects']['time_ms']['p95'])} | {fmt(r['gpu']['offscreen']['time_ms']['median'])}/{fmt(r['gpu']['offscreen']['time_ms']['p95'])} | {fmt(r['process_cpu_ms_per_frame'])}")
    lines.append("")
    lines.append("CPU stage medians / p95 (ns per frame)")
    lines.append("file / state | Tree | Reconcile | Build | Diff | Motion | Render | Paint | Present")
    lines.append("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:")
    for r in results:
        c = r["cpu"]
        values = [f"{fmt(c[k]['time_ns']['median'],0)}/{fmt(c[k]['time_ns']['p95'],0)}" for k in ["tree", "reconcile", "build", "diff", "motion", "render", "paint", "present"]]
        lines.append(f"{r['file']} / {r['state']} | " + " | ".join(values))
    lines.append("")
    lines.append("CPU allocation medians / p95 (bytes per frame; inclusive attribution)")
    lines.append("file / state | Tree | Reconcile | Build | Diff | Motion | Render | Paint | fixture-thread delta")
    lines.append("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:")
    for r in results:
        c = r["cpu"]
        values = [f"{fmt(c[k]['alloc_B']['median'],0)}/{fmt(c[k]['alloc_B']['p95'],0)}" for k in ["tree", "reconcile", "build", "diff", "motion", "render", "paint"]]
        fa = r["frame_alloc_B"]
        lines.append(f"{r['file']} / {r['state']} | " + " | ".join(values) + f" | {fmt(fa['median'],0)}/{fmt(fa['p95'],0)}")
    lines.append("")
    lines.append("Memory/resource counters")
    lines.append("file / state | managed allocated delta | GC total delta | GC committed delta | allocator peak | device peak | image peak | RSS before/after")
    lines.append("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:")
    for r in results:
        m = r["memory_counters"]
        before = r["smaps_B"].get("before-measurements", {}).get("Rss_B")
        after = r["smaps_B"].get("after-gc", {}).get("Rss_B")
        lines.append(f"{r['file']} / {r['state']} | {m.get('managed_allocated_delta_B','-')} B | {m.get('gc_total_memory_delta_B','-')} B | {m.get('gc_committed_delta_B','-')} B | {m.get('allocator_peak_B','-')} B | {m.get('device_peak_B','-')} B | {m.get('image_peak_B','-')} B | {fmt(before,0)}/{fmt(after,0)} B")
    lines.append("")
    lines.append("Callback matched limitation")
    if baseline and callback:
        lines.append("Only shader-dither is matched between the two inputs: the callback log selects state 3, while the baseline log contains all four states. This is a single run per variant, so the comparison is evidence of this paired run, not a controlled multi-run estimate. Baseline dither is the fourth state in a long-lived process; its RSS/resource and cumulative managed allocation counters are therefore not directly comparable with callback's fresh-process dither start.")
        lines.append("Metric | baseline dither | callback dither | callback - baseline")
        lines.append("--- | ---: | ---: | ---:")
        for label, path, unit in [
            ("host p50", ("host_ms", "median"), "ms"),
            ("host p95", ("host_ms", "p95"), "ms"),
            ("events p50", ("wait_events_us", "median"), "us"),
            ("GPU Main p50", ("gpu.main.time_ms", "median"), "ms"),
            ("Tree CPU p50", ("cpu.tree.time_ns", "median"), "ns"),
            ("Reconcile CPU p50", ("cpu.reconcile.time_ns", "median"), "ns"),
            ("Render CPU p50", ("cpu.render.time_ns", "median"), "ns"),
            ("Tree alloc p50", ("cpu.tree.alloc_B", "median"), "B"),
            ("Reconcile alloc p50", ("cpu.reconcile.alloc_B", "median"), "B"),
            ("Build alloc p50", ("cpu.build.alloc_B", "median"), "B"),
        ]:
            def get(obj: dict[str, Any], dotted: str, leaf: str) -> float:
                x: Any = obj
                for key in dotted.split("."):
                    x = x[key]
                return float(x[leaf])
            b, c = get(baseline, path[0], path[1]), get(callback, path[0], path[1])
            lines.append(f"{label} ({unit}) | {b:.2f} | {c:.2f} | {c-b:+.2f}")
    else:
        lines.append("No matched shader-dither rows were found.")
    lines.append("")
    lines.append("See breakdown-analysis.json for every stage's median/p95/mean and raw sample counts; breakdown-analysis.csv is the flat stage table.")
    (out_prefix.with_name(out_prefix.name + "-summary.md")).write_text("\n".join(lines) + "\n")

    # Concise stdout for the parent/automation.
    print("wrote", out_prefix.with_suffix(".json"))
    print("wrote", out_prefix.with_suffix(".csv"))
    print("wrote", out_prefix.with_name(out_prefix.name + "-summary.md"))
    for r in results:
        print(r["file"], r["state"], "host_ms", r["host_ms"]["median"], r["host_ms"]["p95"], "tree_ns", r["cpu"]["tree"]["time_ns"]["median"], r["cpu"]["tree"]["time_ns"]["p95"], "tree_alloc_B", r["cpu"]["tree"]["alloc_B"]["median"], r["cpu"]["tree"]["alloc_B"]["p95"])


if __name__ == "__main__":
    paths = [Path(arg) for arg in sys.argv[1:]] if len(sys.argv) > 1 else DEFAULT_LOGS
    write_outputs([parse_log(path) for path in paths], ROOT / "breakdown-analysis")
