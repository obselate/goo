#!/usr/bin/env python3
"""Exercise native accessibility with AT-SPI and Orca in an isolated compositor.

Requires AT-SPI introspection, KWin, Xwayland, and an Orca installation.
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
EVIDENCE = ROOT / "artifacts/issues-50-60/native-accessibility"
if "--session" not in sys.argv:
    env = dict(os.environ)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "processes.json").unlink(missing_ok=True)
    # Both windows and test input live in a private compositor/session/runtime.
    with tempfile.TemporaryDirectory(prefix="goo-native-accessibility-") as temporary:
        temporary = Path(temporary)
        runtime = temporary / "runtime"
        runtime.mkdir(mode=0o700)
        config = temporary / "config"
        config.mkdir()
        env.update(XDG_RUNTIME_DIR=str(runtime), XDG_CONFIG_HOME=str(config), WAYLAND_DISPLAY="goo-native-accessibility",
                   QT_QPA_PLATFORM="wayland", GDK_BACKEND="x11", GIO_USE_VFS="local", NO_AT_BRIDGE="0")
        flags = subprocess.check_output(["pkg-config", "--cflags", "--libs", "libei-1.0"], text=True).split()
        subprocess.run(["cc", "-O2", str(ROOT / "tests/Goo.AsyncReadbackSmoke/native-drop-input.c"), "-o", str(temporary / "input"), *flags], check=True)
        env["GOO_NATIVE_ACCESSIBILITY_INPUT"] = str(temporary / "input")
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
                    "--xwayland", "--no-global-shortcuts", "--no-lockscreen", "--no-kactivities", "--socket", "goo-native-accessibility",
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
                        if b"Goo.AsyncReadbackSmoke.dll" in cmdline or b"orca" in cmdline:
                            os.killpg(pid, signal.SIGTERM)
                    except (FileNotFoundError, ProcessLookupError): pass
            if registry_parent.poll() is None:
                registry_parent.terminate()
                registry_parent.wait(timeout=5)
            bus.terminate()
            bus.wait(timeout=5)
    if not (EVIDENCE / "done").exists():
        raise RuntimeError("Native accessibility did not complete; see " + str(EVIDENCE / "compositor.log"))
    raise SystemExit(result)

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib

EVIDENCE.mkdir(parents=True, exist_ok=True)
for name in ("ready", "clicked", "selected", "edited", "remove", "done"):
    (EVIDENCE / name).unlink(missing_ok=True)
# A virtual KWin session needs a keyboard/pointer seat before SDL initializes.
import dbus
from dbus.mainloop.glib import DBusGMainLoop
DBusGMainLoop(set_as_default=True)
session = dbus.SessionBus()
status = dbus.Interface(session.get_object("org.a11y.Bus", "/org/a11y/bus"), "org.freedesktop.DBus.Properties")
status.Set("org.a11y.Status", "IsEnabled", dbus.Boolean(True))
status.Set("org.a11y.Status", "ScreenReaderEnabled", dbus.Boolean(True))
remote = dbus.Interface(session.get_object("org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop"), "org.kde.KWin.EIS.RemoteDesktop")
fd, cookie = remote.connectToEIS(3)
fd = fd.take()
injector = subprocess.Popen([os.environ["GOO_NATIVE_ACCESSIBILITY_INPUT"], str(fd)], pass_fds=(fd,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
os.close(fd)
assert injector.stdout.readline().strip() == "ready", "Isolated input seat failed"
cache_signatures = []
cache_bus = dbus.bus.BusConnection(os.environ["AT_SPI_BUS_ADDRESS"])
def on_cache(*args, message=None):
    if process is None: return
    try:
        daemon = dbus.Interface(cache_bus.get_object("org.freedesktop.DBus", "/org/freedesktop/DBus"), "org.freedesktop.DBus")
        if int(daemon.GetConnectionUnixProcessID(message.get_sender())) != process.pid: return
    except dbus.DBusException: return
    cache_signatures.append((message.get_member(), str(message.get_signature())))
cache_bus.add_signal_receiver(on_cache, dbus_interface="org.a11y.atspi.Cache", message_keyword="message")
events = []
def on_event(event):
    try: events.append({"type": event.type, "name": event.source.get_name(), "detail1": event.detail1, "detail2": event.detail2})
    except Exception: pass
listener = Atspi.EventListener.new(on_event)
for kind in ("object:state-changed:focused", "object:state-changed:selected", "object:children-changed", "object:text-selection-changed", "object:text-changed"):
    listener.register(kind)

def pump():
    for _ in range(30):
        if not GLib.MainContext.default().iteration(False): break

def wait_until(predicate, message, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None: raise RuntimeError("Native test stopped (" + str(process.returncode) + "): " + (EVIDENCE / "native.log").read_text()[-3000:])
        pump()
        result = predicate()
        if result: return result
        time.sleep(.05)
    raise AssertionError(message)

def wait_file(name):
    wait_until(lambda: (EVIDENCE / name).exists(), "Missing native signal " + name)

def application():
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app.get_process_id() == process.pid: return app
    return None

def tree():
    app = application()
    if app is None: return []
    queue, nodes = [app], []
    while queue and len(nodes) < 200:
        item = queue.pop(0)
        if item is None: continue
        try:
            nodes.append(item)
            queue.extend(item.get_child_at_index(i) for i in range(item.get_child_count()))
        except Exception: continue
    return nodes

def find(name):
    for item in tree():
        try:
            if item.get_name() == name: return item
        except GLib.GError: continue
    return None

def record(name):
    result = []
    for item in tree():
        states = item.get_state_set().get_states()
        value = {"name": item.get_name(), "role": item.get_role_name(), "states": [str(s.value_nick) for s in states]}
        try:
            component = item.get_component_iface()
            if component:
                bounds = component.get_extents(Atspi.CoordType.WINDOW)
                value["bounds"] = [bounds.x, bounds.y, bounds.width, bounds.height]
            text = item.get_text_iface()
            if text: value["text"] = Atspi.Text.get_text(text, 0, -1)
        except Exception as error: value["query_error"] = str(error)
        result.append(value)
    (EVIDENCE / (name + ".json")).write_text(json.dumps(result, indent=2, ensure_ascii=False))

def activate(item):
    action = item.get_action_iface()
    assert action and action.get_n_actions() > 0, item.get_name()
    actions = [Atspi.Action.get_action_name(action, i) for i in range(action.get_n_actions())]
    index = next((i for i, name in enumerate(actions) if name in ("click", "press", "activate")), 0)
    assert action.do_action(index), (item.get_name(), actions)

def capture(phase):
    subprocess.run(["dotnet", str(ROOT / "tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll"),
                    "capture", "--pid", str(process.pid), "--output", str(EVIDENCE / (phase + ".png"))], check=True, timeout=30)

env = {k: v for k, v in os.environ.items() if not k.startswith("GOO_")}
env.update(GOO_NATIVE_ACCESSIBILITY_SMOKE="1", GOO_NATIVE_ACCESSIBILITY_PROOF=str(EVIDENCE),
           GOO_DEVTOOLS="1", SDL_VIDEODRIVER="wayland", GOO_VK_DIAGNOSTICS="1", GOO_VK_VALIDATION="1",
           GSETTINGS_BACKEND="memory", GDK_BACKEND="wayland")
orcaroot = ROOT / "artifacts/issues-50-60/accesskit/orca/usr"
if orcaroot.exists():
    env.update(PYTHONPATH=str(orcaroot / "lib/python3.14/site-packages"),
               GI_TYPELIB_PATH=str(orcaroot / "lib/girepository-1.0"),
               XDG_DATA_DIRS=str(orcaroot / "share") + ":/usr/share",
               LD_LIBRARY_PATH=str(orcaroot / "lib"),
               GSETTINGS_SCHEMA_DIR=str(orcaroot / "share/glib-2.0/schemas"))
    subprocess.run(["glib-compile-schemas", env["GSETTINGS_SCHEMA_DIR"]], check=True)
    orca_command = ["/usr/bin/python3", str(orcaroot / "bin/orca")]
else: orca_command = ["orca"]
process = orca = speech = None
try:
    with (EVIDENCE / "native.log").open("w") as output, (EVIDENCE / "orca.log").open("w") as orca_log, (EVIDENCE / "speech.log").open("w") as speech_log:
        # The dummy module captures speech requests without playing audio on the user's desktop.
        config = Path(env["XDG_CONFIG_HOME"]) / "speech-dispatcher"
        config.mkdir()
        (config / "speechd.conf").write_text('AddModule "dummy" "sd_dummy"\nDefaultModule dummy\nLogLevel 5\n')
        socket = str(Path(env["XDG_RUNTIME_DIR"]) / "speech.sock")
        env["SPEECHD_ADDRESS"] = "unix_socket:" + socket
        speech = subprocess.Popen(["speech-dispatcher", "-s", "-C", str(config), "-S", socket, "-P", str(config / "pid"), "-L", str(config), "-t", "0"], env=env, stdout=speech_log, stderr=subprocess.STDOUT)
        orca = subprocess.Popen([*orca_command, "--debug-file", str(EVIDENCE / "orca-debug.log")], env=env, stdout=orca_log, stderr=subprocess.STDOUT, start_new_session=True)
        process = subprocess.Popen(["dotnet", str(ROOT / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll")], env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        (EVIDENCE / "processes.json").write_text(json.dumps([process.pid] + ([orca.pid] if orca else [])))
        wait_file("ready")
        wait_until(application, "Goo did not register with AT-SPI")
        editor = wait_until(lambda: find("Message"), "Editor labelled-by relation is missing")
        # Label and editor share a name; choose the editable object.
        editor = wait_until(lambda: next((item for item in tree() if item.get_editable_text_iface()), None), "Editor has no editable-text interface")
        assert editor.get_name() == "Message", editor.get_name()
        text = editor.get_text_iface()
        assert Atspi.Text.get_text(text, 0, -1) == "Hello 😀 world\nSecond line"
        assert editor.get_component_iface().grab_focus()
        assert Atspi.Text.add_selection(text, 6, 7)
        wait_file("selected")
        selected = Atspi.Text.get_selection(text, 0)
        assert (selected.start_offset, selected.end_offset) == (6, 7), selected
        assert Atspi.Text.get_caret_offset(text) == 7
        bounds = Atspi.Text.get_character_extents(text, 6, Atspi.CoordType.WINDOW)
        assert bounds.width > 0 and bounds.height > 0, bounds
        record("initial")
        capture("before")
        button = find("Save message")
        assert button and button.get_component_iface().grab_focus()
        activate(button)
        wait_file("clicked")
        row = find("Selected conversation")
        assert row and row.get_state_set().contains(Atspi.StateType.SELECTED)
        selection = find("Conversations").get_selection_iface()
        assert selection and Atspi.Selection.deselect_child(selection, 0)
        wait_until(lambda: not row.get_state_set().contains(Atspi.StateType.SELECTED), "Native row deselection did not update state")
        assert Atspi.Selection.select_child(selection, 0)
        wait_until(lambda: row.get_state_set().contains(Atspi.StateType.SELECTED), "Native row selection did not update state")
        assert editor.get_editable_text_iface().set_text_contents("Updated 😀 text")
        wait_file("edited")
        wait_until(lambda: Atspi.Text.get_text(text, 0, -1) == "Updated 😀 text", "Native editor value did not update")
        activate(find("Open dialog"))
        dialog = wait_until(lambda: find("Review message"), "Native modal dialog is missing")
        assert dialog.get_state_set().contains(Atspi.StateType.MODAL)
        assert find("Save message") is None, "Hidden modal background remained accessible"
        record("modal")
        capture("modal")
        close = find("Close dialog")
        assert close.get_component_iface().grab_focus()
        activate(close)
        wait_until(lambda: find("Save message"), "Dialog close did not restore the background tree")
        (EVIDENCE / "remove").touch()
        wait_until(lambda: find("Selected conversation") is None, "Removed row remained in native tree")
        record("after")
        capture("after")
        wait_until(lambda: (EVIDENCE / "orca-debug.log").exists() and "SPEECH OUTPUT: 'Save message'" in (EVIDENCE / "orca-debug.log").read_text(), "Orca did not speak the button name")
        assert orca.poll() is None, (EVIDENCE / "orca.log").read_text()
        (EVIDENCE / "events.json").write_text(json.dumps(events, indent=2))
        (EVIDENCE / "cache-signatures.json").write_text(json.dumps(cache_signatures, indent=2))
        assert ("AddAccessible", "((so)(so)(so)iiassusau)") in cache_signatures, cache_signatures
        assert ("RemoveAccessible", "(so)") in cache_signatures, cache_signatures
        assert all(signature == ("(so)" if member == "RemoveAccessible" else "((so)(so)(so)iiassusau)") for member, signature in cache_signatures), cache_signatures
        assert any("text-selection-changed" in event["type"] for event in events), events
        (EVIDENCE / "done").touch()
        assert process.wait(timeout=20) == 0, "Native fixture failed cleanup"
        print("native-accessibility: AT-SPI, Unicode text/selection, actions, modal, removal, Orca and cleanup passed", flush=True)
finally:
    for child in (process, orca):
        if child and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=5)
    if injector.poll() is None:
        injector.terminate()
        injector.wait(timeout=5)
    if speech and speech.poll() is None:
        speech.terminate()
        speech.wait(timeout=5)
