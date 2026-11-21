-- =========================================================
-- Database: omnia_core
-- General, non-custody microservice data: token launches, liquidity
-- positions, trades, pool snapshots.
--
-- tb_tokens lives here so the tables below use REAL foreign keys to it.
-- wallet_id columns reference tb_wallets in the separate omnia_wallet
-- database (custody data). Postgres cannot enforce a foreign key across
-- databases, so wallet_id integrity is validated at the application layer.
--
-- All on-chain AMOUNTS are integers of the smallest unit:
--   SOL    → lamports           NUMERIC(20,0)
--   tokens → raw base units     NUMERIC(40,0)
-- PRICES are ratios, not amounts, and stay decimal.
-- node-pg returns NUMERIC as strings — correct for these values.
-- =========================================================


-- tb_tokens
-- One row per token launched through the platform.
-- user_id / *_wallet_id reference omnia_wallet (app-enforced).
CREATE TABLE tb_tokens (
    token_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- owner + wallets live in omnia_wallet: plain UUIDs, app-enforced
    user_id                  UUID          NOT NULL,
    funding_wallet_id        UUID          NOT NULL,
    fee_wallet_id            UUID,                                   -- fee wallets currently unused

    -- token
    mint_address             VARCHAR       NOT NULL UNIQUE,
    name                     VARCHAR       NOT NULL,
    symbol                   VARCHAR       NOT NULL,
    decimals                 SMALLINT      NOT NULL CHECK (decimals BETWEEN 0 AND 9),
    supply                   NUMERIC(40,0) NOT NULL CHECK (supply > 0),   -- whole tokens (pre-decimals)

    -- metadata (on-chain: name/symbol/uri on the mint; Arweave JSON: description, image, socials)
    metadata_uri             VARCHAR,
    image_uri                VARCHAR,
    metadata_tx_sig          VARCHAR,                                -- base58; with Token-2022 this is the mint tx
    website                  VARCHAR,
    twitter                  VARCHAR,
    telegram                 VARCHAR,

    -- pool / launch position
    pool_address             VARCHAR       UNIQUE,
    position_address         VARCHAR,
    position_nft_mint        VARCHAR,
    position_tx_sig          VARCHAR,                                -- reserved: future funding → fee position transfer
    launch_tx_sig            VARCHAR,                                -- pool creation tx

    -- token program + authority state
    token_program            VARCHAR       NOT NULL DEFAULT 'spl-token' CHECK (token_program IN ('spl-token', 'token-2022')),
    mint_authority_revoked   BOOLEAN       NOT NULL DEFAULT true,
    freeze_authority_revoked BOOLEAN       NOT NULL DEFAULT true,
    metadata_locked          BOOLEAN       NOT NULL DEFAULT false,

    -- PnL entry: SOL that left the funding wallet for this launch
    -- (upload + rent + fees + seeded liquidity), measured before upload → after pool
    launch_cost_lamports     NUMERIC(20,0),

    launched_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- token list: WHERE user_id = $1 ORDER BY launched_at DESC
CREATE INDEX idx_tokens_user_launched ON tb_tokens (user_id, launched_at DESC);


-- tb_liquidity_positions
-- Liquidity positions held by our wallets. Deleting a token with positions is blocked (RESTRICT).
CREATE TABLE tb_liquidity_positions (
    liquidity_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id             UUID NOT NULL,                                  -- omnia_wallet.tb_wallets.wallet_id (app-enforced)
    token_id              UUID NOT NULL REFERENCES tb_tokens(token_id) ON DELETE RESTRICT,
    position_nft_address  VARCHAR UNIQUE NOT NULL,
    token_a_mint          VARCHAR NOT NULL,
    token_b_mint          VARCHAR NOT NULL,
    amount_a_deposited    NUMERIC(40,0) NOT NULL,                         -- raw base units
    amount_b_deposited    NUMERIC(40,0) NOT NULL,                         -- raw base units (lamports when WSOL)
    status                VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at             TIMESTAMPTZ,
    exit_value_lamports   NUMERIC(20,0)                                   -- SOL back on close, set with closed_at.
                                                                          -- PnL = exit_value_lamports - tb_tokens.launch_cost_lamports
);

CREATE INDEX idx_liquidity_wallet_id ON tb_liquidity_positions(wallet_id);
CREATE INDEX idx_liquidity_token_id  ON tb_liquidity_positions(token_id);


-- tb_token_trades
-- One row per trader per executed trade against a token's pool — covers both
-- general market activity and our own tracked wallets in a single table.
-- wallet_id is only populated when the trader is one of our tracked wallets;
-- trader_address always holds the on-chain pubkey. Filter wallet_id IS NOT NULL
-- for our wallets' activity, or leave unfiltered for the full market view.
-- tx_signature is shared across rows when one atomic tx bundles several traders,
-- so uniqueness is on (tx_signature, trader_address), not tx_signature alone.
-- Populated near-real-time from the Helius stream; source data for the
-- command center trading view chart.
CREATE TABLE tb_token_trades (
    trade_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id         UUID NOT NULL REFERENCES tb_tokens(token_id) ON DELETE RESTRICT,
    wallet_id        UUID,                                                -- omnia_wallet.tb_wallets.wallet_id (app-enforced), null if untracked
    tx_signature     VARCHAR NOT NULL,                                    -- not unique alone, see above
    side             VARCHAR NOT NULL CHECK (side IN ('buy', 'sell')),
    amount_token     NUMERIC(40,0) NOT NULL,                              -- raw base units
    amount_lamports  NUMERIC(20,0) NOT NULL,
    price_sol        NUMERIC NOT NULL,                                    -- SOL per whole token at execution — a ratio, decimal is correct
    trader_address   VARCHAR NOT NULL,
    executed_at      TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_trade_signature_trader UNIQUE (tx_signature, trader_address)
);

CREATE INDEX idx_trades_token_id_executed_at ON tb_token_trades(token_id, executed_at);
CREATE INDEX idx_trades_wallet_id            ON tb_token_trades(wallet_id);
CREATE INDEX idx_trades_signature            ON tb_token_trades(tx_signature);


-- tb_pool_snapshots
-- Periodic reserve snapshots per pool, for depth-over-time charting.
CREATE TABLE tb_pool_snapshots (
    snapshot_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id              UUID NOT NULL REFERENCES tb_tokens(token_id) ON DELETE RESTRICT,
    pool_address          VARCHAR NOT NULL,
    token_reserve         NUMERIC(40,0) NOT NULL,                         -- raw base units
    sol_reserve_lamports  NUMERIC(20,0) NOT NULL,
    recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_snapshots_token_id_recorded_at ON tb_pool_snapshots(token_id, recorded_at);