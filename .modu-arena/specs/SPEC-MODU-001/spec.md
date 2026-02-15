# SPEC-MODU-001: Modu Rank to Modu-Arena Migration

## Metadata

| Field | Value |
|-------|-------|
| SPEC ID | SPEC-MODU-001 |
| Title | Modu Rank to Modu-Arena Migration |
| Version | 1.0.0 |
| Status | In Progress |
| Created | 2026-02-10 |
| Author | ModuLabs Team |
| Domain | Full-Stack Migration |
| Parent SPEC | SPEC-RANK-001 |

---

## 1. Executive Summary

This SPEC defines the migration of Modu Rank (legacy Claude Code Agent Leaderboard) to Modu-Arena, transforming it from a single-tool monitoring system to a multi-AI-tool monitoring and project evaluation platform.

### Migration Goals

1. **Branding Transition**: Rename product-facing moai references to modu-arena / Modu-Arena
2. **Multi-Tool Support**: Expand from Claude Code only to support multiple AI coding tools
3. **Claude Code Slash Commands**: Provide a `/modu` command suite under `.claude/commands/` as the primary agent-tool interface
4. **Project Evaluation Slash Command**: Provide `/modu:submit` which runs local validation and submits a README-only payload for remote evaluation (`POST /api/v1/evaluate`)

### Non-Goals

- Preserving the composite scoring algorithm (token usage only)
- Maintaining the complex leaderboard tiers (Bronze/Silver/Gold/etc.)
- Per-user analytics dashboards (simplified to basic stats)
- Team-based features (removed for simplicity)
- Introducing a Claude Code slash command named `/modu-submit` (do not implement; use `/modu:submit`)

---

## 2. Requirements (EARS Format)

### 2.1 Functional Requirements

#### FR-001: Branding Migration

**The system shall** replace all product-facing "moai" references with "modu-arena" / "Modu-Arena" throughout the codebase.

**WHEN** a user views any UI element,
**THEN** the system shall display "Modu-Arena" or "modu-arena" instead of "Modu" or "moai".

**Acceptance Criteria:**
- All user-facing UI text, labels, and titles use Modu-Arena branding
- Documentation files updated with new branding
- Domain name and deployment configuration updated
- Explicit exceptions are documented where renaming is not intended (e.g., internal dev tooling)

**Notes / Exceptions:**
- Developer tooling slash command `/modu` is the primary Claude Code interface for this repo's workflow.
- Internal directory names under `.modu/` and `.claude/` may retain moai naming when referring to the orchestration framework.

#### FR-002: Multi-Tool Token Monitoring

**WHEN** a user completes a session with any supported AI coding tool,
**THEN** the system shall record token usage with tool type identification.

**Acceptance Criteria:**
- Support for tool types: claude-code, opencode, gemini, codex, crush
- Each session record includes tool_type field
- Aggregate token counts across all tools per user
- Dashboard shows breakdown by tool type
- Tool-specific data normalization (different tools have different metrics)

#### FR-003: Tool Type Schema Extension

**The system shall** add tool_type field to session-related tables.

**WHEN** a session is submitted,
**THEN** the system shall validate and store the tool type.

**Acceptance Criteria:**
- sessions.table gains tool_type column (varchar, nullable for backward compatibility)
- token_usage table gains tool_type column
- Default value is 'claude-code' for existing data
- Validation ensures only registered tool types are accepted
- Index on tool_type for efficient filtering

#### FR-004: Project Evaluation System

**WHEN** a user executes `/modu:submit <project-path>`,
**THEN** the system shall run local validation and submit a README-only payload for remote evaluation and storage.

**Acceptance Criteria:**
- The local agent computes `localScore` (0..5) by running README `## Local Validation` -> `bash title="test"` (when present)
- The remote evaluator uses README content only:
  - The payload MUST include `description` as README content (truncated)
  - The payload MUST NOT include source code
  - The payload SHOULD omit fileStructure to keep the remote evaluation README-only
- Project root `README.md` is treated as the source of truth for project claims and usage
- The evaluation produces the following score components:
  - localScore: 0..5 (does the project work as described in README.md)
  - backendScore: 0..5 (backend re-evaluation of novelty/quality)
  - penaltyScore: 0..-5 (low-quality penalties)
- Score calculation:
  - finalScore = localScore + backendScore + penaltyScore
  - Range: -5 .. 10
- cumulativeScore accumulates over time per user:
  - cumulativeScoreAfter = cumulativeScoreBefore + finalScore
  - cumulativeScore can be negative
- Each evaluation record includes: project path hash, score breakdown, finalScore, cumulativeScoreAfter, timestamp
- A boolean `passed` flag is derived from `finalScore >= 5` (threshold retained for badge/count semantics)

#### FR-005: Project Evaluations Table

**The system shall** create a new table for storing project evaluations.

**WHEN** a project evaluation is produced,
**THEN** the system shall store the evaluation record (including failures), and update cumulativeScore.

**Acceptance Criteria:**
- project_evaluations table with fields:
  - id (UUID, primary key)
  - user_id (foreign key to users)
  - project_path_hash (SHA-256 for privacy)
  - project_name (extracted from package.json or directory name)
  - local_score (integer, 0-5)
  - backend_score (integer, 0-5)
  - penalty_score (integer, -5..0)
  - final_score (integer, -5..10)
  - cumulative_score_after (integer, unbounded, can be negative)
  - llm_model (varchar, model used for evaluation)
  - evaluated_at (timestamp)
  - feedback (text, LLM-generated feedback)
  - passed (boolean, derived from final_score >= 5)
  - unique constraint: (user_id, project_path_hash) to prevent duplicate submissions

#### FR-006: LLM Evaluation Service

**The system shall** implement an LLM-based project evaluation service.

**WHEN** a project is submitted for evaluation,
**THEN** the system shall analyze README, code structure, and functionality.

**Acceptance Criteria:**
- Reads project root README.md for description and claims
- Uses LLM for backendScore/penaltyScore and feedback
- localScore is computed by a deterministic local validator (CLI-side) against README.md expectations
- README.md local validation contract:
  - The project root README.md SHOULD include a section titled `## Local Validation`.
  - Under that section, the README SHOULD provide shell commands in fenced blocks with an info string:
    - ```bash title="setup"```: commands to install dependencies
    - ```bash title="test"```: commands to run tests or a health check
    - ```bash title="run"```: (optional) commands to run a minimal example
  - The local validator runs these commands (when present) from the project root.
  - localScore computation:
    - If `test` block is present and succeeds: localScore = 5
    - If `test` block is present and fails: localScore = 0
    - If `test` block is missing: localScore = 0 (insufficient evidence)
- Returns structured JSON score:
  - localScore, backendScore, penaltyScore, finalScore
  - feedback (string)
- Handles rate limits and API errors gracefully

#### FR-007: Single-Script Installation

**WHEN** a new user runs the installation script,
**THEN** the system shall set up CLI, hooks, and authentication in one command.

**Acceptance Criteria:**
- Single bash command: `curl -sSL install.modulabs.ai | bash`
- Detects OS and installs appropriate dependencies
- Sets up CLI in user PATH
- Configures git hooks for session capture
- Prompts for authentication (opens browser)
- Confirms successful installation

#### FR-011: Claude Code Custom Slash Commands

**The system shall** provide project-scoped custom slash commands under `.claude/commands/`.

**WHEN** a developer opens this repo in Claude Code,
**THEN** the `/modu` command suite shall be available for doc-first workflow execution.

**Acceptance Criteria:**
- `/modu` is defined by `.claude/commands/modu.md`
- `/modu:project`, `/modu:plan`, `/modu:run`, `/modu:sync`, `/modu:fix`, `/modu:loop`, `/modu:feedback`, `/modu:submit` are defined by `.claude/commands/modu/*.md`
- Each command instructs the agent to read `.modu-arena/development-plan.md` and relevant SPEC docs before acting
- Commands remain short and end with a `state: ulw` line on completion

#### FR-008: User Project Count Tracking

**The system shall** track the number of successful project evaluations per user.

**WHEN** a user's project evaluation passes (finalScore >= 5),
**THEN** the system shall increment their successful project count.

**Acceptance Criteria:**
- users table gains successful_projects_count column (default 0)
- Count increments atomically with evaluation storage
- Dashboard displays user's project count badge
- No count changes for failed evaluations

#### FR-009: Token Aggregation by Tool

**WHEN** a user views their token statistics,
**THEN** the system shall display breakdown by tool type.

**Acceptance Criteria:**
- Total tokens across all tools shown prominently
- Individual tool token counts displayed
- Percentage breakdown for each tool
- Visual chart showing tool distribution
- Filterable by time period (day, week, month, all-time)

#### FR-010: Simplified Ranking System

**The system shall** use total token count as the primary ranking metric.

**WHEN** rankings are calculated,
**THEN** the system shall rank users by total tokens across all tools.

**Acceptance Criteria:**
- No composite score calculation
- Simple sum of all tokens (input + output)
- Rankings updated hourly via cron job
- Leaderboard shows: rank, username, total tokens, primary tool
- No score tiers or badges

### 2.2 Non-Functional Requirements

#### NFR-001: Security
- Project paths stored as SHA-256 hashes (no plaintext paths)
- API key authentication maintained (HMAC-SHA256)
- LLM API keys stored securely (environment variables)
- Rate limiting for evaluation requests (max 10 per user per day)
- No code content sent to LLM (structure only)

#### NFR-002: Performance
- Token aggregation query: < 500ms
- Project evaluation: < 60 seconds (LLM dependent)
- Leaderboard load: < 2 seconds
- Installation script: < 2 minutes

#### NFR-003: Backward Compatibility
- Existing sessions without tool_type default to 'claude-code'
- Old API keys continue to work
- Database migration handles NULL values
- CLI auto-updates to new version

#### NFR-004: Extensibility
- New tool types added via configuration (no code change)
- Tool adapters implement common interface
- Evaluation rubric configurable via prompts
- Plugin architecture for future features

---

## 3. Technical Architecture

### 3.1 Fresh Database Schema (Complete Redesign)

**IMPORTANT**: This is a complete redesign, not a migration of the existing schema. Only reference patterns are reused.

#### Core Tables

```sql
-- Users table (simplified from original)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id VARCHAR(255) UNIQUE NOT NULL,
  github_id VARCHAR(255) UNIQUE,
  github_username VARCHAR(255),
  github_avatar_url TEXT,
  api_key_hash VARCHAR(255) UNIQUE,
  api_key_prefix VARCHAR(20) UNIQUE,
  user_salt VARCHAR(255) NOT NULL DEFAULT gen_random_uuid()::text,
  privacy_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_api_prefix ON users(api_key_prefix);

-- Tool types registry (enum-like table)
CREATE TABLE tool_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  icon_url TEXT,
  color VARCHAR(7),  -- Hex color for UI
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial tools
INSERT INTO tool_types (id, name, display_name, icon_url, color, sort_order) VALUES
  ('claude-code', 'Claude Code', 'Claude Code', '/icons/claude.svg', '#CC785C', 1),
  ('claude-desktop', 'Claude Desktop', 'Claude Desktop', '/icons/claude.svg', '#D4956A', 2),
  ('opencode', 'OpenCode', 'OpenCode', '/icons/opencode.svg', '#6366F1', 3),
  ('gemini', 'Gemini', 'Gemini Code', '/icons/gemini.svg', '#4285F4', 4),
  ('codex', 'Codex', 'OpenAI Codex', '/icons/codex.svg', '#10A37F', 5),
  ('crush', 'Crush', 'Crush AI', '/icons/crush.svg', '#EC4899', 6);

-- Sessions table (tracking tool usage)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_type_id VARCHAR(50) NOT NULL REFERENCES tool_types(id),

  -- Session identification
  session_hash VARCHAR(64) NOT NULL,  -- SHA-256 of session identifier
  anonymous_project_id VARCHAR(100),

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_seconds INTEGER NOT NULL,

  -- Model info
  model_name VARCHAR(100),

  -- Metrics
  turn_count INTEGER DEFAULT 0,

  -- JSON fields for flexible data
  tool_usage JSONB,           -- Tool-specific usage data
  code_metrics JSONB,         -- Lines added/deleted, files modified

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_tool_type ON sessions(tool_type_id);
CREATE INDEX idx_sessions_session_hash ON sessions(session_hash);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX idx_sessions_user_tool ON sessions(user_id, tool_type_id);

-- Token usage table (normalized)
CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_type_id VARCHAR(50) NOT NULL REFERENCES tool_types(id),

  -- Token counts
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,

  -- Totals for quick queries
  total_tokens BIGINT GENERATED ALWAYS AS (
    input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens
  ) STORED,

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_token_usage_session_id ON token_usage(session_id);
CREATE INDEX idx_token_usage_user_id ON token_usage(user_id);
CREATE INDEX idx_token_usage_tool_type ON token_usage(tool_type_id);
CREATE INDEX idx_token_usage_recorded_at ON token_usage(recorded_at DESC);

-- Project evaluations table (NEW)
CREATE TABLE project_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Project identification
  project_path_hash VARCHAR(64) NOT NULL,  -- SHA-256 for privacy
  project_name VARCHAR(255) NOT NULL,

  -- Evaluation scores
  local_score INTEGER NOT NULL CHECK (local_score >= 0 AND local_score <= 5),
  backend_score INTEGER NOT NULL CHECK (backend_score >= 0 AND backend_score <= 5),
  penalty_score INTEGER NOT NULL CHECK (penalty_score >= -5 AND penalty_score <= 0),
  final_score INTEGER NOT NULL CHECK (final_score >= -5 AND final_score <= 10),
  cumulative_score_after INTEGER NOT NULL,

  -- Evaluation metadata
  llm_model VARCHAR(100) NOT NULL,
  llm_provider VARCHAR(50) NOT NULL,  -- claude, openai, etc.

  -- Results
  passed BOOLEAN NOT NULL,  -- true if final_score >= 5
  feedback TEXT,            -- LLM-generated feedback

  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_evaluations_user_project_hash
  ON project_evaluations(user_id, project_path_hash);

CREATE INDEX idx_evaluations_user_id ON project_evaluations(user_id);
CREATE INDEX idx_evaluations_project_hash ON project_evaluations(project_path_hash);
CREATE INDEX idx_evaluations_passed ON project_evaluations(passed);
CREATE INDEX idx_evaluations_evaluated_at ON project_evaluations(evaluated_at DESC);

-- User stats summary table (for performance)
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Token totals (all tools)
  total_input_tokens BIGINT NOT NULL DEFAULT 0,
  total_output_tokens BIGINT NOT NULL DEFAULT 0,
  total_cache_tokens BIGINT NOT NULL DEFAULT 0,
  total_all_tokens BIGINT NOT NULL DEFAULT 0,

  -- Tool-specific totals (JSON)
  tokens_by_tool JSONB DEFAULT '{}',

  -- Session counts
  total_sessions INTEGER NOT NULL DEFAULT 0,
  sessions_by_tool JSONB DEFAULT '{}',

  -- Project evaluation stats
  successful_projects_count INTEGER NOT NULL DEFAULT 0,
  total_evaluations INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  last_activity_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_stats_total_tokens ON user_stats(total_all_tokens DESC);
CREATE INDEX idx_user_stats_projects ON user_stats(successful_projects_count DESC);
CREATE INDEX idx_user_stats_activity ON user_stats(last_activity_at DESC);

-- Daily aggregates table (for charts/history)
CREATE TABLE daily_user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,

  -- Daily token totals
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,

  -- Daily sessions
  session_count INTEGER NOT NULL DEFAULT 0,

  -- Daily by tool
  by_tool JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, stat_date)
);

CREATE INDEX idx_daily_user_stats_user_date ON daily_user_stats(user_id, stat_date DESC);
CREATE INDEX idx_daily_user_stats_date ON daily_user_stats(stat_date DESC);

-- Security audit log (retained from original)
CREATE TABLE security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON security_audit_log(user_id);
CREATE INDEX idx_audit_event_type ON security_audit_log(event_type);
CREATE INDEX idx_audit_created_at ON security_audit_log(created_at DESC);
```

#### Schema Design Principles

1. **Normalization**: Token usage separated from sessions for cleaner aggregation
2. **Performance**: `user_stats` table for O(1) dashboard queries
3. **Privacy**: Project paths hashed, no code content stored
4. **Extensibility**: `tool_types` registry for easy tool additions
5. **Time-series**: `daily_user_stats` for historical charts

### 3.2 Multi-Tool Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Modu Platform Core                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Tool        │  │  Token       │  │  Evaluation  │             │
│  │  Adapter     │  │  Aggregator  │  │  Service     │             │
│  │  Interface   │  │              │  │              │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                  │                      │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐            │
│  │ Claude Code  │  │   OpenCode   │  │    Gemini    │            │
│  │   Adapter    │  │   Adapter    │  │   Adapter    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│         │                 │                  │                      │
└─────────┼─────────────────┼──────────────────┼──────────────────────┘
          │                 │                  │
          ▼                 ▼                  ▼
    ┌──────────────────────────────────────────────────┐
    │              Sessions API (POST /api/v1/sessions) │
    └──────────────────────────────────────────────────┘
```

### 3.3 LLM Evaluation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Project Evaluation Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User runs: /modu:submit /path/to/project                     │
│         │                                                        │
│         ▼                                                        │
│  2. Local agent reads README.md and runs local validation        │
│     - README.md (source of truth)                               │
│     - Local Validation: ```bash title="test"```                │
│         │                                                        │
│         ▼                                                        │
│  3. Local agent sends to API: POST /api/v1/evaluate              │
│     { projectName, description(README), projectPathHash, localScore } │
│         │                                                        │
│         ▼                                                        │
│  4. Server invokes LLM Evaluation Service:                      │
│     - Builds evaluation prompt with rubric                      │
│     - Calls LLM API (Claude/GPT-4)                              │
│     - Parses structured response                                │
│         │                                                        │
│         ▼                                                        │
│  5. Always store evaluation in project_evaluations:             │
│     - Store score breakdown + cumulative_score_after            │
│     - Set passed = (final_score >= 5)                           │
│     - If passed: increment successful_projects_count            │
│     - Return evaluation + feedback                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 API Endpoint Changes

| Method | Endpoint | Change |
|--------|----------|--------|
| POST | /api/v1/sessions | Add tool_type field to request body |
| GET | /api/v1/stats | Add tool_type breakdown |
| POST | /api/v1/evaluate | NEW: Submit project for evaluation |
| GET | /api/me/projects | NEW: Get user's evaluated projects |
| GET | /api/v1/tool-types | NEW: List available tool types |

### 3.5 Client Commands

| Command | Description |
|---------|-------------|
| `modu-arena register` | Register and get API key |
| `modu-arena status` | Show token stats across all tools |
| `/modu:submit <path>` | Local validation + README-only remote evaluation |
| `modu-arena leaderboard` | Show top users by total tokens |

---

## 4. Security Considerations

### 4.1 Tool Authentication

Each tool adapter may have different authentication mechanisms:
- Claude Code: Session tokens or API keys
- OpenCode: OAuth or API keys
- Gemini: Google OAuth
- Codex: OpenAI API keys
- Crush: Custom auth

The platform shall normalize these to a unified API key format for the Modu API.

### 4.4 Daemon-Based Periodic Sync (Added 2026-02-15)

A launchd daemon runs every 2 minutes to collect token usage from tools that store local data:
- **Claude Desktop**: Parses JSONL conversation logs from `~/Library/Application Support/Claude/`
- **OpenCode**: Queries SQLite database at `~/.local/share/opencode/opencode.db`

The daemon batches submissions (50 per batch, 35s delay, max 3 batches/run) and stops on HTTP 429.
Deduplication is handled server-side via session hash. State persisted in `~/.modu-arena-daemon.json`.

Tools without local data stores (Claude Code, Gemini, Codex, Crush) rely solely on session-end hooks.

### 4.2 Project Privacy

- Project paths hashed before storage (SHA-256 with user salt)
- Only project metadata sent to LLM (no code content)
- User can opt-out of displaying project names publicly
- Evaluation feedback stored but not shared publicly by default

### 4.3 LLM API Security

- LLM API keys stored as server-side environment variables
- Rate limiting per user to prevent abuse
- Prompt injection protection (sanitize project content)
- Separate service account for LLM calls

---

## 5. Migration Strategy

### 5.1 Phase 1: Branding Update (Primary Goal) — COMPLETED
- [x] Update all UI text: moai → modu-arena
- [x] Update API key prefix: `moai_rank_` → `modu_arena_`
- [x] Update domain names and URLs
- [x] Update package.json names
- [x] Update documentation
- [x] Environment variable renaming

### 5.2 Phase 2: Tool Type Extension (Primary Goal) — COMPLETED
- [x] Add tool_type column to sessions table
- [x] Add tool_type column to token_usage table
- [x] Create tool_types registry table
- [x] Update session submission API
- [x] Update CLI to send tool_type
- [x] Add tool filtering to dashboard

### 5.3 Phase 3: Project Evaluation (Primary Goal)
- [ ] Create project_evaluations table
- [ ] Implement LLM evaluation service
- [ ] Create /api/v1/evaluate endpoint
- [ ] Implement CLI `submit` command (no Claude Code slash command)
- [ ] Implement local validator to compute localScore from README.md
- [ ] Implement cumulativeScore accumulation semantics
- [ ] Update dashboard with project count
- [ ] Add project history page

### 5.4 Phase 4: Simplified Rankings (Secondary Goal)
- [ ] Remove composite score calculation
- [ ] Update ranking to use total tokens only
- [ ] Remove badge/tier system
- [ ] Update leaderboard display
- [ ] Update cron jobs

### 5.5 Phase 5: Installation Script (Secondary Goal)
- [ ] Create single-script installer
- [ ] Add OS detection
- [ ] Add dependency installation
- [ ] Add authentication flow
- [ ] Add verification step

---

## 6. Open Questions

1. **LLM Provider**: Which LLM service for evaluations? (Claude, GPT-4, local model?)
2. **Evaluation Limits**: Should there be daily/weekly limits on evaluations?
3. **Project Discovery**: How will users discover and share evaluated projects?
4. **Tool Adapter Maintenance**: Who maintains adapters for each tool as they evolve?

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Branding Migration | 100% completion | No product-facing moai references remain |
| Tool Support | 3+ tools | Multiple tool types active |
| Evaluations | 50+ projects/week | project_evaluations table count |
| Installation Success | 90%+ | Script completion rate |
| API Response Time | < 500ms p95 | Monitoring metrics |

---

## 8. References

- Parent SPEC: SPEC-RANK-001 (Modu Token Rank Service - legacy)
- Current Schema: `apps/web/src/db/schema.ts`
- Auth Module: `apps/web/src/lib/auth.ts`
- Deployment: `DEPLOY.md`

---

**Status**: Ready for Implementation
**Estimated Effort**: Medium-High (database migration + new features)
**Risk Level**: Medium (schema changes, LLM integration)
