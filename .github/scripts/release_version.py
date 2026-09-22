#!/usr/bin/env python3
import argparse
from pathlib import Path
import re
import xml.etree.ElementTree as element_tree

ROOT = Path(__file__).resolve().parents[2]
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$")
INLINE_VERSION = re.compile(r"\b0\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\b")
PLUGIN_PREREQUISITE_VERSION = re.compile(
    r"(and Goo\.DevTools )[^ ]+?(\. The server uses)"
)
PLUGIN_INSTALL_VERSION = re.compile(
    r"(Install the runtime CLI with `dotnet tool install --global Goo\.DevTools --version )"
    r"[^`]+(`\.)"
)
PLUGIN_RECOVERY_VERSION = re.compile(
    r"(Run `dotnet tool update --global Goo\.DevTools --version )"
    r"[^`]+(`\. Set GOO_CLI only when testing a compatible source build\.)"
)
PLUGIN_RUNTIME_VERSION = re.compile(
    r'("runtime": "Install Goo\.DevTools )[^" ]+( and launch with goo dev --project)'
)
LITERAL_VERSION_FILES = (
    "CONTRIBUTING.md",
    "README.md",
    "docs/nuget-readme.md",
    "apps/Goo.DevTools/DiagnosticWire.gs",
    "apps/Goo.DevTools/Program.gs",
    "apps/Goo.DevTools/README.md",
    "apps/Goo.Gallery/Program.gs",
    "docs/devtools/README.md",
    "docs/devtools/protocol.md",
    "integrations/rider/README.md",
    "integrations/vscode/README.md",
    "integrations/vscode/package.json",
    "templates/Goo.Templates/README.md",
    "tools/Goo.DevTools.Cli/CliApplication.cs",
    "tools/Goo.DevTools.Cli/ProtocolConnection.cs",
)


def fail(message: str) -> None:
    raise SystemExit(message)


def read_release_version() -> str:
    document = element_tree.parse(ROOT / "Directory.Build.props").getroot()
    version = document.findtext(".//GooReleaseVersion")
    if version is None or SEMVER.fullmatch(version) is None:
        fail("Directory.Build.props: GooReleaseVersion is missing or invalid")
    return version


def extract_release_notes(text: str, version: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(version)} - \d{{4}}-\d{{2}}-\d{{2}}[ \t]*$",
        re.MULTILINE,
    )
    entries = list(pattern.finditer(text))
    if not entries:
        fail(f"CHANGELOG.md: release entry for Goo {version} is missing")
    if len(entries) > 1:
        fail(f"CHANGELOG.md: duplicate release entries for Goo {version}")
    entry = entries[0]
    next_heading = re.search(r"^## ", text[entry.end():], re.MULTILINE)
    end = entry.end() + next_heading.start() if next_heading else len(text)
    if not text[entry.end():end].strip():
        fail(f"CHANGELOG.md: release entry for Goo {version} is empty")
    return text[entry.start():end].rstrip() + "\n"


def expected_literal_text(path: Path, version: str) -> str:
    text = path.read_text(encoding="utf-8")
    if INLINE_VERSION.search(text) is None:
        fail(f"{path.relative_to(ROOT)}: no synchronized release version found")
    text = INLINE_VERSION.sub(version, text)
    return re.sub(r"(?<=/releases/download/v)0\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?", version, text)


def expected_template_project(version: str) -> str:
    path = ROOT / "templates/Goo.Templates/content/GooStarter.gsproj"
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r'(<PackageReference Include="Goo" Version=")[^"]+(" />)')
    expected, count = pattern.subn(rf"\g<1>{version}\g<2>", text)
    if count != 1:
        fail(f"{path.relative_to(ROOT)}: expected one Goo PackageReference")
    return expected


def expected_template_config(version: str) -> str:
    path = ROOT / "templates/Goo.Templates/content/.template.config/template.json"
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r'("(?:defaultValue|replaces)": ")[^"]+("[,])')
    expected, count = pattern.subn(rf"\g<1>{version}\g<2>", text)
    if count != 2:
        fail(f"{path.relative_to(ROOT)}: expected two Goo version fields")
    return expected


def expected_plugin_readme(version: str) -> str:
    path = ROOT / "plugins/goo/README.md"
    text = path.read_text(encoding="utf-8")
    expected, prerequisite_count = PLUGIN_PREREQUISITE_VERSION.subn(rf"\g<1>{version}\g<2>", text)
    if prerequisite_count != 1:
        fail(f"{path.relative_to(ROOT)}: expected one current CLI prerequisite version")
    expected, install_count = PLUGIN_INSTALL_VERSION.subn(rf"\g<1>{version}\g<2>", expected)
    if install_count != 1:
        fail(f"{path.relative_to(ROOT)}: expected one current CLI install version")
    return expected


def expected_plugin_server(version: str) -> str:
    path = ROOT / "plugins/goo/scripts/server.py"
    text = path.read_text(encoding="utf-8")
    expected, runtime_count = PLUGIN_RUNTIME_VERSION.subn(rf"\g<1>{version}\g<2>", text)
    if runtime_count != 1:
        fail(f"{path.relative_to(ROOT)}: expected one current runtime version")
    expected, recovery_count = PLUGIN_RECOVERY_VERSION.subn(rf"\g<1>{version}\g<2>", expected)
    if recovery_count != 2:
        fail(f"{path.relative_to(ROOT)}: expected two current CLI recovery versions")
    return expected


def synchronized_files(version: str) -> dict[Path, str]:
    expected = {
        ROOT / relative: expected_literal_text(ROOT / relative, version)
        for relative in LITERAL_VERSION_FILES
    }
    template_project = ROOT / "templates/Goo.Templates/content/GooStarter.gsproj"
    template_config = ROOT / "templates/Goo.Templates/content/.template.config/template.json"
    expected[template_project] = expected_template_project(version)
    expected[template_config] = expected_template_config(version)
    expected[ROOT / "plugins/goo/README.md"] = expected_plugin_readme(version)
    expected[ROOT / "plugins/goo/scripts/server.py"] = expected_plugin_server(version)
    return expected


def check(version: str) -> None:
    stale = [
        str(path.relative_to(ROOT))
        for path, expected in synchronized_files(version).items()
        if path.read_text(encoding="utf-8") != expected
    ]
    if stale:
        fail("release version is stale in:\n" + "\n".join(stale))


def write(version: str) -> None:
    for path, expected in synchronized_files(version).items():
        if path.read_text(encoding="utf-8") != expected:
            path.write_text(expected, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--print", action="store_true", dest="print_version")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--notes", action="store_true")
    args = parser.parse_args()
    release_version = read_release_version()
    if args.notes:
        notes = extract_release_notes(
            (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"),
            release_version,
        )
        print(notes, end="")
    elif args.print_version:
        print(release_version)
    elif args.write:
        write(release_version)
        check(release_version)
        print(f"Synchronized Goo {release_version}")
    else:
        check(release_version)
        print(f"Release version OK: Goo {release_version}")


if __name__ == "__main__":
    main()
