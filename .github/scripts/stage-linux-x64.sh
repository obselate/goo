#!/usr/bin/env bash
set -euo pipefail

publish="${1:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
bundle="${2:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"
symbols="${3:?usage: stage-linux-x64.sh PUBLISH_DIR BUNDLE_DIR SYMBOLS_DIR}"

mapfile -t runtime_files <"$(dirname "${BASH_SOURCE[0]}")/linux-bundle-files.txt"

rm -rf "$bundle" "$symbols"
mkdir -p "$bundle" "$symbols"
for name in "${runtime_files[@]}"; do
  install -Dm0644 "$publish/$name" "$bundle/$name"
done
for name in LICENSE README.md CHANGELOG.md THIRD-PARTY-NOTICES.md; do
  install -m 0644 "$name" "$bundle/$name"
done
for name in "$publish"/*.pdb; do
  install -m 0644 "$name" "$symbols/$(basename "$name")"
done
(
  cd "$bundle"
  find . -mindepth 1 -type f ! -name SHA256SUMS \
    -printf '%P\n' | LC_ALL=C sort | xargs sha256sum >SHA256SUMS
)
