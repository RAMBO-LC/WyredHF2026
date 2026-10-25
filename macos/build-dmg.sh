#!/usr/bin/env bash
# Builds SharedBrain.app (native wrapper + bundled Node.js + server) and packages it as a DMG.
# Usage: npm run app:dmg        (from the project root, on macOS)
# Output: ./SharedBrain-<version>-<arch>.dmg

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"
NODE_BIN="$(command -v node)"
NODE_ARCH="$(node -p process.arch)"
BUILD="$ROOT/build/macos"
APP="$BUILD/SharedBrain.app"
DMG="$ROOT/SharedBrain-$VERSION-$ARCH.dmg"

if [[ "$(uname)" != "Darwin" ]]; then echo "This script must run on macOS." >&2; exit 1; fi
if [[ "$NODE_ARCH" != "$ARCH" ]]; then echo "Node is $NODE_ARCH but this Mac is $ARCH; use a native Node build." >&2; exit 1; fi

echo "→ Compiling TypeScript"
rm -rf dist
npx tsc

echo "→ Assembling app bundle"
rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app" "$APP/Contents/Resources/runtime"

cp -R dist public package.json package-lock.json "$APP/Contents/Resources/app/"
cp .env.example "$APP/Contents/Resources/app/"
cp "$NODE_BIN" "$APP/Contents/Resources/runtime/node"

echo "→ Installing production dependencies ($(node -v), $ARCH)"
(cd "$APP/Contents/Resources/app" && npm ci --omit=dev --no-audit --no-fund --prefer-offline --loglevel=error)
# Drop build leftovers and docs that the runtime never reads.
find "$APP/Contents/Resources/app/node_modules" \( -name "*.md" -o -name "*.d.ts" -o -name "*.map" -o -name "test" -o -name "docs" \) -prune -exec rm -rf {} + 2>/dev/null || true
rm -rf "$APP/Contents/Resources/app/node_modules/better-sqlite3/deps" "$APP/Contents/Resources/app/node_modules/better-sqlite3/src"

echo "→ Checking the bundled runtime loads SQLite"
"$APP/Contents/Resources/runtime/node" -e "const D=require('$APP/Contents/Resources/app/node_modules/better-sqlite3'); new D(':memory:').prepare('select 1').get()"

echo "→ Compiling native wrapper"
swiftc -O -target "$ARCH-apple-macos13.0" \
  -framework Cocoa -framework WebKit \
  "$ROOT/macos/SharedBrain/main.swift" -o "$APP/Contents/MacOS/SharedBrain"

echo "→ Rendering icon"
ICONSET="$BUILD/AppIcon.iconset"
mkdir -p "$ICONSET"
swift "$ROOT/macos/make-icon.swift" "$BUILD/icon_1024.png" >/dev/null
for s in 16 32 128 256 512; do
  sips -z $s $s "$BUILD/icon_1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$BUILD/icon_1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>SharedBrain</string>
  <key>CFBundleDisplayName</key><string>SharedBrain</string>
  <key>CFBundleIdentifier</key><string>dev.sharedbrain.app</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleExecutable</key><string>SharedBrain</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>MIT License</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

echo "→ Signing (ad-hoc)"
find "$APP/Contents/Resources/app/node_modules" -name "*.node" -exec codesign --force --sign - {} \;
codesign --force --sign - "$APP/Contents/Resources/runtime/node"
codesign --force --sign - "$APP/Contents/MacOS/SharedBrain"
codesign --force --sign - "$APP"
codesign --verify --deep "$APP"

echo "→ Creating DMG"
STAGE="$BUILD/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cat > "$STAGE/Read Me First.txt" <<'TXT'
SharedBrain for macOS
=====================

1. Drag SharedBrain into Applications.
2. The app is not notarized. The first time, right-click it in Applications
   and choose Open, then confirm. If macOS still blocks it, go to
   System Settings → Privacy & Security and click "Open Anyway".
3. If it says the app is damaged (common after AirDrop), run once in Terminal:
      xattr -dr com.apple.quarantine /Applications/SharedBrain.app

Requires an Apple silicon Mac with macOS 13 or later. No other software needed.
Your data is stored in ~/Library/Application Support/SharedBrain.
To use an LLM, choose File → Edit Settings in the app.
TXT
rm -f "$DMG"
hdiutil create -volname "SharedBrain $VERSION" -srcfolder "$STAGE" -ov -format UDZO -fs HFS+ "$DMG" >/dev/null

echo ""
echo "✓ Built $(basename "$DMG") ($(du -h "$DMG" | cut -f1))"
echo "  App bundle: $APP"
