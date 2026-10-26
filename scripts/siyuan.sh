#!/usr/bin/env bash
# Compatibility entrypoint; Node.js CLI works across platforms.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/siyuan.mjs" "$@"
