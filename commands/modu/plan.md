---
description: Create or refine SPEC using EARS + acceptance criteria (doc-first)
argument-hint: <topic> [...]
allowed-tools: Task, Read, Grep, Glob, Edit, Write
---

# /modu:plan

Goal: create or refine a SPEC folder under `.modu-arena/specs/SPEC-*/`.

Must do:

- Read `.modu-arena/development-plan.md`.
- If a SPEC is referenced, read all 3 files:
  - `.modu-arena/specs/<SPEC-ID>/spec.md`
  - `.modu-arena/specs/<SPEC-ID>/plan.md`
  - `.modu-arena/specs/<SPEC-ID>/acceptance.md`
- Keep requirements in EARS style and keep acceptance criteria testable.

Output requirements:

- Provide: what SPEC(s) were created/updated + next command suggestion.
- End with `state: ulw`.
