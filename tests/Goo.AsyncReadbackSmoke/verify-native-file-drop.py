#!/usr/bin/env python3
"""Exercise SDL native drop routing and an actual Nemo-to-Wayland file-manager drag.

Requires Nemo, GTK AT-SPI introspection, KWin, Xwayland, and libei development files.
All task applications and input run in an isolated virtual compositor.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import tempfile
import shlex

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "artifacts/issues-50-60/native-file-drop"
if "--session" not in sys.argv:
    env = dict(os.environ)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "processes.json").unlink(missing_ok=True)
    # Both windows and test input live in a private compositor/session/runtime.
    with tempfile.TemporaryDirectory(prefix="goo-native-drop-") as temporary:
        temporary = Path(temporary)
        runtime = temporary / "runtime"
        runtime.mkdir(mode=0o700)
        config = temporary / "config"
        config.mkdir()
        env.update(XDG_RUNTIME_DIR=str(runtime), XDG_CONFIG_HOME=str(config), WAYLAND_DISPLAY="goo-native-drop",
                   QT_QPA_PLATFORM="wayland", GDK_BACKEND="x11", GIO_USE_VFS="local", NO_AT_BRIDGE="0")
        flags = subprocess.check_output(["pkg-config", "--cflags", "--libs", "libei-1.0"], text=True).split()
        subprocess.run(["cc", "-O2", str(ROOT / "tests/Goo.AsyncReadbackSmoke/native-drop-input.c"), "-o", str(temporary / "input"), *flags], check=True)
        env["GOO_NATIVE_DROP_INPUT"] = str(temporary / "input")
        wrapper = temporary / "session"
        wrapper.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " " + shlex.quote(__file__) + " --session\n")
        wrapper.chmod(0o700)
        # Avoid the desktop's DISPLAY-derived accessibility socket.
        bus = subprocess.Popen(["dbus-daemon", "--config-file=/usr/share/defaults/at-spi2/accessibility.conf", "--nofork", "--print-address"], stdout=subprocess.PIPE, text=True)
        try:
            env["AT_SPI_BUS_ADDRESS"] = bus.stdout.readline().strip()
            assert env["AT_SPI_BUS_ADDRESS"].startswith("unix:")
            registry_parent = subprocess.Popen(["/usr/lib/at-spi2-registryd"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with (EVIDENCE / "compositor.log").open("w") as log:
                compositor = subprocess.Popen(["dbus-run-session", "--", "kwin_wayland", "--virtual", "--width", "1400", "--height", "900", "--scale", "1",
                    "--xwayland", "--no-global-shortcuts", "--no-lockscreen", "--no-kactivities", "--socket", "goo-native-drop",
                    "--exit-with-session", str(wrapper)], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try: result = compositor.wait(timeout=100)
                finally:
                    if compositor.poll() is None:
                        os.killpg(compositor.pid, signal.SIGTERM)
                        compositor.wait(timeout=10)
        finally:
            if (EVIDENCE / "processes.json").exists():
                for pid in json.loads((EVIDENCE / "processes.json").read_text()):
                    try:
                        cmdline = Path(f"/proc/{pid}/cmdline").read_bytes()
                        if b"Goo.AsyncReadbackSmoke.dll" in cmdline or str(EVIDENCE / 'files').encode() in cmdline:
                            os.killpg(pid, signal.SIGTERM)
                    except (FileNotFoundError, ProcessLookupError): pass
            if registry_parent.poll() is None:
                registry_parent.terminate()
                registry_parent.wait(timeout=5)
            bus.terminate()
            bus.wait(timeout=5)
    if not (EVIDENCE / "done").exists():
        raise RuntimeError("Native drop did not complete; see " + str(EVIDENCE / "compositor.log"))
    raise SystemExit(result)

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

EVIDENCE.mkdir(parents=True, exist_ok=True)
for name in ("ready", "hover.ready", "drop.ready", "done", "paths.txt", "target.txt"):
    (EVIDENCE / name).unlink(missing_ok=True)
files = EVIDENCE / "files"
files.mkdir(exist_ok=True)
names = ("01 attachment.txt", "02 日本語.txt")
for name in names:
    (files / name).write_text("Goo native file transfer fixture\n")

def inject(operation, a, b=0):
    injector.stdin.write(f"{operation} {a} {b}\n")
    injector.stdin.flush()
    assert injector.stdout.readline().strip() == "ok", "Isolated input client failed"
def motion(px, py): inject("m", px, py)
def button(pressed): inject("b", int(pressed))
def key(name, pressed): inject("k", {"Control_L": 29, "a": 30}[name], int(pressed))

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib
DBusGMainLoop(set_as_default=True)
session = dbus.SessionBus()
remote = dbus.Interface(session.get_object("org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop"), "org.kde.KWin.EIS.RemoteDesktop")
fd, cookie = remote.connectToEIS(3)
fd = fd.take()
injector = subprocess.Popen([os.environ["GOO_NATIVE_DROP_INPUT"], str(fd)], pass_fds=(fd,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
os.close(fd)
assert injector.stdout.readline().strip() == "ready", "Isolated EIS input failed"
class Geometry(dbus.service.Object):
    value = None
    @dbus.service.method("org.goo.TestGeometry", in_signature="s", out_signature="")
    def Report(self, value): self.value = json.loads(value)
geometry = Geometry(session, "/org/goo/TestGeometry")
def position_windows():
    geometry.value = None
    script = EVIDENCE / "place-windows.js"
    script.write_text("""const result = [];
for (const window of workspace.windowList()) {
    if (window.pid === """ + str(process.pid) + """) {
        window.frameGeometry = {x: 700, y: 80, width: window.frameGeometry.width, height: window.frameGeometry.height};
        const box = window.clientGeometry;
        result.push([box.x, box.y, box.width, box.height]);
    } else if (window.pid === """ + str(nemo.pid) + """) {
        window.frameGeometry = {x: 40, y: 80, width: window.frameGeometry.width, height: window.frameGeometry.height};
    }
}
callDBus(""" + json.dumps(session.get_unique_name()) + """, "/org/goo/TestGeometry", "org.goo.TestGeometry", "Report", JSON.stringify(result));""")
    scripting = dbus.Interface(session.get_object("org.kde.KWin", "/Scripting"), "org.kde.kwin.Scripting")
    ident = scripting.loadScript(str(script), "goo-drop-test", signature="ss")
    dbus.Interface(session.get_object("org.kde.KWin", "/Scripting/Script" + str(ident)), "org.kde.kwin.Script").run(reply_handler=lambda: None, error_handler=lambda error: print(error, flush=True))
    deadline = time.monotonic() + 5
    while geometry.value is None and time.monotonic() < deadline:
        GLib.MainContext.default().iteration(False)
        time.sleep(.01)
    scripting.unloadScript("goo-drop-test")
    assert geometry.value and len(geometry.value) == 1, geometry.value
    return geometry.value[0]

def wait_for(name, process, seconds=35):
    deadline = time.monotonic() + seconds
    while not (EVIDENCE / name).exists():
        if process.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError(f"Missing {name}; see {EVIDENCE / 'native.log'}")
        time.sleep(.05)

list_view_selected = False

def file_icons():
    global last_scan, list_view_selected
    desktop = Atspi.get_desktop(0)
    applications = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
    last_scan = [{"app": item.get_name(), "pid": item.get_process_id()} for item in applications]
    queue = [item for item in applications if nemo is not None and (item.get_process_id() == nemo.pid or item.get_name() == "nemo")]
    found, visited = {}, 0
    while queue and visited < 2000:
        item = queue.pop(0)
        visited += 1
        try:
            name = item.get_name()
            last_scan.append({"name": name, "role": item.get_role_name()})
            if name == "List View" and item.get_role_name() == "check menu item" and not list_view_selected:
                list_view_selected = item.get_action_iface().do_action(0)
                return {}
            if name in names:
                component = item.get_component_iface()
                bounds = component.get_extents(Atspi.CoordType.SCREEN) if component else item.get_image_iface().get_image_extents(Atspi.CoordType.SCREEN)
                last_scan.append({"bounds": [bounds.x, bounds.y, bounds.width, bounds.height]})
                if bounds.width > 0 and bounds.height > 0:
                    found[name] = (item, bounds)
            queue.extend(item.get_child_at_index(i) for i in range(item.get_child_count()))
        except Exception as error:
            last_scan.append({"error": str(error)})
            continue
    return found

def capture(process, phase):
    subprocess.run(["dotnet", str(ROOT / "tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll"),
                    "capture", "--pid", str(process.pid), "--output", str(EVIDENCE / f"{phase}.png")], check=True, timeout=30)

env = {k: v for k, v in os.environ.items() if not k.startswith("GOO_")}
env.update(GOO_NATIVE_DROP_SMOKE="1", GOO_NATIVE_DROP_PROOF=str(EVIDENCE), GOO_DEVTOOLS="1",
           SDL_VIDEODRIVER="wayland", SDL_LOGGING="input=trace", GDK_BACKEND="x11", NO_AT_BRIDGE="0", GIO_USE_VFS="local",
           GOO_VK_DIAGNOSTICS="1", GOO_VK_VALIDATION="1")
process = nemo = None
try:
    with (EVIDENCE / "native.log").open("w") as output, (EVIDENCE / "nemo.log").open("w") as nemo_output:
        process = subprocess.Popen(["dotnet", str(ROOT / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll")], env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        (EVIDENCE / "processes.json").write_text(json.dumps([process.pid]))
        wait_for("ready", process)
        capture(process, "before")
        nemo = subprocess.Popen(["nemo", "--no-desktop", "--geometry=500x520+40+80", str(files)], env=env, stdout=nemo_output, stderr=subprocess.STDOUT, start_new_session=True)
        (EVIDENCE / "processes.json").write_text(json.dumps([process.pid, nemo.pid]))
        deadline = time.monotonic() + 25
        icons = {}
        while len(icons) < 2 and time.monotonic() < deadline:
            icons = file_icons()
            time.sleep(.1)
        if len(icons) != 2:
            (EVIDENCE / "nemo-accessibility.json").write_text(json.dumps(last_scan, indent=2))
            raise AssertionError("Nemo did not expose both fixture file icons")
        client_x, client_y, client_w, client_h = position_windows()
        time.sleep(.3)
        icons = file_icons()
        bounds = icons[names[0]][1]
        sx, sy = bounds.x + min(24, bounds.width / 2), bounds.y + min(25, bounds.height / 2)
        motion(sx, sy)
        button(True)
        button(False)
        key("Control_L", True)
        key("a", True)
        key("a", False)
        key("Control_L", False)
        time.sleep(1)
        icons = file_icons()
        assert all(item.get_state_set().contains(Atspi.StateType.SELECTED) for item, bounds in icons.values()), "Nemo did not select both files"
        logical_w, logical_h, target_x, target_y = (float(v) for v in (EVIDENCE / "target.txt").read_text().splitlines())
        tx, ty = client_x + target_x * client_w / logical_w, client_y + target_y * client_h / logical_h
        (EVIDENCE / "coordinates.json").write_text(json.dumps({"client": [client_x, client_y, client_w, client_h], "source": [sx, sy], "target": [tx, ty]}))
        motion(sx, sy)
        button(True)
        time.sleep(.15)
        for step in range(1, 35):
            motion(sx + (tx - sx) * step / 34, sy + (ty - sy) * step / 34)
            time.sleep(.02)
        subprocess.run(["spectacle", "--background", "--nonotify", "--pointer", "--output", str(EVIDENCE / "nemo-drag.png")], timeout=15, check=True)
        wait_for("hover.ready", process, 10)
        capture(process, "preview")
        button(False)
        wait_for("drop.ready", process, 15)
        paths = (EVIDENCE / "paths.txt").read_text().splitlines()
        assert set(paths) == {str(files / name) for name in names}, paths
        capture(process, "after")
        (EVIDENCE / "done").write_text("1")
        assert process.wait(timeout=20) == 0, "Native close acceptance failed"
finally:
    if injector.poll() is None:
        button(False)
        injector.stdin.close()
        injector.wait(timeout=5)
    remote.disconnect(cookie)
    for child in (nemo, process):
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()

transcript = (EVIDENCE / "native.log").read_text()
assert "native-file-drop: external-files/preview/cancel/window-routing/disable/owned-paths/close=pass" in transcript
counters = [json.loads(line) for line in transcript.splitlines() if line.startswith('{"kind":"counters"')]
assert counters and all(counters[-1][key] == 0 for key in ("validationErrors", "fatalCode", "vulkanObjectCount", "vulkanDeviceMemoryBytes"))
print("native-file-drop: actual Nemo drag, preview/after captures, cancellation, routing, ownership, and clean native teardown passed")
