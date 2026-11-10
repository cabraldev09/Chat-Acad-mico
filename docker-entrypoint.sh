#!/bin/sh
# Starts the API as the "node" user instead of root (a flaw in the Chromium that opens WhatsApp Web, or in a file the API reads, then does not own the container).
# The container starts as root only to hand the volume to "node" once and then drops the privileges (gosu).
set -e
for dir in /data "${UPLOAD_DIR:-/app/backend/public}" "${WWEBJS_AUTH_PATH:-}" "$(dirname "${ZAPO_AUTH_PATH:-/data/zapo/state.sqlite}")"; do
  [ -n "$dir" ] && mkdir -p "$dir"
done
if [ "$(id -u)" = "0" ]; then
  # the volume of the earlier versions belongs to root: it goes to "node" once (a marker file avoids walking a large volume at every start)
  if [ ! -f /data/.owner-node ]; then
    chown -R node:node /data
    touch /data/.owner-node && chown node:node /data/.owner-node
  fi
  chown node:node "${UPLOAD_DIR:-/app/backend/public}" 2>/dev/null || true
  exec gosu node "$@"
fi
exec "$@"
