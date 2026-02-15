# SPEC-MODU-001: Implementation Plan

## Metadata

| Field | Value |
|-------|-------|
| SPEC ID | SPEC-MODU-001 |
| Document Type | Implementation Plan |
| Version | 1.0.0 |
| Created | 2026-02-10 |
| Status | Planned |

---

## 1. Implementation Milestones

### Milestone 0: Claude Code Slash Commands (/modu) (Primary)

**Priority**: High
**Dependencies**: None
**Estimated Complexity**: Low

#### Tasks

0.1 **Command Definitions**
- [ ] Add `.claude/commands/modu.md` (entry: `/modu`)
- [ ] Add `.claude/commands/modu/*.md` (subcommands)
- [ ] Ensure each command is doc-first (reads `.modu-arena/development-plan.md` and relevant SPEC docs)
- [ ] Keep command outputs short; end with `state: ulw`

0.2 **Tool Compatibility**
- [ ] Mirror commands to `commands/` for tools that prefer a top-level commands directory

**Success Criteria**: Opening the repo in Claude Code shows `/modu` commands as available custom slash commands

### Milestone 1: Branding Migration (Primary)

**Priority**: High
**Dependencies**: None
**Estimated Complexity**: Low

#### Tasks

1.1 **Codebase Branding Updates**
- [ ] Replace product-facing `moai` references with `modu-arena` (TypeScript + docs)
- [ ] Update API key prefix from `moai_rank_` to `modu_arena_`
- [ ] Update package.json names and descriptions
- [ ] Update environment variable names

1.2 **UI/UX Updates**
- [ ] Update all UI text, labels, titles
- [ ] Update navigation elements
- [ ] Update footer and header components
- [ ] Update meta tags and page titles

1.3 **Documentation Updates**
- [ ] Update README.md files
- [ ] Update API documentation
- [ ] Update deployment documentation
- [ ] Update translation files (messages/*.json)

1.4 **Domain and Deployment**
- [ ] Update vercel.json configuration
- [ ] Update domain name references
- [ ] Update base URLs in environment config
- [ ] Update CORS settings if needed

**Success Criteria**: No remaining product-facing references to "moai", "Modu", or "MOAI" in user-facing code

### Milestone 2: Tool Type Extension (Primary)

**Priority**: High
**Dependencies**: Milestone 1
**Estimated Complexity**: Medium

#### Tasks

2.1 **Database Migration**
- [ ] Create `tool_types` registry table
- [ ] Add `tool_type` column to `sessions` table
- [ ] Add `tool_type` column to `token_usage` table
- [ ] Create indexes on new columns
- [ ] Backfill existing data with 'claude-code' default
- [ ] Add CHECK constraint for valid tool types

2.2 **Schema Update**
- [ ] Update Drizzle schema definitions
- [ ] Create migration SQL script
- [ ] Test migration on staging database
- [ ] Document rollback procedure

2.3 **API Changes**
- [ ] Update session submission endpoint to accept `tool_type`
- [ ] Validate `tool_type` against registry
- [ ] Update session response schema
- [ ] Add tool type to statistics endpoints
- [ ] Update Zod validation schemas

2.4 **CLI Updates**
- [ ] Update CLI to send `tool_type` parameter
- [ ] Detect active tool automatically
- [ ] Add manual tool type override option
- [ ] Update error messages

2.5 **Dashboard Updates**
- [ ] Add tool type filter to stats
- [ ] Create tool breakdown chart component
- [ ] Update token usage display
- [ ] Add tool type badge to session list

**Success Criteria**: All sessions have tool_type, dashboard shows breakdown by tool

### Milestone 3: Project Evaluation System (Primary)

**Priority**: High
**Dependencies**: Milestone 2
**Estimated Complexity**: High

#### Tasks

3.1 **Database Setup**
- [ ] Create `project_evaluations` table
- [ ] Add `successful_projects_count` column to `users` table
- [ ] Add (or derive) per-user `cumulativeScore` for project submissions
- [ ] Create indexes for efficient queries
- [ ] Write migration script

3.2 **LLM Evaluation Service**
- [ ] Design evaluation rubric prompt
- [ ] Implement LLM client abstraction
- [ ] Create evaluation API endpoint: `POST /api/v1/evaluate`
- [ ] Implement score parsing and validation
- [ ] Implement scoring model: localScore/backendScore/penaltyScore, finalScore range -5..10
- [ ] Persist score breakdown + cumulativeScoreAfter for each evaluation
- [ ] Add error handling for LLM failures
- [ ] Implement retry logic with exponential backoff

3.3 **Project Analysis**
- [ ] Implement README parser
- [ ] Implement package.json/dotfile detector
- [ ] Create project structure analyzer
- [ ] Implement checksum generation for deduplication
- [ ] Implement deterministic local validator to compute localScore from README.md (CLI-side)

3.4 **CLI Command**
- [ ] Implement `/modu:submit` Claude Code slash command (local validation + README-only remote evaluation)
- [ ] Keep CLI `submit` command as an optional alternative entry point
- [ ] Add project path validation
- [ ] Create progress indicator
- [ ] Handle offline mode (queue for later)
- [ ] Add evaluation history command

3.5 **Dashboard Integration**
- [ ] Add project count badge to user profile
- [ ] Show cumulativeScore and projectScore breakdown per user
- [ ] Create project history page
- [ ] Display evaluation feedback
- [ ] Add share functionality for passing projects

**Success Criteria**: Users can run `modu-arena submit`, passing projects are stored and counted

**Success Criteria (Scoring Addendum)**:
- Each submission yields localScore/backendScore/penaltyScore/finalScore
- finalScore range is enforced: -5..10
- cumulativeScore monotonically updates by addition (can become negative)
- successfulProjectsCount increments only when finalScore >= 5

### Milestone 4: Simplified Rankings (Secondary)

**Priority**: Medium
**Dependencies**: Milestone 2
**Estimated Complexity**: Low

#### Tasks

4.1 **Ranking Calculation**
- [ ] Remove composite score calculation
- [ ] Update to use total tokens only
- [ ] Sum across all tool types
- [ ] Update cron job logic

4.2 **Leaderboard Updates**
- [ ] Remove score tier badges
- [ ] Show primary tool per user
- [ ] Update table columns
- [ ] Add tool distribution visual

4.3 **API Updates**
- [ ] Simplify ranking response schema
- [ ] Remove score breakdown endpoints
- [ ] Update statistics aggregation

**Success Criteria**: Rankings based on total tokens, no composite score

### Milestone 5: Installation Script (Secondary)

**Priority**: Medium
**Dependencies**: Milestone 1
**Estimated Complexity**: Medium

#### Tasks

5.1 **Script Development**
- [ ] Create install.sh script
- [ ] Add OS detection (macOS, Linux)
- [ ] Implement dependency checking
- [ ] Add automatic dependency installation

5.2 **CLI Setup**
- [ ] Download and install CLI binary
- [ ] Add to user PATH
- [ ] Create configuration directory
- [ ] Set up autocomplete

5.3 **Authentication Flow**
- [ ] Open browser for OAuth
- [ ] Wait for callback
- [ ] Store API key securely
- [ ] Verify installation

5.4 **Verification**
- [ ] Run health check
- [ ] Test session submission
- [ ] Display success message
- [ ] Provide next steps

**Success Criteria**: Single command installs everything, user can submit sessions

---

## 2. Technical Approach

### 2.1 Database Migration Strategy

**Method**: Incremental Migration with Backward Compatibility

1. **Phase 1 - Add Columns (Nullable)**
   - Add `tool_type` as nullable column
   - Deploy code that writes new data
   - Existing data unaffected

2. **Phase 2 - Backfill Data**
   - Run background job to set default 'claude-code'
   - Verify all rows have values

3. **Phase 3 - Add Constraints**
   - Make column `NOT NULL`
   - Add CHECK constraint
   - Update indexes

4. **Phase 4 - Cleanup**
   - Remove old code paths
   - Update API documentation

**Rollback Plan**: Keep migration scripts reversible, maintain old schema version tag

### 2.2 Multi-Tool Adapter Pattern

```typescript
interface ToolAdapter {
  readonly toolType: ToolType;
  detect(): boolean;
  collectSession(): SessionData;
  normalize(data: unknown): NormalizedSession;
}

class ClaudeCodeAdapter implements ToolAdapter { /* ... */ }
class OpenCodeAdapter implements ToolAdapter { /* ... */ }
class GeminiAdapter implements ToolAdapter { /* ... */ }

class ToolAdapterManager {
  private adapters: Map<ToolType, ToolAdapter>;

  register(adapter: ToolAdapter): void;
  detectActiveTool(): ToolType;
  collectSession(): Promise<SessionData>;
}
```

### 2.3 LLM Evaluation Architecture

**Service Layer Design**:

```typescript
interface EvaluationService {
  evaluate(request: EvaluationRequest): Promise<EvaluationResult>;
}

class ClaudeEvaluationService implements EvaluationService {
  private client: Anthropic;

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const prompt = this.buildPrompt(request);
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    });
    return this.parseResponse(response);
  }
}
```

**Rubric Prompt Template**:

```
Evaluate this project based on the following rubric:

1. Functionality (0-5 points): Does the project work as described in the README?
2. Practicality (0-5 points): Is this project practical for real-world use?

Project Name: {name}
Description: {description}
Main Files: {files}

Provide your evaluation as JSON:
{
  "functionality": <0-5>,
  "practicality": <0-5>,
  "total": <sum>,
  "feedback": "<brief explanation>"
}
```

### 2.4 API Versioning Strategy

- Keep existing v1 endpoints for backward compatibility
- Add new fields as optional (nullable with defaults)
- Create v2 endpoints for breaking changes
- Deprecation period: 6 months

### 2.5 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel Edge Network                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Next.js   │  │   Next.js   │  │   Next.js   │        │
│  │   App Router│  │   API Routes│  │   Middleware│        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼─────────────────┼─────────────────┼────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────────────────────────────────────────┐
    │           Neon PostgreSQL (Primary)          │
    └──────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────────────────────────────────────────┐
    │         Upstash Redis (Cache/Rate Limit)     │
    └──────────────────────────────────────────────┘
```

**Target Server**: SSH modulabs@modulabs.ddns.net:42622

---

## 3. Risk Assessment

### 3.1 High Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LLM API rate limits | High | Medium | Implement queue, caching, fallback providers |
| Database migration failures | High | Low | Thorough testing, rollback plan, backup |
| Tool API changes break adapters | Medium | High | Abstract adapter pattern, version detection |

### 3.2 Medium Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Branding inconsistencies | Medium | Low | Automated search/replace, manual review |
| Evaluation prompt injection | Medium | Low | Input sanitization, system prompt hardening |
| Installation script compatibility | Medium | Medium | Test on multiple OS, graceful degradation |

### 3.3 Low Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Translation file updates | Low | Low | Use community translation, automated checks |
| Ranking recalculation performance | Low | Low | Optimize queries, add indexes |

---

## 4. Testing Strategy

### 4.1 Unit Tests

- [ ] Tool adapter detection logic
- [ ] Session data normalization
- [ ] Score calculation (removed/updated)
- [ ] LLM response parsing
- [ ] Project path hashing

### 4.2 Integration Tests

- [ ] Session submission with each tool type
- [ ] Project evaluation flow
- [ ] Database migration rollback
- [ ] API authentication with new keys

### 4.3 End-to-End Tests

- [ ] Complete installation flow
- [ ] Submit session → appears in dashboard
- [ ] Submit project → evaluation → storage
- [ ] Cross-tool token aggregation

### 4.4 Performance Tests

- [ ] Token aggregation query with 1M+ sessions
- [ ] Leaderboard query with 10K+ users
- [ ] Evaluation endpoint under load

---

## 5. Dependencies

### 5.1 External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| @anthropic-ai/sdk | ^0.32.0 | LLM evaluation |
| drizzle-orm | ^0.45.1 | Database |
| next | 16.1.1 | Framework |
| clerk | ^6.36.7 | Authentication |

### 5.2 Internal Dependencies

- Milestone 2 depends on Milestone 1 (branding first)
- Milestone 3 depends on Milestone 2 (database schema)
- Milestone 4 can run parallel to Milestone 3
- Milestone 5 can start after Milestone 1

---

## 6. Rollback Plan

### 6.1 Database Rollback

```sql
-- Rollback tool_type addition
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS check_tool_type;
DROP INDEX IF EXISTS idx_sessions_tool_type;
ALTER TABLE sessions DROP COLUMN IF EXISTS tool_type;

-- Rollback project_evaluations
DROP TABLE IF EXISTS project_evaluations;

-- Rollback user count
ALTER TABLE users DROP COLUMN IF EXISTS successful_projects_count;
```

### 6.2 Code Rollback

- Maintain feature flags for new features
- Git tags for each milestone completion
- Revert by tag if critical issues arise

---

## 7. Launch Checklist

### Pre-Launch

- [ ] All migrations tested on staging
- [ ] LLM evaluation tested with real projects
- [ ] Installation script tested on clean systems
- [ ] Documentation updated
- [ ] Monitoring/alerting configured

### Launch Day

- [ ] Database backup taken
- [ ] Migrations applied
- [ ] Feature flags enabled
- [ ] DNS updated (if domain change)
- [ ] Monitoring dashboards verified

### Post-Launch

- [ ] Error rates monitored
- [ ] Performance metrics checked
- [ ] User feedback collected
- [ ] Bug triage process initiated

---

**TAG**: SPEC-MODU-001
**Traceability**: All tasks link to requirements in spec.md
