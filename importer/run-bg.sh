#!/bin/bash
# Run a compendium.py stage detached from the terminal, logging to $DNDC_ROOT/<stage>.log.
#   importer/run-bg.sh repair --workers 4
#   tail -f /docker/dnd-compendium/repair.log
set -euo pipefail
ROOT=${DNDC_ROOT:-/docker/dnd-compendium}
HERE=$(cd "$(dirname "$0")" && pwd)
PY=$ROOT/venv/bin/python
if [ ! -x "$PY" ]; then
    python3 -m venv "$ROOT/venv"
    "$ROOT/venv/bin/pip" -q install -r "$HERE/requirements.txt"
fi
stage=$1
setsid nohup "$PY" -I "$HERE/compendium.py" "$@" > "$ROOT/$stage.log" 2>&1 < /dev/null &
echo "started $stage (pid $!), log: $ROOT/$stage.log"
