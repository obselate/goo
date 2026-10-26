#!/usr/bin/env bash
set -euo pipefail

output="${1:?usage: fetch-sdl-win-x64.sh OUTPUT_DLL}"
version=3.4.0
archive_sha256=fdb00563e2a17e7125681da0e8b06afcc7e0ef7ab73b7edcd8f2f7bd0ae73d3e
dll_sha256=2632e21625861a0dc106f2b1abb649e610d8be88534ba74c76a763abe5aefaa3
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

curl --fail --location --silent --show-error --retry 5 --retry-all-errors --retry-delay 2 \
  "https://github.com/libsdl-org/SDL/releases/download/release-$version/SDL3-$version-win32-x64.zip" \
  --output "$temporary/SDL3.zip"
printf '%s  %s\n' "$archive_sha256" "$temporary/SDL3.zip" | sha256sum --check --status
unzip -q "$temporary/SDL3.zip" SDL3.dll -d "$temporary"
printf '%s  %s\n' "$dll_sha256" "$temporary/SDL3.dll" | sha256sum --check --status
install -Dm0644 "$temporary/SDL3.dll" "$output"
