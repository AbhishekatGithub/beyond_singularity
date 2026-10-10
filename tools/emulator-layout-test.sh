#!/usr/bin/env bash
set -euo pipefail

PKG="com.nullstatestudios.beyondsingularity"
ACT="$PKG/.MainActivity"
OUT="${1:-layout-screenshots}"
mkdir -p "$OUT"

wait_for_app() {
  for _ in {1..30}; do
    if adb shell dumpsys window windows 2>/dev/null | grep -q "$PKG"; then
      sleep 2
      return 0
    fi
    sleep 0.3
  done
  sleep 2
}

capture() {
  local profile="$1" era="$2" sheet="${3:-closed}"
  adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
  if [[ "$sheet" == "open" ]]; then
    adb shell am start -W -n "$ACT" --ei bts_test_era "$era" --ez bts_test_sheet true >/dev/null
  else
    adb shell am start -W -n "$ACT" --ei bts_test_era "$era" --ez bts_test_sheet false >/dev/null
  fi
  wait_for_app
  adb exec-out screencap -p > "$OUT/${profile}_era${era}_${sheet}.png"
  adb shell dumpsys window displays > "$OUT/${profile}_era${era}_${sheet}_window.txt" || true
}

apply_profile() {
  local name="$1" size="$2" density="$3"
  echo "=== $name: $size @ ${density}dpi ==="
  adb shell wm size "$size"
  adb shell wm density "$density"
  adb shell settings put system font_scale 1.0 || true
  sleep 1
  adb shell wm size > "$OUT/${name}_device.txt"
  adb shell wm density >> "$OUT/${name}_device.txt"
  adb shell dumpsys display | grep -E "mBaseDisplayInfo|DisplayDeviceInfo|DisplayInfo" | head -n 15 >> "$OUT/${name}_device.txt" || true

  for era in 13 14 15 16 17 18 19; do
    capture "$name" "$era" closed
  done
  for era in 14 15 16 17 18 19; do
    capture "$name" "$era" open
  done
}

# Suppress Android's one-time immersive-mode education overlay so screenshots show the game.
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb shell settings put global policy_control immersive.full=* || true

adb install -r app/build/outputs/apk/debug/app-debug.apk

# Galaxy S24 physical panel: 2340x1080 FHD+. The density below is a layout stress
# approximation rather than a claim about Samsung's exact logical-density setting.
apply_profile "compact_720p" "1600x720" "360"
apply_profile "galaxy_s24" "2340x1080" "450"
apply_profile "large_phone" "2400x1080" "420"
apply_profile "tablet_10in" "2560x1600" "320"

adb shell wm size reset || true
adb shell wm density reset || true

echo "Captured $(find "$OUT" -name '*.png' | wc -l) screenshots."
