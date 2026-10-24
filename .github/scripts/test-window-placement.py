from pathlib import Path
import subprocess
import sys

program = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
command = ["dotnet", str(program)] if program.suffix == ".dll" else [str(program)]
for state in ("normal", "max", "full"):
    subprocess.run(command + ["placement", "native", "--output=" + str(root), state],
                   check=True, timeout=60)
