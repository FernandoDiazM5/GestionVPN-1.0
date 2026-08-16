#!/bin/sh
set -eu
attempt=0
until node control-plane/src/scripts/migrate.js; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 2
done
exec node control-plane/src/server.js
