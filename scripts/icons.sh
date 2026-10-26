#!/usr/bin/env bash
# Renders apps/<id>/icon.svg into apps/<id>/icons/{icon.png,icon.icns,icon.ico}. Needs rsvg-convert (+ iconutil on macOS).
set -euo pipefail
cd "$(dirname "$0")/.."
for d in apps/*/; do
  id=$(basename "$d"); [ -f "$d/icon.svg" ] || { echo "skip $id (no icon.svg)"; continue; }
  out="$d/icons"; mkdir -p "$out"; tmp=$(mktemp -d)
  for s in 16 32 48 64 128 256 512 1024; do rsvg-convert -w $s -h $s "$d/icon.svg" -o "$tmp/$s.png"; done
  cp "$tmp/512.png" "$out/icon.png"
  node scripts/mkico.mjs "$out/icon.ico" "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$tmp/64.png" "$tmp/128.png" "$tmp/256.png"
  if command -v iconutil >/dev/null; then
    set_="$tmp/i.iconset"; mkdir "$set_"
    for s in 16 32 128 256 512; do cp "$tmp/$s.png" "$set_/icon_${s}x${s}.png"; done
    cp "$tmp/32.png" "$set_/icon_16x16@2x.png"; cp "$tmp/64.png" "$set_/icon_32x32@2x.png"; cp "$tmp/256.png" "$set_/icon_128x128@2x.png"; cp "$tmp/512.png" "$set_/icon_256x256@2x.png"; cp "$tmp/1024.png" "$set_/icon_512x512@2x.png"
    iconutil -c icns "$set_" -o "$out/icon.icns"
  fi
  rm -rf "$tmp"; echo "icons: $id"
done
