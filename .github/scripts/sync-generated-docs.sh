#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
./bootstrap.sh --gsharp-only
dotnet workload install android
dotnet build Goo.Android/Goo.Android.gsproj -c Release \
  -p:AndroidSdkDirectory="$ANDROID_HOME" -p:JavaSdkDirectory="$JAVA_HOME" \
  -p:TreatWarningsAsErrors=true
dotnet build tests/Goo.ApiContractTests/Goo.ApiContractTests.gsproj -c Release -p:TreatWarningsAsErrors=true
dotnet build tools/Goo.ApiDocs/Goo.ApiDocs.gsproj -c Release
for source in Goo Goo.Audio Goo.Android; do
  xml="$source/bin/Release/net10.0/$source.xml"
  output=docs/api
  if [ "$source" = Goo.Audio ]; then output=docs/api-audio; fi
  if [ "$source" = Goo.Android ]; then
    xml="$source/bin/Release/net10.0-android/$source.xml"
    output=docs/api-android
  fi
  dotnet tools/Goo.ApiDocs/bin/Release/net10.0/Goo.ApiDocs.dll \
    --source "$source" --xml "$xml" --output "$output"
done
rm -rf docs/api-gestures docs/api-images docs/api-native-menus docs/api-native-dialogs \
  docs/api-notifications docs/api-printing docs/api-spell-check docs/api-spell-check.hunspell docs/api-app-host docs/api-rich-text
dotnet run --project tools/Goo.SyncDocs/Goo.SyncDocs.gsproj -c Release -- .
if [ "${1:-}" = --check ] && [ -n "$(git status --porcelain -- 'docs/api*' plugins/goo/reference)" ]; then
  printf '%s\n' '::error::Generated documentation is stale. Run: bash .github/scripts/sync-generated-docs.sh'
  git diff --stat -- 'docs/api*' plugins/goo/reference
  exit 1
fi
