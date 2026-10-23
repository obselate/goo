#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

program = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
runtime = root / "r"
runtime.mkdir(mode=0o700)
environment = os.environ.copy()
environment["XDG_RUNTIME_DIR"] = str(runtime)
command = ["dotnet", str(program)] if program.suffix == ".dll" else [str(program)]
children = []


def start(mode, identity, output, tag=None, cwd=None):
    arguments = command + [mode, identity, str(output)]
    if tag is not None:
        arguments.append(tag)
    child = subprocess.Popen(arguments, cwd=cwd or output, env=environment,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    children.append(child)
    return child


def completed(child):
    output, _ = child.communicate(timeout=30)
    if child.returncode != 0:
        raise RuntimeError(f"App host check exited {child.returncode}:\n{output}")


def wait_for(path, child):
    deadline = time.monotonic() + 25
    while not path.exists():
        if child.poll() is not None:
            completed(child)
            raise RuntimeError(f"App host check exited before {path.name}")
        if time.monotonic() >= deadline:
            raise TimeoutError(path.name)
        time.sleep(0.01)


def case(name):
    output = root / name
    output.mkdir()
    return output, "org.goo.tests." + uuid.uuid4().hex


try:
    output, identity = case("forward")
    sender = output / "sender cwd"
    receiver = output / "receiver cwd"
    sender.mkdir()
    receiver.mkdir()
    primary = start("primary", identity, output, cwd=receiver)
    wait_for(output / "primary.ready", primary)
    completed(start("secondary", identity, output, cwd=sender))
    wait_for(output / "closed.ready", primary)
    completed(start("closed", identity, output, cwd=sender))
    completed(primary)
    if not (output / "passed").exists():
        raise RuntimeError("Activation checks did not finish")
    print("single-instance: arguments, URI, documents, notification, UI thread and queue rejection passed")

    output, identity = case("election")
    first = start("elect", identity, output, "one")
    second = start("elect", identity, output, "two")
    (output / "start").touch()
    wait_for(output / "one.status", first)
    wait_for(output / "two.status", second)
    statuses = sorted((output / name).read_text() for name in ("one.status", "two.status"))
    if statuses != ["Forwarded", "Primary"]:
        raise RuntimeError(f"Concurrent ownership changed: {statuses}")
    (output / "stop").touch()
    completed(first)
    completed(second)
    print("single-instance: concurrent launches elected one primary")

    output, identity = case("timeout")
    primary = start("stall", identity, output)
    wait_for(output / "stall.ready", primary)
    completed(start("timeout", identity, output))
    (output / "stop").touch()
    completed(primary)
    print("single-instance: missing endpoint timed out without another primary")

    output, identity = case("restart")
    first = start("hold", identity, output, "first")
    wait_for(output / "first.ready", first)
    first.kill()
    first.wait(timeout=10)
    second = start("hold", identity, output, "second")
    wait_for(output / "second.ready", second)
    (output / "stop").touch()
    completed(second)
    print("single-instance: exited owner and stale endpoint recovered")

    if sys.platform.startswith("linux"):
        output, identity = case("unsupported")
        completed(start("unsupported", identity, output))
        print("single-instance: missing runtime context returned Unsupported")
finally:
    for child in children:
        if child.poll() is None:
            child.kill()
        output, _ = child.communicate(timeout=10)
        if child.returncode != 0 and output:
            print(output, file=sys.stderr)
