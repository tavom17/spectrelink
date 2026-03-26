---
name: solBundler source repository scan
description: Full analysis of the solBundler REPL app being migrated into the Spectrelink wallet-app service; includes confirmed endpoint design and Postgres persistence model
type: project
---

## Source repository

Path: `/home/tavosol/cryptoProjects/solBundler`
Full context file: `/home/tavosol/.claude/agents/wallet-app-architect/solBundler-context.md`

## What solBundler is

A CLI/REPL bundler tool for Solana. The "bundler" pattern = one funding wallet + N slave wallets all derived from a single BIP39 mnemonic. Used to fund many wallets and coordinate simultaneous buys during a token launch.

## Tech stack (source)

- TypeScript 5.9, strict ESM, tsx runtime (no compiled output)
- `@solana/kit` v6.1.0 (NOT legacy web3.js)
- `@solana-program/system` for SOL transfer instructions
- `bip39` + `ed25519-hd-key` + `tweetnacl` for HD wallet derivation
- `bs58` for Base58 address encoding
- Node.js `readline/promises` REPL
- Local `vault/*.json` files for wallet persistence (stateful — must be eliminated)

## Source files

- `src/index.ts` — entry point; registers REPL commands
- `src/shell.ts` — Shell class; readline REPL loop; command dispatch
- `src/walletController.ts` — stateful class: fundingWallet, slaveWallets Map, mnemonic, seed
- `src/Wallet.ts` — Wallet class: HD derivation from (index, seedBuffer); exposes address, kitKeypair
- `src/rpcWrapper.ts` — pure Solana Kit RPC + transaction building functions
- `src/userInterface.ts` — ASCII art banner and help text
- `src/types/Command.ts` — CommandContext and CommandHandler types

## walletController: discard the class, preserve the logic

The `walletController` class is discarded — its stateful fields (fundingWallet, slaveWallets, mnemonic, seed) must never live in service memory between requests. Its *methods* are the business logic and are preserved as stateless standalone functions in `src/services/wallet.service.ts`, backed by Postgres instead of in-memory fields.

Method -> function mapping:
- `createFundingWallet()` -> `createWallet(userId)`: generate mnemonic internally, derive index 0, delegate INSERT to api-gateway → Postgres
- `createSlaveWallets(n)` -> `deriveWallet(userId, count?)`: call api-gateway to fetch mnemonic, derive next index(es), delegate INSERT to api-gateway → Postgres
- `fundSlaves()` + `createBatchInstructions()` -> `fundWallets(userId, amountLamports)`: call api-gateway to fetch mnemonic + all wallet paths, derive keypairs, build + sign batch tx(s) via Helius RPC
- `saveAllWallets()` / `loadWalletsFromFile()` -> eliminated (api-gateway → Postgres replaces file I/O)

wallet-app owns derivation logic. api-gateway owns storage. wallet-app never touches Postgres directly.

## Confirmed HTTP endpoint design

All requests arrive from api-gateway with `userId`. Mnemonics and derivation paths are wallet-app's internal concern — they never appear in api-gateway request bodies.

| REPL equivalent | HTTP Endpoint (api-gw → wallet-app) | Request body | Response | Delegation (wallet-app → api-gw → Postgres) |
|---|---|---|---|---|
| cfw + sw | POST /wallet/create | { userId } | { fundingAddress } | wallet-app generates mnemonic, derives index 0, calls api-gw to INSERT users + wallets |
| csw + sw | POST /wallet/derive | { userId, count? } | { address, derivationPath, index } | wallet-app calls api-gw to GET mnemonic; derives next index; calls api-gw to INSERT wallets |
| batchTransactionTest | POST /wallet/fund | { userId, amountLamports } | { signatures: string[] } | wallet-app calls api-gw to GET mnemonic + wallet paths; derives keypairs; submits via Helius |
| solBalance | GET /wallet/balance | ?address=<base58> | { address, lamports } | None — direct Helius RPC call |
| (none) | GET /health | — | { status: 'ok' } | None |

Mnemonic is NEVER returned in any response at any layer. api-gateway only ever sees addresses and signatures.

## Postgres schema intent

```
users
  id            PK (matches userId from api-gateway auth)
  seedphrase    encrypted BIP39 mnemonic
  created_at

wallets
  id            PK
  user_id       FK -> users.id
  derivation_path  e.g. "m/44'/501'/0'/0'" (index 0 = funding wallet)
  address       base58 Solana address
  created_at
```

## Stateful patterns eliminated and their replacements

- walletController.mnemonic/seed — fetched per request from api-gateway (which reads Postgres); discarded after use
- walletController.fundingWallet/slaveWallets — derived per request from api-gateway-supplied mnemonic
- vault/*.json file I/O — replaced by api-gateway → Postgres INSERT/SELECT
- REPL-session RPC client — replaced by Helius private RPC URL from `HELIUS_RPC_URL` env var; module-level singleton is fine
- Hardcoded devnet URLs in rpcWrapper.ts lines 116, 155 — replaced by `HELIUS_RPC_URL` env var (Helius, not public Solana endpoints)

## Network topology (confirmed)

wallet-app is on `spectrelink_app` only. Postgres and Redis are on `spectrelink_data` only. wallet-app has zero direct network path to either.

api-gateway is the exclusive `app` ↔ `data` bridge. wallet-app delegates all DB operations to api-gateway via internal HTTP calls. The specific internal routes api-gateway exposes for those calls are a Phase 3 design task.

Helius RPC calls (balance queries, transaction submission) go directly from wallet-app to the Helius endpoint — they do not pass through api-gateway.

## Important for future phases

- `@solana/spl-token` is in package.json but unused — reserved for future token mint + ATA creation (coin-launcher integration)
- Batch tx size limit: ~20-25 slaves per transaction before hitting Solana's 1232-byte message limit; POST /wallet/fund must chunk and return multiple signatures if needed
- `createSolanaRpcSubscriptions` is instantiated in rpcWrapper but never used — drop initially
