#!/usr/bin/env bash
set -euo pipefail

PKG="com.nullstatestudios.beyondsingularity"
ACT="$PKG/.MainActivity"
OUT="${1:-native-qa}"
mkdir -p "$OUT"

wait_for_app() {
  for _ in {1..40}; do
    if adb shell pidof "$PKG" >/dev/null 2>&1; then
      sleep 1.2
      return 0
    fi
    sleep 0.35
  done
  echo "App did not become ready" >&2
  return 1
}

check_crash() {
  if adb logcat -d -t 500 | grep -E "FATAL EXCEPTION|Process: $PKG" | grep -q "$PKG"; then
    echo "Fatal Android crash detected" >&2
    adb logcat -d -t 800 > "$OUT/fatal-logcat.txt" || true
    return 1
  fi
}

launch() {
  local era="$1" systems="${2:-false}" reader="${3:-false}"
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  adb logcat -c || true
  adb shell am start -W -n "$ACT" --ei bts_test_era "$era" --ez bts_test_sheet "$systems" --ez bts_test_reader "$reader" >/dev/null
  wait_for_app
  if [[ "$reader" == "true" ]]; then sleep 1.4; else sleep .7; fi
  check_crash
}

shot() {
  local name="$1"
  adb exec-out screencap -p > "$OUT/$name.png"
  adb shell dumpsys window displays > "$OUT/$name-window.txt" || true
}

apply_profile() {
  local name="$1" size="$2" density="$3"
  echo "=== $name: $size @ ${density}dpi ==="
  adb shell wm size "$size"
  adb shell wm density "$density"
  adb shell settings put system font_scale 1.0 || true
  sleep .7
  {
    echo "profile=$name"
    adb shell wm size
    adb shell wm density
    adb shell settings get system font_scale
  } > "$OUT/${name}-device.txt"

  for era in 13 14 15 16 17 18 19; do
    launch "$era" false false
    shot "${name}_era${era}_world"
  done
}

adb shell settings put secure immersive_mode_confirmations confirmed || true
adb shell settings put global policy_control immersive.full=* || true

adb install -r app/build/outputs/apk/debug/app-debug.apk >/dev/null

# Four layout classes on the real Android WebView.
apply_profile "compact_720p" "1600x720" "360"
apply_profile "galaxy_s24" "2340x1080" "450"
apply_profile "large_phone" "2400x1080" "420"
apply_profile "tablet_10in" "2560x1600" "320"

# Deep interaction evidence on the S24-shaped profile.
adb shell wm size "2340x1080"
adb shell wm density "450"

for era in 14 15 16 17 18 19; do
  launch "$era" true false
  shot "galaxy_s24_era${era}_systems_open"
  adb shell input keyevent 4
  sleep .4
  if ! adb shell pidof "$PKG" >/dev/null 2>&1; then
    echo "Back dismissed the app instead of the systems modal in Era $era" >&2
    exit 1
  fi
  shot "galaxy_s24_era${era}_systems_back_dismissed"
done

for era in 13 14 15 16 17 18 19; do
  launch "$era" false true
  shot "galaxy_s24_era${era}_reader_bottom"
  adb shell input keyevent 4
  sleep .35
  if ! adb shell pidof "$PKG" >/dev/null 2>&1; then
    echo "Back dismissed the app instead of reader in Era $era" >&2
    exit 1
  fi
done

# Pan/scroll stress capture. Emulator timing is diagnostic, not a release threshold.
launch 13 false false
adb shell dumpsys gfxinfo "$PKG" reset >/dev/null 2>&1 || true
for _ in {1..8}; do
  adb shell input swipe 1750 540 850 620 180
  adb shell input swipe 850 620 1600 470 180
done
adb shell dumpsys gfxinfo "$PKG" framestats > "$OUT/galaxy_s24_gfxinfo.txt" || true
adb logcat -d -t 1200 > "$OUT/galaxy_s24_logcat.txt" || true
check_crash

adb shell wm size reset || true
adb shell wm density reset || true
adb shell settings put system font_scale 1.0 || true

echo "Native Android QA complete: $(find "$OUT" -name '*.png' | wc -l) screenshots."
