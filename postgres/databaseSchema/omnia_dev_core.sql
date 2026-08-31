-- =========================================================
-- Database: omnia_core
-- Shared cluster — general, non-custody microservice data.
-- wallet_id and token_id below reference tb_wallets / tb_tokens
-- in the separate omnia_wallet database. Postgres cannot enforce
-- a foreign key across databases, so referential integrity for
-- these two columns must be validated at the application layer
-- (e.g. confirm the wallet/token exists via the wallet service
-- before inserting a position).
-- =========================================================

CREATE TABLE tb_liquidity_positions (
    liquidity_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id            UUID NOT NULL, -- omnia_wallet.tb_wallets.wallet_id (app-enforced)
    token_id             UUID NOT NULL, -- omnia_wallet.tb_tokens.token_id (app-enforced)
    position_nft_address VARCHAR UNIQUE NOT NULL,
    token_a_mint         VARCHAR NOT NULL,
    token_b_mint         VARCHAR NOT NULL,
    amount_a_deposited   NUMERIC NOT NULL,
    amount_b_deposited   NUMERIC NOT NULL,
    status                VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at            TIMESTAMPTZ,
    exit_value_sol       NUMERIC -- total SOL received back on close; set alongside closed_at. PnL = exit_value_sol - tb_tokens.launch_cost_sol
);

CREATE INDEX idx_liquidity_wallet_id ON tb_liquidity_positions(wallet_id);
CREATE INDEX idx_liquidity_token_id ON tb_liquidity_positions(token_id);

-- tb_token_trades
-- One row per trader per executed trade against a token's pool — covers both
-- general market activity and our own tracked wallets in a single table.
-- wallet_id is only populated when the trader is one of our own tracked
-- wallets; trader_address always holds the on-chain pubkey regardless.
-- Filter on wallet_id IS NOT NULL to show only our wallets' activity, or
-- leave unfiltered for the full market view. tx_signature is shared across
-- multiple rows when a buy is bundled across several traders/wallets in one
-- atomic transaction, so uniqueness is on (tx_signature, trader_address),
-- not tx_signature alone. Populated in near-real-time from the Helius data
-- stream (webhook/websocket) as trades occur, and is the source data for
-- the trading view chart in the command center.
CREATE TABLE tb_token_trades (
    trade_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id       UUID NOT NULL, -- omnia_wallet.tb_tokens.token_id (app-enforced)
    wallet_id      UUID, -- omnia_wallet.tb_wallets.wallet_id (app-enforced), null if untracked trader
    tx_signature   VARCHAR NOT NULL, -- not unique alone, see above
    side           VARCHAR NOT NULL CHECK (side IN ('buy', 'sell')),
    amount_token   NUMERIC NOT NULL,
    amount_sol     NUMERIC NOT NULL,
    price_sol      NUMERIC NOT NULL, -- price per token in SOL at execution
    trader_address VARCHAR NOT NULL,
    executed_at    TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_trade_signature_trader UNIQUE (tx_signature, trader_address)
);

CREATE INDEX idx_trades_token_id_executed_at ON tb_token_trades(token_id, executed_at);
CREATE INDEX idx_trades_wallet_id ON tb_token_trades(wallet_id);
CREATE INDEX idx_trades_signature ON tb_token_trades(tx_signature);

-- tb_pool_snapshots
-- Periodic reserve snapshots per pool, for depth-over-time charting.
CREATE TABLE tb_pool_snapshots (
    snapshot_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id      UUID NOT NULL, -- omnia_wallet.tb_tokens.token_id (app-enforced)
    pool_address  VARCHAR NOT NULL,
    token_reserve NUMERIC NOT NULL,
    sol_reserve   NUMERIC NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_snapshots_token_id_recorded_at ON tb_pool_snapshots(token_id, recorded_at);

