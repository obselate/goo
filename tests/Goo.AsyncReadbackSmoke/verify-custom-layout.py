#!/usr/bin/env python3
"""Capture and verify retained custom layout at two native window sizes."""
import json
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[2]
evidence = root / "artifacts/issues-50-60/custom-layout"
evidence.mkdir(parents=True, exist_ok=True)
for name in ("wide.ready", "narrow.ready", "narrow", "done"):
    (evidence / name).unlink(missing_ok=True)
env = dict(os.environ, GOO_CUSTOM_LAYOUT_SMOKE="1", GOO_CUSTOM_LAYOUT_PROOF=str(evidence),
           GOO_DEVTOOLS="1", SDL_VIDEODRIVER="wayland", GOO_VK_DIAGNOSTICS="1", GOO_VK_VALIDATION="1")
with (evidence / "native.log").open("w") as output:
    process = subprocess.Popen(["dotnet", str(root / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll")], env=env, stdout=output, stderr=subprocess.STDOUT)
    try:
        for phase in ("wide", "narrow"):
            deadline = time.monotonic() + 35
            while not (evidence / f"{phase}.ready").exists():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("Native layout fixture failed; see " + str(evidence / "native.log"))
                time.sleep(.05)
            subprocess.run(["dotnet", str(root / "tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll"),
                            "capture", "--pid", str(process.pid), "--output", str(evidence / f"{phase}.png")], check=True, timeout=30)
            (evidence / ("narrow" if phase == "wide" else "done")).write_text("1")
        if process.wait(timeout=15):
            raise RuntimeError("Native layout fixture failed during close")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
transcript = (evidence / "native.log").read_text()
assert "custom-layout-native: wrapped-text/image/resize/retained-state/input=pass" in transcript
counters = [json.loads(line) for line in transcript.splitlines() if line.startswith('{"kind":"counters"')]
assert counters and all(counters[-1][key] == 0 for key in ("validationErrors", "fatalCode", "vulkanObjectCount", "vulkanDeviceMemoryBytes"))
print("custom-layout-native: wide/narrow captures, wrapping, image, retained counter/input, and native cleanup passed")
