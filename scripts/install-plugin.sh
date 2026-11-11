#!/bin/sh
# Build the plugin and copy it into an Obsidian vault on this machine, then print the hash of the copied main.js.
# Usage: scripts/install-plugin.sh <vault-folder> [--no-build]
set -eu
usage() { echo "usage: $0 <vault-folder> [--no-build]" >&2; exit 2; }
VAULT=""
BUILD=1
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    -*) usage ;;
    *) [ -z "$VAULT" ] || usage; VAULT=$a ;;
  esac
done
[ -n "$VAULT" ] || usage
if [ ! -d "$VAULT/.obsidian" ]; then
  echo "$VAULT has no .obsidian folder: open it once in Obsidian as a vault, or check the path" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
if [ "$BUILD" = 1 ]; then
  npm run build
fi
for f in main.js styles.css manifest.json; do
  [ -f "$f" ] || { echo "$f is missing: run without --no-build" >&2; exit 1; }
done
DEST="$VAULT/.obsidian/plugins/dnd-5e-sheet"
mkdir -p "$DEST"
cp main.js styles.css manifest.json "$DEST/"
sha256sum "$DEST/main.js"
