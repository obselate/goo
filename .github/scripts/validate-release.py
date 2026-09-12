#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MAX_BYTES = 20_971_520
MAX_GLIBC = (2, 27)
MAX_MACOS = (14, 0, 0)
MACHO_ARM64 = 0x0100000C
MACHO_DYLIB = 6
MACHO_MAGIC_64 = 0xFEEDFACF
WINDOWS_SDL_SHA256 = "2632e21625861a0dc106f2b1abb649e610d8be88534ba74c76a763abe5aefaa3"
WINDOWS_SDL_IMPORTS = {
    "ADVAPI32.dll", "GDI32.dll", "IMM32.dll", "KERNEL32.dll", "OLEAUT32.dll",
    "SETUPAPI.dll", "SHELL32.dll", "USER32.dll", "VERSION.dll", "WINMM.dll",
    "ole32.dll",
}
PACKAGE_FILES = {
    "_rels/.rels",
    "Goo.nuspec",
    "lib/net10.0/Yoga.Net.dll",
    "lib/net10.0/Goo.xml",
    "lib/net10.0/Goo.dll",
    "ref/net10.0/Goo.dll",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.md",
    "buildTransitive/Goo.targets",
    "contentFiles/any/any/Vulkan/Shaders/Authoring/goo_effect.glsl",
    "contentFiles/any/any/Vulkan/Shaders/Authoring/goo_effect.slang",
    "contentFiles/any/any/Vulkan/Runtime/HarfBuzz-COPYING.txt",
    "contentFiles/any/any/Vulkan/Shaders/analytic.vert.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_blend.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_shadow.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_border.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_linear4.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_radial4.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_sampled_image.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/analytic_solid.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/clip_mask.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/clip_mask.vert.spv",
    "contentFiles/any/any/Vulkan/Shaders/hb_gpu.vert.spv",
    "contentFiles/any/any/Vulkan/Shaders/hb_gpu_draw.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/hb_gpu_paint.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/lava.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/harfbuzz-14.3.1.provenance.json",
    "contentFiles/any/any/Vulkan/Runtime/MoltenVK-LICENSE.txt",
    "contentFiles/any/any/Vulkan/Shaders/path_band.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/path_band.vert.spv",
    "contentFiles/any/any/Vulkan/Shaders/shader-manifest.json",
    "contentFiles/any/any/Vulkan/Shaders/solid_quad.frag.spv",
    "contentFiles/any/any/Vulkan/Shaders/solid_quad.vert.spv",
    "runtimes/linux-x64/native/libSDL3.so",
    "runtimes/linux-x64/native/libgoo-harfbuzz-gpu.so",
    "runtimes/linux-x64/native/libgoo-harfbuzz.so",
    "runtimes/linux-x64/native/text-native-build.json",
    "runtimes/android-arm64/native/libgoo-harfbuzz.so",
    "runtimes/android-arm64/native/libgoo-harfbuzz-gpu.so",
    "runtimes/android-arm64/native/text-native-build.json",
    "runtimes/android-x64/native/libgoo-harfbuzz.so",
    "runtimes/android-x64/native/libgoo-harfbuzz-gpu.so",
    "runtimes/android-x64/native/text-native-build.json",
    "runtimes/osx-arm64/native/libMoltenVK.dylib",
    "runtimes/osx-arm64/native/libSDL3.dylib",
    "runtimes/osx-arm64/native/libgoo-harfbuzz-gpu.dylib",
    "runtimes/osx-arm64/native/libgoo-harfbuzz.dylib",
    "runtimes/osx-arm64/native/text-native-build.json",
    "runtimes/win-x64/native/goo-harfbuzz-gpu.dll",
    "runtimes/win-x64/native/goo-harfbuzz.dll",
    "runtimes/win-x64/native/SDL3.dll",
    "runtimes/win-x64/native/text-native-build.json",
    "tools/net10.0/any/Goo.ShaderEffectTool.deps.json",
    "tools/net10.0/any/Goo.ShaderEffectTool.dll",
    "tools/net10.0/any/Goo.ShaderEffectTool.runtimeconfig.json",
    "[Content_Types].xml",
}
BUNDLE_FILES = {
    "Goo.PackageSmoke.deps.json",
    "Goo.PackageSmoke.dll",
    "Goo.PackageSmoke.runtimeconfig.json",
    "Goo.dll",
    "Gsharp.Extensions.dll",
    "Hexa.NET.SDL3.dll",
    "HexaGen.Runtime.dll",
    "Unicode.Bidi.dll",
    "StbImageSharp.dll",
    "Yoga.Net.dll",
    "libSDL3.so",
    "libgoo-harfbuzz-gpu.so",
    "libgoo-harfbuzz.so",
    "text-native-build.json",
    "Vulkan/Runtime/HarfBuzz-COPYING.txt",
    "Vulkan/Shaders/analytic.vert.spv",
    "Vulkan/Shaders/analytic_blend.frag.spv",
    "Vulkan/Shaders/analytic_shadow.frag.spv",
    "Vulkan/Shaders/analytic_border.frag.spv",
    "Vulkan/Shaders/analytic_linear4.frag.spv",
    "Vulkan/Shaders/analytic_radial4.frag.spv",
    "Vulkan/Shaders/analytic_sampled_image.frag.spv",
    "Vulkan/Shaders/analytic_solid.frag.spv",
    "Vulkan/Shaders/clip_mask.frag.spv",
    "Vulkan/Shaders/clip_mask.vert.spv",
    "Vulkan/Shaders/hb_gpu.vert.spv",
    "Vulkan/Shaders/hb_gpu_draw.frag.spv",
    "Vulkan/Shaders/hb_gpu_paint.frag.spv",
    "Vulkan/Shaders/lava.frag.spv",
    "Vulkan/Shaders/harfbuzz-14.3.1.provenance.json",
    "Vulkan/Shaders/path_band.frag.spv",
    "Vulkan/Shaders/path_band.vert.spv",
    "Vulkan/Shaders/shader-manifest.json",
    "Vulkan/Shaders/solid_quad.frag.spv",
    "Vulkan/Shaders/solid_quad.vert.spv",
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "THIRD-PARTY-NOTICES.md",
    "SHA256SUMS",
}
NATIVE_NAMES = {"libSDL3.so", "libgoo-harfbuzz-gpu.so", "libgoo-harfbuzz.so"}
SYMBOL_FILES = {
    "_rels/.rels",
    "Goo.nuspec",
    "[Content_Types].xml",
    "lib/net10.0/Yoga.Net.pdb",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glibc_versions(path: Path) -> set[tuple[int, int]]:
    result = subprocess.run(
        ["readelf", "--version-info", str(path)], text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        return set()
    return {
        tuple(map(int, value.split(".")))
        for value in re.findall(r"GLIBC_(\d+\.\d+)", result.stdout)
    }


def require_glibc_floor(path: Path) -> None:
    versions = glibc_versions(path)
    if versions and max(versions) > MAX_GLIBC:
        raise SystemExit(
            f"{path} requires GLIBC_{'.'.join(map(str, max(versions)))}; "
            "maximum is GLIBC_2.27")


def pe_imports(path: Path) -> set[str]:
    result = subprocess.run(
        ["objdump", "-p", str(path)], text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        raise SystemExit(f"could not inspect PE imports: {path}")
    return set(re.findall(r"DLL Name:\s+(\S+)", result.stdout))


def macho_version(value: int) -> tuple[int, int, int]:
    return value >> 16, (value >> 8) & 0xFF, value & 0xFF


def macho_string(data: bytes, command: int, size: int, offset: int) -> str:
    if offset < 8 or offset >= size:
        raise SystemExit("Mach-O load command has an invalid string offset")
    start = command + offset
    end = data.find(b"\0", start, command + size)
    if end < 0:
        raise SystemExit("Mach-O load command has an unterminated string")
    try:
        return data[start:end].decode("utf-8")
    except UnicodeDecodeError as error:
        raise SystemExit("Mach-O load command has a non-UTF-8 string") from error


def macho_metadata(data: bytes) -> dict[str, object]:
    if len(data) < 32:
        raise SystemExit("native payload has a truncated Mach-O header")
    magic, cpu, _, file_type, count, commands_size, _, _ = struct.unpack_from(
        "<IIIIIIII", data)
    if magic != MACHO_MAGIC_64 or cpu != MACHO_ARM64 or file_type != MACHO_DYLIB:
        raise SystemExit("native payload is not a thin arm64 Mach-O dylib")
    if 32 + commands_size > len(data):
        raise SystemExit("native payload has a truncated Mach-O load-command table")
    position = 32
    image_name = None
    dependencies: set[str] = set()
    minimum = None
    for _ in range(count):
        if position + 8 > 32 + commands_size:
            raise SystemExit("native payload has a truncated Mach-O load command")
        command, size = struct.unpack_from("<II", data, position)
        if size < 8 or position + size > 32 + commands_size:
            raise SystemExit("native payload has an invalid Mach-O load command")
        base_command = command & 0x7FFFFFFF
        if base_command in {0x0C, 0x0D, 0x18, 0x1F, 0x20, 0x23}:
            if size < 24:
                raise SystemExit("native payload has a truncated Mach-O dylib command")
            name_offset = struct.unpack_from("<I", data, position + 8)[0]
            name = macho_string(data, position, size, name_offset)
            if base_command == 0x0D:
                if image_name is not None:
                    raise SystemExit("native payload has multiple Mach-O install names")
                image_name = name
            else:
                dependencies.add(name)
        elif base_command == 0x32:
            if size < 24:
                raise SystemExit("native payload has a truncated LC_BUILD_VERSION")
            platform, value = struct.unpack_from("<II", data, position + 8)
            if platform != 1:
                raise SystemExit("native payload does not target macOS")
            value = macho_version(value)
            if minimum is not None and minimum != value:
                raise SystemExit("native payload has conflicting minimum macOS metadata")
            minimum = value
        elif base_command == 0x24:
            if size < 16:
                raise SystemExit("native payload has a truncated LC_VERSION_MIN_MACOSX")
            value = macho_version(struct.unpack_from("<I", data, position + 8)[0])
            if minimum is not None and minimum != value:
                raise SystemExit("native payload has conflicting minimum macOS metadata")
            minimum = value
        position += size
    if position != 32 + commands_size:
        raise SystemExit("native payload has inconsistent Mach-O load commands")
    if image_name is None or minimum is None:
        raise SystemExit("native payload lacks Mach-O identity or minimum macOS metadata")
    return {
        "dependencies": sorted(dependencies),
        "installName": image_name,
        "minimumMacOS": minimum,
    }


def validate_macos_payloads(payloads: dict[str, bytes]) -> None:
    metadata = {
        name: macho_metadata(data)
        for name, data in payloads.items()
        if name.endswith(".dylib")
    }
    expected_names = {
        "libMoltenVK.dylib": "@rpath/libMoltenVK.dylib",
        "libSDL3.dylib": "@rpath/libSDL3.dylib",
        "libgoo-harfbuzz-gpu.dylib": "@rpath/libgoo-harfbuzz-gpu.dylib",
        "libgoo-harfbuzz.dylib": "@rpath/libgoo-harfbuzz.dylib",
    }
    expected_rpath_dependencies = {
        "libgoo-harfbuzz-gpu.dylib": {"@rpath/libgoo-harfbuzz.dylib"},
    }
    if set(metadata) != set(expected_names):
        raise SystemExit("macOS native payload set is incomplete")
    for name, expected_name in expected_names.items():
        details = metadata[name]
        if details["installName"] != expected_name:
            raise SystemExit(f"packaged {name} has an unexpected Mach-O install name")
        minimum = details["minimumMacOS"]
        if minimum > MAX_MACOS:
            value = ".".join(map(str, minimum))
            raise SystemExit(f"packaged {name} requires macOS {value}; maximum is 14.0")
        for dependency in details["dependencies"]:
            if not dependency.startswith(("/System/Library/", "/usr/lib/", "@rpath/")):
                raise SystemExit(f"packaged {name} has an unexpected dependency: {dependency}")
            if dependency.startswith("@rpath/") \
                    and dependency not in expected_rpath_dependencies.get(name, set()):
                raise SystemExit(f"packaged {name} has an unexpected private dependency: {dependency}")

    recorded = json.loads(payloads["text-native-build.json"])
    manifest = json.loads((ROOT / "tools/Goo.TextNative/manifest.json").read_text())
    for field in ("schema", "name", "source", "requiredExports"):
        if recorded.get(field) != manifest.get(field):
            raise SystemExit(f"packaged macOS text-native provenance is stale: {field}")
    if recorded.get("outputs", {}).get("osx-arm64") != manifest["outputs"]["osx-arm64"]:
        raise SystemExit("packaged macOS text-native output names are stale")
    recorded_build = recorded.get("build", {})
    for field, expected in manifest["build"].items():
        if field in ("linux", "windows", "android", "environments"):
            continue
        if recorded_build.get(field) != expected:
            raise SystemExit(f"packaged macOS text-native provenance is stale: build.{field}")
    if recorded_build.get("environments", {}).get("osx-arm64") != manifest["build"]["environments"]["osx-arm64"]:
        raise SystemExit("packaged macOS text-native provenance environment is stale")
    evidence = recorded.get("buildEvidence", {})
    if evidence.get("target") != "osx-arm64" or evidence.get("sourceDirectory") != "temporary":
        raise SystemExit("packaged macOS text-native build evidence is invalid")
    if evidence.get("environment") != manifest["build"]["environments"]["osx-arm64"]:
        raise SystemExit("packaged macOS text-native build environment is stale")
    if evidence.get("deploymentTarget") != "14.0":
        raise SystemExit("packaged macOS text-native deployment target is stale")
    for field, expected in manifest["build"].items():
        if field not in ("environments", "linux", "windows", "android") and evidence.get(field) != expected:
            raise SystemExit(f"packaged macOS text-native build policy is stale: {field}")
    artifacts = recorded.get("artifacts", {})
    for role, name in manifest["outputs"]["osx-arm64"].items():
        artifact = artifacts.get(role, {})
        data = payloads[name]
        details = metadata[name]
        required_exports = set(manifest["requiredExports"][role])
        if artifact.get("file") != name \
                or artifact.get("bytes") != len(data) \
                or artifact.get("sha256") != hashlib.sha256(data).hexdigest() \
                or artifact.get("architectures") != ["arm64"] \
                or artifact.get("installName") != details["installName"] \
                or details["dependencies"] != sorted(
                    manifest["build"]["macos"]["requiredNeeded"][role]) \
                or artifact.get("needed") != details["dependencies"] \
                or not required_exports.issubset(set(artifact.get("exports", []))):
            raise SystemExit(f"packaged macOS text-native artifact provenance is invalid: {name}")


def pe_debug_entries(data: bytes) -> list[tuple[int, int, bytes]]:
    if len(data) < 64 or data[:2] != b"MZ":
        raise SystemExit("managed assembly is not a PE image")
    pe = struct.unpack_from("<I", data, 60)[0]
    if pe + 24 > len(data) or data[pe:pe + 4] != b"PE\0\0":
        raise SystemExit("managed assembly has no PE header")
    section_count = struct.unpack_from("<H", data, pe + 6)[0]
    optional_size = struct.unpack_from("<H", data, pe + 20)[0]
    optional = pe + 24
    magic = struct.unpack_from("<H", data, optional)[0]
    directory = optional + (96 if magic == 0x10B else 112 if magic == 0x20B else -1)
    if directory < optional or directory + 56 > len(data):
        raise SystemExit("managed assembly has an invalid optional header")
    debug_rva, debug_size = struct.unpack_from("<II", data, directory + 48)
    sections = optional + optional_size
    debug_offset = None
    for index in range(section_count):
        section = sections + index * 40
        if section + 40 > len(data):
            raise SystemExit("managed assembly has an invalid section table")
        virtual_size, virtual_address, raw_size, raw_offset = struct.unpack_from("<IIII", data, section + 8)
        if virtual_address <= debug_rva < virtual_address + max(virtual_size, raw_size):
            debug_offset = raw_offset + debug_rva - virtual_address
            break
    if debug_offset is None or debug_offset + debug_size > len(data) or debug_size % 28 != 0:
        raise SystemExit("managed assembly has an invalid debug directory")
    entries: list[tuple[int, int, bytes]] = []
    for index in range(debug_size // 28):
        entry = debug_offset + index * 28
        timestamp = struct.unpack_from("<I", data, entry + 4)[0]
        entry_type = struct.unpack_from("<I", data, entry + 12)[0]
        size = struct.unpack_from("<I", data, entry + 16)[0]
        raw_offset = struct.unpack_from("<I", data, entry + 24)[0]
        if size > 0 and raw_offset + size > len(data):
            raise SystemExit("managed assembly has invalid debug data")
        entries.append((entry_type, timestamp, data[raw_offset:raw_offset + size]))
    return entries


def pe_debug_types(data: bytes) -> set[int]:
    return {entry_type for entry_type, _, _ in pe_debug_entries(data)}


def portable_pdb_identity(data: bytes) -> tuple[bytes, bytes]:
    if len(data) < 24 or data[:4] != b"BSJB":
        raise SystemExit("symbol file is not a portable PDB")
    position = 16 + struct.unpack_from("<I", data, 12)[0]
    position = (position + 3) & ~3
    if position + 4 > len(data):
        raise SystemExit("portable PDB has an invalid metadata header")
    _, stream_count = struct.unpack_from("<HH", data, position)
    position += 4
    pdb_offset = None
    for _ in range(stream_count):
        if position + 8 > len(data):
            raise SystemExit("portable PDB has an invalid stream table")
        offset, size = struct.unpack_from("<II", data, position)
        position += 8
        try:
            end = data.index(0, position)
        except ValueError as error:
            raise SystemExit("portable PDB has an unterminated stream name") from error
        name = data[position:end].decode("utf-8")
        position = (end + 4) & ~3
        if offset + size > len(data):
            raise SystemExit("portable PDB stream exceeds the file")
        if name == "#Pdb":
            pdb_offset = offset
    if pdb_offset is None or pdb_offset + 20 > len(data):
        raise SystemExit("portable PDB has no valid #Pdb stream")
    identity = data[pdb_offset:pdb_offset + 20]
    canonical = bytearray(data)
    canonical[pdb_offset:pdb_offset + 20] = bytes(20)
    return identity, hashlib.sha256(canonical).digest()


def validate_symbols(package_path: Path, symbols_path: Path) -> None:
    with zipfile.ZipFile(package_path) as package, zipfile.ZipFile(symbols_path) as symbols:
        names = set(symbols.namelist())
        variable = {
            name for name in names
            if name.startswith("package/services/metadata/core-properties/")
            and name.endswith(".psmdcp")
        }
        unexpected = names - SYMBOL_FILES - variable
        missing = SYMBOL_FILES - names
        if unexpected or missing or len(variable) != 1:
            raise SystemExit(
                f"symbol package allowlist mismatch; missing={sorted(missing)}, "
                f"unexpected={sorted(unexpected)}, metadata={sorted(variable)}")
        for pdb_name in sorted(name for name in names if name.endswith(".pdb")):
            dll_name = pdb_name[:-4] + ".dll"
            if dll_name not in package.namelist():
                raise SystemExit(f"symbol package has no matching assembly: {pdb_name}")
            identity, checksum = portable_pdb_identity(symbols.read(pdb_name))
            entries = pe_debug_entries(package.read(dll_name))
            codeview = [(timestamp, raw) for entry_type, timestamp, raw in entries if entry_type == 2]
            checksums = [raw for entry_type, _, raw in entries if entry_type == 19]
            if len(codeview) != 1 or len(checksums) != 1:
                raise SystemExit(f"assembly debug records are incomplete: {dll_name}")
            timestamp, codeview_data = codeview[0]
            if len(codeview_data) < 24 or codeview_data[:4] != b"RSDS":
                raise SystemExit(f"assembly CodeView record is invalid: {dll_name}")
            if identity != codeview_data[4:20] + struct.pack("<I", timestamp):
                raise SystemExit(f"PDB identity does not match assembly: {pdb_name}")
            algorithm, separator, recorded = checksums[0].partition(b"\0")
            if separator != b"\0" or algorithm != b"SHA256" or recorded != checksum:
                raise SystemExit(f"PDB checksum does not match assembly: {pdb_name}")
    print(f"Symbols OK: {symbols_path.stat().st_size} bytes")


def validate_package(path: Path) -> str:
    if path.stat().st_size > MAX_BYTES:
        raise SystemExit(f"NuGet package exceeds 20 MiB: {path.stat().st_size}")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        variable = {
            name for name in names
            if name.startswith("package/services/metadata/core-properties/")
            and name.endswith(".psmdcp")
        }
        unexpected = names - PACKAGE_FILES - variable
        missing = PACKAGE_FILES - names
        if unexpected or missing or len(variable) != 1:
            raise SystemExit(
                f"package allowlist mismatch; missing={sorted(missing)}, "
                f"unexpected={sorted(unexpected)}, metadata={sorted(variable)}")
        package_sources = {
            "README.md": ROOT / "docs/nuget-readme.md",
            "CHANGELOG.md": ROOT / "CHANGELOG.md",
            "LICENSE": ROOT / "LICENSE",
            "THIRD-PARTY-NOTICES.md": ROOT / "THIRD-PARTY-NOTICES.md",
        }
        for name, source in package_sources.items():
            if archive.read(name) != source.read_bytes():
                raise SystemExit(f"package {name} differs from the release tree")
        if 17 not in pe_debug_types(archive.read("lib/net10.0/Goo.dll")):
            raise SystemExit("packaged Goo.dll does not contain embedded debug symbols")
        if archive.read("buildTransitive/Goo.targets") != (ROOT / "Goo/Goo.targets").read_bytes():
            raise SystemExit("packaged Goo.targets differs from the release tree")
        if archive.read("contentFiles/any/any/Vulkan/Runtime/MoltenVK-LICENSE.txt") != (ROOT / "Goo/Runtime/Vulkan/MoltenVK-LICENSE.txt").read_bytes():
            raise SystemExit("packaged MoltenVK license differs from the release tree")
        nuspec = archive.read("Goo.nuspec").decode("utf-8-sig")
        dependency = re.search(r'<dependency id="Hexa.NET.SDL3"[^>]+>', nuspec)
        if dependency is None or "Native" not in dependency.group(0):
            raise SystemExit("Hexa.NET.SDL3 native assets are not excluded")
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "libSDL3.so"
            target.write_bytes(
                archive.read("runtimes/linux-x64/native/libSDL3.so"))
            if not target.read_bytes().startswith(b"\x7fELF"):
                raise SystemExit("packaged libSDL3.so is not an ELF library")
            require_glibc_floor(target)
            sdl_digest = digest(target)
            windows_target = Path(directory) / "SDL3.dll"
            windows_target.write_bytes(
                archive.read("runtimes/win-x64/native/SDL3.dll"))
            if windows_target.read_bytes()[:2] != b"MZ":
                raise SystemExit("packaged SDL3.dll is not a PE library")
            if digest(windows_target) != WINDOWS_SDL_SHA256:
                raise SystemExit("packaged SDL3.dll does not match the pinned SDL release")
            imports = pe_imports(windows_target)
            if imports != WINDOWS_SDL_IMPORTS:
                raise SystemExit(f"unexpected SDL3.dll imports: {sorted(imports)}")
            macos_names = (
                "libMoltenVK.dylib",
                "libSDL3.dylib",
                "libgoo-harfbuzz-gpu.dylib",
                "libgoo-harfbuzz.dylib",
            )
            macos_payloads = {
                name: archive.read(f"runtimes/osx-arm64/native/{name}")
                for name in macos_names
            }
            macos_payloads["text-native-build.json"] = archive.read(
                "runtimes/osx-arm64/native/text-native-build.json")
            validate_macos_payloads(macos_payloads)
            for rid in ("android-arm64", "android-x64"):
                provenance = json.loads(archive.read(f"runtimes/{rid}/native/text-native-build.json"))
                if provenance["buildEvidence"]["target"] != rid:
                    raise SystemExit(f"Android provenance target mismatch: {rid}")
                for artifact in provenance["artifacts"].values():
                    data = archive.read(f"runtimes/{rid}/native/{artifact['file']}")
                    if hashlib.sha256(data).hexdigest() != artifact["sha256"]:
                        raise SystemExit(f"Android payload hash mismatch: {rid}/{artifact['file']}")
    print(f"Package OK: {path.stat().st_size} bytes")
    return sdl_digest


def parse_checksums(path: Path) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([^\n]+)", line)
        if match is None or match.group(2) in checksums:
            raise SystemExit(f"invalid checksum line: {line!r}")
        checksums[match.group(2)] = match.group(1)
    return checksums


def validate_bundle(path: Path, package_sdl_digest: str) -> None:
    if any(item.is_symlink() for item in path.rglob("*")):
        raise SystemExit("bundle must not contain symlinks")
    files = [item for item in path.rglob("*") if item.is_file()]
    names = {item.relative_to(path).as_posix() for item in files}
    missing = BUNDLE_FILES - names
    unexpected = names - BUNDLE_FILES
    if missing or unexpected:
        raise SystemExit(
            f"bundle allowlist mismatch; missing={sorted(missing)}, "
            f"unexpected={sorted(unexpected)}")
    for name in ("README.md", "CHANGELOG.md", "LICENSE", "THIRD-PARTY-NOTICES.md"):
        if (path / name).read_bytes() != (ROOT / name).read_bytes():
            raise SystemExit(f"bundle {name} differs from the release tree")
    total = sum(item.stat().st_size for item in files)
    if total > MAX_BYTES:
        raise SystemExit(f"bundle exceeds 20 MiB: {total}")

    checksums = parse_checksums(path / "SHA256SUMS")
    expected_checksum_names = BUNDLE_FILES - {"SHA256SUMS"}
    if set(checksums) != expected_checksum_names:
        raise SystemExit("SHA256SUMS allowlist mismatch")
    for name, expected in checksums.items():
        if digest(path / name) != expected:
            raise SystemExit(f"checksum mismatch: {name}")

    native = {name: path / name for name in NATIVE_NAMES}
    hashes: dict[str, list[str]] = {}
    for name, item in native.items():
        if not item.read_bytes().startswith(b"\x7fELF"):
            raise SystemExit(f"native payload is not ELF: {name}")
        hashes.setdefault(digest(item), []).append(name)
        require_glibc_floor(item)
    duplicates = [names for names in hashes.values() if len(names) > 1]
    if duplicates:
        raise SystemExit(f"duplicate native payloads: {duplicates}")
    if digest(native["libSDL3.so"]) != package_sdl_digest:
        raise SystemExit("bundle and package contain different SDL payloads")
    for item in files:
        require_glibc_floor(item)
    print(f"Bundle OK: {total} bytes; native={sorted(native)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--symbols", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    args = parser.parse_args()
    sdl_digest = validate_package(args.package)
    validate_symbols(args.package, args.symbols)
    validate_bundle(args.bundle, sdl_digest)


if __name__ == "__main__":
    main()
