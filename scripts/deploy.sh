#!/usr/bin/env bash
# Build and copy the plugin into the dnd vault on azure-dragon (LAN or VPN with SSH access).
# Obsidian Sync then carries it to the phone ("Installed community plugins" sync must be on).
set -euo pipefail
HOST="${DEPLOY_HOST:-azure-dragon}"
DEST="${DEPLOY_DEST:-C:/obsidian/dnd/.obsidian/plugins/dnd-5e-sheet}"
cd "$(dirname "$0")/.."
npm run build
ssh "$HOST" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '$DEST' | Out-Null\""
scp main.js manifest.json styles.css "$HOST:$DEST/"
echo "Deployed to $HOST:$DEST"
echo "First time: Obsidian > Settings > Community plugins > turn off Restricted mode > enable '5e Character Sheet'."
echo "Updates: run the command 'Reload app without saving' or toggle the plugin off and on."
