import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path


def command_text(name, args):
    result = subprocess.run([name, *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
    return result.stdout.splitlines()[0].strip()


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def linux_symbols(path):
    result = subprocess.run(["readelf", "--dyn-syms", "--wide", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = set()
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 8 or fields[-2] == "UND":
            continue
        name = fields[-1].split("@", 1)[0]
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            values.add(name)
    return sorted(values)


def linux_needed(path):
    result = subprocess.run(["readelf", "--dynamic", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return sorted(set(re.findall(r"Shared library: \[([^]]+)\]", result.stdout)))


def linux_dynamic_paths(path):
    result = subprocess.run(["readelf", "--dynamic", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = {"rpath": [], "runpath": []}
    for line in result.stdout.splitlines():
        for name, marker in (("rpath", "Library rpath:"), ("runpath", "Library runpath:")):
            if marker in line:
                match = re.search(r"\[([^]]*)\]", line)
                if match is None:
                    raise SystemExit(f"{path.name} has malformed {name}")
                values[name] = [item for item in match.group(1).split(":") if item]
    return values


def linux_format(path):
    result = subprocess.run(["file", "-b", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return result.stdout.strip()


def linux_glibc_versions(path):
    result = subprocess.run(["readelf", "--version-info", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = set(re.findall(r"GLIBC_([0-9]+(?:\.[0-9]+)+)", result.stdout))
    return sorted(values, key=lambda value: tuple(int(item) for item in value.split(".")))


def normalize_environment_value(name, value):
    if name in ("CFLAGS", "CXXFLAGS"):
        return re.sub(r"-ffile-prefix-map=[^ ]+=\.", "-ffile-prefix-map=<temporary-source-root>=.", value)
    return value


def verify_source_patches(manifest, manifest_path):
    patches = manifest.get("build", {}).get("sourcePatches")
    if not isinstance(patches, list) or len(patches) != 1:
        raise SystemExit("expected one HarfBuzz source patch")
    repo_root = manifest_path.resolve().parents[2]
    for patch in patches:
        path = repo_root / patch["path"]
        if not path.is_file():
            raise SystemExit(f"source patch missing: {path}")
        if sha256(path) != patch["sha256"]:
            raise SystemExit(f"source patch SHA-256 drift: {path}")


def verify_environment(manifest, target):
    expected = manifest["build"]["environments"].get(target)
    if expected is None:
        raise SystemExit(f"missing target environment: {target}")
    for name, value in expected.items():
        actual = os.environ.get(name)
        if actual is None or normalize_environment_value(name, actual) != value:
            raise SystemExit(f"{target} environment drift for {name}")
    return dict(expected)


def windows_symbols(path, tool_prefix):
    result = subprocess.run([f"{tool_prefix}-objdump", "-p", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = set()
    active = False
    for line in result.stdout.splitlines():
        if "[Ordinal/Name Pointer] Table" in line:
            active = True
            continue
        if active:
            match = re.search(r"(?:\]\s+\+base\[\s*\d+\]\s+[0-9a-fA-F]+|\[\s*\d+\])\s+([A-Za-z_][A-Za-z0-9_]*)\s*$", line)
            if match:
                values.add(match.group(1).lstrip("_"))
            elif line.strip() and not line[0].isspace():
                active = False
    return sorted(values)


def windows_needed(path, tool_prefix):
    result = subprocess.run([f"{tool_prefix}-objdump", "-p", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return sorted(set(re.findall(r"DLL Name: ([^\n]+)", result.stdout)))


def windows_format(path, tool_prefix):
    result = subprocess.run([f"{tool_prefix}-objdump", "-f", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    if "file format pei-x86-64" not in result.stdout:
        raise SystemExit(f"{path.name} is not PE32+ x86-64")
    return "PE32+ x86-64"


def windows_image_name(path, tool_prefix):
    result = subprocess.run([f"{tool_prefix}-objdump", "-p", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    match = re.search(r"^\s*Name\s+[0-9a-fA-F]+\s+([^\s]+)\s*$", result.stdout, re.MULTILINE)
    if match is None:
        raise SystemExit(f"{path.name} has no PE image name")
    return match.group(1)


def macos_symbols(path):
    result = subprocess.run(["nm", "-gUj", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return sorted({line.strip().removeprefix("_") for line in result.stdout.splitlines() if line.strip()})


def macos_needed(path):
    result = subprocess.run(["otool", "-L", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = []
    for line in result.stdout.splitlines()[1:]:
        value = line.strip().split(" (", 1)[0]
        if value:
            values.append(value)
    return sorted(set(values))


def macos_format(path):
    result = subprocess.run(["file", "-b", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return result.stdout.strip()


def macos_architectures(path):
    result = subprocess.run(["lipo", "-archs", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    return sorted(result.stdout.split())


def macos_install_name(path):
    result = subprocess.run(["otool", "-D", str(path)], check=True, stdout=subprocess.PIPE, universal_newlines=True)
    values = [line.strip() for line in result.stdout.splitlines()[1:] if line.strip()]
    if len(values) != 1:
        raise SystemExit(f"{path.name} has no unique Mach-O install name")
    return values[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--target", required=True, choices=("linux-x64", "osx-arm64", "win-x64", "android-arm64", "android-x64"))
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--artifact", required=True, action="append", metavar="NAME=PATH")
    parser.add_argument("--tool-prefix", default="")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    verify_source_patches(manifest, args.manifest)
    environment = verify_environment(manifest, args.target)
    artifacts = {}
    prefixes = {
        "harfbuzz": ("hb_",),
        "gpu": ("hb_gpu_",),
    }
    for spec in args.artifact:
        name, separator, value = spec.partition("=")
        if separator == "" or name not in manifest["outputs"][args.target]:
            raise SystemExit(f"invalid artifact: {spec}")
        path = Path(value)
        if path.name != manifest["outputs"][args.target][name]:
            raise SystemExit(f"{name} output name drift")
        if args.target == "linux-x64":
            symbols = linux_symbols(path)
            needed = linux_needed(path)
            dynamic_paths = linux_dynamic_paths(path)
            image_format = linux_format(path)
            linux_policy = manifest["build"]["linux"]
            required_format = linux_policy["requiredFormat"]
            if required_format not in image_format:
                raise SystemExit(f"{path.name} format drift: {image_format}")
            if needed != sorted(linux_policy["requiredNeeded"][name]):
                raise SystemExit(f"{name} Linux dependency drift: {needed}")
            if dynamic_paths["rpath"] != linux_policy["requiredRpath"][name]:
                raise SystemExit(f"{name} Linux RPATH drift: {dynamic_paths['rpath']}")
            if dynamic_paths["runpath"] != linux_policy["requiredRunpath"][name]:
                raise SystemExit(f"{name} Linux RUNPATH drift: {dynamic_paths['runpath']}")
            glibc_versions = linux_glibc_versions(path)
            maximum = manifest["build"]["linux"]["maxGlibc"]
            if glibc_versions and tuple(int(item) for item in glibc_versions[-1].split(".")) > tuple(int(item) for item in maximum.split(".")):
                raise SystemExit(f"{name} GLIBC drift: {glibc_versions[-1]}")
            image_name = None
        elif args.target.startswith("android-"):
            policy = manifest["build"]["android"]
            symbols = linux_symbols(path)
            needed = linux_needed(path)
            dynamic_paths = linux_dynamic_paths(path)
            image_format = linux_format(path)
            if policy["requiredFormat"][args.target] not in image_format:
                raise SystemExit(f"{path.name} Android format drift: {image_format}")
            if needed != sorted(policy["requiredNeeded"][name]):
                raise SystemExit(f"{name} Android dependency drift: {needed}")
            if dynamic_paths["rpath"] != policy["requiredRpath"][name] or dynamic_paths["runpath"] != policy["requiredRunpath"][name]:
                raise SystemExit(f"{name} Android loader path drift: {dynamic_paths}")
            dynamic = subprocess.check_output(["readelf", "--dynamic", str(path)], text=True)
            sonames = re.findall(r"Library soname: \[([^]]+)\]", dynamic)
            if sonames != [path.name]:
                raise SystemExit(f"{name} Android SONAME drift: {sonames}")
            headers = subprocess.check_output(["readelf", "--program-headers", "--wide", str(path)], text=True)
            alignments = [int(line.split()[-1], 16) for line in headers.splitlines() if line.strip().startswith("LOAD ")]
            if not alignments or min(alignments) < policy["minimumPageAlignment"]:
                raise SystemExit(f"{name} does not support 16 KB Android pages: {alignments}")
            if linux_glibc_versions(path):
                raise SystemExit(f"{name} unexpectedly uses glibc")
            image_name = path.name
        elif args.target == "win-x64":
            if not args.tool_prefix:
                raise SystemExit("Windows tool prefix is required")
            symbols = windows_symbols(path, args.tool_prefix)
            needed = windows_needed(path, args.tool_prefix)
            image_format = windows_format(path, args.tool_prefix)
            image_name = windows_image_name(path, args.tool_prefix)
            if needed != sorted(manifest["build"]["windows"]["requiredNeeded"][name]):
                raise SystemExit(f"{name} Windows dependency drift: {needed}")
            if image_name.casefold() != path.name.casefold():
                raise SystemExit(f"{name} PE image name drift: {image_name}")
        else:
            policy = manifest["build"]["macos"]
            symbols = macos_symbols(path)
            needed = macos_needed(path)
            image_format = macos_format(path)
            architectures = macos_architectures(path)
            image_name = macos_install_name(path)
            needed = sorted(value for value in needed if value != image_name)
            if policy["requiredFormat"] not in image_format:
                raise SystemExit(f"{path.name} format drift: {image_format}")
            if architectures != sorted(policy["requiredArchitectures"]):
                raise SystemExit(f"{name} macOS architecture drift: {architectures}")
            if needed != sorted(policy["requiredNeeded"][name]):
                raise SystemExit(f"{name} macOS dependency drift: {needed}")
            if image_name != policy["requiredInstallName"][name]:
                raise SystemExit(f"{name} Mach-O install name drift: {image_name}")
            for dependency in needed:
                if any(dependency.startswith(prefix) for prefix in policy["forbiddenDependencyPrefixes"]):
                    raise SystemExit(f"{name} macOS dependency is not redistributable: {dependency}")
        symbols = sorted(value for value in symbols if value.startswith(prefixes[name]))
        required = set(manifest["requiredExports"][name])
        missing = sorted(required - set(symbols))
        if missing:
            raise SystemExit(f"{name} export check failed: {', '.join(missing)}")
        artifact = {
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "exports": symbols,
            "needed": needed,
        }
        if args.target == "linux-x64":
            artifact["format"] = image_format
            artifact["rpath"] = dynamic_paths["rpath"]
            artifact["runpath"] = dynamic_paths["runpath"]
            artifact["glibcVersions"] = glibc_versions
            artifact["maxGlibc"] = glibc_versions[-1] if glibc_versions else None
        elif args.target.startswith("android-"):
            artifact["format"] = image_format
            artifact["soname"] = image_name
            artifact["rpath"] = dynamic_paths["rpath"]
            artifact["runpath"] = dynamic_paths["runpath"]
            artifact["loadAlignments"] = alignments
            artifact["minimumApi"] = policy["minimumApi"]
        elif args.target == "win-x64":
            artifact["format"] = image_format
            artifact["imageName"] = image_name
        else:
            artifact["format"] = image_format
            artifact["architectures"] = architectures
            artifact["installName"] = image_name
        artifacts[name] = artifact
    if set(artifacts) != set(manifest["outputs"][args.target]):
        raise SystemExit("artifact set is incomplete")
    if args.target == "linux-x64":
        compiler = os.environ.get("CC", "cc")
        toolchain = {
            "meson": command_text("meson", ["--version"]),
            "ninja": command_text("ninja", ["--version"]),
            "cc": command_text(compiler, ["--version"]),
            "strip": command_text("strip", ["--version"]),
        }
    elif args.target.startswith("android-"):
        toolchain = {
            "meson": command_text("meson", ["--version"]),
            "ninja": command_text("ninja", ["--version"]),
            "cc": command_text(os.environ["CC"], ["--version"]),
            "strip": command_text(os.environ["STRIP"], ["--version"]),
            "ndk": manifest["build"]["android"]["ndkVersion"],
            "minimumApi": manifest["build"]["android"]["minimumApi"],
        }
    elif args.target == "win-x64":
        toolchain = {
            "meson": command_text("meson", ["--version"]),
            "ninja": command_text("ninja", ["--version"]),
            "cc": command_text(f"{args.tool_prefix}-gcc", ["--version"]),
            "cpp": command_text(f"{args.tool_prefix}-g++", ["--version"]),
            "objdump": command_text(f"{args.tool_prefix}-objdump", ["--version"]),
            "strip": command_text(f"{args.tool_prefix}-strip", ["--version"]),
        }
    else:
        toolchain = {
            "meson": command_text("meson", ["--version"]),
            "ninja": command_text("ninja", ["--version"]),
            "cc": command_text("clang", ["--version"]),
            "xcode": command_text("xcodebuild", ["-version"]),
        }
    build = dict(manifest["build"])
    build.pop("environments", None)
    build["target"] = args.target
    build["toolchain"] = toolchain
    build["sourceDirectory"] = "temporary"
    build["environment"] = environment
    if args.target == "win-x64":
        build["crossFile"] = {
            "c": f"{args.tool_prefix}-gcc",
            "cpp": f"{args.tool_prefix}-g++",
            "ar": f"{args.tool_prefix}-ar",
            "nm": f"{args.tool_prefix}-nm",
            "strip": f"{args.tool_prefix}-strip",
            "objdump": f"{args.tool_prefix}-objdump",
            "windres": f"{args.tool_prefix}-windres",
            "system": "windows",
            "cpu": "x86_64",
        }
    manifest["buildEvidence"] = build
    manifest["artifacts"] = artifacts
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "text-native-build.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
