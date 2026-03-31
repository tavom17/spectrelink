--table for user
CREATE TABLE tb_users (
user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_email VARCHAR NOT NULL,
user_password_hash varchar NOT NULL, 
user_role varchar NOT NULL DEFAULT 'member', 
hd_account_index INT UNIQUE NOT NULL, 
created_at timestamp NOT NULL, 
updated_at timestamp NOT NULL
);


--table for wallets
CREATE TABLE tb_wallets (
wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES tb_users(user_id),
wallet_index INT NOT NULL,
derivation_path VARCHAR NOT NULL,
public_key VARCHAR UNIQUE NOT NULL,
encrypted_menmonic TEXT NOT NULL, 
label VARCHAR,
created_at TIMESTAMP NOT NULL DEFAULT now()  
);


--table for tokens
CREATE TABLE tb_tokens (
token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES tb_users(user_id),
mint_address VARCHAR UNIQUE NOT NULL,
name VARCHAR NOT NULL, 
symbol VARCHAR NOT NULL,
decimals INT NOT NULL, 
supply BIGINT NOT NULL, 
launch_tx_sig VARCHAR,
launched_at TIMESTAMP,
created_at TIMESTAMP NOT NULL DEFAULT now() 
);


--table for liquidity positions specifically from meteora
CREATE TABLE tb_liquidity_positions (
liquidity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
wallet_id uuid NOT NULL REFERENCES tb_wallets(wallet_id),
token_id uuid NOT NULL REFERENCES tb_tokens(token_id),
pool_address VARCHAR NOT NULL,
position_nft_address VARCHAR UNIQUE NOT NULL,
token_a_mint VARCHAR NOT NULL,
token_b_mint VARCHAR NOT NULL,
amount_a_deposited NUMERIC NOT NULL,
amount_b_deposited NUMERIC NOT NULL, 
status VARCHAR NOT NULL DEFAULT 'open',
opened_at TIMESTAMP NOT NULL DEFAULT now(),
closed_at TIMESTAMP
);