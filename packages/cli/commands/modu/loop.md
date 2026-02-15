---
description: Run iterative fix/verify loop until acceptance criteria are met
argument-hint: <goal> [...]
allowed-tools: Task, Read, Grep, Glob, Bash, Edit, Write
---

# /modu:loop

Goal: iterate until the requested acceptance criteria are satisfied.

Must do:

- Start by reading `.modu-arena/development-plan.md` and the relevant SPEC acceptance criteria.
- Operate in a tight loop: observe -> change -> verify -> repeat.
- Stop if blocked and ask exactly one clarifying question.

Output requirements:

- Report final verification evidence.
- End with `state: ulw`.
