-- =========================================================
-- Stored procedures for omnia_dev_wallet (tb_users, tb_wallets, tb_tokens)
-- Covers the 5 INSERT sites catalogued in /dbcalls.
--
-- Pattern used throughout:
--   - CREATE PROCEDURE (not FUNCTION) so transaction control
--     (COMMIT/ROLLBACK) is legal inside the body.
--   - Retryable errors (serialization_failure, deadlock_detected) are
--     caught in a LOOP with capped attempts + linear backoff via pg_sleep.
--   - The COMMIT always sits OUTSIDE the BEGIN...EXCEPTION block, since
--     PL/pgSQL implements exception handling with an implicit savepoint
--     and Postgres forbids COMMIT while a subtransaction is open.
--   - Non-retryable errors (unique_violation, check_violation) are
--     re-raised immediately with a caller-friendly message instead of
--     being retried.
-- =========================================================


-- ---------------------------------------------------------
-- 1. tb_users insert  (api-gateway/src/routes/auth/registration.ts:24-27)
--
-- Replaces the app's separate SELECT-then-INSERT with one atomic
-- statement, closing the TOCTOU race where two concurrent registrations
-- for the same email could both pass the SELECT check.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_register_user(
    IN  p_user_email      VARCHAR,
    IN  p_password_hash   VARCHAR,
    OUT p_user_id         UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt      INT := 0;
    v_max_attempts INT := 5;
BEGIN
    <<retry>>
    LOOP
        BEGIN
            INSERT INTO tb_users (user_email, user_password_hash)
            VALUES (p_user_email, p_password_hash)
            RETURNING user_id INTO p_user_id;

            EXIT retry;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'email_already_exists: %', p_user_email
                    USING ERRCODE = 'unique_violation';

            WHEN serialization_failure OR deadlock_detected THEN
                v_attempt := v_attempt + 1;
                IF v_attempt >= v_max_attempts THEN
                    RAISE;
                END IF;
                PERFORM pg_sleep(0.05 * v_attempt);
        END;
    END LOOP;

    COMMIT;
END;
$$;


-- ---------------------------------------------------------
-- 2. tb_wallets insert — master wallet
--    (wallet-app/src/routes/internal/walletRoute.ts:27-31)
--
-- Only path that ever populates encrypted_mnemonic; wallet_index is
-- always 0 for the master row (one master wallet per user).
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_create_master_wallet(
    IN  p_user_id             UUID,
    IN  p_derivation_path     VARCHAR,
    IN  p_public_key          VARCHAR,
    IN  p_encrypted_mnemonic  TEXT,
    IN  p_label                VARCHAR,
    OUT p_wallet_id            UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt      INT := 0;
    v_max_attempts INT := 5;
BEGIN
    <<retry>>
    LOOP
        BEGIN
            INSERT INTO tb_wallets (
                user_id, wallet_index, derivation_path,
                public_key, encrypted_mnemonic, wallet_type, label
            )
            VALUES (
                p_user_id, 0, p_derivation_path,
                p_public_key, p_encrypted_mnemonic, 'master', p_label
            )
            RETURNING wallet_id INTO p_wallet_id;

            EXIT retry;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'master_wallet_already_exists: user_id=%', p_user_id
                    USING ERRCODE = 'unique_violation';

            WHEN serialization_failure OR deadlock_detected THEN
                v_attempt := v_attempt + 1;
                IF v_attempt >= v_max_attempts THEN
                    RAISE;
                END IF;
                PERFORM pg_sleep(0.05 * v_attempt);
        END;
    END LOOP;

    COMMIT;
END;
$$;


-- ---------------------------------------------------------
-- Helper — advisory-lock protected wallet_index allocation.
--
-- The app currently computes "one past the max index" with a plain
-- SELECT MAX(wallet_index) issued before the INSERT, which is racy
-- under concurrent requests for the same user_id + wallet_type.
-- This procedure takes a transaction-scoped advisory lock keyed on
-- (user_id, wallet_type) so concurrent callers serialize instead of
-- colliding on uq_user_wallet_index.
--
-- Must be called inside the SAME transaction as the subsequent
-- sp_create_wallet / sp_create_slave_wallets_bulk call (BEGIN ... CALL
-- sp_allocate_wallet_index ... derive keys in app code ... CALL
-- sp_create_wallet ... COMMIT) so the lock is held across both steps.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_allocate_wallet_index(
    IN  p_user_id      UUID,
    IN  p_wallet_type  VARCHAR,
    IN  p_count        INT DEFAULT 1,
    OUT p_next_index   INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_wallet_type, 0));

    SELECT COALESCE(MAX(wallet_index) + 1, 0)
    INTO p_next_index
    FROM tb_wallets
    WHERE user_id = p_user_id AND wallet_type = p_wallet_type;
END;
$$;


-- ---------------------------------------------------------
-- 3 & 4. tb_wallets insert — funding / fee wallets
--    (wallet-app/src/routes/internal/walletFunctions.ts:103-107, 137-141)
--
-- Generic single-row insert, used for funding/fee (and reusable for
-- master or slave one-offs) after sp_allocate_wallet_index has produced
-- the index for this user_id + wallet_type.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_create_wallet(
    IN  p_user_id             UUID,
    IN  p_wallet_index        INT,
    IN  p_derivation_path     VARCHAR,
    IN  p_public_key          VARCHAR,
    IN  p_wallet_type         VARCHAR,
    IN  p_encrypted_mnemonic  TEXT    DEFAULT NULL,
    IN  p_label               VARCHAR DEFAULT NULL,
    OUT p_wallet_id           UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt      INT := 0;
    v_max_attempts INT := 5;
BEGIN
    <<retry>>
    LOOP
        BEGIN
            INSERT INTO tb_wallets (
                user_id, wallet_index, derivation_path,
                public_key, encrypted_mnemonic, wallet_type, label
            )
            VALUES (
                p_user_id, p_wallet_index, p_derivation_path,
                p_public_key, p_encrypted_mnemonic, p_wallet_type, p_label
            )
            RETURNING wallet_id INTO p_wallet_id;

            EXIT retry;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'wallet_index_or_public_key_conflict: user_id=%, wallet_type=%, wallet_index=%',
                    p_user_id, p_wallet_type, p_wallet_index
                    USING ERRCODE = 'unique_violation';

            WHEN serialization_failure OR deadlock_detected THEN
                v_attempt := v_attempt + 1;
                IF v_attempt >= v_max_attempts THEN
                    RAISE;
                END IF;
                PERFORM pg_sleep(0.05 * v_attempt);
        END;
    END LOOP;

    COMMIT;
END;
$$;


-- ---------------------------------------------------------
-- 5. tb_wallets bulk insert — slave wallets
--    (wallet-app/src/routes/internal/walletFunctions.ts:69-73)
--
-- App currently issues one INSERT per slave inside a hand-rolled
-- BEGIN/COMMIT loop. This collapses that into a single set-based
-- INSERT so the whole batch commits or fails atomically, with one
-- retry loop around the batch rather than per-row.
--
-- Call sp_allocate_wallet_index(p_user_id, 'slave', amountOfSlaves)
-- first to get the starting index, derive amountOfSlaves keypairs in
-- app code using consecutive indexes, then pass the resulting arrays
-- here (all three arrays must be the same length and same order).
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_create_slave_wallets_bulk(
    IN  p_user_id           UUID,
    IN  p_wallet_indexes    INT[],
    IN  p_derivation_paths  VARCHAR[],
    IN  p_public_keys       VARCHAR[],
    OUT p_wallet_ids        UUID[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt      INT := 0;
    v_max_attempts INT := 5;
BEGIN
    IF array_length(p_wallet_indexes, 1) IS DISTINCT FROM array_length(p_public_keys, 1)
       OR array_length(p_derivation_paths, 1) IS DISTINCT FROM array_length(p_public_keys, 1) THEN
        RAISE EXCEPTION 'slave_wallet_array_length_mismatch';
    END IF;

    <<retry>>
    LOOP
        BEGIN
            SELECT array_agg(wallet_id ORDER BY wallet_index)
            INTO p_wallet_ids
            FROM (
                INSERT INTO tb_wallets (user_id, wallet_index, derivation_path, public_key, wallet_type)
                SELECT p_user_id, idx, path, pubkey, 'slave'
                FROM unnest(p_wallet_indexes, p_derivation_paths, p_public_keys) AS t(idx, path, pubkey)
                RETURNING wallet_id, wallet_index
            ) AS inserted;

            EXIT retry;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'slave_wallet_index_or_public_key_conflict: user_id=%', p_user_id
                    USING ERRCODE = 'unique_violation';

            WHEN serialization_failure OR deadlock_detected THEN
                v_attempt := v_attempt + 1;
                IF v_attempt >= v_max_attempts THEN
                    RAISE;
                END IF;
                PERFORM pg_sleep(0.05 * v_attempt);
        END;
    END LOOP;

    COMMIT;
END;
$$;


-- ---------------------------------------------------------
-- 6. tb_tokens insert — token launch record
--    (coin-launcher/src/launchInitializer.ts:185-188)
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_record_token_launch(
    IN  p_user_id              UUID,
    IN  p_fee_wallet_id        UUID,
    IN  p_funding_wallet_id    UUID,
    IN  p_mint_address         VARCHAR,
    IN  p_name                 VARCHAR,
    IN  p_symbol                VARCHAR,
    IN  p_decimals               INT,
    IN  p_supply                 NUMERIC,
    IN  p_metadata_uri            VARCHAR,
    IN  p_image_uri                VARCHAR,
    IN  p_metadata_tx_sig           VARCHAR,
    IN  p_pool_address                VARCHAR,
    IN  p_position_address             VARCHAR,
    IN  p_position_nft_mint             VARCHAR,
    IN  p_position_tx_sig                 VARCHAR,
    IN  p_launch_tx_sig                    VARCHAR,
    IN  p_website                           VARCHAR,
    IN  p_twitter                            VARCHAR,
    IN  p_telegram                            VARCHAR,
    OUT p_token_id                             UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_attempt      INT := 0;
    v_max_attempts INT := 5;
BEGIN
    <<retry>>
    LOOP
        BEGIN
            INSERT INTO tb_tokens (
                user_id, fee_wallet_id, funding_wallet_id, mint_address, name, symbol,
                decimals, supply, metadata_uri, image_uri, metadata_tx_sig, pool_address,
                position_address, position_nft_mint, position_tx_sig, launch_tx_sig,
                website, twitter, telegram, launched_at
            )
            VALUES (
                p_user_id, p_fee_wallet_id, p_funding_wallet_id, p_mint_address, p_name, p_symbol,
                p_decimals, p_supply, p_metadata_uri, p_image_uri, p_metadata_tx_sig, p_pool_address,
                p_position_address, p_position_nft_mint, p_position_tx_sig, p_launch_tx_sig,
                p_website, p_twitter, p_telegram, now()
            )
            RETURNING token_id INTO p_token_id;

            EXIT retry;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'mint_address_already_recorded: %', p_mint_address
                    USING ERRCODE = 'unique_violation';

            WHEN serialization_failure OR deadlock_detected THEN
                v_attempt := v_attempt + 1;
                IF v_attempt >= v_max_attempts THEN
                    RAISE;
                END IF;
                PERFORM pg_sleep(0.05 * v_attempt);
        END;
    END LOOP;

    COMMIT;
END;
$$;
