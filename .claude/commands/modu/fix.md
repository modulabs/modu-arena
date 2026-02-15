---
description: Targeted fix workflow (minimal change, verify, report)
argument-hint: <symptom> [...]
allowed-tools: Task, Read, Grep, Glob, Bash, Edit, Write
---

# /modu:fix

Goal: apply a minimal, behavior-correct fix.

Must do:

- Identify the failing surface area (error message, endpoint, file path).
- Fix root cause with minimal diff.
- Re-verify (type-check/build/tests) and report evidence.

Output requirements:

- 3 bullets: cause, fix, verification.
- End with `state: ulw`.
