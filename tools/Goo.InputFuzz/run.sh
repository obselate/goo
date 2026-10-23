#!/usr/bin/env bash
set -euo pipefail

target="${1:?input target required}"
work="$PWD/artifacts/input-fuzz"
failures="$work/failures/$target"
mkdir -p "$failures"
options=(-max_total_time=600 -timeout=15 -rss_limit_mb=2048 -max_len=1048576 -artifact_prefix="$failures/")
export ASAN_OPTIONS=abort_on_error=1:detect_leaks=1
export UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1
export INPUT_TARGET="$target"
export INPUT_CURRENT="$work/current-$target"
status=0
case "$target" in
  svg|raster|wav)
    "$work/managed" "${options[@]}" --target_path=dotnet \
      --target_arg="$work/managed-target/Goo.InputFuzz.dll" "$work/corpus/$target" || status=$?
    if [[ "$status" != 0 && -f "$INPUT_CURRENT" ]]; then
      cp "$INPUT_CURRENT" "$failures/current-input"
    fi
    ;;
  native-image|font)
    "$work/$target" "${options[@]}" "$work/corpus/$target" || status=$?
    ;;
  *) exit 2 ;;
esac
exit "$status"
