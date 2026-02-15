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

### Current Focus: Claude Code Slash Commands (/modu)

The center of this repo's agent tooling is **creating and evolving Claude Code custom slash commands**.

Primary commands live here:

- `.claude/commands/modu.md` (entry: `/modu`)
- `.claude/commands/modu/*.md` (subcommands: `/modu:plan`, `/modu:run`, ...)

Compatibility mirrors (for tools that prefer a top-level commands layout):

- `commands/modu.md`
- `commands/modu/*.md`

Primary project evaluation command:

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
