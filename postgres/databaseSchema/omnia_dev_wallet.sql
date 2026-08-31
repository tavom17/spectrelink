-- =========================================================
-- Database: omnia_wallet
-- Isolated, VPC-only DO cluster — no public network access.
-- Contains identity + custody data: users, wallets, token launches.
-- =========================================================

CREATE TABLE tb_users (
    user_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email         VARCHAR UNIQUE NOT NULL,
    user_password_hash VARCHAR NOT NULL,
    user_role          VARCHAR NOT NULL DEFAULT 'member' CHECK (user_role IN ('member', 'admin')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tb_wallets
-- unique per user, no master seed phrase; wallet_index only needs
-- to be unique within a user, not globally.
CREATE TABLE tb_wallets (
    wallet_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES tb_users(user_id) ON DELETE CASCADE,
    wallet_index       INT NOT NULL,
    derivation_path    VARCHAR NOT NULL,
    public_key         VARCHAR UNIQUE NOT NULL,
    encrypted_mnemonic TEXT NOT NULL,
    wallet_type        VARCHAR NOT NULL DEFAULT 'slave' CHECK (wallet_type IN ('slave', 'funding', 'fee', 'master')),
    label              VARCHAR,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_wallet_index UNIQUE (user_id, wallet_index)
);

CREATE INDEX idx_wallets_user_id ON tb_wallets(user_id);

CREATE TABLE tb_tokens (
    token_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES tb_users(user_id) ON DELETE CASCADE,
    fee_wallet_id   UUID REFERENCES tb_wallets(wallet_id),
    mint_address    VARCHAR UNIQUE NOT NULL,
    name            VARCHAR NOT NULL,
    symbol          VARCHAR NOT NULL,
    decimals        INT NOT NULL,
    supply          BIGINT NOT NULL,
    metadata_uri    VARCHAR,
    image_uri       VARCHAR,
    metadata_tx_sig VARCHAR,
    pool_address    VARCHAR,
    launch_tx_sig   VARCHAR,
    launch_cost_sol NUMERIC, -- total SOL spent to launch (fees + seeded liquidity); the "entry" for PnL
    launched_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokens_user_id ON tb_tokens(user_id);
CREATE INDEX idx_tokens_fee_wallet_id ON tb_tokens(fee_wallet_id);

-- keep updated_at current on tb_users without app-side plumbing
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON tb_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
