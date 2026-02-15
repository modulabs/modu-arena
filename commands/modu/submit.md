---
description: Evaluate current project (local run) + README-only remote scoring
argument-hint: [project-path]
allowed-tools: Bash, Read, Grep, Glob
---

# /modu:submit

Goal: submit a project for evaluation using README.md as the source of truth.

Hard rules:

- Read `.modu-arena/development-plan.md` first.
- Local evaluation MUST run using README `## Local Validation` -> `bash title="test"` (if present):
  - If test succeeds: localScore=5
  - If test fails or missing: localScore=0
- Remote evaluation MUST use README content only (do NOT send code; avoid sending fileStructure).

Behavior:

1. Determine project path:
   - If an argument is provided, use it.
   - Otherwise, use the current working directory.
2. Read `<project>/README.md` and use its contents as `description` (truncate to 5000 chars).
3. Compute `projectName` from the directory name.
4. Compute `projectPathHash = sha256(<absolute project path>)`.
5. Load API key and server URL:
   - From `~/.modu-arena.json` (apiKey + optional serverUrl), or
   - From `MODU_ARENA_API_URL` env var override.
6. Call `POST /api/v1/evaluate` with API key + HMAC auth.
   - Body MUST include: projectName, description, projectPathHash, localScore.
7. Print the evaluation fields and end with `state: ulw`.

## Execution

Run this using the Bash tool. It reads the local README, runs local validation (if present), then sends a README-only payload to the server.

```bash
set -euo pipefail

RUN_MODE=0
PROJECT_PATH=""
if [ -n "${ARGUMENTS:-}" ]; then
  if [ "${ARGUMENTS%% *}" = "--run" ]; then
    RUN_MODE=1
    PROJECT_PATH="${ARGUMENTS#--run}"
    PROJECT_PATH="${PROJECT_PATH# }"
  else
    PROJECT_PATH="$ARGUMENTS"
  fi
fi
if [ -z "$PROJECT_PATH" ]; then PROJECT_PATH="$PWD"; fi

node - "$PROJECT_PATH" "$RUN_MODE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const projectPathArg = process.argv[2];
const runMode = process.argv[3] === '1';
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

const description = readmeRaw.length > 5000 ? `${readmeRaw.slice(0, 5000)}\n... (truncated)` : readmeRaw;

function extractLocalValidationTestCommand(text) {
  const idx = text.toLowerCase().indexOf('## local validation');
  if (idx < 0) return null;
  const section = text.slice(idx);
  const m = section.match(/```bash[^\n]*title\s*=\s*['\"]test['\"][^\n]*\n([\s\S]*?)\n```/i);
  if (!m) return null;
  const cmd = (m[1] || '').trim();
  return cmd ? cmd : null;
}

let localScore = 0;
const testCmd = extractLocalValidationTestCommand(readmeRaw);
let localEvaluationSummary = '';
if (!runMode) {
  console.log('Planned /modu:submit');
  console.log('projectPath:', projectPath);
  console.log('projectName:', projectName);
  console.log('readmePath:', readmePath);
  console.log('localValidationTest:', testCmd ? testCmd : '(missing)');
  console.log('');
  console.log('To proceed and run the local test command, re-run:');
  console.log('  /modu:submit --run ' + projectPath);
  console.log('');
  console.log('state: ulw');
  process.exit(0);
}

if (testCmd) {
  const start = Date.now();
  try {
    execSync(testCmd, { cwd: projectPath, stdio: 'ignore', timeout: 120000, windowsHide: true });
    localScore = 5;
    localEvaluationSummary = `Ran README Local Validation test: PASS (localScore=5) in ${Date.now() - start}ms.`;
  } catch {
    localScore = 0;
    localEvaluationSummary = `Ran README Local Validation test: FAIL (localScore=0) in ${Date.now() - start}ms.`;
  }
} else {
  localEvaluationSummary = 'No README Local Validation test block found (localScore=0).';
}

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
