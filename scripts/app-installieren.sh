#!/bin/zsh
# Baut Blockbuch als eigenständige Mac-App und legt sie in ~/Applications (Finder: „Programme“ im Benutzerordner).
# Nach Änderungen am Code einfach erneut ausführen:  npm run app
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

if pgrep -xq Blockbuch || pgrep -fq "Blockbuch.app/Contents/MacOS"; then
  echo "Blockbuch läuft gerade – bitte zuerst mit ⌘Q beenden, dann erneut starten."
  exit 1
fi

echo "Baue Blockbuch … (beim ersten Mal einige Minuten)"
npm run tauri build

QUELLE="src-tauri/target/release/bundle/macos/Blockbuch.app"
ZIEL="$HOME/Applications/Blockbuch.app"
mkdir -p "$HOME/Applications"
rm -rf "$ZIEL.alt"
[ -d "$ZIEL" ] && mv "$ZIEL" "$ZIEL.alt"
cp -R "$QUELLE" "$ZIEL"
rm -rf "$ZIEL.alt"
echo "Fertig: $ZIEL – starten über Launchpad, Spotlight (⌘ Leertaste „Blockbuch“) oder den Finder."
