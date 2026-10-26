#!/usr/bin/env bash
set -euo pipefail

destination="${1:?usage: fetch-bundletool.sh OUTPUT_DIR}"
mkdir -p "$destination"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 \
  https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar \
  --output "$destination/bundletool-all-1.18.3.jar"
printf '%s  %s\n' a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29 \
  "$destination/bundletool-all-1.18.3.jar" | sha256sum --check --strict
