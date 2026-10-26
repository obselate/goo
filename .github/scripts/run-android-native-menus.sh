#!/usr/bin/env bash
set -euo pipefail
apk="$(realpath "${1:?APK path is required}")"
offscreen_apk="$(realpath "${2:?Offscreen APK path is required}")"
work="$(realpath -m "${3:-artifacts/android-native-menus}")"
mkdir -p "$work"/{tmp,avd/device,home,user,cache,logs}
export TMPDIR="$work/tmp" ANDROID_TMP="$work/tmp"
export ANDROID_AVD_HOME="$work/avd" ANDROID_EMULATOR_HOME="$work/home"
export ANDROID_USER_HOME="$work/user" XDG_CACHE_HOME="$work/cache"
export ADB_SERVER_SOCKET=tcp:localhost:5042 ANDROID_ADB_SERVER_PORT=5042
adb="${ANDROID_HOME:?ANDROID_HOME is required}/platform-tools/adb"
if [[ -z "${GOO_EMULATOR_DIRECTORY:-}" ]]; then
    curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 https://dl.google.com/android/repository/emulator-linux_x64-16428233.zip -o "$work/emulator.zip"
    printf '%s  %s\n' cd7362ea55dfb86a418958138dc396e74165dd01 "$work/emulator.zip" | sha1sum -c -
    unzip -q "$work/emulator.zip" -d "$work/runtime"
    rm "$work/emulator.zip"
    GOO_EMULATOR_DIRECTORY="$work/runtime/emulator"
fi
if [[ -z "${GOO_ANDROID_IMAGE_DIRECTORY:-}" ]]; then
    curl --fail --location --retry 5 --retry-all-errors --retry-delay 2 https://dl.google.com/android/repository/sys-img/google_apis/x86_64-36_r07.zip -o "$work/image.zip"
    printf '%s  %s\n' c6bf44bdcd885bb902b4ba752d111a073ad7a817 "$work/image.zip" | sha1sum -c -
    unzip -q "$work/image.zip" -d "$work/image"
    rm "$work/image.zip"
    GOO_ANDROID_IMAGE_DIRECTORY="$work/image/x86_64"
fi
cat > "$work/avd/goo-native-menus.ini" <<EOF
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
"$adb" -P 5042 start-server
"$GOO_EMULATOR_DIRECTORY/emulator" -avd goo-native-menus -port 5564 -no-window -no-audio \
    -no-snapshot -no-boot-anim -no-metrics -gpu lavapipe -cores 2 -memory 2560 \
    -no-direct-adb -adb-path "$adb" > "$work/logs/emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
    timeout --kill-after=5 15 "$adb" -P 5042 -s emulator-5564 logcat -d > "$work/logs/logcat.txt" 2>&1 || true
    timeout --kill-after=5 15 "$adb" -P 5042 -s emulator-5564 shell cat /data/local/tmp/goo-native-menu.xml > "$work/logs/menu.xml" 2>&1 || true
    timeout --kill-after=5 15 "$adb" -P 5042 -s emulator-5564 shell dumpsys activity activities > "$work/logs/activities.txt" 2>&1 || true
    timeout --kill-after=5 15 "$adb" -P 5042 -s emulator-5564 exec-out screencap -p > "$work/logs/screen.png" 2>/dev/null || true
    timeout --kill-after=5 10 "$adb" -P 5042 -s emulator-5564 emu kill >/dev/null 2>&1 || true
    kill -KILL "$emulator_pid" 2>/dev/null || true
    timeout --kill-after=5 10 "$adb" -P 5042 kill-server >/dev/null 2>&1 || true
}
trap cleanup EXIT
python3 - "$adb" "$apk" <<'PY'
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
adb, apk = sys.argv[1:]
def run(*args):
    return subprocess.run([adb, '-P', '5042', '-s', 'emulator-5564', *args], capture_output=True, text=True, timeout=30)
def until(check, label):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        value = check()
        if value is not None and value is not False:
            return value
        time.sleep(0.5)
    raise RuntimeError(label)
until(lambda: run('shell', 'getprop', 'sys.boot_completed').stdout.strip() == '1', 'Android did not boot')
installed = run('install', '--no-incremental', '-r', apk)
if installed.returncode:
    raise RuntimeError(installed.stdout + installed.stderr)
run('logcat', '-c')
run('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
run('shell', 'wm', 'dismiss-keyguard')
started = run('shell', 'am', 'start', '-n', 'org.goo.androidsmoke/org.goo.androidsmoke.MainActivity',
    '--ez', 'goo.native_menu_smoke', 'true')
if started.returncode or 'Error' in started.stderr:
    raise RuntimeError(started.stdout + started.stderr)
until(lambda: 'passed activity-relaunch' in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout,
    'Android native menu Activity did not relaunch')
until(lambda: 'selection-ready' in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout,
    'Android native menu selection did not become ready')
def item(text):
    run('shell', 'uiautomator', 'dump', '/data/local/tmp/goo-native-menu.xml')
    xml = run('shell', 'cat', '/data/local/tmp/goo-native-menu.xml').stdout
    if not xml.startswith('<?xml'):
        return None
    return next((node for node in ET.fromstring(xml).iter('node') if node.get('text') == text), None)
for text in ('Actions', 'Select'):
    node = until(lambda: item(text), 'Native row did not appear: ' + text)
    x0, y0, x1, y1 = map(int, re.findall(r'\d+', node.get('bounds')))
    run('shell', 'input', 'tap', str((x0 + x1) // 2), str((y0 + y1) // 2))
until(lambda: item('Cancel this menu with Back'), 'Native cancellation row did not appear')
run('shell', 'input', 'keyevent', '4')
until(lambda: 'passed selection cancellation busy shortcuts owner-close' in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout,
    'Android native menu checks did not finish')
native_pid = run('shell', 'pidof', 'org.goo.androidsmoke').stdout.strip()
started = run('shell', 'am', 'start', '-f', '0x18000000', '-n', 'org.goo.androidsmoke/org.goo.androidsmoke.MainActivity',
    '--ez', 'goo.native_menu_smoke', 'true', '--ez', 'goo.native_menu_destroy', 'true')
if started.returncode or 'Error' in started.stderr:
    raise RuntimeError(started.stdout + started.stderr)
until(lambda: 'activity-close' in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout,
    'Activity closure did not complete the native menu')
if 'passed activity-close' not in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout:
    raise RuntimeError('Activity closure returned the wrong native menu status')
until(lambda: 'activity-destroyed' in run('logcat', '-d', '-s', 'GooNativeMenus:I', '*:S').stdout,
    'Native menu Activity did not finish destruction')
run('shell', 'uiautomator', 'dump', '/data/local/tmp/goo-native-menu.xml')
final_log = run('logcat', '-d', '--pid', native_pid).stdout
if 'FATAL EXCEPTION' in final_log or 'UNHANDLED EXCEPTION' in final_log:
    raise RuntimeError(final_log)
print('GOO_NATIVE_MENUS_PASS')
PY
"$adb" -P 5042 -s emulator-5564 install --no-incremental -r "$offscreen_apk"
"$adb" -P 5042 -s emulator-5564 logcat -c
"$adb" -P 5042 -s emulator-5564 shell am start \
    -n org.goo.offscreenproof/org.goo.offscreenproof.MainActivity
for _ in {1..90}; do
    "$adb" -P 5042 -s emulator-5564 logcat -d -s GooOffscreenProof:I '*:S' > "$work/logs/offscreen.txt"
    if grep -q 'PASS:\|FAIL:' "$work/logs/offscreen.txt"; then break; fi
    sleep 0.5
done
grep -F 'PASS: paused Android activity, destroyed presentation surface' "$work/logs/offscreen.txt"
echo GOO_OFFSCREEN_ANDROID_PASS
