#!/usr/bin/env bash
set -euo pipefail

destination="${1:?usage: fetch-appimage-tools.sh OUTPUT_DIR}"
mkdir -p "$destination"
headers=(--header 'Accept: application/octet-stream')
if [[ -n "${GH_TOKEN:-}" ]]; then
  headers+=(--header "Authorization: Bearer $GH_TOKEN")
fi
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 "${headers[@]}" \
  https://api.github.com/repos/AppImage/appimagetool/releases/assets/324406736 \
  --output "$destination/appimagetool-x86_64.AppImage"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 "${headers[@]}" \
  https://api.github.com/repos/AppImage/type2-runtime/releases/assets/657374641 \
  --output "$destination/runtime-x86_64"
printf '%s  %s\n' \
  ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0 "$destination/appimagetool-x86_64.AppImage" \
  617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46 "$destination/runtime-x86_64" \
  | sha256sum --check --strict
chmod 0755 "$destination/appimagetool-x86_64.AppImage"
