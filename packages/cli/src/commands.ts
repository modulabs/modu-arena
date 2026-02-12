/**
 * CLI Commands — install, rank, status, uninstall
 */

import { createInterface } from 'node:readline';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { getAllAdapters, type InstallResult } from './adapters.js';
import { getRank, registerUser, loginUser, submitEvaluation } from './api.js';
import { loadConfig, saveConfig, requireConfig } from './config.js';
import { API_BASE_URL, TOOL_DISPLAY_NAMES, type ToolType } from './constants.js';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const chars: string[] = [];
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (ch: string) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '\u0004') {
        // Enter or Ctrl+D
        stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(chars.join('').trim());
      } else if (c === '\u0003') {
        // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        if (chars.length > 0) {
          chars.pop();
          process.stdout.write('\b \b');
        }
      } else {
        chars.push(c);
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

// ─── register ──────────────────────────────────────────────────────────────

export async function registerCommand(): Promise<void> {
  console.log('\n📝 Modu-Arena — Register\n');

  const username = await prompt('  Username (3-50 chars): ');
  if (!username || username.length < 3 || username.length > 50) {
    console.error('Error: Username must be between 3 and 50 characters.\n');
    process.exit(1);
  }

  const password = await promptPassword('  Password (min 8 chars): ');
  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters.\n');
    process.exit(1);
  }

  const displayName = await prompt('  Display name (optional, press Enter to skip): ');

  console.log('\n  Registering...');

  const existing = loadConfig();
  const result = await registerUser(
    { username, password, displayName: displayName || undefined },
    existing?.serverUrl,
  );

  if (result.error) {
    console.error(`\n  Error: ${result.error}\n`);
    process.exit(1);
  }

  if (!result.apiKey) {
    console.error('\n  Error: No API key returned from server.\n');
    process.exit(1);
  }

  saveConfig({ apiKey: result.apiKey, serverUrl: existing?.serverUrl });
  console.log('\n  ✓ Registration successful!');
  console.log(`  ✓ API key saved to ~/.modu-arena.json`);
  console.log(`\n  Username: ${result.user?.username}`);
  console.log(`  API Key:  ${result.apiKey.slice(0, 20)}...${result.apiKey.slice(-4)}`);
  console.log('\n  ⚠ Save your API key — it will not be shown again.\n');

  console.log('  Installing hooks for detected AI coding tools...\n');
  await installCommand(result.apiKey);
}

// ─── login ─────────────────────────────────────────────────────────────────

export async function loginCommand(): Promise<void> {
  console.log('\n🔑 Modu-Arena — Login\n');

  const username = await prompt('  Username: ');
  if (!username) {
    console.error('Error: Username is required.\n');
    process.exit(1);
  }

  const password = await promptPassword('  Password: ');
  if (!password) {
    console.error('Error: Password is required.\n');
    process.exit(1);
  }

  console.log('\n  Logging in...');

  const existing = loadConfig();
  const result = await loginUser({ username, password }, existing?.serverUrl);

  if (result.error) {
    console.error(`\n  Error: ${result.error}\n`);
    process.exit(1);
  }

  if (!result.apiKey) {
    console.error('\n  Error: No API key returned from server.\n');
    process.exit(1);
  }

  saveConfig({ apiKey: result.apiKey, serverUrl: existing?.serverUrl });
  console.log('\n  ✓ Login successful!');
  console.log(`  ✓ API key saved to ~/.modu-arena.json`);
  console.log(`\n  Username: ${result.user?.username}`);
  console.log(`  API Key:  ${result.apiKey.slice(0, 20)}...${result.apiKey.slice(-4)}`);
  console.log('\n  ⚠ A new API key was generated. Previous key is now invalid.\n');

  console.log('  Reinstalling hooks with new API key...\n');
  await installCommand(result.apiKey);
}

// ─── install ───────────────────────────────────────────────────────────────

export async function installCommand(apiKey?: string): Promise<void> {
  console.log('\n🔧 Modu-Arena — AI Coding Tool Usage Tracker\n');

  // Check if already configured
  const existing = loadConfig();
  if (existing?.apiKey && !apiKey) {
    console.log('✓ Already configured.');
    console.log('  Use --api-key <key> to update your API key.\n');
    apiKey = existing.apiKey;
  }

  if (!apiKey) {
    console.error(
      'Error: API key required.\n' +
        '  Get your API key from the Modu-Arena dashboard.\n' +
        '  Usage: npx @suncreation/modu-arena install --api-key <your-api-key>\n',
    );
    process.exit(1);
  }

  // Validate API key format
  if (!apiKey.startsWith('modu_arena_')) {
    console.error(
      'Error: Invalid API key format. Key must start with "modu_arena_".\n',
    );
    process.exit(1);
  }

  // Save config
  saveConfig({ apiKey });
  console.log('✓ API key saved to ~/.modu-arena.json\n');

  // Detect and install hooks for each tool
  const adapters = getAllAdapters();
  const results: { tool: string; result: InstallResult }[] = [];

  console.log('Detecting AI coding tools...\n');

  for (const adapter of adapters) {
    const detected = adapter.detect();
    if (detected) {
      console.log(`  ✓ ${adapter.displayName} detected`);
      const result = adapter.install(apiKey);
      results.push({ tool: adapter.displayName, result });
      if (result.success) {
        console.log(`    → Hook installed: ${result.hookPath}`);
      } else {
        console.log(`    ✗ ${result.message}`);
      }
    } else {
      console.log(`  - ${adapter.displayName} not found`);
    }
  }

  const installed = results.filter((r) => r.result.success);
  console.log(
    `\n✓ Setup complete. ${installed.length} tool(s) configured.\n`,
  );

  if (installed.length === 0) {
    console.log(
      'No AI coding tools detected. Install one of the supported tools:\n' +
        '  • Claude Code (https://docs.anthropic.com/s/claude-code)\n' +
        '  • OpenCode (https://opencode.ai)\n' +
        '  • Gemini CLI (https://github.com/google-gemini/gemini-cli)\n' +
        '  • Codex CLI (https://github.com/openai/codex)\n' +
        '  • Crush (https://charm.sh/crush)\n',
    );
  }
}

// ─── rank ──────────────────────────────────────────────────────────────────

export async function rankCommand(): Promise<void> {
  const config = requireConfig();
   console.log('\n📊 Modu-Arena — Your Stats\n');

  const result = await getRank({ apiKey: config.apiKey, serverUrl: config.serverUrl });

  if (!result.success) {
    console.error(`Error: ${'error' in result ? result.error : 'Unknown error'}\n`);
    process.exit(1);
  }

  if (!('data' in result) || !result.data) {
    console.error('Error: Unexpected response format.\n');
    process.exit(1);
  }

  const { username, usage, overview } = result.data;

  console.log(`  User:     ${username}`);
  console.log(`  Tokens:   ${formatNumber(usage.totalTokens)}`);
  console.log(`  Sessions: ${usage.totalSessions}`);
  console.log(`  Projects: ${overview.successfulProjectsCount}`);
  console.log('');

  // Tool breakdown
  if (usage.toolBreakdown.length > 0) {
    console.log('  Tool Breakdown:');
    for (const entry of usage.toolBreakdown) {
      const name = TOOL_DISPLAY_NAMES[entry.tool as ToolType] || entry.tool;
      console.log(
        `    ${name}: ${formatNumber(entry.tokens)} tokens`,
      );
    }
    console.log('');
  }

  // Period stats (aggregate from daily arrays)
  const sum7 = usage.last7Days.reduce(
    (acc, d) => ({ tokens: acc.tokens + d.inputTokens + d.outputTokens, sessions: acc.sessions + d.sessions }),
    { tokens: 0, sessions: 0 },
  );
  const sum30 = usage.last30Days.reduce(
    (acc, d) => ({ tokens: acc.tokens + d.inputTokens + d.outputTokens, sessions: acc.sessions + d.sessions }),
    { tokens: 0, sessions: 0 },
  );
  console.log(
    `  Last 7 days:  ${formatNumber(sum7.tokens)} tokens, ${sum7.sessions} sessions`,
  );
  console.log(
    `  Last 30 days: ${formatNumber(sum30.tokens)} tokens, ${sum30.sessions} sessions`,
  );
  console.log('');
}

// ─── status ────────────────────────────────────────────────────────────────

export function statusCommand(): void {
   const config = loadConfig();
   console.log('\n🔍 Modu-Arena — Status\n');

   if (!config?.apiKey) {
     console.log('  Status: Not configured');
     console.log(
       '  Run `npx @suncreation/modu-arena install --api-key <key>` to set up.\n',
     );
     return;
   }

  const maskedKey =
    config.apiKey.slice(0, 15) + '...' + config.apiKey.slice(-4);
  console.log(`  API Key: ${maskedKey}`);
  console.log(`  Server:  ${config.serverUrl || API_BASE_URL}`);
  console.log('');

  // Check installed hooks
  const adapters = getAllAdapters();
  console.log('  Installed Hooks:');
  let hookCount = 0;
  for (const adapter of adapters) {
    const detected = adapter.detect();
    if (detected) {
      const hookExists = existsSync(adapter.getHookPath());
      const status = hookExists ? '✓ Active' : '✗ Not installed';
      console.log(`    ${adapter.displayName}: ${status}`);
      if (hookExists) hookCount++;
    }
  }
  if (hookCount === 0) {
    console.log('    (none)');
  }
  console.log('');
}

// ─── uninstall ─────────────────────────────────────────────────────────────

export function uninstallCommand(): void {
   console.log('\n🗑️  Modu-Arena — Uninstall\n');

  // Remove hooks
  const adapters = getAllAdapters();
  for (const adapter of adapters) {
    const hookPath = adapter.getHookPath();
    if (existsSync(hookPath)) {
      unlinkSync(hookPath);
      console.log(`  ✓ Removed ${adapter.displayName} hook`);
    }
  }

   // Remove config
   const configPath = join(homedir(), '.modu-arena.json');
   if (existsSync(configPath)) {
     unlinkSync(configPath);
     console.log('  ✓ Removed ~/.modu-arena.json');
   }

   console.log('\n✓ Modu-Arena uninstalled.\n');
}

// ─── submit ─────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  '.cache', '.turbo', '.vercel', '__pycache__', '.svelte-kit',
  'coverage', '.output', '.parcel-cache',
]);

function collectFileStructure(
  dir: string,
  maxDepth: number,
  currentDepth = 0,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (currentDepth >= maxDepth) return result;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') && IGNORE_DIRS.has(entry)) continue;
    if (IGNORE_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const sub = collectFileStructure(fullPath, maxDepth, currentDepth + 1);
      for (const [key, val] of Object.entries(sub)) {
        result[key] = val;
      }
    } else {
      files.push(entry);
    }
  }

  if (files.length > 0) {
    const relDir = currentDepth === 0 ? '.' : dir.split('/').slice(-(currentDepth)).join('/');
    result[relDir] = files;
  }

  return result;
}

export async function submitCommand(): Promise<void> {
  const config = requireConfig();
  console.log('\n🚀 Modu-Arena — Project Submit\n');

  const cwd = process.cwd();
  const projectName = basename(cwd);

  const readmePath = join(cwd, 'README.md');
  if (!existsSync(readmePath)) {
    console.error('Error: README.md not found in the current directory.');
    console.error('  Please create a README.md describing your project.\n');
    process.exit(1);
  }

  const description = readFileSync(readmePath, 'utf-8');
  if (description.trim().length === 0) {
    console.error('Error: README.md is empty.\n');
    process.exit(1);
  }

  console.log(`  Project:  ${projectName}`);
  console.log(`  README:   ${readmePath}`);
  console.log('');
  console.log('  Collecting file structure...');

  const fileStructure = collectFileStructure(cwd, 3);
  const fileCount = Object.values(fileStructure).reduce((sum, files) => sum + files.length, 0);
  console.log(`  Found ${fileCount} file(s) in ${Object.keys(fileStructure).length} director${Object.keys(fileStructure).length === 1 ? 'y' : 'ies'}`);
  console.log('');
  console.log('  Submitting for evaluation...\n');

  const result = await submitEvaluation(
    { projectName, description, fileStructure },
    { apiKey: config.apiKey, serverUrl: config.serverUrl },
  );

  if (!result.success) {
    console.error(`Error: ${'error' in result ? result.error : 'Unknown error'}\n`);
    process.exit(1);
  }

  const { evaluation } = result;
  const statusIcon = evaluation.passed ? '✅' : '❌';
  const statusText = evaluation.passed ? 'PASSED' : 'FAILED';

  console.log(`  Result: ${statusIcon} ${statusText}`);
  console.log(`  Total Score: ${evaluation.totalScore}/100`);
  console.log('');
  console.log('  Rubric Scores:');
  console.log(`    Functionality: ${evaluation.rubricFunctionality}/50`);
  console.log(`    Practicality:  ${evaluation.rubricPracticality}/50`);
  console.log('');

  if (evaluation.feedback) {
    console.log('  Feedback:');
    const lines = evaluation.feedback.split('\n');
    for (const line of lines) {
      console.log(`    ${line}`);
    }
    console.log('');
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
