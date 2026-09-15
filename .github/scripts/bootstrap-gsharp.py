#!/usr/bin/env python3
import argparse
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

COMMIT = "947be9cb5f4467947ecb95dba06b461f9984d659"


def bootstrap(destination):
    destination = Path(destination).resolve()
    if (destination / "commit").exists() and (destination / "commit").read_text().strip() == COMMIT:
        if all((destination / path).is_file() for path in ["compiler/gsc.dll", "formatter/gsfmt.dll"]):
            return
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gsharp-authoring-") as temporary:
        temporary = Path(temporary)
        archive = temporary / "source.tar.gz"
        urllib.request.urlretrieve(f"https://api.github.com/repos/DavidObando/gsharp/tarball/{COMMIT}", archive)
        with tarfile.open(archive) as bundle:
            bundle.extractall(temporary / "source", filter="data")
        source = next((temporary / "source").iterdir())
        for project, output in [("src/Compiler/Compiler.csproj", "compiler"),
                                ("src/Formatting/Gsfmt.Cli/Gsfmt.Cli.csproj", "formatter")]:
            subprocess.run(["dotnet", "publish", project, "-c", "Release", "--nologo", "-o", str(destination / output)], cwd=source, check=True)
        shutil.copy2(source / "LICENSE", destination / "LICENSE")
    (destination / "commit").write_text(COMMIT + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the pinned upstream G# compiler and formatter for ADR-0180.")
    parser.add_argument("destination", type=Path)
    bootstrap(parser.parse_args().destination)
