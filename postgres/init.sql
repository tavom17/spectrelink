-- tb_users
CREATE TABLE tb_users (
    user_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email         VARCHAR UNIQUE NOT NULL,
    user_password_hash VARCHAR NOT NULL,
    user_role          VARCHAR NOT NULL DEFAULT 'member' CHECK (user_role IN ('member', 'admin')),
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP NOT NULL DEFAULT now()
);

-- tb_wallets
CREATE TABLE tb_wallets (
    wallet_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES tb_users(user_id),
    wallet_index       INT NOT NULL,
    derivation_path    VARCHAR NOT NULL,
    public_key         VARCHAR UNIQUE NOT NULL,
    encrypted_mnemonic TEXT NOT NULL,
    wallet_type        VARCHAR NOT NULL DEFAULT 'slave' CHECK (wallet_type IN ('slave', 'funding','fee')),
    label              VARCHAR,
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_wallet_index UNIQUE (user_id, wallet_index)
);

-- tb_tokens
CREATE TABLE tb_tokens (
    token_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES tb_users(user_id),
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
    launched_at     TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- tb_liquidity_positions
CREATE TABLE tb_liquidity_positions (
    liquidity_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id            UUID NOT NULL REFERENCES tb_wallets(wallet_id),
    token_id             UUID NOT NULL REFERENCES tb_tokens(token_id),
    position_nft_address VARCHAR UNIQUE NOT NULL,
    token_a_mint         VARCHAR NOT NULL,
    token_b_mint         VARCHAR NOT NULL,
    amount_a_deposited   NUMERIC NOT NULL,
    amount_b_deposited   NUMERIC NOT NULL,
    status               VARCHAR NOT NULL DEFAULT 'open',
    opened_at            TIMESTAMP NOT NULL DEFAULT now(),
    closed_at            TIMESTAMP
);