#!/bin/bash
set -e

PB_BIN="/pb/pocketbase"
DATA_DIR="/pb/pb_data"

$PB_BIN serve --http=0.0.0.0:8090 --dir="$DATA_DIR" --publicDir="/pb/pb_public" &
PB_PID=$!

for i in $(seq 1 30); do
  if wget -q --spider http://localhost:8090/api/health 2>/dev/null; then break; fi
  sleep 1
done

wget -q -O - --post-data="{\"email\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\",\"passwordConfirm\":\"${PB_ADMIN_PASSWORD}\"}" \
  --header="Content-Type: application/json" \
  http://localhost:8090/api/admins 2>&1 || true

TOKEN=$(wget -q -O - --post-data="{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  --header="Content-Type: application/json" \
  http://localhost:8090/api/admins/auth-with-password | sed 's/.*"token":"\([^"]*\)".*/\1/')

wget -q -O - --method=PATCH \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  --body-data='{"trustedProxy":{"headers":["X-Forwarded-For"]}}' \
  http://localhost:8090/api/settings 2>&1 | head -c 120 || true

kill $PB_PID
wait $PB_PID 2>/dev/null || true

if [ "$1" = "--init-only" ]; then exit 0; fi

exec $PB_BIN serve --http=0.0.0.0:8090 --dir="$DATA_DIR" --publicDir="/pb/pb_public"
