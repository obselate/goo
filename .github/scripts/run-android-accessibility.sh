#!/usr/bin/env bash
set -euo pipefail

apk="$(realpath "${1:?APK path is required}")"
work="$(realpath -m "${2:-artifacts/android-accessibility-36}")"
mkdir -p "$work"/{tmp,avd/device,home,user,cache,logs}
export TMPDIR="$work/tmp" ANDROID_TMP="$work/tmp"
export ANDROID_AVD_HOME="$work/avd" ANDROID_EMULATOR_HOME="$work/home"
export ANDROID_USER_HOME="$work/user" XDG_CACHE_HOME="$work/cache"
export ADB_SERVER_SOCKET=tcp:localhost:5038 ANDROID_ADB_SERVER_PORT=5038
adb="${ANDROID_HOME:?ANDROID_HOME must name the Android SDK}/platform-tools/adb"
image=x86_64-36_r07.zip
image_hash=c6bf44bdcd885bb902b4ba752d111a073ad7a817
if [[ -z "${GOO_EMULATOR_DIRECTORY:-}" ]]; then
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 https://dl.google.com/android/repository/emulator-linux_x64-16428233.zip -o "$work/emulator.zip"
  printf '%s  %s\n' cd7362ea55dfb86a418958138dc396e74165dd01 "$work/emulator.zip" | sha1sum -c -
  unzip -q "$work/emulator.zip" -d "$work/runtime"
  rm "$work/emulator.zip"
  GOO_EMULATOR_DIRECTORY="$work/runtime/emulator"
fi
if [[ -z "${GOO_ANDROID_IMAGE_DIRECTORY:-}" ]]; then
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 "https://dl.google.com/android/repository/sys-img/google_apis/$image" -o "$work/image.zip"
  printf '%s  %s\n' "$image_hash" "$work/image.zip" | sha1sum -c -
  unzip -q "$work/image.zip" -d "$work/image"
  rm "$work/image.zip"
  GOO_ANDROID_IMAGE_DIRECTORY="$work/image/x86_64"
fi
cat > "$work/avd/goo-accessibility.ini" <<EOF
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
image.sysdir.1=$GOO_ANDROID_IMAGE_DIRECTORY
tag.id=google_apis
target=android-36
PlayStore.enabled=false
EOF
[[ -r /dev/kvm && -w /dev/kvm ]]
"$GOO_EMULATOR_DIRECTORY/emulator" -accel-check
"$adb" -P 5038 start-server
"$GOO_EMULATOR_DIRECTORY/emulator" -avd goo-accessibility -port 5560 -no-window -no-audio \
  -no-snapshot -no-boot-anim -no-metrics -gpu lavapipe -cores 2 -memory 2560 \
  -no-direct-adb -adb-path "$adb" > "$work/logs/emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  timeout --kill-after=5 20 "$adb" -P 5038 -s emulator-5560 logcat -d > "$work/logs/logcat.txt" 2>&1 || true
  timeout --kill-after=5 20 "$adb" -P 5038 -s emulator-5560 shell cmd gpu vkjson > "$work/logs/vulkan.json" 2>&1 || true
  timeout --kill-after=5 20 "$adb" -P 5038 -s emulator-5560 exec-out screencap -p > "$work/logs/screen.png" 2>/dev/null || true
  timeout --kill-after=5 10 "$adb" -P 5038 -s emulator-5560 emu kill >/dev/null 2>&1 || true
  kill -KILL "$emulator_pid" 2>/dev/null || true
  timeout --kill-after=5 10 "$adb" -P 5038 kill-server >/dev/null 2>&1 || true
}
trap cleanup EXIT
for attempt in {1..180}; do
  if [[ "$(timeout 10 "$adb" -P 5038 -s emulator-5560 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  kill -0 "$emulator_pid"
  sleep 2
done
[[ "$(timeout 10 "$adb" -P 5038 -s emulator-5560 shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]
"$adb" -P 5038 -s emulator-5560 shell settings put global window_animation_scale 0
"$adb" -P 5038 -s emulator-5560 shell settings put global transition_animation_scale 0
"$adb" -P 5038 -s emulator-5560 shell settings put global animator_duration_scale 0
timeout 180 "$adb" -P 5038 -s emulator-5560 shell am wait-for-broadcast-idle --flush-broadcast-loopers
"$adb" -P 5038 -s emulator-5560 install --no-incremental -r "$apk"
timeout 180 "$adb" -P 5038 -s emulator-5560 shell am instrument -w -r \
  org.goo.androidsmoke/org.goo.androidsmoke.AccessibilityChecks | tee "$work/logs/instrumentation.txt"
grep -q 'GOO_ACCESSIBILITY_PASS' "$work/logs/instrumentation.txt"
grep -q 'INSTRUMENTATION_CODE: -1' "$work/logs/instrumentation.txt"
! grep -q 'GOO_ACCESSIBILITY_FAIL\|INSTRUMENTATION_FAILED\|INSTRUMENTATION_ABORTED' "$work/logs/instrumentation.txt"
"$adb" -P 5038 -s emulator-5560 shell pm clear org.goo.androidsmoke
timeout 180 "$adb" -P 5038 -s emulator-5560 shell am instrument -w -r \
  org.goo.androidsmoke/org.goo.androidsmoke.NotificationChecks | tee "$work/logs/notifications.txt"
grep -q 'GOO_NOTIFICATIONS_PASS' "$work/logs/notifications.txt"
grep -q 'INSTRUMENTATION_CODE: -1' "$work/logs/notifications.txt"
! grep -q 'GOO_NOTIFICATIONS_FAIL\|INSTRUMENTATION_FAILED\|INSTRUMENTATION_ABORTED' "$work/logs/notifications.txt"
"$adb" -P 5038 -s emulator-5560 shell input keyevent HOME
"$adb" -P 5038 -s emulator-5560 shell am kill org.goo.androidsmoke
! "$adb" -P 5038 -s emulator-5560 shell pidof org.goo.androidsmoke
"$adb" -P 5038 -s emulator-5560 logcat -c
"$adb" -P 5038 -s emulator-5560 shell cmd statusbar expand-notifications
python3 - "$adb" "$work/logs/notifications.xml" > "$work/logs/notification-tap.txt" <<'PY'
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
device = [sys.argv[1], '-P', '5038', '-s', 'emulator-5560']
deadline = time.monotonic() + 30
while time.monotonic() < deadline:
    subprocess.run([*device, 'shell', 'uiautomator', 'dump', '/sdcard/goo-notifications.xml'],
                   check=True, capture_output=True, timeout=30)
    subprocess.run([*device, 'pull', '/sdcard/goo-notifications.xml', sys.argv[2]],
                   check=True, capture_output=True, timeout=30)
    node = next((node for node in ET.parse(sys.argv[2]).iter("node")
                 if node.get("text") == "Goo cold activation"), None)
    if node is not None:
        break
else:
    raise RuntimeError("Cold activation notification did not appear")
x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.attrib["bounds"]))
print((x1 + x2) // 2, (y1 + y2) // 2)
PY
read -r x y < "$work/logs/notification-tap.txt"
"$adb" -P 5038 -s emulator-5560 shell input tap "$x" "$y"
for attempt in {1..30}; do
  "$adb" -P 5038 -s emulator-5560 logcat -d -s GooNotifications:I > "$work/logs/cold-notification.txt"
  if grep -q 'id=cold payload=cold-payload initial=True action=' "$work/logs/cold-notification.txt"; then break; fi
  sleep 1
done
grep -q 'id=cold payload=cold-payload initial=True action=' "$work/logs/cold-notification.txt"
