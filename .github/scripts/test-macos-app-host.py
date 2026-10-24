import os
from pathlib import Path
import plistlib
import signal
import subprocess
import sys
import time
import uuid

publish = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
session = root / "session"
session.mkdir()
identity = "org.goo.host." + uuid.uuid4().hex
scheme = "goo-host-" + uuid.uuid4().hex
extension = "goohost" + uuid.uuid4().hex
app = root / "Goo.AppHostSmoke.app"
plist = plistlib.loads(Path("tests/Goo.PackageSmoke/Info.plist").read_bytes())
plist.update(CFBundleIdentifier=identity, CFBundleExecutable="Goo.AppHostSmoke",
             CFBundleName="Goo.AppHostSmoke", CFBundleDisplayName="Goo AppHost Smoke")
plist["CFBundleURLTypes"] = [{"CFBundleURLName": identity, "CFBundleURLSchemes": [scheme]}]
plist["CFBundleDocumentTypes"][0]["LSItemContentTypes"] = [identity + ".document"]
plist["UTExportedTypeDeclarations"][0].update(
    UTTypeIdentifier=identity + ".document",
    UTTypeTagSpecification={"public.filename-extension": [extension]},
)
plist_path = root / "Info.plist"
plist_path.write_bytes(plistlib.dumps(plist))
subprocess.run(["bash", ".github/scripts/stage-macos-arm64.sh", str(publish), str(app),
                str(root / "symbols"), "Goo.AppHostSmoke", str(plist_path)], check=True, timeout=60)
one = root / ("one document." + extension)
two = root / ("two document." + extension)
one.write_text("one", encoding="utf-8")
two.write_text("two", encoding="utf-8")


def wait_for(name):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if (session / "error").exists():
            raise RuntimeError((session / "error").read_text(encoding="utf-8"))
        path = session / name
        if path.exists():
            return path
        time.sleep(0.02)
    raise TimeoutError(name)


def launch(targets, fresh=False):
    args = ["open"] + (["-n"] if fresh else []) + ["-a", str(app), *targets]
    if fresh:
        args += ["--args", "activated", identity, "--output=" + str(session)]
    subprocess.run(args, check=True, timeout=15)


def observed(index, kind, initial, target):
    expected = [kind, "initial" if initial else "warm", target]
    actual = wait_for(f"{index}.event").read_text(encoding="utf-8").splitlines()
    if actual != expected:
        raise RuntimeError(f"Native instance activation changed: {actual}")


try:
    launch([scheme + "://cold/route"], fresh=True)
    observed(1, "OpenUri", True, scheme + "://cold/route")
    launch([scheme + "://warm/route"])
    observed(2, "OpenUri", False, scheme + "://warm/route")
    forwarded = []
    for index in (3, 4):
        target = scheme + "://forwarded/" + ("one" if index == 3 else "two")
        launch([target], fresh=True)
        event = wait_for(f"{index}.event").read_text(encoding="utf-8").splitlines()
        if event[:2] != ["OpenUri", "warm"]:
            raise RuntimeError(f"Forwarded native activation changed: {event}")
        forwarded.append(event[2])
    if sorted(forwarded) != [scheme + "://forwarded/one", scheme + "://forwarded/two"]:
        raise RuntimeError(f"Forwarded URI batch changed: {forwarded}")
    launch([str(one), str(two)])
    observed(5, "OpenDocuments", False, str(one))
    documents = wait_for("5.documents").read_text(encoding="utf-8").splitlines()
    if documents != [one.as_uri(), two.as_uri()]:
        raise RuntimeError(f"Native document batch changed: {documents}")
    (session / "stop").touch()
    wait_for("exited")
    for path in session.iterdir():
        path.unlink()
    launch([str(one), str(two)], fresh=True)
    observed(1, "OpenDocuments", True, str(one))
    documents = wait_for("1.documents").read_text(encoding="utf-8").splitlines()
    if documents != [one.as_uri(), two.as_uri()]:
        raise RuntimeError(f"Cold document batch changed: {documents}")
    (session / "stop").touch()
    wait_for("exited")
    print("macOS app-host: cold/warm URI, forced new-instance forwarding and cold/warm document batches passed")
finally:
    (session / "stop").touch()
    pid_path = session / "pid"
    if not (session / "exited").exists() and pid_path.exists():
        pid = int(pid_path.read_text(encoding="utf-8"))
        command = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                                 capture_output=True, text=True, check=False).stdout
        if str(app / "Contents/MacOS/Goo.AppHostSmoke") in command and str(session) in command:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
