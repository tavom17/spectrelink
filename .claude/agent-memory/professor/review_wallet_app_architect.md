---
name: wallet-app-architect agent activity digest
description: What the wallet-app-architect agent has done, key decisions made, concepts the developer should understand, and upskilling threads to pursue
type: project
---

## Agent Activity Summary (as of 2026-03-25)

### Phase 1 — Scan Complete

wallet-app-architect has fully scanned the source repository at `/home/tavosol/cryptoProjects/solBundler`.

**What solBundler is:** A CLI/REPL bundler for Solana. The "bundler" pattern = one funding wallet + N slave wallets all derived from a single BIP39 mnemonic. Used to fund many wallets and coordinate simultaneous buys during a token launch (a common Solana launch strategy).

### Phase 2 — Stateless Design Complete

The agent has produced the full HTTP endpoint design for wallet-app:

| Endpoint | Purpose |
|---|---|
| POST /wallet/create | Generate mnemonic, derive index 0 (funding wallet), persist |
| POST /wallet/derive | Load mnemonic from storage, derive next N slave wallets |
| POST /wallet/fund | Load all wallets, build batch SOL transfer tx(s), sign, submit |
| GET /wallet/balance | Query SOL balance for any address (stateless RPC call) |
| GET /health | Health check |

### Key Architectural Decision Made

**wallet-app cannot reach Postgres directly.** It lives on `spectrelink_app` network; Postgres lives on `spectrelink_data`. All persistence is mediated through api-gateway. The internal HTTP API between wallet-app and api-gateway for DB operations is **not yet designed** — this is the critical open design question for Phase 3.

### Postgres Schema Intent

```
users:   id, seedphrase (encrypted BIP39 mnemonic), created_at
wallets: id, user_id (FK), derivation_path, address (base58), created_at
```

### Critical Stateful Patterns Being Eliminated

The old `walletController` class held state in memory: `fundingWallet`, `slaveWallets` Map, `mnemonic`, `seed`. All of these are eliminated. Every request loads what it needs from Postgres (via api-gateway), operates, and discards. No wallet data survives between requests.

### Important Technical Constraints Discovered

- Solana tx message size limit: ~1232 bytes. At ~20-25 slave wallets per batch, POST /wallet/fund must chunk into multiple transactions and return multiple signatures.
- Mnemonic is NEVER returned to api-gateway in any response — wallet-app's internal concern only.
- `@solana/spl-token` is in package.json but unused — reserved for future coin-launcher integration.
- Hardcoded devnet URLs in old `rpcWrapper.ts` must be replaced with `SOLANA_RPC_URL` env var.

## Concepts the Developer Should Understand

1. **BIP39 + HD derivation** — What a mnemonic is, how the seed buffer is derived, how BIP44 derivation paths work (m/44'/501'/index'/0'), and why index 0 is always the funding wallet.
2. **Stateless vs stateful service design** — Why in-memory state between requests is dangerous in a microservice (restart = data loss, no horizontal scaling, no recovery).
3. **Network segmentation as a security boundary** — Why wallet-app being on app network only (not data network) is a deliberate constraint, not a gap to work around.
4. **The api-gateway mediation pattern** — wallet-app needs to write to Postgres but can't reach it. How does it do that? The answer (internal HTTP calls to api-gateway) has architectural implications worth discussing.
5. **Transaction batching on Solana** — Why you can't fund 100 wallets in one transaction and how chunking works.

## Open Questions to Ask the Developer

- Do you understand why the wallet controller's in-memory state is a problem in a Docker container context? (Hint: think about what happens when the container restarts.)
- What does it mean for wallet-app to call api-gateway for DB access? What does that internal API look like? Who authenticates whom?
- The mnemonic is encrypted at rest — what library/approach are you planning? This is unresolved.
- The redis tag in docker-compose is unpinned (`redis` not `redis:7-alpine`) — intentional or oversight?

## Unresolved for wallet-app Phase 3

- Exact internal HTTP API between wallet-app and api-gateway (for DB operations)
- Seedphrase encryption library and key management approach
- App-specific Postgres user (currently using `scrippa_admin` which is superuser — should be locked down)
- Helius private RPC URL (will be env var, URL not yet saved here)
- Internal port assignments per container
