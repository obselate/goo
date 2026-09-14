#!/usr/bin/env python3
"""Validate the optional AccessKit package's pinned native payloads and Linux ABI."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from zipfile import ZipFile

package = Path(sys.argv[1])
with ZipFile(package) as archive:
    manifest = json.loads(archive.read("native-build.json"))
    assert manifest["accesskit_c"] == "0.23.0", "Unexpected AccessKit C ABI"
    payloads = set()
    for source, expected in manifest["sha256"].items():
        _, rid, filename = source.split("/")
        entry = f"runtimes/{rid}/native/{filename}"
        value = archive.read(entry)
        assert hashlib.sha256(value).hexdigest() == expected, entry
        payloads.add(entry)
        if rid == "linux-x64":
            with tempfile.TemporaryDirectory(prefix="goo-accesskit-abi-") as temporary:
                binary = Path(temporary) / filename
                binary.write_bytes(value)
                symbols = subprocess.check_output(["readelf", "--version-info", str(binary)], text=True)
                versions = [tuple(map(int, version.split("."))) for version in re.findall(r"GLIBC_([0-9.]+)", symbols)]
                assert max(versions) <= (2, 27), max(versions)
    actual = {name for name in archive.namelist() if name.startswith("runtimes/")}
    assert payloads == actual, (payloads, actual)
    assert not any(name.startswith("lib/") for name in archive.namelist()), "The runtime package must remain native-only"
    assert {"LICENSE-MIT", "LICENSE-APACHE", "README.md"}.issubset(archive.namelist())
print(f"{package.name}: five pinned native payloads, licenses, and glibc baseline passed")
