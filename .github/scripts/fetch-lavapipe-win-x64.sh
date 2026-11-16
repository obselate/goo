#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: fetch-lavapipe-win-x64.sh OUTPUT_DIRECTORY}"
rm -rf -- "$output/native" "$output/licenses" "$output/provenance.json"
mkdir -p "$output/native" "$output/licenses"
work="$(mktemp -d "$(dirname "$output")/lavapipe-win.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
for command_name in curl 7z sha256sum python3; do
  command -v "$command_name" >/dev/null || { printf 'required command missing: %s\n' "$command_name" >&2; exit 1; }
done
curl -fLsS --retry 5 https://github.com/pal1000/mesa-dist-win/releases/download/26.2.6/mesa3d-26.2.6-release-msvc.7z -o "$work/mesa.7z"
curl -fLsS --retry 5 https://sdk.lunarg.com/sdk/download/1.4.363.0/windows/VulkanRT-X64-1.4.363.0-Components.zip -o "$work/loader.zip"
printf '%s  %s\n' b2e00615feaba45942343c265cc8c5f576142ca682c1ac6661922d4b72492877 "$work/mesa.7z" a25a927aa8b9f0371048f1861cf88ac3b9bc9b1fb332c42d897c8ab32695769a "$work/loader.zip" | sha256sum -c -
7z e -y "-o$output/native" "$work/mesa.7z" x64/vulkan_lvp.dll
7z e -y "-o$output/native" "$work/loader.zip" '*/x64/vulkan-1.dll'
cp "$(dirname "$0")/../../Goo.SoftwareRenderer/licenses/win-x64/"*.txt "$output/licenses/"
python3 - "$output" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
artifacts = {path.name: {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size} for path in sorted((out / 'native').iterdir())}
(out / 'provenance.json').write_text(json.dumps({'mesa': '26.2.6', 'mesaSha256': 'b2e00615feaba45942343c265cc8c5f576142ca682c1ac6661922d4b72492877', 'loader': '1.4.363.0', 'loaderSha256': 'a25a927aa8b9f0371048f1861cf88ac3b9bc9b1fb332c42d897c8ab32695769a', 'rid': 'win-x64', 'artifacts': artifacts}, indent=2) + '\n')
print(json.dumps(artifacts, indent=2))
PY
