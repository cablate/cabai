#!/usr/bin/env bash
set -euo pipefail

echo "[pre-deploy] This unsafe legacy script is retired." >&2
echo "It no longer dumps a source URL from argv or drops/creates a target database." >&2
echo "Create an isolated empty database yourself, then run npm run db:restore:drill with explicit confirmation." >&2
exit 2
