#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

if [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  npx prisma migrate deploy
fi

case "${1:-api}" in
  api)
    exec node dist/index.js
    ;;
  daemon)
    exec node dist/daemon/main.js
    ;;
  *)
    exec "$@"
    ;;
esac
