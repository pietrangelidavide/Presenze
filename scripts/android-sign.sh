#!/usr/bin/env bash
# Firma l'APK di Presenze. La chiave di firma si crea la prima volta e resta nella release privata "chiave-firma":
# serve sempre la stessa chiave, altrimenti Android non permette di aggiornare l'app già installata.
set -euo pipefail

OUT="build-out"
KEYDIR="${RUNNER_TEMP:-/tmp}/chiave"
mkdir -p "$OUT" "$KEYDIR"

UNSIGNED="$(ls android/app/build/outputs/apk/release/*.apk | head -n 1)"
echo "File da firmare: $UNSIGNED"

if gh release download chiave-firma -R "$GITHUB_REPOSITORY" -D "$KEYDIR" -p presenze.keystore -p presenze.pass 2>/dev/null; then
  echo "Uso la chiave di firma già creata"
else
  echo "Creo la chiave di firma (succede solo la prima volta)"
  PASS="$(openssl rand -hex 16)"
  keytool -genkeypair -keystore "$KEYDIR/presenze.keystore" -alias presenze -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Presenze, O=Davide Pietrangeli, C=IT"
  printf '%s' "$PASS" > "$KEYDIR/presenze.pass"
  gh release create chiave-firma "$KEYDIR/presenze.keystore" "$KEYDIR/presenze.pass" -R "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease --title "Chiave di firma - non cancellare" \
    --notes "Serve a firmare l'app Android di Presenze. Se la cancelli, per installare gli aggiornamenti dovrai prima disinstallare l'app (esporta prima il backup dalle Impostazioni)."
fi

PASS="$(cat "$KEYDIR/presenze.pass")"
BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)"
echo "Strumenti di firma: $BT"
"$BT/zipalign" -p -f 4 "$UNSIGNED" "$OUT/allineato.apk"
"$BT/apksigner" sign --ks "$KEYDIR/presenze.keystore" --ks-key-alias presenze --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out "$OUT/Presenze.apk" "$OUT/allineato.apk"
rm -f "$OUT/allineato.apk" "$OUT"/*.idsig
"$BT/apksigner" verify --print-certs "$OUT/Presenze.apk" | head -n 3
ls -la "$OUT"
