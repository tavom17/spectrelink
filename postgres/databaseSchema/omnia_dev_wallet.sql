-- =========================================================
-- Database: omnia_wallet
-- Isolated, VPC-only DO cluster — no public network access.
-- Identity + custody data: users, wallets, bundle groups.
-- Only wallet-app connects here. Token launch records live in
-- omnia_core (tb_tokens).
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
-- One master per user holds the encrypted mnemonic; every other wallet is
-- derived from it. wallet_index only needs to be unique per user + type.
CREATE TABLE tb_wallets (
    wallet_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES tb_users(user_id) ON DELETE CASCADE,
    wallet_index       INT NOT NULL,
    derivation_path    VARCHAR NOT NULL,
    public_key         VARCHAR UNIQUE NOT NULL,
    encrypted_mnemonic TEXT,
    wallet_type        VARCHAR NOT NULL DEFAULT 'slave' CHECK (wallet_type IN ('slave', 'funding', 'fee', 'master')),
    label              VARCHAR,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_wallet_index UNIQUE (user_id, wallet_index, wallet_type),
    CONSTRAINT chk_master_has_mnemonic CHECK (wallet_type != 'master' OR encrypted_mnemonic IS NOT NULL)
);

CREATE INDEX idx_wallets_user_id ON tb_wallets(user_id);

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


-- tb_bundle_groups
-- A user's named group of slave wallets, created together for bundled buys.
CREATE TABLE tb_bundle_groups (
    group_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES tb_users(user_id) ON DELETE CASCADE,
    group_name  VARCHAR NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_group_name_per_user UNIQUE (user_id, group_name)
);

CREATE INDEX idx_bundle_groups_user ON tb_bundle_groups (user_id, created_at DESC);

-- tb_bundle_group_members
-- Each slave wallet belongs to at most one group; position orders the group.
-- Triggers below: slave wallets only, max 25 per group.
CREATE TABLE tb_bundle_group_members (
    member_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES tb_bundle_groups(group_id) ON DELETE CASCADE,
    wallet_id   UUID NOT NULL REFERENCES tb_wallets(wallet_id) ON DELETE CASCADE,
    position    SMALLINT NOT NULL CHECK (position >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_wallet_single_group UNIQUE (wallet_id),
    CONSTRAINT uq_position_per_group  UNIQUE (group_id, position)
);

CREATE INDEX idx_group_members ON tb_bundle_group_members (group_id, position);

-- only slave wallets may join a bundle group
CREATE OR REPLACE FUNCTION fn_bundle_member_must_be_slave()
RETURNS TRIGGER AS $$
DECLARE wtype VARCHAR;
BEGIN
    SELECT wallet_type INTO wtype FROM tb_wallets WHERE wallet_id = NEW.wallet_id;
    IF wtype IS DISTINCT FROM 'slave' THEN
        RAISE EXCEPTION 'wallet % is type %, only slave wallets can join a bundle group',
            NEW.wallet_id, wtype;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bundle_member_slave_only
    BEFORE INSERT ON tb_bundle_group_members
    FOR EACH ROW EXECUTE FUNCTION fn_bundle_member_must_be_slave();

-- max 25 wallets per group; row lock on the group stops two concurrent inserts both seeing 24
CREATE OR REPLACE FUNCTION fn_enforce_bundle_group_cap()
RETURNS TRIGGER AS $$
DECLARE current_count SMALLINT;
BEGIN
    PERFORM 1 FROM tb_bundle_groups WHERE group_id = NEW.group_id FOR UPDATE;
    SELECT COUNT(*) INTO current_count
      FROM tb_bundle_group_members WHERE group_id = NEW.group_id;
    IF current_count >= 25 THEN
        RAISE EXCEPTION 'bundle group % is at capacity (25)', NEW.group_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bundle_group_cap
    BEFORE INSERT ON tb_bundle_group_members
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_bundle_group_cap();