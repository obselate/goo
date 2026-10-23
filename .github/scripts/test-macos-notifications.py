from pathlib import Path
import plistlib
import subprocess
import sys

publish = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
executable = "Goo.Notifications.Smoke"
subprocess.run([str(publish / executable), "missing"], check=True, timeout=40)
plist = plistlib.loads(Path("tests/Goo.PackageSmoke/Info.plist").read_bytes())
plist.update(CFBundleIdentifier="org.goo.notifications.smoke", CFBundleExecutable=executable,
             CFBundleName=executable, CFBundleDisplayName="Goo notification smoke")
for key in ("CFBundleURLTypes", "CFBundleDocumentTypes", "UTExportedTypeDeclarations"):
    plist.pop(key, None)
plist_path = root / "Info.plist"
plist_path.write_bytes(plistlib.dumps(plist))
app = root / (executable + ".app")
subprocess.run(["bash", ".github/scripts/stage-macos-arm64.sh", str(publish), str(app),
                str(root / "symbols"), executable, str(plist_path)], check=True, timeout=60)
subprocess.run([str(app / "Contents/MacOS" / executable), "macos"], check=True, timeout=100)
print("macOS notifications: missing identity and native permission, completion, presence and removal checks passed")
