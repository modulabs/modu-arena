-- Modu Platform Fresh Schema Migration
-- This migration creates the complete new schema for Modu platform
-- Replaces: daily_aggregates, rankings, teams, agents, usage_alerts, cost_tracking

-- Step 1: Create tool_types registry table
CREATE TABLE IF NOT EXISTS tool_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  icon_url TEXT,
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Seed tool types
INSERT INTO tool_types (id, name, display_name, color, sort_order) VALUES
  ('claude-code', 'Claude Code', 'Claude Code', '#D97706', 1),
  ('opencode', 'OpenCode', 'OpenCode', '#3B82F6', 2),
  ('gemini', 'Gemini CLI', 'Gemini CLI', '#10B981', 3),
  ('codex', 'Codex CLI', 'Codex CLI', '#8B5CF6', 4),
  ('crush', 'Crush', 'Crush', '#EC4899', 5)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Add tool_type_id to sessions (if column doesn't exist)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tool_type_id VARCHAR(50) REFERENCES tool_types(id);
-- Rename server_session_hash to session_hash if old column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='server_session_hash') THEN
    ALTER TABLE sessions RENAME COLUMN server_session_hash TO session_hash;
  END IF;
END$$;

-- Step 4: Add tool_type_id to token_usage (if column doesn't exist)
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS tool_type_id VARCHAR(50) REFERENCES tool_types(id);

-- Step 5: Add successful_projects_count to users (if column doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS successful_projects_count INTEGER DEFAULT 0;

-- Step 6: Create project_evaluations table
CREATE TABLE IF NOT EXISTS project_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_path_hash VARCHAR(64) NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  total_score INTEGER NOT NULL,
  rubric_functionality INTEGER NOT NULL,
  rubric_practicality INTEGER NOT NULL,
  llm_model VARCHAR(100) NOT NULL,
  llm_provider VARCHAR(50) NOT NULL,
  passed BOOLEAN NOT NULL,
  feedback TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 7: Create user_stats table
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_input_tokens BIGINT NOT NULL DEFAULT 0,
  total_output_tokens BIGINT NOT NULL DEFAULT 0,
  total_cache_tokens BIGINT NOT NULL DEFAULT 0,
  total_all_tokens BIGINT NOT NULL DEFAULT 0,
  tokens_by_tool JSONB DEFAULT '{}',
  total_sessions INTEGER NOT NULL DEFAULT 0,
  sessions_by_tool JSONB DEFAULT '{}',
  successful_projects_count INTEGER NOT NULL DEFAULT 0,
  total_evaluations INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 8: Create daily_user_stats table
CREATE TABLE IF NOT EXISTS daily_user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  by_tool JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stat_date)
);

-- Step 9: Create security_audit_log table
CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 10: Create indexes
CREATE INDEX IF NOT EXISTS tool_types_is_active_idx ON tool_types(is_active);
CREATE INDEX IF NOT EXISTS tool_types_sort_order_idx ON tool_types(sort_order);

CREATE INDEX IF NOT EXISTS sessions_tool_type_id_idx ON sessions(tool_type_id);
CREATE INDEX IF NOT EXISTS sessions_user_tool_idx ON sessions(user_id, tool_type_id);

CREATE INDEX IF NOT EXISTS token_usage_tool_type_id_idx ON token_usage(tool_type_id);

CREATE INDEX IF NOT EXISTS project_evaluations_user_id_idx ON project_evaluations(user_id);
CREATE INDEX IF NOT EXISTS project_evaluations_project_hash_idx ON project_evaluations(project_path_hash);
CREATE INDEX IF NOT EXISTS project_evaluations_passed_idx ON project_evaluations(passed);
CREATE INDEX IF NOT EXISTS project_evaluations_evaluated_at_idx ON project_evaluations(evaluated_at);

CREATE INDEX IF NOT EXISTS user_stats_total_tokens_idx ON user_stats(total_all_tokens);
CREATE INDEX IF NOT EXISTS user_stats_projects_idx ON user_stats(successful_projects_count);
CREATE INDEX IF NOT EXISTS user_stats_activity_idx ON user_stats(last_activity_at);

CREATE INDEX IF NOT EXISTS daily_user_stats_user_date_idx ON daily_user_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS daily_user_stats_date_idx ON daily_user_stats(stat_date);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_event_type_idx ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON security_audit_log(created_at);
