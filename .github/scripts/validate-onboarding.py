#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as element_tree

from release_version import check as check_release_version
from release_version import read_release_version

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PACKAGE_IDS = {
    "Goo",
    "Goo.Android",
    "Goo.DevTools",
    "Goo.DevTools.App",
    "Goo.Svg",
    "Goo.SvgCompiler",
    "Goo.Templates",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return [item.decode() for item in result.stdout.split(b"\0") if item]


def markdown_prose(text: str) -> str:
    lines: list[str] = []
    fenced = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if not fenced:
            lines.append(line)
    return "\n".join(lines)


def project_versions(version: str, files: list[str]) -> None:
    package_ids: set[str] = set()
    for relative in files:
        if not relative.endswith((".csproj", ".gsproj")):
            continue
        root = element_tree.parse(ROOT / relative).getroot()
        package_id = root.findtext(".//PackageId")
        project_version = root.findtext(".//Version")
        if package_id and package_id.startswith("Goo"):
            package_ids.add(package_id)
            if project_version != "$(GooReleaseVersion)":
                fail(f"{relative}: package version must use $(GooReleaseVersion)")
        for reference in root.findall(".//PackageReference"):
            if reference.get("Include") != "Goo":
                continue
            standalone_template = (
                relative.startswith("templates/Goo.Templates/content/")
                or relative.startswith("plugins/goo/reference/templates/Goo.Templates/content/")
            )
            expected = version if standalone_template else "$(GooReleaseVersion)"
            if reference.get("Version") != expected:
                fail(f"{relative}: Goo reference is {reference.get('Version')}, expected {expected}")
    if package_ids != EXPECTED_PACKAGE_IDS:
        fail(f"Goo package IDs differ: found={sorted(package_ids)} expected={sorted(EXPECTED_PACKAGE_IDS)}")


def template_version(version: str) -> None:
    path = ROOT / "templates/Goo.Templates/content/.template.config/template.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    symbol = document["symbols"]["goo-version"]
    if symbol.get("defaultValue") != version or symbol.get("replaces") != version:
        fail(f"{path.relative_to(ROOT)}: template Goo version must be {version}")


def release_text(version: str) -> None:
    check_release_version(version)
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    if not re.search(rf"^## {re.escape(version)} - \d{{4}}-\d{{2}}-\d{{2}}$", changelog, re.MULTILINE):
        fail(f"CHANGELOG.md: release heading for {version} is missing")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    required = {
        f"dotnet new install Goo.Templates@{version}",
        "Windows x64 is tested on Windows 11",
        "minimum supported Windows version is not yet established",
        "## Further reading",
    }
    missing = sorted(item for item in required if item not in readme)
    if missing:
        fail(f"README.md: required onboarding text is missing: {missing}")
    if "Windows requires Windows 11" in readme:
        fail("README.md: Windows 11 must be a tested environment, not a minimum requirement")
    nuget_readme = (ROOT / "docs/nuget-readme.md").read_text(encoding="utf-8")
    nuget_readme_prose = markdown_prose(nuget_readme)
    relative_links = [
        target for target in re.findall(r"!?\[[^\]\n]*\]\(([^)\n]+)\)", nuget_readme_prose)
        if not target.startswith(("#", "http://", "https://"))
    ]
    relative_html = [
        target for target in re.findall(r"(?:href|src)=\"([^\"]+)\"", nuget_readme_prose)
        if not target.startswith(("#", "http://", "https://"))
    ]
    if relative_links or relative_html:
        fail(f"docs/nuget-readme.md: NuGet cannot resolve relative links: {relative_links + relative_html}")


def markdown_links(files: list[str]) -> None:
    failures: list[str] = []
    pattern = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")
    for relative in files:
        if not relative.endswith(".md") or relative.startswith(("vendor/", "plugins/goo/reference/")):
            continue
        path = ROOT / relative
        text = markdown_prose(path.read_text(encoding="utf-8"))
        for target in pattern.findall(text):
            target = target.strip().split(maxsplit=1)[0].strip("<>")
            if not target or target.startswith(("#", "http://", "https://", "mailto:")):
                continue
            local = target.split("#", 1)[0]
            destination = (path.parent / local).resolve()
            if not destination.is_relative_to(ROOT):
                failures.append(f"{relative}: {target} resolves outside the repository")
            elif not destination.exists():
                failures.append(f"{relative}: {target}")
    if failures:
        fail("broken local Markdown links:\n" + "\n".join(failures))


version = read_release_version()
tracked = tracked_files()
project_versions(version, tracked)
template_version(version)
release_text(version)
markdown_links(tracked)
print(f"Onboarding metadata OK: Goo {version}, {len(EXPECTED_PACKAGE_IDS)} packages")
