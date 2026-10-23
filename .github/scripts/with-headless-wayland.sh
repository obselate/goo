#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == Darwin ]]; then
  exec "$@"
fi

if [[ "${GOO_HEADLESS_PRIVATE_BUS:-}" != 1 ]]; then
  exec dbus-run-session -- env GOO_HEADLESS_PRIVATE_BUS=1 "$0" "$@"
fi

runtime_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/goo-xdg-runtime.XXXXXX")"
export XDG_RUNTIME_DIR="$runtime_root"
export WAYLAND_DISPLAY="${GOO_WAYLAND_DISPLAY:-goo-wayland}"
export GOO_HEADLESS_WAYLAND=1
compositor_log="$runtime_root/compositor.log"

cleanup() {
  status=$?
  kill -- "$compositor_target" 2>/dev/null || true
  wait "$compositor_pid" 2>/dev/null || true
  while kill -0 -- "$compositor_target" 2>/dev/null; do
    sleep 0.1
  done
  if (( status != 0 )); then
    cat "$compositor_log"
  fi
  rm -rf -- "$runtime_root"
  exit "$status"
}
trap cleanup EXIT

if [[ "${GOO_HEADLESS_COMPOSITOR:-}" != kwin ]] && command -v weston >/dev/null 2>&1; then
  weston --backend=headless-backend.so --renderer="${GOO_WESTON_RENDERER:-pixman}" \
    --socket="$WAYLAND_DISPLAY" --idle-time=0 >"$compositor_log" 2>&1 &
  compositor_pid=$!
  compositor_target=$compositor_pid
else
  XDG_CONFIG_HOME="$runtime_root/config" setsid kwin_wayland --virtual \
    --width 1400 --height 900 --scale 1 --no-global-shortcuts --no-lockscreen --no-kactivities \
    --socket "$WAYLAND_DISPLAY" >"$compositor_log" 2>&1 &
  compositor_pid=$!
  compositor_target=-$compositor_pid
fi
for _ in $(seq 1 50); do
  test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" && break
  sleep 0.1
done
test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"

"$@"
