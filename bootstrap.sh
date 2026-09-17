#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
commit="947be9cb5f4467947ecb95dba06b461f9984d659"
gsharp="$root/artifacts/gsharp"

if [ ! -f "$gsharp/commit" ] \
  || [ "$(tr -d '\r\n' <"$gsharp/commit")" != "$commit" ] \
  || [ ! -f "$gsharp/compiler/gsc.dll" ] \
  || [ ! -f "$gsharp/formatter/gsfmt.dll" ]; then
  temporary="$(mktemp -d)"
  temporary="$(cd "$temporary" && pwd -P)"
  trap 'rm -rf "$temporary"' EXIT
  git clone -q https://github.com/DavidObando/gsharp.git "$temporary/gsharp"
  git -C "$temporary/gsharp" checkout -q --detach "$commit"
  rm -rf "$gsharp/compiler" "$gsharp/formatter"
  dotnet publish "$temporary/gsharp/src/Compiler/Compiler.csproj" -c Release --nologo -o "$gsharp/compiler"
  dotnet publish "$temporary/gsharp/src/Formatting/Gsfmt.Cli/Gsfmt.Cli.csproj" -c Release --nologo -o "$gsharp/formatter"
  cp "$temporary/gsharp/LICENSE" "$gsharp/LICENSE"
  printf '%s\n' "$commit" >"$gsharp/commit"
  rm -rf "$temporary"
  trap - EXIT
  printf 'Installed pinned G# authoring tools.\n'
else
  printf 'G# authoring tools are current.\n'
fi

if [ "${1:-}" = "--gsharp-only" ]; then
  exit
fi

version="$(sed -n 's:.*<GooReleaseVersion>\([^<]*\)</GooReleaseVersion>.*:\1:p' "$root/Directory.Build.props")"
gallery="$root/artifacts/gallery-native"
if [ -f "$gallery/.version" ] && [ "$(tr -d '\r\n' <"$gallery/.version")" = "$version" ]; then
  printf 'Gallery native assets are current.\n'
  exit
fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
curl --fail --location --retry 3 \
  "https://github.com/obselate/goo/releases/download/v$version/Goo.$version.nupkg" \
  --output "$temporary/Goo.nupkg"
rm -rf "$gallery"
mkdir -p "$gallery"
unzip -q "$temporary/Goo.nupkg" -d "$gallery"
printf '%s\n' "$version" >"$gallery/.version"
printf 'Installed Goo %s Gallery native assets.\n' "$version"
