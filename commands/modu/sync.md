---
description: Sync implementation changes back into docs (SPEC + API docs + README)
argument-hint: <SPEC-ID>
allowed-tools: Task, Read, Grep, Glob, Edit, Write
---

# /modu:sync

Goal: ensure docs reflect reality after implementation.

Must do:

- Read `.modu-arena/development-plan.md`.
- Read `.modu-arena/specs/<SPEC-ID>/{spec.md,plan.md,acceptance.md}`.
- If APIs changed, update `docs/api-specification.md`.
- Read `README.md` and compare against current implementation state. Update `README.md` if any of these are out of date:
  - Supported tools list or feature descriptions
  - CLI commands, options, or usage examples
  - Architecture diagrams or tech stack references
  - Installation instructions or environment variables
  - Database schema or API reference sections
  - Any version numbers, dates, or status badges
- Preserve the existing README structure and tone. Only modify sections that are factually stale.

Output requirements:

- Short list: what docs were updated.
- For each updated doc, one-line summary of what changed (e.g. "Added OpenCode plugin section", "Removed deprecated hook flow").
- End with `state: ulw`.
