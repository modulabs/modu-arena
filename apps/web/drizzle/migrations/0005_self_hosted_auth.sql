-- Self-hosted Auth Migration
-- Replaces Clerk auth with username/password + JWT sessions
-- Adds username and password_hash columns, removes clerk_id

-- Step 1: Add new auth columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Step 2: Backfill existing users with a generated username from email or github_username
UPDATE users
SET username = COALESCE(
  github_username,
  SPLIT_PART(email, '@', 1),
  'user_' || LEFT(id::text, 8)
)
WHERE username IS NULL;

UPDATE users
SET password_hash = 'MIGRATED_NO_PASSWORD'
WHERE password_hash IS NULL;

-- Step 3: Add NOT NULL constraints after backfill
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

-- Step 4: Add unique constraint on username
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;
END $$;

-- Step 5: Drop clerk_id column and its unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_clerk_id_unique;
ALTER TABLE users DROP COLUMN IF EXISTS clerk_id;

-- Rollback instructions:
-- ALTER TABLE users ADD COLUMN clerk_id VARCHAR(255) UNIQUE;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_unique;
-- ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
-- ALTER TABLE users DROP COLUMN IF EXISTS username;
