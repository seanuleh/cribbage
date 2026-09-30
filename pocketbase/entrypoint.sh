#!/bin/sh
# cribbage — container init (PocketBase 0.23+).
# Schema + settings live in pb_migrations/ (applied on serve). This only ensures the
# superuser exists (idempotent) and starts PB. /bin/sh: Alpine has no bash.

PB="/pb/pocketbase"

$PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir=/pb/pb_data

exec $PB serve --http=0.0.0.0:8090 --dir=/pb/pb_data --publicDir=/pb/pb_public \
  --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks
