#!/usr/bin/env bash
# Prepara il progetto iOS (da eseguire su macOS, per esempio nella build cloud).
# Crea la cartella ios/ se manca, genera icone e schermata di avvio, copia l'app web e imposta Info.plist.
set -euo pipefail

BUILD_NUMBER="${1:-1}"
VERSION="$(node -p "require('./package.json').version")"

[ -d ios ] || npx cap add ios
npx capacitor-assets generate --ios
npm run build
npx cap sync ios

PLIST="ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
setkey() { # setkey <chiave> <tipo> <valore>
  "$PB" -c "Set :$1 $3" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 $2 $3" "$PLIST"
}
setkey CFBundleDisplayName string "Presenze"
setkey ITSAppUsesNonExemptEncryption bool false
setkey NSCameraUsageDescription string "Serve per scattare la foto del profilo."
setkey NSPhotoLibraryUsageDescription string "Serve per scegliere la foto del profilo."

# iPhone solo in verticale
"$PB" -c "Delete :UISupportedInterfaceOrientations" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
"$PB" -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"

# Versione e numero di build (il numero deve crescere a ogni caricamento su TestFlight)
PBX="ios/App/App.xcodeproj/project.pbxproj"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};/g; s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/g" "$PBX"
echo "Presenze ${VERSION} (build ${BUILD_NUMBER}) pronta per Xcode"
