#!/usr/bin/env bash
set -euo pipefail

if [[ $# == 0 || ${1:-} == --help || ${1:-} == -h ]]; then
  printf '%s\n' 'Usage: with-headless-wayland.sh COMMAND [ARGUMENT ...]'
  exit 0
fi
if [[ "$(uname -s)" == Darwin ]]; then
  exec "$@"
fi
if [[ ${GOO_HEADLESS_PRIVATE_BUS:-} != 1 ]]; then
  root="$(cd "$(dirname "$0")/../.." && pwd)"
  mkdir -p "${RUNNER_TEMP:-$root/artifacts}"
  session="$(mktemp -d "${RUNNER_TEMP:-$root/artifacts}/goo-wayland.XXXXXX")"
  export XDG_RUNTIME_DIR="$session/runtime" XDG_CACHE_HOME="$session/cache"
  export XDG_CONFIG_HOME="$session/config" XDG_DATA_HOME="$session/data"
  mkdir -p "$XDG_RUNTIME_DIR" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME"
  chmod 700 "$XDG_RUNTIME_DIR"
  cleanup() {
    status=$?
    trap - EXIT INT TERM
    kill -- "-$session_pid" 2>/dev/null || true
    wait "$session_pid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      if ! kill -0 -- "-$session_pid" 2>/dev/null; then break; fi
      sleep 0.1
    done
    kill -KILL -- "-$session_pid" 2>/dev/null || true
    if (( status != 0 )); then cat "$session/compositor.log" 2>/dev/null || true; fi
    rm -rf -- "$session"
    exit "$status"
  }
  trap cleanup EXIT INT TERM
  setsid dbus-run-session -- env GOO_HEADLESS_PRIVATE_BUS=1 GOO_HEADLESS_SESSION="$session" "$0" "$@" &
  session_pid=$!
  wait "$session_pid"
  exit $?
fi

unset DISPLAY
export WAYLAND_DISPLAY="${GOO_WAYLAND_DISPLAY:-goo-wayland}"
export GOO_HEADLESS_WAYLAND=1
if [[ ${GOO_WAYLAND_COMPOSITOR:-kwin} == weston ]]; then
  weston --backend=headless-backend.so --renderer="${GOO_WESTON_RENDERER:-pixman}" \
    --socket="$WAYLAND_DISPLAY" --idle-time=0 >"$GOO_HEADLESS_SESSION/compositor.log" 2>&1 &
else
  kwin_wayland --virtual --width 1400 --height 900 --scale 1 \
    --no-global-shortcuts --no-lockscreen --no-kactivities \
    --socket "$WAYLAND_DISPLAY" >"$GOO_HEADLESS_SESSION/compositor.log" 2>&1 &
fi
for _ in $(seq 1 100); do
  if test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"; then break; fi
  sleep 0.1
done
test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"
"$@"
