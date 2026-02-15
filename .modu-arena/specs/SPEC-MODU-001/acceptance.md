# SPEC-MODU-001: Acceptance Criteria

## Metadata

| Field | Value |
|-------|-------|
| SPEC ID | SPEC-MODU-001 |
| Document Type | Acceptance Criteria |
| Version | 1.0.0 |
| Created | 2026-02-10 |
| Status | Planned |

---

## 1. Acceptance Criteria Overview

This document defines the acceptance criteria for SPEC-MODU-001 using Given-When-Then format. Each criterion is testable and verifiable.

---

## 2. Functional Requirements Acceptance

### AC-001: Branding Migration

**Feature**: All moai references replaced with modu

**Scenario 1: UI displays Modu branding**
```gherkin
GIVEN a user visits the application
WHEN they view any page
THEN all visible text displays "Modu" or "modu"
AND no "Modu", "moai", or "MOAI" references appear
```

**Scenario 2: API endpoints use new branding**
```gherkin
GIVEN a client makes an API request
WHEN they inspect the response headers
THEN API keys have prefix "modu_arena_"
AND no "moai_rank_" prefixes exist
```

**Scenario 3: Package names updated**
```gherkin
GIVEN a developer inspects package.json
WHEN they read the package name
THEN it contains "modu" not "moai"
```

**Verification Method**:
- Grep for remaining "moai" references (case-insensitive)
- Manual UI review of all pages
- API key inspection in database

---

### AC-002: Multi-Tool Token Monitoring

**Feature**: Track tokens from multiple AI coding tools

**Scenario 1: Session submission includes tool type**
```gherkin
GIVEN a user has an API key
WHEN they submit a session with tool_type="gemini"
THEN the session is stored with tool_type="gemini"
AND the session appears in their statistics
```

**Scenario 2: View breakdown by tool**
```gherkin
GIVEN a user has sessions from multiple tools
WHEN they view their dashboard
THEN they see total tokens across all tools
AND they see individual token counts per tool
AND a visual chart shows distribution
```

**Scenario 3: Filter sessions by tool**
```gherkin
GIVEN a user has sessions from multiple tools
WHEN they filter by tool_type="claude-code"
THEN only Claude Code sessions are displayed
AND token totals reflect only the filtered sessions
```

**Verification Method**:
- Submit test sessions for each tool type
- Verify database stores tool_type correctly
- Check dashboard displays breakdown

---

### AC-003: Tool Type Schema Extension

**Feature**: Database stores tool type for each session

**Scenario 1: Existing sessions have default tool type**
```gherkin
GIVEN a database with existing sessions
WHEN the migration runs
THEN all sessions have tool_type='claude-code'
AND no NULL tool_type values exist
```

**Scenario 2: New sessions require valid tool type**
```gherkin
GIVEN a user submits a new session
WHEN they provide an invalid tool_type
THEN the API returns 400 Bad Request
AND the error lists valid tool types
```

**Scenario 3: Tool type index exists**
```gherkin
GIVEN a large number of sessions
WHEN querying by tool_type
THEN the query completes in < 100ms
AND EXPLAIN shows index usage
```

**Verification Method**:
- Inspect database schema
- Run EXPLAIN ANALYZE on tool_type queries
- Test invalid tool_type submission

---

### AC-004: Project Evaluation System

**Feature**: README-based evaluation with score breakdown and cumulative score

**Scenario 1: Successful project evaluation**
```gherkin
GIVEN a user runs /modu:submit on a working project
AND the project README.md contains a `## Local Validation` section with a `test` command block
WHEN the evaluation completes with finalScore >= 5
THEN an evaluation record is stored in project_evaluations
AND the record includes localScore, backendScore, penaltyScore, finalScore
AND the record includes cumulativeScoreAfter = cumulativeScoreBefore + finalScore
AND the user's successful_projects_count increments
AND the user receives feedback message
```

**Scenario 2: Failed project evaluation**
```gherkin
GIVEN a user runs /modu:submit on a non-working project
AND the project README.md contains a `## Local Validation` section with a `test` command block
WHEN the evaluation completes with finalScore < 5
THEN an evaluation record is stored in project_evaluations
AND the user's successful_projects_count does NOT change
AND the user's cumulativeScore is updated by adding the finalScore (can decrease)
AND the user receives feedback explaining why
```

**Scenario 3: Duplicate project submission**
```gherkin
GIVEN a user previously submitted a project
WHEN they submit the same project again (same path hash)
THEN the server returns the existing evaluation
AND no duplicate record is created
AND the user's cumulativeScore is not changed
```

**Verification Method**:
- Submit test projects with known quality levels
- Verify database state after submissions
- Check count increments correctly
- Verify cumulativeScore and cumulativeScoreAfter semantics

---

### AC-005: Project Evaluations Table

**Feature**: New table stores project evaluations

**Scenario 1: Table schema matches specification**
```gherkin
GIVEN the migration is applied
WHEN inspecting the project_evaluations table
THEN it contains all required columns
AND all foreign key constraints exist
AND all indexes are created
```

**Scenario 2: Score constraints enforced**
```gherkin
GIVEN a user tries to insert invalid scores
WHEN localScore is outside 0-5 range OR backendScore is outside 0-5 range
OR penaltyScore is outside -5..0 range OR finalScore is outside -5..10 range
THEN the database rejects the insert
AND returns a constraint violation error
```

**Scenario 3: Cascade deletion works**
```gherkin
GIVEN a user has project evaluations
WHEN the user is deleted
THEN all their evaluations are also deleted
```

**Verification Method**:
- \d project_evaluations in PostgreSQL
- Test constraint violations
- Test cascade deletion

---

### AC-006: LLM Evaluation Service

**Feature**: Service evaluates projects using LLM

**Scenario 1: Evaluation returns valid JSON**
```gherkin
GIVEN a valid project submission
WHEN the LLM evaluation service processes it
THEN the response contains valid JSON
AND includes localScore (0-5)
AND includes backendScore (0-5)
AND includes penaltyScore (-5..0)
AND includes finalScore (-5..10)
AND includes cumulativeScoreAfter
AND includes feedback text
```

**Scenario 2: Evaluation handles LLM errors**
```gherkin
GIVEN the LLM API is unavailable
WHEN a project is submitted for evaluation
THEN the service returns a 503 error
AND the request is queued for retry
```

**Scenario 3: Evaluation respects rate limits**
```gherkin
GIVEN a user has submitted 10 evaluations today
WHEN they submit an 11th evaluation
THEN the request is rejected with 429
AND the error message explains the limit
```

**Verification Method**:
- Mock LLM responses for testing
- Test error scenarios
- Verify rate limiting behavior

---

### AC-007: Single-Script Installation

**Feature**: One command installs everything

**Scenario 1: macOS installation succeeds**
```gherkin
GIVEN a clean macOS system
WHEN the user runs: curl -sSL install.modulabs.ai | bash
THEN the CLI is installed to /usr/local/bin
AND the CLI is in the user's PATH
AND authentication flow completes
AND a test session can be submitted
```

**Scenario 2: Linux installation succeeds**
```gherkin
GIVEN a clean Linux system
WHEN the user runs: curl -sSL install.modulabs.ai | bash
THEN the CLI is installed to ~/.local/bin
AND the CLI is in the user's PATH
AND authentication flow completes
```

**Scenario 3: Installation detects existing installation**
```gherkin
GIVEN a system with modu already installed
WHEN the user runs the installer
THEN it detects the existing installation
AND offers to update or skip
```

**Verification Method**:
- Test on clean VM (macOS and Linux)
- Verify all components installed
- Test upgrade scenario

---

### AC-008: User Project Count Tracking

**Feature**: Track successful projects per user

**Scenario 1: Count increments on passing evaluation**
```gherkin
GIVEN a user with successful_projects_count=3
WHEN they submit a project that scores 6/10
THEN their count becomes 4
AND the count is displayed on their profile
```

**Scenario 2: Count does not increment on failing evaluation**
```gherkin
GIVEN a user with successful_projects_count=3
WHEN they submit a project that scores 3/10
THEN their count remains 3
AND no record is created in project_evaluations
```

**Scenario 3: New user starts at zero**
```gherkin
GIVEN a newly registered user
WHEN they view their profile
THEN their successful_projects_count is 0
```

**Verification Method**:
- Query database for count values
- Submit passing and failing projects
- Verify dashboard displays count

---

### AC-009: Token Aggregation by Tool

**Feature**: Dashboard shows token breakdown by tool

**Scenario 1: Aggregate tokens across all tools**
```gherkin
GIVEN a user with sessions from 3 different tools
WHEN they view their statistics
THEN they see total tokens = sum of all tools
AND they see individual counts per tool
```

**Scenario 2: Percentage breakdown displayed**
```gherkin
GIVEN a user has used Claude Code (70%) and Gemini (30%)
WHEN they view their statistics
THEN the percentages sum to 100%
AND a visual chart shows the distribution
```

**Scenario 3: Filter by time period**
```gherkin
GIVEN a user with sessions spanning multiple months
WHEN they select "This Week" filter
THEN only tokens from this week are shown
AND the breakdown reflects the filtered period
```

**Verification Method**:
- Create test data with multiple tools
- Verify aggregation queries
- Check UI displays correctly

---

### AC-010: Simplified Ranking System

**Feature**: Rankings based on total tokens only

**Scenario 1: Leaderboard ranks by total tokens**
```gherkin
GIVEN users with various token totals
WHEN the leaderboard is viewed
THEN users are sorted by total tokens descending
AND the rank is based on this order
```

**Scenario 2: No composite score displayed**
```gherkin
GIVEN a user viewing the leaderboard
WHEN they inspect the columns
THEN there is no "composite score" column
AND the primary metric is total tokens
```

**Scenario 3: Show primary tool**
```gherkin
GIVEN a user who has used multiple tools
WHEN they appear on the leaderboard
THEN their most-used tool is displayed
```

**Verification Method**:
- Inspect leaderboard query logic
- Verify no composite score calculation
- Check UI columns

---

## 3. Non-Functional Requirements Acceptance

### AC-NFR-001: Security

**Scenario 1: Project paths are hashed**
```gherkin
GIVEN a user submits a project for evaluation
WHEN the evaluation is stored
THEN the project_path_hash contains a SHA-256 hash
AND the original path is not stored
```

**Scenario 2: API key authentication maintained**
```gherkin
GIVEN a user with a valid API key
WHEN they submit a session
THEN the HMAC signature is verified
AND requests without valid signature are rejected
```

**Scenario 3: Rate limiting enforced**
```gherkin
GIVEN a user who has submitted 10 evaluations today
WHEN they submit an 11th evaluation
THEN the request is rejected with 429 status
```

**Verification Method**:
- Inspect database for hashed paths
- Test HMAC authentication
- Verify rate limiting behavior

---

### AC-NFR-002: Performance

**Scenario 1: Token aggregation under 500ms**
```gherkin
GIVEN a database with 1M+ session records
WHEN a user requests their token statistics
THEN the response completes in < 500ms (p95)
```

**Scenario 2: Project evaluation under 60s**
```gherkin
GIVEN a valid project submission
WHEN the evaluation completes
THEN the total time is < 60 seconds
```

**Scenario 3: Leaderboard loads under 2s**
```gherkin
GIVEN the leaderboard page
WHEN a user loads it
THEN the page renders in < 2 seconds
```

**Verification Method**:
- Run performance tests
- Measure p95 latencies
- Optimize queries as needed

---

### AC-NFR-003: Backward Compatibility

**Scenario 1: Old API keys still work**
```gherkin
GIVEN a user with an existing moai_rank_ API key
WHEN they submit a session with the new system
THEN the request succeeds
AND the key is validated correctly
```

**Scenario 2: Existing sessions have default tool type**
```gherkin
GIVEN sessions created before the migration
WHEN querying for sessions
THEN all have tool_type='claude-code'
AND queries work correctly
```

**Verification Method**:
- Test with old API keys
- Query migrated data
- Verify no breaking changes

---

### AC-NFR-004: Extensibility

**Scenario 1: New tool type via configuration**
```gherkin
GIVEN a system administrator
WHEN they add a new tool type to tool_types table
AND set is_active=true
THEN the tool type is immediately available
```

**Scenario 2: Adapter implements interface**
```gherkin
GIVEN a new tool adapter
WHEN it implements ToolAdapter interface
THEN it can be registered without code changes
```

**Verification Method**:
- Add a test tool type
- Implement a mock adapter
- Verify it integrates without core changes

---

## 4. Quality Gates

### 4.1 Pre-Deployment Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Database migrations tested on staging
- [ ] No TypeScript errors
- [ ] No linting warnings
- [ ] Security scan passes
- [ ] Performance benchmarks met
- [ ] Documentation updated

### 4.2 Definition of Done

A requirement is considered done when:

1. **Code Complete**: All code is written and committed
2. **Tested**: Unit and integration tests pass
3. **Reviewed**: Code review completed
4. **Documented**: Documentation updated
5. **Deployed**: Feature deployed to staging
6. **Verified**: Manual testing confirms acceptance criteria

---

## 5. Test Scenarios Summary

| Priority | Scenario Count | Automated | Manual |
|----------|----------------|-----------|--------|
| High | 15 | 12 | 3 |
| Medium | 10 | 7 | 3 |
| Low | 5 | 3 | 2 |
| **Total** | **30** | **22** | **8** |

---

**TAG**: SPEC-MODU-001
**Traceability**: All AC items reference requirements in spec.md

---

### AC-011: Claude Code Custom Slash Commands

**Feature**: `/modu` command suite is available in Claude Code

**Scenario 1: Commands exist in repo**
```gherkin
GIVEN a developer opens the repo in Claude Code
WHEN Claude Code loads project slash commands
THEN `.claude/commands/modu.md` exists
AND `.claude/commands/modu/plan.md` exists
AND `.claude/commands/modu/run.md` exists
AND `.claude/commands/modu/sync.md` exists
```

**Scenario 2: Commands are doc-first**
```gherkin
GIVEN a developer runs `/modu:run SPEC-MODU-001`
WHEN the agent begins execution
THEN it reads `.modu-arena/development-plan.md`
AND it reads `.modu-arena/specs/SPEC-MODU-001/spec.md`
AND it reads `.modu-arena/specs/SPEC-MODU-001/plan.md`
AND it reads `.modu-arena/specs/SPEC-MODU-001/acceptance.md`
```

**Verification Method**:
- Confirm files exist under `.claude/commands/`
- Run `/modu` in Claude Code and confirm it is recognized
