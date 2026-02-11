import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  date,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Tool Types table
// Registry for supported AI coding tools
// ============================================================================
export const toolTypes = pgTable(
  'tool_types',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    iconUrl: text('icon_url'),
    color: varchar('color', { length: 7 }), // Hex color for UI
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('tool_types_is_active_idx').on(table.isActive),
    index('tool_types_sort_order_idx').on(table.sortOrder),
  ]
);

// ============================================================================
// Users table
// Simplified for Modu platform - supports Clerk/GitHub auth
// ============================================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: varchar('clerk_id', { length: 255 }).unique(),
    githubId: varchar('github_id', { length: 255 }).unique(),
    githubUsername: varchar('github_username', { length: 255 }),
    githubAvatarUrl: text('github_avatar_url'),
    displayName: varchar('display_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(), // scrypt hash
    apiKeyPrefix: varchar('api_key_prefix', { length: 32 }).notNull(), // 'modu_arena_xxxxxxxx'
    userSalt: varchar('user_salt', { length: 64 })
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    privacyMode: boolean('privacy_mode').default(false),
    // NEW: Track successful project evaluations
    successfulProjectsCount: integer('successful_projects_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('users_api_key_hash_idx').on(table.apiKeyHash)]
);

// ============================================================================
// Sessions table
// Tracks AI coding tool sessions with multi-tool support
// ============================================================================
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    toolTypeId: varchar('tool_type_id', { length: 50 })
      .references(() => toolTypes.id)
      .notNull(),

    // Session identification
    sessionHash: varchar('session_hash', { length: 64 }).notNull().unique(),
    anonymousProjectId: varchar('anonymous_project_id', { length: 100 }),

    // Timing
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),

    // Model info
    modelName: varchar('model_name', { length: 100 }),

    // Metrics
    turnCount: integer('turn_count').default(0),

    // JSON fields for flexible data
    toolUsage: jsonb('tool_usage'), // Tool-specific usage data
    codeMetrics: jsonb('code_metrics'), // Lines added/deleted, files modified

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_tool_type_id_idx').on(table.toolTypeId),
    index('sessions_session_hash_idx').on(table.sessionHash),
    index('sessions_started_at_idx').on(table.startedAt),
    index('sessions_user_tool_idx').on(table.userId, table.toolTypeId),
  ]
);

// ============================================================================
// Token Usage table
// Records token usage per session with tool type association
// ============================================================================
export const tokenUsage = pgTable(
  'token_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => sessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    toolTypeId: varchar('tool_type_id', { length: 50 })
      .references(() => toolTypes.id)
      .notNull(),

    // Token counts
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    cacheCreationTokens: bigint('cache_creation_tokens', { mode: 'number' }).default(0),
    cacheReadTokens: bigint('cache_read_tokens', { mode: 'number' }).default(0),

    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('token_usage_session_id_idx').on(table.sessionId),
    index('token_usage_user_id_idx').on(table.userId),
    index('token_usage_tool_type_id_idx').on(table.toolTypeId),
    index('token_usage_recorded_at_idx').on(table.recordedAt),
    index('token_usage_user_recorded_idx').on(table.userId, table.recordedAt),
  ]
);

// ============================================================================
// Project Evaluations table
// NEW: Stores LLM-based project evaluations
// ============================================================================
export const projectEvaluations = pgTable(
  'project_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Project identification
    projectPathHash: varchar('project_path_hash', { length: 64 }).notNull(), // SHA-256 for privacy
    projectName: varchar('project_name', { length: 255 }).notNull(),

    // Evaluation scores
    // Note: Check constraints are enforced at application level, not DB level for Drizzle
    // totalScore: 0-10 (sum of rubric scores)
    totalScore: integer('total_score').notNull(),
    // rubricFunctionality: 0-5 points
    rubricFunctionality: integer('rubric_functionality').notNull(),
    // rubricPracticality: 0-5 points
    rubricPracticality: integer('rubric_practicality').notNull(),

    // Evaluation metadata
    llmModel: varchar('llm_model', { length: 100 }).notNull(),
    llmProvider: varchar('llm_provider', { length: 50 }).notNull(),

    // Results
    passed: boolean('passed').notNull(), // true if score >= 5
    feedback: text('feedback'), // LLM-generated feedback

    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('project_evaluations_user_id_idx').on(table.userId),
    index('project_evaluations_project_hash_idx').on(table.projectPathHash),
    index('project_evaluations_passed_idx').on(table.passed),
    index('project_evaluations_evaluated_at_idx').on(table.evaluatedAt),
  ]
);

// ============================================================================
// User Stats table
// Pre-computed statistics for dashboard queries
// ============================================================================
export const userStats = pgTable(
  'user_stats',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Token totals (all tools)
    totalInputTokens: bigint('total_input_tokens', { mode: 'number' }).notNull().default(0),
    totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }).notNull().default(0),
    totalCacheTokens: bigint('total_cache_tokens', { mode: 'number' }).notNull().default(0),
    totalAllTokens: bigint('total_all_tokens', { mode: 'number' }).notNull().default(0),

    // Tool-specific totals (JSON)
    tokensByTool: jsonb('tokens_by_tool').default('{}'), // { "claude-code": 1000, "opencode": 500 }

    // Session counts
    totalSessions: integer('total_sessions').notNull().default(0),
    sessionsByTool: jsonb('sessions_by_tool').default('{}'),

    // Project evaluation stats
    successfulProjectsCount: integer('successful_projects_count').notNull().default(0),
    totalEvaluations: integer('total_evaluations').notNull().default(0),

    // Timestamps
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('user_stats_total_tokens_idx').on(table.totalAllTokens),
    index('user_stats_projects_idx').on(table.successfulProjectsCount),
    index('user_stats_activity_idx').on(table.lastActivityAt),
  ]
);

// ============================================================================
// Daily User Stats table
// Time-series data for charts and history
// ============================================================================
export const dailyUserStats = pgTable(
  'daily_user_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    statDate: date('stat_date').notNull(),

    // Daily token totals
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    cacheTokens: bigint('cache_tokens', { mode: 'number' }).notNull().default(0),
    totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),

    // Daily sessions
    sessionCount: integer('session_count').notNull().default(0),

    // Daily by tool (JSON)
    byTool: jsonb('by_tool').default('{}'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique().on(table.userId, table.statDate),
    index('daily_user_stats_user_date_idx').on(table.userId, table.statDate),
    index('daily_user_stats_date_idx').on(table.statDate),
  ]
);

// ============================================================================
// Security Audit Log table
// Tracks security-related events (retained from original)
// ============================================================================
export const securityAuditLog = pgTable(
  'security_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    eventType: varchar('event_type', { length: 100 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    details: jsonb('details'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('audit_log_user_id_idx').on(table.userId),
    index('audit_log_event_type_idx').on(table.eventType),
    index('audit_log_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// Type exports for use in application code
// ============================================================================
export type ToolType = typeof toolTypes.$inferSelect;
export type NewToolType = typeof toolTypes.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type TokenUsage = typeof tokenUsage.$inferSelect;
export type NewTokenUsage = typeof tokenUsage.$inferInsert;

export type ProjectEvaluation = typeof projectEvaluations.$inferSelect;
export type NewProjectEvaluation = typeof projectEvaluations.$inferInsert;

export type UserStats = typeof userStats.$inferSelect;
export type NewUserStats = typeof userStats.$inferInsert;

export type DailyUserStats = typeof dailyUserStats.$inferSelect;
export type NewDailyUserStats = typeof dailyUserStats.$inferInsert;

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLog.$inferInsert;
