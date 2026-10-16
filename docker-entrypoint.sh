#!/bin/sh
# Railway mounts volumes owned by root. Give the data folder to the app user, then run the app as that user.
set -e
DATA="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  chown -R fxr:fxr "$DATA"
  chmod 700 "$DATA"
  exec su-exec fxr "$@"
fi
exec "$@"
