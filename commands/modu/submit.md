---
description: Evaluate current project (agent-based local scoring) + README-only remote scoring
argument-hint: [project-path]
allowed-tools: Bash, Read, Grep, Glob
---

# /modu:submit

Goal: submit a project for evaluation using README.md as the source of truth.

Hard rules:

- Read `.modu-arena/development-plan.md` first (if it exists).
- Local evaluation is performed by YOU (the agent) — read the README and score it 0-5.
- Remote evaluation MUST use README content only (do NOT send code; avoid sending fileStructure).

## Local Scoring (Agent-Based)

Before submitting, you MUST evaluate the README yourself and assign a `localScore` (0-5).

Scoring rubric:

| Score | Criteria |
|-------|----------|
| 5 | Excellent: clear project purpose, technical depth, architecture/design explained, setup instructions, usage examples, well-structured |
| 4 | Good: covers most aspects but missing minor details (e.g., no architecture diagram, sparse examples) |
| 3 | Adequate: describes what the project does and basic setup, but lacks depth or structure |
| 2 | Minimal: very brief, missing key sections (no setup, no usage, or no technical details) |
| 1 | Poor: exists but provides almost no useful information |
| 0 | Missing or empty README |

Also write a 1-sentence `localEvaluationSummary` explaining your score.

## Behavior

1. Determine project path:
   - If an argument is provided, use it.
   - Otherwise, use the current working directory.
2. Read `<project>/README.md` and use its contents as `description` (truncate to 50000 chars).
3. Score the README using the rubric above → `localScore` (0-5) and `localEvaluationSummary`.
4. Compute `projectName` from the directory name.
5. Compute `projectPathHash = sha256(<absolute project path>)`.
6. Load API key and server URL:
   - From `~/.modu-arena.json` (apiKey + optional serverUrl), or
   - From `MODU_ARENA_API_URL` env var override.
7. Call `POST /api/v1/evaluate` with API key + HMAC auth.
   - Body MUST include: projectName, description, projectPathHash, localScore, localEvaluationSummary.
8. Print the evaluation fields and end with `state: ulw`.

## Execution

Run this using the Bash tool. Pass `LOCAL_SCORE` and `LOCAL_EVAL_SUMMARY` as environment variables from your agent scoring above.

Set these env vars before running the bash block:
- `LOCAL_SCORE` — integer 0-5 from your rubric evaluation
- `LOCAL_EVAL_SUMMARY` — your 1-sentence justification

```bash
set -euo pipefail

PROJECT_PATH=""
if [ -n "${ARGUMENTS:-}" ]; then
  PROJECT_PATH="$ARGUMENTS"
fi
if [ -z "$PROJECT_PATH" ]; then PROJECT_PATH="$PWD"; fi

node - "$PROJECT_PATH" "${LOCAL_SCORE:-0}" "${LOCAL_EVAL_SUMMARY:-Agent did not provide local evaluation.}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const projectPathArg = process.argv[2];
const localScore = Math.max(0, Math.min(5, parseInt(process.argv[3], 10) || 0));
const localEvaluationSummary = process.argv[4] || '';
const projectPath = path.resolve(projectPathArg || process.cwd());
const projectName = path.basename(projectPath);
const readmePath = path.join(projectPath, 'README.md');

if (!fs.existsSync(readmePath)) {
  console.error('Error: README.md not found:', readmePath);
  process.exit(1);
}

const readmeRaw = fs.readFileSync(readmePath, 'utf8');
if (!readmeRaw.trim()) {
  console.error('Error: README.md is empty');
  process.exit(1);
}

const MAX_DESC = 50000;
const SUFFIX = '\n... (truncated)';
const description = readmeRaw.length > MAX_DESC ? readmeRaw.slice(0, MAX_DESC - SUFFIX.length) + SUFFIX : readmeRaw;

const projectPathHash = crypto.createHash('sha256').update(projectPath).digest('hex');

const configPath = path.join(os.homedir(), '.modu-arena.json');
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
  } catch {
    // ignore
  }
}

const apiKey = config.apiKey;
if (!apiKey) {
  console.error('Error: API key missing. Run `npx @suncreation/modu-arena login` or `install --api-key <key>` first.');
  process.exit(1);
}

const baseUrl = process.env.MODU_ARENA_API_URL || config.serverUrl || 'http://backend.vibemakers.kr:23010';
const url = `${String(baseUrl).replace(/\/$/, '')}/api/v1/evaluate`;

const ts = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ projectName, description, projectPathHash, localScore, localEvaluationSummary });
const sig = crypto.createHmac('sha256', apiKey).update(`${ts}:${body}`).digest('hex');

console.log(`Submitting project: ${projectName}`);
console.log(`Local score: ${localScore}/5 — ${localEvaluationSummary}`);
console.log(`README length: ${readmeRaw.length} chars (sending ${description.length} chars)`);
console.log('');

(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-Timestamp': ts,
      'X-Signature': sig,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Error:', res.status, text);
    process.exit(1);
  }

  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
  console.log('\nstate: ulw');
})();
NODE
```
