---
name: Spectrelink key architectural decisions
description: Confirmed architectural decisions and the reasoning behind them — to be used when teaching or reviewing any agent's work
type: project
---

## Confirmed Decisions

### 1. Three isolated Docker bridge networks

- `public`: cloudflare + nginx only
- `app`: nginx + all app services (frontend, api-gateway, wallet-app, launcher-app, liquidity-app)
- `data`: api-gateway + postgres + redis only

**Why:** Defense in depth. A compromised app container has no network path to the database. The data layer is not reachable from frontend or nginx at all.

### 2. api-gateway as the exclusive data bridge

api-gateway is the only container on BOTH app and data networks. All app containers persist data by calling api-gateway, not the database directly.

**Why:** Single enforcement point for auth, rate limiting, and data access policy. Prevents each app service from independently re-implementing DB connection logic and auth checks.

### 3. Stateless wallet design

Wallets are never held in server memory between requests. Every request loads mnemonic from encrypted storage, derives what it needs, operates, and discards.

**Why:** Container restarts must not cause data loss. State must survive process death. Also required for any future horizontal scaling.

**Source decision (canonical quote from project-context.docx):**
```
Before: stdin input → handler → stdout output
After:  POST /wallet/create → handler → JSON response
The handler in the middle is the same code in both cases.
```

### 4. No custom smart contracts

Spectrelink uses existing Solana programs only: SPL Token Program (launcher-app), Meteora (liquidity-app). No Anchor programs, no custom on-chain code.

**Why:** Reduces audit surface, deployment complexity, and upgrade risk. The platform value is in off-chain orchestration.

### 5. Helius as RPC provider

Private Helius endpoint (not public Solana RPC). Provides: enhanced tx parsing, DAS API, webhook-driven real-time events.

**Why:** Public RPC endpoints have rate limits that would make the bundler pattern (many simultaneous wallet operations) unreliable.

### 6. node:20-alpine for all app containers

**Why:** Minimal image size, consistent runtime, LTS stability.

### 7. Separate containers per application domain

wallet-app, launcher-app, liquidity-app are independent containers, NOT modules inside api-gateway.

**Why:** Independent deployment, failure isolation, and the ability to scale individual services. api-gateway is a thin routing/auth layer only.

## Active Work Items (confirmed 2026-03-25)

- **api-gateway build** — Active. Confirmed next major build target. Will establish the internal HTTP API that wallet-app and other services use to reach the data layer. Architecture gap (wallet-app → api-gateway → postgres/redis) is known and will be closed as part of this phase.
- **wallet-app stateless refactor** — Active. Restructuring wallet-app to be fully stateless (no in-memory wallet state between requests) is confirmed active work, running in parallel with or just ahead of api-gateway wiring.

## Decisions Still Open

- Seedphrase encryption approach (library + key storage)
- App-specific Postgres user with limited permissions (currently using superuser)
- Internal port assignments
- WebSocket implementation approach for real-time frontend updates
