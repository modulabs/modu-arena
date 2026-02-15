---
description: Implement work described in SPEC (behavior-preserving when refactoring)
argument-hint: <SPEC-ID>
allowed-tools: Task, Read, Grep, Glob, Bash, Edit, Write
---

# /modu:run

Goal: implement the referenced SPEC.

Must do:

- Read `.modu-arena/specs/<SPEC-ID>/{spec.md,plan.md,acceptance.md}`.
- Implement ONLY what the SPEC requires.
- Verify with appropriate checks (at least type-check/build/tests if available).

Output requirements:

- Short list: what changed + what was verified.
- End with `state: ulw`.
