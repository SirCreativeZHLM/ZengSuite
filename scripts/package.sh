#!/usr/bin/env bash
# Build + package one app (or `all`) for the current OS into dist/.   scripts/package.sh <id|all> [os] [arch]
# Output names (match the website): Zeng<Name>-<ver>-<macos|windows|linux>-<arm64|x64|x86_64>.<dmg|zip|tar.gz>
set -euo pipefail
cd "$(dirname "$0")/.."
ID="${1:?usage: package.sh <id|all>}"
OS="${2:-$(uname -s | tr '[:upper:]' '[:lower:]')}"; case "$OS" in mingw*|msys*|windows*) OS=windows;; darwin*) OS=macos;; esac
RAW_ARCH="${3:-$(uname -m)}"
case "$OS:$RAW_ARCH" in macos:arm64|macos:aarch64) ARCH=arm64;; macos:*) ARCH=x64;; windows:*) ARCH=x64;; linux:aarch64|linux:arm64) ARCH=arm64;; *) ARCH=x86_64;; esac
VERSION="$(node -p "require('./package.json').version")"
EXT=""; [ "$OS" = windows ] && EXT=".exe"
TARGET="${CARGO_TARGET_DIR:-target}/release"
mkdir -p dist
IDS=(); if [ "$ID" = all ]; then for d in apps/*/; do [ -f "$d/app.json" ] && IDS+=("$(basename "$d")"); done; else IDS=("$ID"); fi
cargo build --release $(for i in "${IDS[@]}"; do printf -- '-p zeng-%s ' "$i"; done)
meta() { node -e "const j=require('./apps/$1/app.json');const v=j['$2'];console.log(Array.isArray(v)?v.join(' '):v)"; }

make_app() { # macOS .app into $2
  local id=$1 dest=$2 name; name="Zeng$(meta $id name)"; local app="$dest/$name.app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp "$TARGET/zeng$id" "$app/Contents/MacOS/$name"
  [ -f "apps/$id/icons/icon.icns" ] && cp "apps/$id/icons/icon.icns" "$app/Contents/Resources/icon.icns"
  local docs=""; for e in $(meta $id extensions); do docs="$docs<dict><key>CFBundleTypeExtensions</key><array><string>$e</string></array><key>CFBundleTypeRole</key><string>Editor</string><key>LSHandlerRank</key><string>Alternate</string></dict>"; done
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>$(meta $id name)</string><key>CFBundleDisplayName</key><string>$(meta $id name)</string>
<key>CFBundleExecutable</key><string>$name</string><key>CFBundleIdentifier</key><string>com.zengbot.suite.$id</string>
<key>CFBundleIconFile</key><string>icon</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string><key>CFBundleVersion</key><string>$VERSION</string>
<key>LSMinimumSystemVersion</key><string>11.0</string><key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
<key>CFBundleDocumentTypes</key><array>$docs</array>
</dict></plist>
PLIST
  codesign --force --deep --sign - "$app" 2>/dev/null || true
}

make_linux_dir() { # $1 id, $2 dest dir
  local id=$1 dest=$2 name; name="Zeng$(meta $id name)"
  mkdir -p "$dest"; cp "$TARGET/zeng$id" "$dest/zeng$id"
  [ -f "apps/$id/icons/icon.png" ] && cp "apps/$id/icons/icon.png" "$dest/zeng$id.png"
  cat > "$dest/zeng$id.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=$name
Comment=$(meta $id tagline)
Exec=zeng$id %F
Icon=zeng$id
Categories=Office;
Terminal=false
DESK
}
install_sh() { cat > "$1/install.sh" <<'SH'
#!/usr/bin/env sh
# Installs into ~/.local (no root needed).
set -e; cd "$(dirname "$0")"
mkdir -p ~/.local/bin ~/.local/share/applications ~/.local/share/icons/hicolor/512x512/apps
for b in zeng*; do case "$b" in *.png|*.desktop|*.sh) ;; *) install -m755 "$b" ~/.local/bin/ ;; esac; done
for p in *.png; do [ -f "$p" ] && cp "$p" ~/.local/share/icons/hicolor/512x512/apps/; done
for d in *.desktop; do [ -f "$d" ] && sed "s|^Exec=|Exec=$HOME/.local/bin/|" "$d" > ~/.local/share/applications/"$d"; done
echo "Installed. Needs WebKitGTK 4.1 (libwebkit2gtk-4.1-0)."
SH
chmod +x "$1/install.sh"; }

pack() { # $1 label (e.g. ZengPages or ZengSuite), rest = ids
  local label=$1; shift; local base="$label-$VERSION-$OS-$ARCH"; local stage; stage="$(mktemp -d)"
  case "$OS" in
    macos)
      mkdir -p "$stage/$label"; for i in "$@"; do make_app $i "$stage/$label"; done; ln -s /Applications "$stage/$label/Applications"
      rm -f "dist/$base.dmg"; hdiutil create -volname "$label" -srcfolder "$stage/$label" -ov -format UDZO "dist/$base.dmg" >/dev/null ;;
    windows)
      mkdir -p "$stage/$label"; for i in "$@"; do n="Zeng$(meta $i name)"; cp "$TARGET/zeng$i.exe" "$stage/$label/$n.exe"
        if [ -f "apps/$i/icons/icon.ico" ]; then npx --yes rcedit@4 "$stage/$label/$n.exe" --set-icon "apps/$i/icons/icon.ico" 2>/dev/null || echo "icon patch skipped for $n"; fi; done
      cp LICENSE "$stage/$label/" ; rm -f "dist/$base.zip"
      (cd "$stage" && (7z a -tzip "$OLDPWD/dist/$base.zip" "$label" >/dev/null 2>&1 || powershell -NoProfile -Command "Compress-Archive -Force '$label' '$OLDPWD/dist/$base.zip'")) ;;
    linux)
      mkdir -p "$stage/$base"; for i in "$@"; do make_linux_dir $i "$stage/$base"; done; install_sh "$stage/$base"; cp LICENSE "$stage/$base/"
      tar -C "$stage" -czf "dist/$base.tar.gz" "$base" ;;
  esac
  rm -rf "$stage"; echo "packaged dist/$base"
}

if [ "$ID" = all ]; then
  for i in "${IDS[@]}"; do pack "Zeng$(meta $i name)" "$i"; done
  pack ZengSuite "${IDS[@]}"
else pack "Zeng$(meta $ID name)" "$ID"; fi
