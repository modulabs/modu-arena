---
description: Sync implementation changes back into docs (SPEC + API docs)
argument-hint: <SPEC-ID>
allowed-tools: Task, Read, Grep, Glob, Edit, Write
---

# /modu:sync

Goal: ensure docs reflect reality after implementation.

Must do:

- Read `.modu-arena/development-plan.md`.
- Read `.modu-arena/specs/<SPEC-ID>/{spec.md,plan.md,acceptance.md}`.
- If APIs changed, update `docs/api-specification.md`.

Output requirements:

- Short list: what docs were updated.
- End with `state: ulw`.
