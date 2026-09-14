#!/usr/bin/env python3
"""Exercise the real SDL portal transport against an isolated D-Bus chooser service.
Run with /usr/bin/python3 (requires python3-dbus and python3-gi).
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "artifacts/issues-50-60/dialogs"
EVIDENCE.mkdir(parents=True, exist_ok=True)

if "--service" in sys.argv:
    import dbus
    import dbus.service
    from dbus.mainloop.glib import DBusGMainLoop
    from gi.repository import GLib
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    name = dbus.service.BusName("org.freedesktop.portal.Desktop", bus)
    requests = []
    records = []

    def record(value):
        records.append(value)
        (EVIDENCE / "requests.json").write_text(json.dumps(records, indent=2, ensure_ascii=False))

    class Request(dbus.service.Object):
        def __init__(self, path, title):
            super().__init__(bus, path)
            self.path, self.title = path, title

        @dbus.service.method("org.freedesktop.portal.Request", in_signature="", out_signature="")
        def Close(self):
            record({"closed": self.title, "path": self.path})
            # Close intentionally emits no Response. A late signal must be ignored.
            GLib.timeout_add(150, self.respond)

        @dbus.service.signal("org.freedesktop.portal.Request", signature="ua{sv}")
        def Response(self, response, results):
            pass

        def respond(self):
            code = 1 if self.title == "cancel" else 2 if self.title == "failed" else 0
            count = 4097 if self.title == "large" else 2 if self.title == "open" else 1
            uris = ["file:///tmp/one%20two"] + ["file:///tmp/caf%C3%A9"] * (count - 1)
            self.Response(dbus.UInt32(code), {"uris": dbus.Array(uris, signature="s")})
            return False

    class Portal(dbus.service.Object):
        @dbus.service.method("org.freedesktop.portal.FileChooser", in_signature="ssa{sv}", out_signature="o", sender_keyword="sender")
        def OpenFile(self, parent, title, options, sender=None):
            return self.show("OpenFile", parent, title, options, sender)

        @dbus.service.method("org.freedesktop.portal.FileChooser", in_signature="ssa{sv}", out_signature="o", sender_keyword="sender")
        def SaveFile(self, parent, title, options, sender=None):
            return self.show("SaveFile", parent, title, options, sender)

        def show(self, method, parent, title, options, sender):
            path = "/org/freedesktop/portal/desktop/request/" + sender[1:].replace(".", "_") + "/" + str(options["handle_token"])
            request = Request(path, str(title))
            requests.append(request)
            converted = {str(k): (bytes(v).decode().rstrip("\0") if str(k) in ("current_folder", "current_file") else v) for k, v in options.items()}
            record({"method": method, "parent": str(parent), "title": str(title), "options": converted})
            if title == "instant":
                request.respond()
            elif title not in ("cancel-api", "owner-close"):
                GLib.timeout_add(700, request.respond)
            return dbus.ObjectPath(path)

    portal = Portal(bus, "/org/freedesktop/portal/desktop")
    (EVIDENCE / "ready").write_text("ready")
    GLib.MainLoop().run()
elif "--session" in sys.argv:
    (EVIDENCE / "ready").unlink(missing_ok=True)
    with (EVIDENCE / "service.log").open("w") as service_log:
        service = subprocess.Popen([sys.executable, __file__, "--service"], stdout=service_log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if (EVIDENCE / "ready").exists():
                    break
                if service.poll() is not None:
                    raise RuntimeError("Isolated portal service failed")
                time.sleep(.05)
            env = dict(os.environ, GOO_FILE_DIALOG_SMOKE="portal", SDL_VIDEODRIVER="wayland",
                       GOO_VK_DIAGNOSTICS="1", GOO_VK_VALIDATION="1",
                       LD_LIBRARY_PATH=str(ROOT / "artifacts/native/dialogs"))
            with (EVIDENCE / "native.log").open("w") as log:
                result = subprocess.run(["dotnet", str(ROOT / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll")], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=90)
            transcript = (EVIDENCE / "native.log").read_text()
            if result.returncode or "file-dialog-native: complete=pass" not in transcript:
                raise RuntimeError("Native chooser acceptance failed; see " + str(EVIDENCE / "native.log"))
            records = json.loads((EVIDENCE / "requests.json").read_text())
            expected_parent = next(line.split(": ", 1)[1] for line in transcript.splitlines() if line.startswith("file-dialog-owner: "))
            assert expected_parent != "wayland:"
            requests = [r for r in records if "method" in r]
            assert len(requests) == 10 and all(r["parent"] == expected_parent for r in requests)
            assert {r["closed"] for r in records if "closed" in r} == {"cancel-api", "owner-close"}
            for r in requests:
                options = r["options"]
                assert options["modal"]
                if r["title"] == "open":
                    assert options["multiple"] and options["filters"] == [["Text", [[0, "*.txt"], [0, "*.md"]]], ["All files", [[0, "*"]]]]
                if r["title"] == "save":
                    assert r["method"] == "SaveFile" and options["current_name"] == "goo-dialog-suggested.txt"
                if r["title"] == "folder":
                    assert options["directory"] and "filters" not in options
            counters = [json.loads(line) for line in transcript.splitlines() if line.startswith('{"kind":"counters"')]
            assert counters and all(counters[-1][key] == 0 for key in ("validationErrors", "fatalCode", "vulkanObjectCount", "vulkanDeviceMemoryBytes"))
            print("file-dialog-native: ten portal requests, exact native owner, options, cancellation, late response, independent rendering/input, and cleanup passed")
        finally:
            service.terminate()
            service.wait(timeout=10)
else:
    subprocess.run(["dbus-run-session", "--", sys.executable, __file__, "--session"], check=True)
