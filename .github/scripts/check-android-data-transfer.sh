#!/usr/bin/env bash
set -euo pipefail

source_apk="$(realpath "${1:?Source APK is required}")"
peer_apk="$(realpath "${2:?Peer APK is required}")"
work="$(realpath -m "${3:?Private runtime directory is required}")"
mode="${4:-clipboard}"
[[ "$mode" == clipboard || "$mode" == documents ]]
mkdir -p "$work"/{tmp,avd/device,home,user,cache,logs}
export TMPDIR="$work/tmp" ANDROID_TMP="$work/tmp"
export ANDROID_AVD_HOME="$work/avd" ANDROID_EMULATOR_HOME="$work/home"
export ANDROID_USER_HOME="$work/user" XDG_CACHE_HOME="$work/cache"
port="${GOO_ANDROID_EMULATOR_PORT:-5642}"
adb_port="${GOO_ANDROID_ADB_PORT:-5142}"
export ADB_SERVER_SOCKET="tcp:localhost:$adb_port" ANDROID_ADB_SERVER_PORT="$adb_port"
adb="${ANDROID_HOME:?Android SDK is required}/platform-tools/adb"
emulator="${GOO_EMULATOR_DIRECTORY:?Emulator directory is required}/emulator"
image="${GOO_ANDROID_IMAGE_DIRECTORY:?API 36 image directory is required}"
cat > "$work/avd/goo-data-transfer.ini" <<EOF
avd.ini.encoding=UTF-8
path=$work/avd/device
target=android-36
EOF
cat > "$work/avd/device/config.ini" <<EOF
avd.ini.encoding=UTF-8
abi.type=x86_64
hw.cpu.arch=x86_64
hw.cpu.ncore=2
hw.ramSize=2560
hw.lcd.width=1080
hw.lcd.height=1920
hw.lcd.density=420
hw.gpu.enabled=yes
hw.gpu.mode=lavapipe
hw.keyboard=yes
hw.mainKeys=no
disk.dataPartition.size=2G
image.sysdir.1=$image
tag.id=google_apis
target=android-36
PlayStore.enabled=false
EOF
"$adb" -P "$adb_port" start-server
"$emulator" -avd goo-data-transfer -port "$port" -wipe-data -no-window -no-qt -no-audio -no-snapshot -no-boot-anim \
  -no-metrics -gpu lavapipe -cores 2 -memory 2560 -no-direct-adb -adb-path "$adb" > "$work/logs/emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  timeout 20 "$adb" -P "$adb_port" -s "emulator-$port" logcat -d > "$work/logs/logcat.txt" 2>&1 || true
  timeout 10 "$adb" -P "$adb_port" -s "emulator-$port" emu kill >/dev/null 2>&1 || true
  kill "$emulator_pid" 2>/dev/null || true
  wait "$emulator_pid" 2>/dev/null || true
  "$adb" -P "$adb_port" kill-server || true
}
trap cleanup EXIT
for attempt in {1..180}; do
  if [[ "$(timeout 10 "$adb" -P "$adb_port" -s "emulator-$port" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  kill -0 "$emulator_pid"
  sleep 2
done
[[ "$(timeout 10 "$adb" -P "$adb_port" -s "emulator-$port" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]
"$adb" -P "$adb_port" -s "emulator-$port" install --no-incremental -r "$source_apk"
"$adb" -P "$adb_port" -s "emulator-$port" install --no-incremental -r "$peer_apk"
"$adb" -P "$adb_port" -s "emulator-$port" logcat -c
if [[ "$mode" == documents ]]; then
  for phase in pick reopen; do
    if [[ "$phase" == reopen ]]; then
      "$adb" -P "$adb_port" -s "emulator-$port" shell am force-stop org.goo.androidsmoke
    fi
    timeout 240 "$adb" -P "$adb_port" -s "emulator-$port" shell am instrument -w -r -e phase "$phase" \
      org.goo.androidsmoke/org.goo.androidsmoke.DocumentChecks | tee "$work/logs/documents-$phase.txt"
    grep -q "GOO_ANDROID_DOCUMENTS_PASS $phase" "$work/logs/documents-$phase.txt"
    grep -q 'INSTRUMENTATION_CODE: -1' "$work/logs/documents-$phase.txt"
    ! grep -q 'GOO_ANDROID_DOCUMENTS_FAIL\|INSTRUMENTATION_FAILED\|INSTRUMENTATION_ABORTED' "$work/logs/documents-$phase.txt"
  done
  exit 0
fi
wait_marker() {
  for attempt in {1..180}; do
    "$adb" -P "$adb_port" -s "emulator-$port" logcat -d -v brief -s GooClipboard:I > "$work/logs/clipboard.txt"
    if grep -q GOO_ANDROID_CLIPBOARD_FAIL "$work/logs/clipboard.txt"; then cat "$work/logs/clipboard.txt"; return 1; fi
    if grep -q "$1" "$work/logs/clipboard.txt"; then cat "$work/logs/clipboard.txt"; return 0; fi
    sleep 1
  done
  cat "$work/logs/clipboard.txt"
  return 1
}
component="$("$adb" -P "$adb_port" -s "emulator-$port" shell cmd package resolve-activity --brief --components -a android.intent.action.MAIN -c android.intent.category.LAUNCHER org.goo.androidsmoke | tr -d '\r')"
"$adb" -P "$adb_port" -s "emulator-$port" shell am start -W -n "$component" --ez goo.clipboard_smoke true
wait_marker GOO_ANDROID_CLIPBOARD_READY
old_pid="$("$adb" -P "$adb_port" -s "emulator-$port" shell pidof org.goo.androidsmoke | tr -d '\r')"
"$adb" -P "$adb_port" -s "emulator-$port" shell input keyevent KEYCODE_HOME
for attempt in {1..30}; do
  "$adb" -P "$adb_port" -s "emulator-$port" shell am kill org.goo.androidsmoke
  if [[ -z "$("$adb" -P "$adb_port" -s "emulator-$port" shell pidof org.goo.androidsmoke || true)" ]]; then break; fi
  sleep 1
done
"$adb" -P "$adb_port" -s "emulator-$port" shell dumpsys activity processes > "$work/logs/processes.txt"
[[ -z "$("$adb" -P "$adb_port" -s "emulator-$port" shell pidof org.goo.androidsmoke || true)" ]]
"$adb" -P "$adb_port" -s "emulator-$port" shell am start -W -n org.goo.clipboardpeer/org.goo.clipboardpeer.MainActivity
wait_marker GOO_ANDROID_CLIPBOARD_PASS
new_pid="$("$adb" -P "$adb_port" -s "emulator-$port" shell pidof org.goo.androidsmoke | tr -d '\r')"
[[ -n "$new_pid" && "$old_pid" != "$new_pid" ]]
printf 'Android clipboard streams passed after provider process recreation (%s -> %s).\n' "$old_pid" "$new_pid"
