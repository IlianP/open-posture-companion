#!/usr/bin/env bash
#
# Build the standalone Android APK (release variant: the JavaScript bundle is
# embedded, so the app runs without a development server).
#
# Used by .github/workflows/android-apk.yml and for local builds alike:
#
#   npm ci
#   ./scripts/build-android.sh
#
# Needs Node, JDK 17 and the Android SDK (ANDROID_HOME). The native project
# in android/ is generated from app.json + app.config.js on every run and is
# never committed, so there is no native code to keep in sync with upstream.
#
# The APK is signed with the debug key that ships in the Expo project
# template. That key is the same for every build, which is what lets a newer
# APK install over an older one — and it is public, so it only proves "built
# from this template", not who built it. See FORK.md.
#
# ANDROID_ABIS   comma-separated ABIs to include (default: arm64-v8a, which
#                covers every phone that can run Android 12+ in practice).

set -euo pipefail

cd "$(dirname "$0")/.."

abis="${ANDROID_ABIS:-arm64-v8a}"
out_dir="dist"
out_apk="$out_dir/open-posture-companion.apk"

node scripts/check-ble-write-safety.mjs

# CI=1 keeps prebuild non-interactive (it otherwise asks before discarding
# an existing android/ directory or when the git tree is dirty).
CI=1 npx expo prebuild --platform android --clean --no-install

# Android only installs an update over an existing app if both are signed
# with the same key. Stop here if the template ever ships a different one,
# rather than producing an APK that silently refuses to install as an update.
expected_keystore="221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58"
actual_keystore="$(sha256sum android/app/debug.keystore | cut -d' ' -f1)"
if [ "$actual_keystore" != "$expected_keystore" ]; then
  echo "The signing keystore from the Expo template has changed" >&2
  echo "(sha256 $actual_keystore)." >&2
  echo "An APK signed with it cannot update an installed build. See FORK.md, \"Signatur\"." >&2
  exit 1
fi

(cd android && ./gradlew assembleRelease \
  -PreactNativeArchitectures="$abis" \
  --console=plain)

mkdir -p "$out_dir"
cp android/app/build/outputs/apk/release/app-release.apk "$out_apk"

echo
echo "APK: $out_apk ($(du -h "$out_apk" | cut -f1))"
echo "SHA-256: $(sha256sum "$out_apk" | cut -d' ' -f1)"
