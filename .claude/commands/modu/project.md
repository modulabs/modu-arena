---
description: Analyze repo and generate/refresh project docs used by SPEC workflow
argument-hint: [notes]
allowed-tools: Task, Read, Grep, Glob, Bash, Edit, Write
---

# /modu:project

Goal: ensure project documentation exists and is current so later `/modu:plan` can reference it.

Must do:

- Read `.modu-arena/development-plan.md` first.
- Update or create the minimum docs needed by the plan (keep it brief):
  - `.modu-arena/development-plan.md` (entry point)
  - Any missing files under `.modu-arena/specs/` required by current work

Output requirements:

- Short checklist of what changed.
- End with `state: ulw`.
