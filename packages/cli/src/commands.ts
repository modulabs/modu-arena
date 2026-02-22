/**
 * CLI Commands — install, rank, status, uninstall
 */

import { createInterface } from 'node:readline';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { getAllAdapters, type InstallResult } from './adapters.js';
import { getRank, loginUser, submitEvaluation, sendVerificationCode, verifyCode, verifyCodeAndSignup } from './api.js';
import { loadConfig, saveConfig, requireConfig } from './config.js';
import { API_BASE_URL, TOOL_DISPLAY_NAMES, type ToolType } from './constants.js';
import { installDaemon, uninstallDaemon, getDaemonStatus } from './daemon.js';
import { syncAllTools, hasAnyToolData, hasClaudeDesktopData } from './claude-desktop.js';

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
  if (!process.stdin.isTTY) {
    return prompt(question);
  }
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

  const email = await prompt('  Email: ');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('  Error: Valid email address is required.\n');
    process.exit(1);
  }

  console.log('\n  Sending verification code...');
  const existing = loadConfig();
  const sendResult = await sendVerificationCode(email, existing?.serverUrl);
  if (sendResult.error) {
    console.error(`\n  Error: ${sendResult.error}\n`);
    process.exit(1);
  }
  console.log('  ✓ Verification code sent! Check your email.\n');

  let verifiedCode = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const code = await prompt('  Verification code (6 digits): ');
    if (!code || !/^\d{6}$/.test(code)) {
      console.error('  Error: Please enter a 6-digit code.');
      if (attempt < 3) {
        console.log(`  (${3 - attempt} attempt(s) remaining)\n`);
        continue;
      }
      console.error('\n  Too many failed attempts. Please try again.\n');
      process.exit(1);
    }

    const verifyResult = await verifyCode(email, code, existing?.serverUrl);
    if (verifyResult.error || !verifyResult.verified) {
      console.error(`  ✗ ${verifyResult.error || 'Verification failed. Please try again.'}`);
      if (attempt < 3) {
        console.log(`  (${3 - attempt} attempt(s) remaining)\n`);
        continue;
      }
      console.error('\n  Too many failed attempts. Please try again.\n');
      process.exit(1);
    }

    verifiedCode = code;
    console.log('  ✓ Email verified!\n');
    break;
  }

  if (!verifiedCode) {
    process.exit(1);
  }

  const username = await prompt('  Username (3-50 chars): ');
  if (!username || username.length < 3 || username.length > 50) {
    console.error('  Error: Username must be between 3 and 50 characters.\n');
    process.exit(1);
  }

  const password = await promptPassword('  Password (min 8 chars): ');
  if (!password || password.length < 8) {
    console.error('  Error: Password must be at least 8 characters.\n');
    process.exit(1);
  }

  console.log('\n  Registering...');

  const result = await verifyCodeAndSignup(
    { email, code: verifiedCode, username, password },
    existing?.serverUrl,
  );

  if (!result.success || result.error) {
    console.error(`\n  Error: ${result.error}\n`);
    process.exit(1);
  }

  if (!result.apiKey) {
    console.error('\n  Error: No API key returned from server.\n');
    process.exit(1);
  }

  saveConfig({ apiKey: result.apiKey, serverUrl: existing?.serverUrl });
  console.log('\n  ✓ Registration successful!');
  console.log('  ✓ API key saved to ~/.modu-arena.json');
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
  console.log(`  ✓ New API key generated and saved to ~/.modu-arena.json`);
  console.log(`\n  Username: ${result.user?.username}`);
  console.log(`  API Key:  ${result.apiKey.slice(0, 20)}...${result.apiKey.slice(-4)}`);
  console.log('\n  ⚠ Save your API key — it will not be shown again.\n');

  console.log('  Installing hooks...\n');
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
        '  Run `npx @suncreation/modu-arena register` to create an account, or\n' +
        '  Run `npx @suncreation/modu-arena login` to sign in.\n',
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
        if (result.warning) {
          console.log(`    ⚠ ${result.warning}`);
        }
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

  const daemonResult = installDaemon();
  if (daemonResult.success) {
    console.log(`✓ ${daemonResult.message}`);
  } else {
    console.log(`⚠ Daemon install skipped: ${daemonResult.message}`);
  }

  installSlashCommands();
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
    (acc, d) => ({ tokens: acc.tokens + d.inputTokens + d.outputTokens + (d.cacheTokens ?? 0), sessions: acc.sessions + d.sessions }),
    { tokens: 0, sessions: 0 },
  );
  const sum30 = usage.last30Days.reduce(
    (acc, d) => ({ tokens: acc.tokens + d.inputTokens + d.outputTokens + (d.cacheTokens ?? 0), sessions: acc.sessions + d.sessions }),
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

  const descriptionRaw = readFileSync(readmePath, 'utf-8');
  if (descriptionRaw.trim().length === 0) {
    console.error('Error: README.md is empty.\n');
    process.exit(1);
  }
  const description = descriptionRaw.length > 5000 
    ? descriptionRaw.slice(0, 5000) + '\n... (truncated)'
    : descriptionRaw;

  const projectPathHash = sha256Hex(cwd);
  const localValidationTest = extractLocalValidationTestCommand(descriptionRaw);
  let localScore = 0;
  let localEvaluationSummary: string | undefined;
  if (localValidationTest) {
    console.log('  Running local validation (README: ## Local Validation)...');
    try {
      const start = Date.now();
      execSync(localValidationTest, {
        cwd,
        stdio: 'ignore',
        timeout: 120000,
        windowsHide: true,
      });
      localScore = 5;
      localEvaluationSummary = `Ran README Local Validation test: PASS (localScore=5) in ${Date.now() - start}ms.`;
      console.log('  ✓ Local validation passed');
    } catch {
      localScore = 0;
      localEvaluationSummary = 'Ran README Local Validation test: FAIL (localScore=0).';
      console.log('  ✗ Local validation failed');
    }
    console.log('');
  } else {
    localEvaluationSummary = 'No README Local Validation test block found (localScore=0).';
  }

  console.log(`  Project:  ${projectName}`);
  console.log(`  README:   ${readmePath}`);
  console.log('');
  console.log('  Submitting for evaluation...\n');

  const result = await submitEvaluation(
    { projectName, description, projectPathHash, localScore, localEvaluationSummary },
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
  console.log(`  Final Score: ${evaluation.finalScore}/10`);
  console.log(`  Cumulative:  ${evaluation.cumulativeScoreAfter}`);
  console.log('');
  console.log('  Score Breakdown:');
  console.log(`    localScore:   ${evaluation.localScore}/5`);
  console.log(`    backendScore: ${evaluation.backendScore}/5`);
  console.log(`    penaltyScore: ${evaluation.penaltyScore}`);
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

// ─── slash commands ────────────────────────────────────────────────────────

function installSlashCommands(): void {
  const cwd = process.cwd();
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const srcDir = join(thisDir, '..', 'commands');

  if (!existsSync(srcDir)) {
    const altDir = join(thisDir, 'commands');
    if (!existsSync(altDir)) return;
    return copyCommandsFrom(altDir, cwd);
  }
  copyCommandsFrom(srcDir, cwd);
}

function copyCommandsFrom(srcDir: string, cwd: string): void {
  const targetBase = join(cwd, '.claude', 'commands');

  const routerSrc = join(srcDir, 'modu.md');
  if (existsSync(routerSrc)) {
    mkdirSync(targetBase, { recursive: true });
    writeFileSync(join(targetBase, 'modu.md'), readFileSync(routerSrc));
  }

  const subDir = join(srcDir, 'modu');
  if (!existsSync(subDir)) return;

  const targetSub = join(targetBase, 'modu');
  mkdirSync(targetSub, { recursive: true });

  let count = 0;
  for (const file of readdirSync(subDir)) {
    if (!file.endsWith('.md')) continue;
    writeFileSync(join(targetSub, file), readFileSync(join(subDir, file)));
    count++;
  }

  console.log(`\n✓ Slash commands installed to ${targetBase} (${count} commands)`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function extractLocalValidationTestCommand(readme: string): string | null {
  const idx = readme.toLowerCase().indexOf('## local validation');
  if (idx < 0) return null;
  const section = readme.slice(idx);
  const m = section.match(/```bash[^\n]*title\s*=\s*['"]test['"][^\n]*\n([\s\S]*?)\n```/i);
  if (!m) return null;
  const cmd = (m[1] || '').trim();
  return cmd.length > 0 ? cmd : null;
}

// ─── daemon install ────────────────────────────────────────────────────────

export function daemonInstallCommand(): void {
  console.log('\n🔄 Modu-Arena — Sync Daemon\n');
  
  if (!hasAnyToolData()) {
    console.log('  ✗ No tool data found (Claude Desktop, OpenCode).');
    console.log('    Make sure at least one supported tool is installed and has been used.\n');
    process.exit(1);
  }
  
  const result = installDaemon();
  
  if (result.success) {
    console.log(`  ✓ ${result.message}`);
    console.log('  ✓ Daemon will sync all tool usage automatically.\n');
  } else {
    console.error(`  ✗ ${result.message}\n`);
    process.exit(1);
  }
}

// ─── daemon uninstall ──────────────────────────────────────────────────────

export function daemonUninstallCommand(): void {
  console.log('\n🔄 Modu-Arena — Sync Daemon\n');
  
  const result = uninstallDaemon();
  
  if (result.success) {
    console.log(`  ✓ ${result.message}\n`);
  } else {
    console.error(`  ✗ ${result.message}\n`);
    process.exit(1);
  }
}

// ─── daemon status ─────────────────────────────────────────────────────────

export function daemonStatusCommand(): void {
  console.log('\n🔄 Modu-Arena — Sync Daemon\n');
  
  const status = getDaemonStatus();
  
  console.log(`  Platform: ${status.platform}`);
  console.log(`  Installed: ${status.installed ? 'Yes' : 'No'}`);
  if (status.installed) {
    console.log(`  Sync Interval: ${Math.floor(status.interval / 60)} minutes`);
  }
  
  console.log(`  Claude Desktop Data: ${hasClaudeDesktopData() ? 'Found' : 'Not found'}`);
  console.log(`  Any Tool Data: ${hasAnyToolData() ? 'Found' : 'Not found'}`);
  console.log('');
}

// ─── daemon sync ───────────────────────────────────────────────────────────

export async function daemonSyncCommand(): Promise<void> {
  const config = requireConfig();
  
  if (!hasAnyToolData()) {
    console.log('No tool data found. Nothing to sync.\n');
    return;
  }
  
  console.log('Syncing all tool usage...');
  
  const result = await syncAllTools(config.apiKey);
  
  console.log(`  Synced: ${result.synced} sessions`);
  console.log(`  Skipped: ${result.skipped} sessions (already synced)`);
  
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 3)) {
      console.log(`    - ${err}`);
    }
    if (result.errors.length > 3) {
      console.log(`    ... and ${result.errors.length - 3} more`);
    }
  }
  console.log('');
}
