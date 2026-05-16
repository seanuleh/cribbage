# Cribbage Board

A mobile-first digital cribbage board for tracking scores when you don't have a physical board handy.

Two players sit opposite each other — P2 controls are at the top (rotated), P1 at the bottom. The SVG board runs portrait with a 3-leg S-fold track, pegs animate between holes.

## Stack

- **Frontend**: React + Vite
- **Backend**: PocketBase 0.22.22 (REST API, auth, realtime)
- **Container**: Single Alpine Docker image — frontend built into PocketBase `--publicDir`
- **Auth**: Cloudflare Access + cf-auth sidecar (nginx `auth_request` + localStorage token injection)

## Features

- 3-leg folded cribbage track, two player tracks side-by-side
- Peg animation: back peg slides to new hole, then both swap colours
- Score history with undo
- Skunk / double-skunk detection
- Persistent game state via PocketBase
- Player name editing
- Scroll down to hide browser chrome for a full-screen feel

## Running Locally

```sh
# Start PocketBase (needs a running PB instance or use the Docker image)
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8090` — set that in `vite.config.js` if needed.

## Docker

```sh
docker build -t cribbage .
docker run -p 8090:8090 \
  -e PB_ADMIN_EMAIL=admin@example.com \
  -e PB_ADMIN_PASSWORD=yourpassword \
  -v $(pwd)/pb_data:/pb/pb_data \
  cribbage
```

## Schema

One `games` collection — see `pocketbase/pb_migrations/` for the full schema. PocketBase auto-applies migrations on startup.

| Field | Type | Notes |
|---|---|---|
| `player1_name` | text | |
| `player2_name` | text | |
| `player1_score` | number | front peg position |
| `player2_score` | number | front peg position |
| `active` | bool | false when game is over |
| `user` | relation | links to auth user |
