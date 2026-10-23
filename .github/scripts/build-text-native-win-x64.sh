#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: build-text-native-win-x64.sh OUTPUT_DIRECTORY}"
script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
manifest="$repo_root/tools/Goo.TextNative/manifest.json"
hb_url='https://github.com/harfbuzz/harfbuzz/releases/download/15.0.0/harfbuzz-15.0.0.tar.xz'
hb_sha256='968536e9abd782f07f7954044c0c4020199fcdd39b41d221ec42d2a3be4a44df'
tool_prefix="${MINGW_TOOL_PREFIX:-x86_64-w64-mingw32}"

for command_name in curl sha256sum tar meson ninja file patch python3; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done
for tool_name in gcc g++ ar strip objcopy objdump windres; do
  command -v "${tool_prefix}-${tool_name}" >/dev/null || {
    printf 'required MinGW tool missing: %s-%s\n' "$tool_prefix" "$tool_name" >&2
    exit 1
  }
done

python3 - "$manifest" "$hb_sha256" "$hb_url" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = manifest["source"]["harfbuzz"]
if source["version"] != "15.0.0" or source["tag"] != "15.0.0":
    raise SystemExit("HarfBuzz version/tag drift")
if source["signedTagCommit"] != "35f656a1a2bab548ea7f54a6dd3fba2b09680d14":
    raise SystemExit("HarfBuzz signed tag commit drift")
if source["archiveSha256"] != sys.argv[2] or source["archiveUrl"] != sys.argv[3]:
    raise SystemExit("HarfBuzz archive provenance drift")
if manifest["outputs"]["win-x64"] != {"harfbuzz": "goo-harfbuzz.dll", "gpu": "goo-harfbuzz-gpu.dll"}:
    raise SystemExit("Windows output name drift")
windows = manifest["build"]["windows"]
if windows["target"] != "x86_64-w64-mingw32" or windows["requiredFormat"] != "PE32+ x86-64":
    raise SystemExit("Windows target/format drift")
if windows["gpuImport"] != "goo-harfbuzz.dll":
    raise SystemExit("hb-gpu core import drift")
if windows["requiredNeeded"] != {
    "harfbuzz": ["ADVAPI32.dll", "KERNEL32.dll", "msvcrt.dll"],
    "gpu": ["ADVAPI32.dll", "KERNEL32.dll", "goo-harfbuzz.dll", "msvcrt.dll"],
}:
    raise SystemExit("Windows dependency policy drift")
required = {
    "-Dglib=disabled", "-Dgobject=disabled", "-Dcairo=disabled",
    "-Dchafa=disabled", "-Dpng=disabled", "-Dzlib=disabled",
    "-Dicu=disabled", "-Dgraphite=disabled", "-Dgraphite2=disabled",
    "-Dfreetype=disabled", "-Dfontations=disabled", "-Dgdi=disabled",
    "-Ddirectwrite=disabled", "-Dcoretext=disabled", "-Dharfrust=disabled",
    "-Dkbts=disabled", "-Dwasm=disabled", "-Draster=disabled",
    "-Dvector=disabled", "-Dgpu=enabled", "-Dsubset=disabled",
    "-Dtests=disabled", "-Dintrospection=disabled", "-Ddocs=disabled",
    "-Ddoc_tests=false", "-Dutilities=disabled", "-Dbenchmark=disabled",
    "-Dgpu_demo=disabled", "-Dwith_libstdcxx=false",
}
if set(manifest["build"]["harfbuzzOptions"]) != required:
    raise SystemExit("HarfBuzz integration options drift")
if manifest["build"]["environments"]["win-x64"] != {
    "SOURCE_DATE_EPOCH": "0",
    "CFLAGS": "-O3 -g0 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2 -fstack-protector-strong -fcf-protection=full -ffile-prefix-map=<temporary-source-root>=.",
    "CXXFLAGS": "-O3 -g0 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2 -fstack-protector-strong -fcf-protection=full -ffile-prefix-map=<temporary-source-root>=.",
    "LDFLAGS": "-Wl,--no-insert-timestamp -static -static-libgcc -static-libstdc++ -fstack-protector-strong -Wl,--exclude-libs,libssp.a",
}:
    raise SystemExit("Windows build environment drift")
PY

work="$(mktemp -d -t goo-text-native-win.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$output"
output="$(CDPATH= cd -- "$output" && pwd)"
for legacy in goo-freetype.dll goo-text-native.dll; do
  rm -f -- "$output/$legacy"
done
staging="$work/output"
mkdir -p "$staging"

curl -fsSL --retry 3 --retry-delay 2 "$hb_url" -o "$work/harfbuzz.tar.xz"
printf '%s  %s\n' "$hb_sha256" "$work/harfbuzz.tar.xz" | sha256sum -c -
tar -xJf "$work/harfbuzz.tar.xz" -C "$work"
python3 "$repo_root/tools/Goo.TextNative/apply-source-patches.py" --manifest "$manifest" --source-root "$work/harfbuzz-15.0.0"

python3 - "$work/harfbuzz-15.0.0/src/meson.build" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

def patch_target(text, start_marker, end_marker, old_name, new_name, indent):
    start = text.find(start_marker)
    if start < 0 or text.find(start_marker, start + 1) >= 0:
        raise SystemExit(f"Meson target drift: {old_name}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"Meson target boundary drift: {old_name}")
    end += len(end_marker)
    block = text[start:end]
    block = block.replace(f"library('{old_name}'", f"library('{new_name}'", 1)
    version_lines = f"{indent}soversion: hb_so_version,\n{indent}version: version,\n"
    if block.count(version_lines) != 1:
        raise SystemExit(f"Meson versioned target drift: {old_name}")
    block = block.replace(version_lines, "", 1)
    cpp = f"{indent}cpp_args: cpp_args + extra_hb_cpp_args,\n"
    if block.count(cpp) != 1:
        raise SystemExit(f"Meson target arguments drift: {old_name}")
    block = block.replace(cpp, cpp + f"{indent}name_prefix: '',\n{indent}name_suffix: 'dll',\n", 1)
    return text[:start] + block + text[end:]

text = patch_target(
    text,
    "libharfbuzz = library('harfbuzz', hb_sources,\n",
    "\n)\n\nlibharfbuzz_dep",
    "harfbuzz",
    "goo-harfbuzz",
    "  ",
)
text = patch_target(
    text,
    "  libharfbuzz_gpu = library('harfbuzz-gpu',\n",
    "\n  )\n\n  install_headers(hb_gpu_headers",
    "harfbuzz-gpu",
    "goo-harfbuzz-gpu",
    "    ",
)
path.write_text(text, encoding="utf-8")
PY

compiler="$(command -v "${tool_prefix}-gcc")"
cxx="$(command -v "${tool_prefix}-g++")"
ar="$(command -v "${tool_prefix}-ar")"
strip_tool="$(command -v "${tool_prefix}-strip")"
objcopy="$(command -v "${tool_prefix}-objcopy")"
windres="$(command -v "${tool_prefix}-windres")"
objdump="$(command -v "${tool_prefix}-objdump")"
cross_file="$work/mingw-x86_64.cross"
python3 - "$cross_file" "$compiler" "$cxx" "$ar" "$strip_tool" "$objcopy" "$windres" "$work" <<'PY'
import sys
from pathlib import Path

path, compiler, cxx, ar, strip_tool, objcopy, windres, work = sys.argv[1:]
def quote(value):
    return "'" + value.replace("'", "'\\''") + "'"
Path(path).write_text(
    "[binaries]\n"
    f"c = {quote(compiler)}\n"
    f"cpp = {quote(cxx)}\n"
    f"ar = {quote(ar)}\n"
    f"strip = {quote(strip_tool)}\n"
    f"objcopy = {quote(objcopy)}\n"
    f"windres = {quote(windres)}\n"
    "\n[host_machine]\n"
    "system = 'windows'\n"
    "cpu_family = 'x86_64'\n"
    "cpu = 'x86_64'\n"
    "endian = 'little'\n"
    "\n[properties]\n"
    "needs_exe_wrapper = true\n"
    "\n[built-in options]\n"
    f"c_args = ['-O3', '-g0', '-U_FORTIFY_SOURCE', '-D_FORTIFY_SOURCE=2', '-fstack-protector-strong', '-fcf-protection=full', '-ffile-prefix-map={work}=.']\n"
    f"cpp_args = ['-O3', '-g0', '-U_FORTIFY_SOURCE', '-D_FORTIFY_SOURCE=2', '-fstack-protector-strong', '-fcf-protection=full', '-ffile-prefix-map={work}=.']\n"
    "c_link_args = ['-static', '-static-libgcc', '-static-libstdc++', '-fstack-protector-strong', '-Wl,--exclude-libs,libssp.a', '-Wl,--no-insert-timestamp']\n"
    "cpp_link_args = ['-static', '-static-libgcc', '-static-libstdc++', '-fstack-protector-strong', '-Wl,--exclude-libs,libssp.a', '-Wl,--no-insert-timestamp']\n",
    encoding="utf-8",
)
PY

python3 "$repo_root/tools/Goo.TextNative/add-image-sources.py" --manifest "$manifest" --source-root "$work/harfbuzz-15.0.0"
export SOURCE_DATE_EPOCH=0
export CFLAGS="-O3 -g0 -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2 -fstack-protector-strong -fcf-protection=full -ffile-prefix-map=$work=."
export CXXFLAGS="$CFLAGS"
export LDFLAGS='-Wl,--no-insert-timestamp -static -static-libgcc -static-libstdc++ -fstack-protector-strong -Wl,--exclude-libs,libssp.a'
common_options=(--prefix=/usr --libdir=lib --buildtype=release --default-library=shared --wrap-mode=nodownload)
harfbuzz_options=(-Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dpng=disabled -Dzlib=disabled -Dicu=disabled -Dgraphite=disabled -Dgraphite2=disabled -Dfreetype=disabled -Dfontations=disabled -Dgdi=disabled -Ddirectwrite=disabled -Dcoretext=disabled -Dharfrust=disabled -Dkbts=disabled -Dwasm=disabled -Draster=disabled -Dvector=disabled -Dgpu=enabled -Dsubset=disabled -Dtests=disabled -Dintrospection=disabled -Ddocs=disabled -Ddoc_tests=false -Dutilities=disabled -Dbenchmark=disabled -Dgpu_demo=disabled -Dwith_libstdcxx=false)
meson setup "$work/harfbuzz-build" "$work/harfbuzz-15.0.0" --cross-file "$cross_file" "${common_options[@]}" "${harfbuzz_options[@]}"
ninja -C "$work/harfbuzz-build" -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf 2)"

harfbuzz_library="$(find "$work/harfbuzz-build" -type f -name 'goo-harfbuzz.dll' -print | LC_ALL=C sort | head -n 1)"
gpu_library="$(find "$work/harfbuzz-build" -type f -name 'goo-harfbuzz-gpu.dll' -print | LC_ALL=C sort | head -n 1)"
[[ -n "$harfbuzz_library" && -n "$gpu_library" ]]
harfbuzz_output="$staging/goo-harfbuzz.dll"
gpu_output="$staging/goo-harfbuzz-gpu.dll"
install -m 0755 "$harfbuzz_library" "$harfbuzz_output"
install -m 0755 "$gpu_library" "$gpu_output"
"$strip_tool" --strip-unneeded "$harfbuzz_output"
"$strip_tool" --strip-unneeded "$gpu_output"

file "$harfbuzz_output" | grep -Eqi 'PE32\+.*DLL.*x86-64'
file "$gpu_output" | grep -Eqi 'PE32\+.*DLL.*x86-64'
"$objdump" -f "$harfbuzz_output" | grep -Fq 'file format pei-x86-64'
"$objdump" -f "$gpu_output" | grep -Fq 'file format pei-x86-64'
python3 - "$manifest" "$objdump" "$harfbuzz_output" "$gpu_output" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
objdump = sys.argv[2]
paths = {"harfbuzz": Path(sys.argv[3]), "gpu": Path(sys.argv[4])}
for name, path in paths.items():
    output = subprocess.run([objdump, "-p", str(path)], check=True, stdout=subprocess.PIPE, text=True).stdout
    imports = [line.split("DLL Name:", 1)[1].strip() for line in output.splitlines() if "DLL Name:" in line]
    lowered = "\n".join(imports).casefold()
    for forbidden in manifest["build"]["windows"]["forbiddenImports"]:
        if forbidden.casefold() in lowered:
            raise SystemExit(f"{path.name} imports forbidden runtime/integration: {forbidden}")
    if name == "gpu" and manifest["build"]["windows"]["gpuImport"].casefold() not in {item.casefold() for item in imports}:
        raise SystemExit("hb-gpu core import drift")
PY

python3 "$repo_root/tools/Goo.TextNative/record-build.py" \
  --manifest "$manifest" \
  --target win-x64 \
  --output "$staging" \
  --tool-prefix "$tool_prefix" \
  --artifact "harfbuzz=$harfbuzz_output" \
  --artifact "gpu=$gpu_output"
install -m 0755 "$harfbuzz_output" "$output/goo-harfbuzz.dll"
install -m 0755 "$gpu_output" "$output/goo-harfbuzz-gpu.dll"
install -m 0644 "$staging/text-native-build.json" "$output/text-native-build.json"
printf 'Built %s (%s bytes)\n' "$output/goo-harfbuzz.dll" "$(stat -c %s "$output/goo-harfbuzz.dll")"
printf 'Built %s (%s bytes)\n' "$output/goo-harfbuzz-gpu.dll" "$(stat -c %s "$output/goo-harfbuzz-gpu.dll")"
