#!/usr/bin/env bash
# Prepara il progetto Android (da eseguire dove ci sono Node e Java, per esempio nella build su GitHub).
# Crea la cartella android/ se manca, genera icone e schermata di avvio, copia l'app web e imposta versione e numero di build.
set -euo pipefail

BUILD_NUMBER="${1:-1}"
VERSION="$(node -p "require('./package.json').version")"

[ -d android ] || npx cap add android
npx capacitor-assets generate --android
npm run build
npx cap sync android

GRADLE="android/app/build.gradle"
# Il numero di build deve crescere a ogni versione, altrimenti Android rifiuta l'aggiornamento
sed -i -E "s/versionCode[ =]+[0-9]+/versionCode ${BUILD_NUMBER}/; s/versionName[ =]+\"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE"
if ! grep -q "versionCode ${BUILD_NUMBER}" "$GRADLE"; then
  echo "::warning::Non sono riuscito a impostare il numero di build in ${GRADLE}"
fi
echo "Presenze ${VERSION} (build ${BUILD_NUMBER}) pronta per Gradle"
