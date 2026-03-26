---
name: Spectrelink project state and phase status
description: Current build status, what is live, what is in progress, and what is planned — as of 2026-03-25
type: project
---

## Platform Identity

- **Name:** Spectrelink
- **Domain:** spectrelink.org
- **Purpose:** Off-chain Solana orchestration platform — HD wallets, SPL token launches, Meteora liquidity management. No custom smart contracts.
- **Host:** Geekom A8, Ubuntu Server bare metal, `/home/scrippa/spectrelink/`

## Phase Status (as of 2026-03-25)

- **Phase 1 (Infrastructure):** COMPLETE — Cloudflare tunnel + Nginx + 3-network Docker segmentation running
- **Phase 2 (Data Layer):** COMPLETE — Postgres 16 + Redis 7 running with bind mounts, network isolation confirmed
- **Phase 3 (Application Layer):** IN PROGRESS — wallet-app stateless refactor and api-gateway build are BOTH confirmed active work items (as of 2026-03-25); launcher-app, liquidity-app still placeholder
- **Phase 4 (Frontend UI):** PARTIALLY BUILT — Next.js frontend exists with splash page, overview, about, and transit pages; served through nginx; Dockerfile written

## What is Built and Running

- `cloudflare` container — Cloudflare Tunnel, `public` network
- `nginx` container — reverse proxy, bridges `public` and `app` networks, port 80 exposed
- `frontend` container — Next.js (node:20-alpine), `app` network, built from `./frontend/Dockerfile`
- `postgres` container — `postgres:16-alpine`, `data` network, bind mount `/home/scrippa/server-data/postgres`
- `redis` container — `redis:7-alpine` (note: docker-compose uses `redis` image tag, not pinned to 7-alpine), `data` network, bind mount `/home/scrippa/server-data/redis`

## What is Placeholder Only

- `api-gateway` — `node:20-alpine` image, no Dockerfile, no code; bridges `app` and `data` networks
- `wallet-generator` (wallet-app) — `node:20-alpine` image, no Dockerfile, no code; `app` network only
- `coin-launcher` (launcher-app) — `node:20-alpine` image, no Dockerfile, no code; `app` network only
- `liquidity-app` — directory exists locally, NOT defined in docker-compose yet

## Network Topology (Confirmed)

```
spectrelink_public: cloudflare, nginx
spectrelink_app:    nginx, frontend, api-gateway, wallet-generator, coin-launcher
spectrelink_data:   api-gateway, postgres, redis
```

api-gateway is the ONLY bridge between app and data networks. wallet-app has zero direct path to Postgres or Redis.

**Why:** enforce data layer isolation — no service other than api-gateway can ever directly touch the database or cache.

## Real-Time Event Architecture

Helius webhook -> api-gateway -> Postgres write + Redis pub/sub -> WebSocket push -> frontend update.
This is the planned flow; not yet implemented.

## Key Stack Versions

- Node.js: 20-alpine (all app containers)
- Postgres: 16-alpine
- Redis: 7-alpine (pinned in docs, actual compose uses `redis` tag — worth flagging)
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui
- API: Fastify + JWT (planned)
- Solana: @solana/kit v6 (NOT deprecated web3.js)
- RPC: Helius (private endpoint, webhook support)
