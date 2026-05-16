# cribbage — Agent Reference

## Stack
- React + Vite frontend, PocketBase 0.22.22 backend, single Docker container
- Auth handled externally by cf-auth sidecar + nginx sub_filter

## Deployment
Live at `cribbage.uleh.tv`. Rebuild and redeploy:
```sh
cd /home/sean && docker compose up -d --build cribbage
```

## Always Back Up Before Schema Changes

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf /data/cribbage/backups/${TIMESTAMP}.tar.gz -C /data/cribbage/pb_data --exclude=backups .
```

Never deploy a migration to a live DB without doing this first. No exceptions.

## Schema Changes — JS Migrations

All schema changes go in `pocketbase/pb_migrations/` as JS migration files. PocketBase auto-applies unapplied migrations on startup.

To add/change schema:
1. Back up first
2. Get current timestamp: `date +%s`
3. Write `pocketbase/pb_migrations/[timestamp]_description.js`
4. Rebuild: `docker compose up -d --build cribbage`

## Get an Admin Token (inside container)

```bash
docker exec cribbage sh -c 'curl -s -X POST http://localhost:8090/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  | sed "s/.*\"token\":\"\([^\"]*\)\".*/\1/"'
```
