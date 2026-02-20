CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(128) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_encrypted TEXT,
  label VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys(user_id, is_active);

INSERT INTO api_keys (user_id, key_hash, key_prefix, key_encrypted, is_active, created_at)
SELECT id, api_key_hash, api_key_prefix, api_key_encrypted, true, COALESCE(updated_at, created_at)
FROM users
WHERE api_key_hash IS NOT NULL AND api_key_hash != '';

ALTER TABLE users ALTER COLUMN api_key_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN api_key_prefix DROP NOT NULL;
