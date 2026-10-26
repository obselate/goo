#!/usr/bin/env bash
set -euo pipefail

destination="${1:?usage: fetch-appimage-tools.sh OUTPUT_DIR}"
mkdir -p "$destination"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 --header 'Accept: application/octet-stream' \
  https://api.github.com/repos/AppImage/appimagetool/releases/assets/610035789 \
  --output "$destination/appimagetool-x86_64.AppImage"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 --header 'Accept: application/octet-stream' \
  https://api.github.com/repos/AppImage/type2-runtime/releases/assets/657374641 \
  --output "$destination/runtime-x86_64"
printf '%s  %s\n' \
  95cbe7cce9717fce90c484e34052ee7c7f1d7635b33c12525b4776826a7d29b6 "$destination/appimagetool-x86_64.AppImage" \
  617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46 "$destination/runtime-x86_64" \
  | sha256sum --check --strict
chmod 0755 "$destination/appimagetool-x86_64.AppImage"
