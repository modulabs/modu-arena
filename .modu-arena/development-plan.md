## Modu-Arena Development Plan (Living Doc)

This repo is migrating MoAI Rank into Modu-Arena.

Source of truth:

- SPEC: `.modu-arena/specs/SPEC-MODU-001/spec.md`
- Plan: `.modu-arena/specs/SPEC-MODU-001/plan.md`
- Acceptance: `.modu-arena/specs/SPEC-MODU-001/acceptance.md`
- Legacy baseline: `.modu-arena/specs/SPEC-RANK-001/spec.md`

### Where to Start

- If requirements need changes: edit the SPEC first, then update the plan + acceptance.
- If implementation is next: follow the plan milestones in order.

### Current Focus: Universal Daemon Sync (2-min interval)

All AI coding tools sync token usage to the backend every 2 minutes via a launchd daemon, published as `@suncreation/modu-arena` on npm.

**CLI package**: `packages/cli/` → npm `@suncreation/modu-arena` (v0.3.2)

**Completed milestones (Feb 2026):**
- moai → modu-arena rename (v0.3.0)
- Multi-tool daemon sync: Claude Desktop (JSONL), OpenCode (SQLite) + session-end hooks
- Batching, rate-limit protection, recent-only OpenCode filter
- Backend token limits raised (500M input, 100M output, 1B cache)
- Production deployed to `backend.vibemakers.kr:23010`

**Slash commands** (secondary focus):

- `.claude/commands/modu.md` (entry: `/modu`)
- `.claude/commands/modu/*.md` (subcommands: `/modu:plan`, `/modu:run`, ...)
- `commands/modu.md` / `commands/modu/*.md` (compatibility mirrors)
- `/modu:submit` (local validation + README-only remote evaluation)

Acceptance criteria and edge cases (duplicates, storage semantics, pass threshold) are defined in:

- `.modu-arena/specs/SPEC-MODU-001/acceptance.md`

### Documentation That Must Stay In Sync

- Public API docs: `docs/api-specification.md`
- CLI usage docs (README variants)
- Any hook/install docs under `.claude/`

### Execution Workflow

Use the `/modu` workflow commands for SPEC-first development:

1. `/modu plan` to refine/extend specs
2. `/modu run SPEC-MODU-001` to implement changes
3. `/modu sync SPEC-MODU-001` to keep docs consistent
