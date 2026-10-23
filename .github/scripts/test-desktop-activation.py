#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

program = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
session = root / "s"
session.mkdir()
runtime = root / "r"
runtime.mkdir(mode=0o700)
environment = os.environ.copy()
environment["XDG_RUNTIME_DIR"] = str(runtime)
command = [shutil.which("dotnet"), str(program)] if program.suffix == ".dll" else [str(program)]
identity = "org.goo.activation." + uuid.uuid4().hex
scheme = "goo-activation-" + uuid.uuid4().hex
extension = ".gooactivation" + uuid.uuid4().hex
prefix = command + ["activated", identity, str(session)]
document = session / ("one document" + extension)
document.write_text("activation document", encoding="utf-8")
cleanup = None


def wait_for(name, timeout=25, errors=True):
    deadline = time.monotonic() + timeout
    target = session / name
    while not target.exists():
        error = session / "error"
        if errors and error.exists():
            raise RuntimeError(error.read_text(encoding="utf-8"))
        if time.monotonic() >= deadline:
            raise TimeoutError(name)
        time.sleep(0.01)
    return target


def observed(index, kind, initial, target):
    lines = wait_for(f"{index}.event").read_text(encoding="utf-8").splitlines()
    if lines != [kind, "initial" if initial else "warm", target]:
        raise RuntimeError(f"Native activation changed: {lines}")


def desktop_argument(value):
    value = str(value).replace("\\", "\\\\").replace('"', '\\"')
    value = value.replace("$", "\\$").replace("`", "\\`").replace("%", "%%")
    return '"' + value + '"'


if sys.platform == "win32":
    import winreg
    class_root = "Software\\Classes\\"
    scheme_key = class_root + scheme
    prog_id = "Goo." + uuid.uuid4().hex
    document_key = class_root + prog_id
    extension_key = class_root + extension
    owned_keys = [extension_key, document_key, scheme_key]

    def set_value(key, name, value):
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, key, access=winreg.KEY_SET_VALUE) as handle:
            winreg.SetValueEx(handle, name, 0, winreg.REG_SZ, value)

    def delete_key(key):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, access=winreg.KEY_READ) as handle:
                while True:
                    try:
                        child = winreg.EnumKey(handle, 0)
                    except OSError:
                        break
                    delete_key(key + "\\" + child)
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
        except FileNotFoundError:
            pass

    def cleanup():
        for key in owned_keys:
            delete_key(key)

    try:
        set_value(scheme_key, None, "URL:Goo activation qualification")
        set_value(scheme_key, "URL Protocol", "")
        set_value(scheme_key + r"\shell\open\command", None,
                  subprocess.list2cmdline(prefix + ["--goo-open-uri"]) + ' "%1"')
        set_value(extension_key, None, prog_id)
        set_value(document_key + r"\shell\open\command", None,
                  subprocess.list2cmdline(prefix + ["--goo-open-documents"]) + ' "%1"')
    except Exception:
        cleanup()
        raise

    def launch_uri(value):
        os.startfile(value, "open")

    def launch_document():
        os.startfile(str(document), "open")

elif sys.platform.startswith("linux"):
    gio = shutil.which("gio")
    if gio is None:
        raise RuntimeError("gio is required for native desktop activation qualification")
    for name, flag, field in (("links", "--goo-open-uri", "%u"), ("documents", "--goo-open-documents", "%U")):
        executable = " ".join(desktop_argument(value) for value in prefix + [flag])
        (root / (name + ".desktop")).write_text(
            "[Desktop Entry]\nType=Application\nName=Goo activation qualification\nTerminal=false\nNoDisplay=true\n"
            + "Exec=" + executable + " " + field + "\n", encoding="utf-8")

    def gio_launch(name, value):
        subprocess.run([gio, "launch", str(root / (name + ".desktop")), value], env=environment,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=10)

    def launch_uri(value):
        gio_launch("links", value)

    def launch_document():
        gio_launch("documents", document.as_uri())

else:
    raise RuntimeError("This driver qualifies Windows and Linux. macOS uses the signed-bundle driver.")

try:
    cold = scheme + "://cold/%CE%BB"
    warm = scheme + "://warm/route"
    launch_uri(cold)
    observed(1, "OpenUri", True, cold)
    launch_uri(warm)
    observed(2, "OpenUri", False, warm)
    launch_document()
    observed(3, "OpenDocuments", False, str(document))
    (session / "stop").touch()
    wait_for("exited")
    for name in ("stop", "exited", "pid", "1.event", "2.event", "3.event"):
        (session / name).unlink()
    launch_document()
    observed(1, "OpenDocuments", True, str(document))
    (session / "stop").touch()
    wait_for("exited")
    print("desktop-activation: native cold/warm URI, cold/warm document and owner-thread delivery passed")
finally:
    try:
        (session / "stop").touch()
        if (session / "pid").exists() and not (session / "error").exists():
            wait_for("exited", timeout=45, errors=False)
    finally:
        if cleanup is not None:
            cleanup()
