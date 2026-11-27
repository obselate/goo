#!/usr/bin/env bash
set -euo pipefail

dll="tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll"
experiments_dll=""

while (( $# > 0 )); do
  case "$1" in
    --dll)
      dll="${2:?--dll requires a path}"
      shift 2
      ;;
    --experiments-dll)
      experiments_dll="${2:?--experiments-dll requires a path}"
      shift 2
      ;;
    --help|-h)
      printf '%s\n' 'Usage: run-linux-readback-smokes.sh [--dll PATH] [--experiments-dll PATH]'
      exit 0
      ;;
    *)
      if [[ "$1" != --* && "$dll" == "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll" ]]; then
        dll="$1"
        shift
      else
        printf 'Unknown argument: %s\n' "$1" >&2
        exit 2
      fi
      ;;
  esac
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
cd "$repo_root"

[[ -f "$dll" ]] || {
  printf 'Missing async readback smoke assembly: %s\n' "$dll" >&2
  exit 1
}

export SDL_VIDEODRIVER=wayland
export LIBGL_ALWAYS_SOFTWARE=1
export VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation
export LD_LIBRARY_PATH="$repo_root/artifacts/native${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if [[ -z "${VK_DRIVER_FILES:-}" ]]; then
  lvp_icds=(/usr/share/vulkan/icd.d/lvp_icd*.json)
  if [[ -f "${lvp_icds[0]}" ]]; then
    export VK_DRIVER_FILES="${lvp_icds[0]}"
  fi
fi

tmp_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/goo-readback-smokes.XXXXXX")"
cleanup() {
  rm -rf -- "$tmp_root"
}
trap cleanup EXIT

base_cache="$tmp_root/mesa-shader-cache"
mkdir -p "$base_cache" "$tmp_root/logs" "$repo_root/artifacts/reports"

echo "Warming Mesa shader cache and running default GOO_VK_DIAGNOSTICS smoke..."
"$script_dir/with-headless-wayland.sh" env \
  MESA_SHADER_CACHE_DIR="$base_cache" \
  MESA_SHADER_CACHE_DISABLE=false \
  GOO_VK_DIAGNOSTICS=1 \
  dotnet "$dll"

standard_smokes=(
  "liquid-glass-alpha|GOO_VK_DIAGNOSTICS=1|GOO_LIQUID_GLASS_ALPHA_SMOKE=1"
  "backdrop-blur|GOO_VK_DIAGNOSTICS=1|GOO_BACKDROP_BLUR_SMOKE=1"
  "shader-effect|GOO_VK_DIAGNOSTICS=1|GOO_SHADER_EFFECT_SMOKE=1"
  "shader-generator|GOO_VK_DIAGNOSTICS=1|GOO_SHADER_GENERATOR_SMOKE=1"
  "fragment-correctness|GOO_VK_DIAGNOSTICS=1|GOO_FRAGMENT_CORRECTNESS_SMOKE=1"
  "queue-wake|GOO_QUEUE_WAKE_SMOKE=1"
  "svg-corpus|GOO_SVG_CORPUS_OUTPUT=$repo_root/artifacts/reports/svg-corpus|GOO_SVG_CORPUS_BASELINE=$repo_root/tests/Goo.AsyncReadbackSmoke/Assets/SvgCorpus"
  "vector-retain|GOO_VECTOR_RETAIN_SMOKE=1"
  "non-scaling-stroke|XDG_CACHE_HOME=$tmp_root/non-scaling-stroke-cache|GOO_VK_DIAGNOSTICS=1|GOO_NON_SCALING_STROKE_SMOKE=1"
  "svg-morph|GOO_SVG_MORPH_SMOKE=1"
  "diagnostic-capture-busy|GOO_VK_DIAGNOSTICS=1|GOO_DIAGNOSTIC_CAPTURE_BUSY_SMOKE=1"
  "profiler|GOO_PROFILER_SMOKE=1"
  "profiler-start|GOO_PROFILER_SMOKE=1|GOO_PROFILE_START=1"
  "animation-visibility|GOO_ANIMATION_VISIBILITY_SMOKE=1"
  "embedded-host|GOO_VK_DIAGNOSTICS=1|GOO_EMBEDDED_HOST_SMOKE=1"
  "window-activation|GOO_VK_DIAGNOSTICS=1|GOO_WINDOW_ACTIVATION_SMOKE=1"
  "window-display|GOO_VK_DIAGNOSTICS=1|GOO_WINDOW_DISPLAY_SMOKE=1"
  "timeline-completion|GOO_VK_DIAGNOSTICS=1|GOO_TIMELINE_COMPLETION_SMOKE=1"
  "primitive-metrics|GOO_PRIMITIVE_METRICS_SMOKE=1"
  "pipeline-identity|GOO_VK_DIAGNOSTICS=1|GOO_PIPELINE_IDENTITY_SMOKE=1"
  "clip-capture|GOO_VK_DIAGNOSTICS=1|GOO_CLIP_CAPTURE_SMOKE=1"
  "partial-redraw|GOO_VK_DIAGNOSTICS=1|GOO_PARTIAL_REDRAW_SMOKE=1"
  "retained-frame-equality|GOO_VK_DIAGNOSTICS=1|GOO_RETAINED_FRAME_EQUALITY_SMOKE=1"
  "editor-gutter|GOO_VK_DIAGNOSTICS=1|GOO_EDITOR_GUTTER_SMOKE=1"
  "glyph-upload|GOO_VK_DIAGNOSTICS=1|GOO_GLYPH_UPLOAD_SMOKE=1"
  "scrollbar|GOO_VK_DIAGNOSTICS=1|GOO_SCROLLBAR_SMOKE=1"
  "scroll-placement|GOO_VK_DIAGNOSTICS=1|GOO_SCROLL_PLACEMENT_SMOKE=1"
  "portal-capture|GOO_VK_DIAGNOSTICS=1|GOO_PORTAL_CAPTURE_SMOKE=1"
  "keyed-order|GOO_KEYED_ORDER_SMOKE=1"
  "pixel-edge|GOO_VK_DIAGNOSTICS=1|GOO_PIXEL_EDGE_SMOKE=1"
  "border-snap|GOO_VK_DIAGNOSTICS=1|GOO_BORDER_SNAP_SMOKE=1"
  "rounded-resize-first-frame|GOO_VK_DIAGNOSTICS=1|GOO_ROUNDED_RESIZE_FIRST_FRAME_SMOKE=1"
  "path-atlas-growth|GOO_VK_DIAGNOSTICS=1|GOO_PATH_ATLAS_GROWTH_SMOKE=1"
  "hide-resources|GOO_VK_DIAGNOSTICS=1|GOO_HIDE_RESOURCES_SMOKE=1"
  "hidden-device-recovery|GOO_VK_DIAGNOSTICS=1|GOO_HIDDEN_DEVICE_RECOVERY_SMOKE=1"
  "pending-device-recovery|GOO_VK_DIAGNOSTICS=1|GOO_PENDING_DEVICE_RECOVERY_SMOKE=1"
  "zero-extent-device-recovery|GOO_VK_DIAGNOSTICS=1|GOO_ZERO_EXTENT_DEVICE_RECOVERY_SMOKE=1"
  "image-staging|GOO_VK_DIAGNOSTICS=1|GOO_IMAGE_STAGING_SMOKE=1"
  "image-release|GOO_VK_DIAGNOSTICS=1|GOO_IMAGE_RELEASE_SMOKE=1"
  "image-budget-pressure|GOO_VK_DIAGNOSTICS=1|GOO_IMAGE_BUDGET_PRESSURE_SMOKE=1"
  "transparent-window|GOO_VK_DIAGNOSTICS=1|GOO_TRANSPARENT_WINDOW_SMOKE=1"
  "ordered-modifier|GOO_VK_DIAGNOSTICS=1|GOO_ORDERED_MODIFIER_SMOKE=1"
  "prevented-key-repeat|GOO_PREVENTED_KEY_REPEAT_SMOKE=1"
)

specs_file="$tmp_root/standard-smokes.specs"
printf '%s\n' "${standard_smokes[@]}" > "$specs_file"

echo "Running ${#standard_smokes[@]} standard Wayland smokes in 1 persistent session..."
"$script_dir/with-headless-wayland.sh" env \
  MESA_SHADER_CACHE_DIR="$base_cache" \
  MESA_SHADER_CACHE_DISABLE=false \
  bash -s "$dll" "$specs_file" "$tmp_root/logs" "${#standard_smokes[@]}" <<'WORKER_EOF'
set -euo pipefail
dll="$1"
specs_file="$2"
log_dir="$3"
total="$4"
index=0
while IFS='|' read -r label env_specs; do
  [[ -n "$label" ]] || continue
  index=$((index + 1))
  IFS='|' read -r -a vars <<< "$env_specs"
  log_file="$log_dir/${label}.log"
  printf '[smoke %d/%d] %s\n' "$index" "$total" "$label"
  if ! env "${vars[@]}" dotnet "$dll" >"$log_file" 2>&1; then
    printf '=== FAILED SMOKE (%d/%d): %s ===\n' "$index" "$total" "$label" >&2
    cat "$log_file" >&2
    exit 1
  fi
done < "$specs_file"
WORKER_EOF

echo "Verifying local PNG pixels and CPU device selection (GOO_IMAGE_FILE_SMOKE=1)..."
"$script_dir/with-headless-wayland.sh" env \
  MESA_SHADER_CACHE_DIR="$base_cache" \
  MESA_SHADER_CACHE_DISABLE=false \
  GOO_IMAGE_FILE_SMOKE=1 \
  GOO_VK_DIAGNOSTICS=1 \
  dotnet "$dll" 2>&1 | tee "$repo_root/artifacts/reports/vulkan-cpu-startup.txt"
grep -E '"kind":"device".*"deviceType":4,' "$repo_root/artifacts/reports/vulkan-cpu-startup.txt"

echo "Running isolated GOO_NATIVE_POPUP_SMOKE=1..."
(
  reports="$repo_root/artifacts/reports/native-popup"
  mkdir -p "$reports"
  if command -v dpkg-query >/dev/null 2>&1; then
    dpkg-query -W -f '${binary:Package}\t${Version}\n' weston libweston-13-0 \
      > "$reports/packages.txt" 2>/dev/null || true
  fi
  restore_core_pattern=0
  core_pattern=""
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null && [[ -r /proc/sys/kernel/core_pattern ]]; then
    command -v gdb >/dev/null || sudo apt-get install -y --no-install-recommends gdb
    core_pattern="$(cat /proc/sys/kernel/core_pattern)"
    restore_core_pattern=1
    trap 's=$?; if (( restore_core_pattern )); then printf "%s\n" "$core_pattern" | sudo tee /proc/sys/kernel/core_pattern >/dev/null; fi; exit "$s"' EXIT
    printf '%s\n' "$reports/core.%e.%p" | sudo tee /proc/sys/kernel/core_pattern >/dev/null
    ulimit -S -c 131072
  fi
  status=0
  "$script_dir/with-headless-wayland.sh" env \
    MESA_SHADER_CACHE_DIR="$base_cache" \
    MESA_SHADER_CACHE_DISABLE=false \
    GOO_VK_DIAGNOSTICS=1 \
    GOO_NATIVE_POPUP_SMOKE=1 \
    WAYLAND_DEBUG=client \
    bash -c 'ulimit -c 0; exec dotnet "$@"' bash \
    "$dll" \
    2> "$reports/client-protocol.log" || status=$?
  if (( status != 0 )); then
    cat "$reports/client-protocol.log" >&2
    for core in "$reports"/core.*; do
      [[ -f "$core" ]] || continue
      if [[ "$core" != "$reports"/core.weston.* ]] || ! command -v gdb >/dev/null 2>&1; then
        rm -f -- "$core"
        continue
      fi
      if DEBUGINFOD_URLS=https://debuginfod.ubuntu.com DEBUGINFOD_TIMEOUT=15 \
        timeout --kill-after=5s 120s gdb -q -nx -batch \
        -iex 'set debuginfod enabled on' \
        -ex 'set pagination off' -ex 'set backtrace limit 64' \
        -ex 'set print elements 64' -ex 'info sharedlibrary' \
        -ex 'thread apply all bt full' /usr/bin/weston "$core" \
        > "$reports/weston-backtrace.txt" 2>&1 \
        && grep -q '^#0 ' "$reports/weston-backtrace.txt" \
        && ! grep -q '??' "$reports/weston-backtrace.txt"; then
        rm -f -- "$core"
      fi
    done
  fi
  exit "$status"
)

if [[ "${CI:-}" == true ]] || command -v sway >/dev/null 2>&1; then
  echo "Running isolated GOO_LAYER_WINDOW_CLOSE_SMOKE=1 under kwin..."
  GOO_WAYLAND_COMPOSITOR=kwin "$script_dir/with-headless-wayland.sh" env \
    MESA_SHADER_CACHE_DIR="$base_cache" \
    MESA_SHADER_CACHE_DISABLE=false \
    GOO_VK_DIAGNOSTICS=1 \
    GOO_LAYER_WINDOW_CLOSE_SMOKE=1 \
    dotnet "$dll"
else
  echo "Skipping GOO_LAYER_WINDOW_CLOSE_SMOKE=1 locally (sway not installed; enforced in CI)."
fi

echo "Running batched GPU experiment smokes..."
exp_xdg="$tmp_root/gpu-experiments"
mkdir -p "$exp_xdg"/{config,cache,data}
"$script_dir/with-headless-wayland.sh" env \
  MESA_SHADER_CACHE_DIR="$base_cache" \
  MESA_SHADER_CACHE_DISABLE=false \
  XDG_CONFIG_HOME="$exp_xdg/config" \
  XDG_CACHE_HOME="$exp_xdg/cache" \
  XDG_DATA_HOME="$exp_xdg/data" \
  GOO_VK_DIAGNOSTICS=1 \
  GOO_GPU_EXPERIMENT_SMOKE=1 \
  GOO_VK_GPU_EXPERIMENT=no-text \
  GOO_GPU_EXPERIMENT_EXPECTED=none \
  dotnet "$dll"

if [[ -n "$experiments_dll" ]]; then
  [[ -f "$experiments_dll" ]] || {
    printf 'Missing GPU experiments smoke assembly: %s\n' "$experiments_dll" >&2
    exit 1
  }
  printf 'no-text\n' > "$exp_xdg/selection"
  "$script_dir/with-headless-wayland.sh" env \
    MESA_SHADER_CACHE_DIR="$base_cache" \
    MESA_SHADER_CACHE_DISABLE=false \
    XDG_CONFIG_HOME="$exp_xdg/config" \
    XDG_CACHE_HOME="$exp_xdg/cache" \
    XDG_DATA_HOME="$exp_xdg/data" \
    bash -s "$experiments_dll" "$exp_xdg/selection" "$tmp_root/logs" <<'EXP_EOF'
set -euo pipefail
experiments_dll="$1"
selection_file="$2"
log_dir="$3"
for mode in none full-redraw no-text no-shadows no-images no-layers \
  no-clip-sampling clip-clear-only clip-regenerate no-gpu-timestamps; do
  log_file="$log_dir/exp-${mode}.log"
  printf '[gpu-experiment] %s\n' "$mode"
  if ! GOO_VK_DIAGNOSTICS=1 GOO_GPU_EXPERIMENT_SMOKE=1 \
    GOO_VK_GPU_EXPERIMENT="$mode" GOO_GPU_EXPERIMENT_EXPECTED="$mode" \
    dotnet "$experiments_dll" >"$log_file" 2>&1; then
    printf '=== FAILED GPU EXPERIMENT: %s ===\n' "$mode" >&2
    cat "$log_file" >&2
    exit 1
  fi
done
log_file="$log_dir/exp-selection-file.log"
printf '[gpu-experiment] selection-file\n'
if ! GOO_VK_DIAGNOSTICS=1 GOO_GPU_EXPERIMENT_SMOKE=1 \
  GOO_VK_GPU_EXPERIMENT=no-shadows GOO_GPU_EXPERIMENT_EXPECTED=no-text \
  GOO_VK_GPU_EXPERIMENT_FILE="$selection_file" \
  dotnet "$experiments_dll" >"$log_file" 2>&1; then
  printf '=== FAILED GPU EXPERIMENT: selection-file ===\n' >&2
  cat "$log_file" >&2
  exit 1
fi
EXP_EOF
fi

echo "All Linux readback smokes passed."
