#!/bin/sh
# Build this checkout and copy the plugin into a Windows vault over SSH, then print the deployed hash to compare.
# Usage: scripts/deploy-vault.sh <ssh-host> [<ssh-host> ...]   deploys to every host given.
# DND_VAULT sets the vault path on the host (default C:/obsidian/dnd).
set -eu
if [ "$#" -eq 0 ]; then
  echo "usage: scripts/deploy-vault.sh <ssh-host> [<ssh-host> ...]" >&2
  exit 2
fi
VAULT=${DND_VAULT:-C:/obsidian/dnd}
DEST="$VAULT/.obsidian/plugins/dnd-5e-sheet/"
HASHPATH=$(printf '%s' "${DEST}main.js" | tr '/' '\\')
cd "$(dirname "$0")/.."
npm run build
sha256sum main.js
deploy() {
  scp -o ConnectTimeout=60 -q main.js styles.css manifest.json "$1:$DEST" &&
    ssh -o ConnectTimeout=60 "$1" "certutil -hashfile $HASHPATH SHA256"
}
fail=0
for h in "$@"; do
  if deploy "$h"; then echo "deployed to $h"; else echo "failed: $h" >&2; fail=1; fi
done
exit "$fail"
