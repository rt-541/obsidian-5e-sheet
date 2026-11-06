#!/bin/sh
# Build this checkout and copy the plugin into the dnd vault, trying each host in turn, then print the deployed hash to compare.
set -eu
HOSTS="azure-dragon azure-dragon-vpn"
DEST="C:/obsidian/dnd/.obsidian/plugins/dnd-5e-sheet/"
HASHPATH='C:\obsidian\dnd\.obsidian\plugins\dnd-5e-sheet\main.js'
cd "$(dirname "$0")/.."
npm run build
sha256sum main.js
for h in $HOSTS; do
  if scp -o ConnectTimeout=60 -q main.js styles.css manifest.json "$h:$DEST"; then
    ssh -o ConnectTimeout=60 "$h" "certutil -hashfile $HASHPATH SHA256"
    exit 0
  fi
done
echo "no host reachable: nothing deployed" >&2
exit 1
