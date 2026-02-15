---
description: Modu workflow router (project/plan/run/sync/fix/loop/feedback/submit)
argument-hint: <project|plan|run|sync|fix|loop|feedback|submit> [...]
allowed-tools: Task, Read, Grep, Glob, Bash, Edit, Write
---

# /modu

Parse `$ARGUMENTS` and run the matching Modu workflow.

Hard rules:

- Treat these docs as the source of truth. Read them before doing anything:
  - `.modu-arena/development-plan.md`
  - `.modu-arena/specs/` (relevant SPEC folder)
  - `docs/api-specification.md` (when touching API)
- Keep output short.
- When you finish a workflow, end with `state: ulw`.

Routing:

- If `$ARGUMENTS` starts with `project` -> follow `/modu:project`.
- If `$ARGUMENTS` starts with `plan` -> follow `/modu:plan`.
- If `$ARGUMENTS` starts with `run` -> follow `/modu:run`.
- If `$ARGUMENTS` starts with `sync` -> follow `/modu:sync`.
- If `$ARGUMENTS` starts with `fix` -> follow `/modu:fix`.
- If `$ARGUMENTS` starts with `loop` -> follow `/modu:loop`.
- If `$ARGUMENTS` starts with `feedback` -> follow `/modu:feedback`.
- If `$ARGUMENTS` starts with `submit` -> follow `/modu:submit`.

If no subcommand is provided, print a 1-screen help showing the subcommands and example invocations.
