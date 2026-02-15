---
description: Collect structured feedback and convert into SPEC or fix plan
argument-hint: <feedback> [...]
allowed-tools: Task, Read, Grep, Glob, Edit, Write
---

# /modu:feedback

Goal: turn feedback into actionable next steps.

Must do:

- Read `.modu-arena/development-plan.md`.
- If feedback implies a feature/change, propose a SPEC folder under `.modu-arena/specs/`.
- If feedback is a bug, propose `/modu:fix` steps.

Output requirements:

- Short plan + next command suggestion.
- End with `state: ulw`.
