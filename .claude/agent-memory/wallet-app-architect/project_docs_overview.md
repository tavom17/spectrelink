---
name: Spectrelink project goals, phases, and architecture decisions
description: High-level project context from canonical project documents — platform goals, confirmed phase status, architectural decisions that govern all wallet-app work
type: project
---

## Platform Identity

- **Name:** Spectrelink
- **Domain:** spectrelink.org
- **Purpose:** Off-chain orchestration platform for Solana operations — no custom smart contracts
- **Host:** Geekom A8, Ubuntu Server bare metal, /home/scrippa/spectrelink/
- **Three core apps:** wallet-app (HD wallets), launcher-app (SPL tokens), liquidity-app (Meteora)

## Phase Status (as of 2026-03-25)

- **Phase 1 (Infrastructure):** COMPLETE — Cloudflare tunnel, Nginx, 3-network Docker segmentation all live
- **Phase 2 (Data Layer):** COMPLETE — Postgres 16 + Redis 7 running, bind mounts confirmed, isolation validated
- **Phase 3 (Application Layer):** NEXT — wallet-app refactor is the first deliverable
- **Phase 4 (Frontend):** Future — Next.js UI

## Confirmed Network Topology

Three isolated Docker bridge networks:

```
spectrelink_public: cloudflare-tunnel, nginx
spectrelink_app:    nginx, frontend, api-gateway, wallet-app, launcher-app, liquidity-app
spectrelink_data:   api-gateway, postgres, redis
```

**api-gateway is the ONLY container on both app and data networks.** It is the exclusive bridge. wallet-app has zero network path to Postgres or Redis directly — all persistence is mediated through api-gateway.

## Architectural Decisions That Govern wallet-app

1. **Separate containers per app** — wallet-app, launcher-app, liquidity-app are each their own container. api-gateway is a thin auth/routing layer, not a monolith containing the app logic.

2. **Stateless wallet design** — wallets are never kept alive in server memory between requests. Every request derives what it needs from encrypted storage and discards it. This is a confirmed design decision, not TBD.

3. **The refactor pattern (canonical quote from project-context.docx):**
   ```
   Before: stdin input → handler → stdout output
   After:  POST /wallet/create → handler → JSON response
   The handler in the middle is the same code in both cases.
   ```

4. **wallet-app persistence path:** wallet-app cannot reach Postgres directly — it is on `spectrelink_app` only. For every DB operation (mnemonic read/write, wallet record read/write), wallet-app makes an outbound internal HTTP call to api-gateway. api-gateway executes the SQL and returns results. The specific internal routes for those calls are a Phase 3 design task. Helius RPC calls go directly from wallet-app to Helius — they bypass api-gateway entirely.

5. **Private key lifetime:** Private keys exist in server memory only momentarily during signing operations. Public keys are plaintext. Mnemonics are encrypted at rest in Postgres.

6. **Helius as RPC provider** — not public endpoints. Webhook-driven real-time events: Helius fires POST to api-gateway, which writes to Postgres, publishes to Redis pub/sub, WebSocket pushes to frontend.

7. **All services use node:20-alpine** — confirmed base image for all app containers.

## Postgres Details (Confirmed)

- User: `scrippa_admin` (admin — Phase 3 should create app-specific limited user)
- Database: `spectrelink`
- Port 5432, data network only
- Bind mount: `/home/scrippa/server-data/postgres` → `/var/lib/postgresql/data`
- Confirmed databases: `spectrelink`, `postgres`
- Schema intent: `users` (auth + encrypted seedphrase), `wallets` (pubkeys + derivation paths), token configs, liquidity positions

## Redis Details (Confirmed)

- `redis:7-alpine`, port 6379, data network only
- Password protected
- Roles: JWT session TTL, wallet list cache, pub/sub for real-time events, async job queues
- Bind mount: `/home/scrippa/server-data/redis` → `/data`

## Solana Stack

- On-chain programs: SPL Token Program (launcher), Meteora (liquidity) — no custom smart contracts anywhere in the platform
- RPC: Helius (private endpoint, never public Solana URLs) — Solana-native, enhanced tx parsing, webhook support, DAS API
- Helius webhooks fire to api-gateway (`POST /api/events/transaction`); api-gateway writes to Postgres, publishes to Redis pub/sub, WebSocket pushes to frontend. wallet-app is not in this event flow.
- wallet-app uses @solana/kit v6 (not deprecated web3.js); RPC URL env var is `HELIUS_RPC_URL`

## Unresolved for wallet-app Phase 3

- Exact internal HTTP routes api-gateway exposes for wallet-app DB delegation (mnemonic read/write, wallet record read/write)
- Seedphrase encryption library/algorithm (confirmed it is encrypted at rest; mechanism TBD)
- App-specific Postgres user name and permission scope (must not use `scrippa_admin` in application code)
- Internal port assignments per app container (defined during Phase 3 scaffolding)

Note: Helius as RPC provider is confirmed. The private endpoint URL will be in `HELIUS_RPC_URL` env var — never committed to the repository.
