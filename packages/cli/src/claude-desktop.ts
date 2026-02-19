/**
 * Multi-tool session parser and sync logic.
 * 
 * Supports:
 * - Claude Desktop: JSONL files from ~/Library/Application Support/Claude/local-agent-mode-sessions/
 * - OpenCode: SQLite DB at ~/.local/share/opencode/opencode.db
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { API_BASE_URL, DAEMON_STATE_FILE } from './constants.js';
import { computeHmacSignature } from './crypto.js';

const IS_WIN = process.platform === 'win32';

interface UsageData {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface JsonlMessage {
  type: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    model?: string;
    usage?: UsageData;
  };
}

interface SessionAggregate {
  sessionId: string;
  toolType: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
}

interface DaemonState {
  lastSync: string;
  syncedSessions: string[];
}

function getClaudeDesktopDataDir(): string {
  if (IS_WIN) {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude');
  }
  return join(homedir(), 'Library', 'Application Support', 'Claude');
}

function getSessionDirs(): string[] {
  const dataDir = getClaudeDesktopDataDir();
  const sessionsDir = join(dataDir, 'local-agent-mode-sessions');
  if (!existsSync(sessionsDir)) return [];
  
  const orgDirs: string[] = [];
  for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'skills-plugin') {
      orgDirs.push(join(sessionsDir, entry.name));
    }
  }
  return orgDirs;
}

function findJsonlFiles(baseDir: string): string[] {
  const files: string[] = [];
  
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.jsonl') && !entry.name.includes('audit')) {
        files.push(full);
      }
    }
  }
  
  walk(baseDir);
  return files;
}

function parseJsonlFile(filePath: string): SessionAggregate | null {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  let sessionId = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let model = 'unknown';
  let startedAt = '';
  let endedAt = '';
  let messageCount = 0;
  
  for (const line of lines) {
    try {
      const msg: JsonlMessage = JSON.parse(line);
      
      if (msg.sessionId && !sessionId) {
        sessionId = msg.sessionId;
      }
      
      if (msg.timestamp) {
        if (!startedAt || msg.timestamp < startedAt) {
          startedAt = msg.timestamp;
        }
        if (!endedAt || msg.timestamp > endedAt) {
          endedAt = msg.timestamp;
        }
      }
      
      if (msg.message?.usage) {
        const usage = msg.message.usage;
        inputTokens += usage.input_tokens || 0;
        outputTokens += usage.output_tokens || 0;
        cacheCreationTokens += usage.cache_creation_input_tokens || 0;
        cacheReadTokens += usage.cache_read_input_tokens || 0;
        messageCount++;
        
        if (msg.message.model) {
          model = msg.message.model;
        }
      }
    } catch {
    }
  }
  
  if (!sessionId || messageCount === 0) return null;
  
  return {
    sessionId,
    toolType: 'claude-desktop',
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    model,
    startedAt,
    endedAt,
    messageCount,
  };
}

function getDaemonStatePath(): string {
  return join(homedir(), DAEMON_STATE_FILE);
}

function loadDaemonState(): DaemonState {
  const path = getDaemonStatePath();
  if (!existsSync(path)) {
    return { lastSync: new Date(0).toISOString(), syncedSessions: [] };
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { lastSync: new Date(0).toISOString(), syncedSessions: [] };
  }
}

function saveDaemonState(state: DaemonState): void {
  const path = getDaemonStatePath();
  writeFileSync(path, JSON.stringify(state, null, 2));
}

function computeSessionHash(session: SessionAggregate): string {
  const data = `${session.toolType}:${session.sessionId}:${session.inputTokens}:${session.outputTokens}:${session.endedAt}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 35_000;   // stay under 100 req/min server limit
const MAX_BATCHES_PER_RUN = 3;   // cap at ~150 sessions to avoid daemon timeout

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function submitSessions(
  sessions: SessionAggregate[],
  apiKey: string,
  state: DaemonState,
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  const pending: SessionAggregate[] = [];
  for (const session of sessions) {
    const hash = computeSessionHash(session);
    if (state.syncedSessions.includes(hash)) {
      skipped++;
      continue;
    }
    if (session.inputTokens === 0 && session.outputTokens === 0) {
      skipped++;
      continue;
    }
    pending.push(session);
  }

  let batchCount = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (batchCount >= MAX_BATCHES_PER_RUN) {
      errors.push(`[daemon] Paused after ${batchCount} batches (${synced} synced). Remaining ${pending.length - i} sessions will sync on next run.`);
      break;
    }

    if (batchCount > 0) {
      await sleep(BATCH_DELAY_MS);
    }

    const batch = pending.slice(i, i + BATCH_SIZE);
    let rateLimited = false;

    for (const session of batch) {
      const hash = computeSessionHash(session);
      try {
        const body = JSON.stringify({
          toolType: session.toolType,
          endedAt: session.endedAt,
          startedAt: session.startedAt,
          inputTokens: session.inputTokens,
          outputTokens: session.outputTokens,
          cacheCreationTokens: session.cacheCreationTokens,
          cacheReadTokens: session.cacheReadTokens,
          modelName: session.model,
        });

        const ts = Math.floor(Date.now() / 1000).toString();
        const sig = computeHmacSignature(apiKey, ts, body);

        const res = await fetch(`${API_BASE_URL}/api/v1/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'X-Timestamp': ts,
            'X-Signature': sig,
          },
          body,
        });

        if (res.ok) {
          state.syncedSessions.push(hash);
          synced++;
        } else if (res.status === 429) {
          rateLimited = true;
          errors.push(`[daemon] Rate limited. ${synced} synced so far. Will resume on next run.`);
          break;
        } else {
          const err = await res.text();
          errors.push(`[${session.toolType}] ${session.sessionId}: ${err}`);
        }
      } catch (e) {
        errors.push(`[${session.toolType}] ${session.sessionId}: ${e}`);
      }
    }

    saveDaemonState(state);
    batchCount++;

    if (rateLimited) break;
  }

  return { synced, skipped, errors };
}

// ─── OpenCode SQLite support ───────────────────────────────────────────────

function getOpenCodeDbPath(): string {
  if (IS_WIN) {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'opencode', 'opencode.db');
  }
  return join(homedir(), '.local', 'share', 'opencode', 'opencode.db');
}

function hasOpenCodeDb(): boolean {
  return existsSync(getOpenCodeDbPath());
}

function collectOpenCodeSessions(sinceMs?: number): SessionAggregate[] {
  const dbPath = getOpenCodeDbPath();
  if (!existsSync(dbPath)) return [];

  const whereClause = sinceMs ? `WHERE s.time_updated >= ${sinceMs}` : '';
  const query = `
SELECT s.id, s.time_created, s.time_updated,
  COALESCE(SUM(json_extract(m.data, '$.tokens.input')), 0) as input_tokens,
  COALESCE(SUM(json_extract(m.data, '$.tokens.output')), 0) as output_tokens,
  COALESCE(SUM(json_extract(m.data, '$.tokens.cache.read')), 0) as cache_read,
  COALESCE(SUM(json_extract(m.data, '$.tokens.cache.write')), 0) as cache_write,
  MAX(json_extract(m.data, '$.modelID')) as model,
  COUNT(m.id) as msg_count
FROM session s
LEFT JOIN message m ON m.session_id = s.id AND json_extract(m.data, '$.role') = 'assistant'
${whereClause}
GROUP BY s.id
HAVING input_tokens > 0 OR output_tokens > 0`;

  try {
    const raw = execSync(`sqlite3 -json "${dbPath}" "${query.replace(/\n/g, ' ')}"`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();

    if (!raw || raw === '[]') return [];
    const rows = JSON.parse(raw) as Array<{
      id: string;
      time_created: string | number;
      time_updated: string | number;
      input_tokens: number;
      output_tokens: number;
      cache_read: number;
      cache_write: number;
      model: string | null;
      msg_count: number;
    }>;

    return rows.map((r) => ({
      sessionId: r.id,
      toolType: 'opencode',
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheCreationTokens: r.cache_write,
      cacheReadTokens: r.cache_read,
      model: r.model || 'unknown',
      startedAt: typeof r.time_created === 'number'
        ? new Date(r.time_created).toISOString()
        : r.time_created,
      endedAt: typeof r.time_updated === 'number'
        ? new Date(r.time_updated).toISOString()
        : r.time_updated,
      messageCount: r.msg_count,
    }));
  } catch {
    return [];
  }
}

// ─── Claude Desktop JSONL collection ───────────────────────────────────────

function collectClaudeDesktopSessions(): SessionAggregate[] {
  const sessions: SessionAggregate[] = [];
  for (const orgDir of getSessionDirs()) {
    for (const file of findJsonlFiles(orgDir)) {
      const session = parseJsonlFile(file);
      if (session) sessions.push(session);
    }
  }
  return sessions;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function syncAllTools(apiKey: string): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const state = loadDaemonState();
  const allSessions: SessionAggregate[] = [
    ...collectClaudeDesktopSessions(),
  ];

  const result = await submitSessions(allSessions, apiKey, state);

  state.lastSync = new Date().toISOString();
  saveDaemonState(state);

  return result;
}

export async function syncClaudeDesktop(apiKey: string): Promise<{ synced: number; skipped: number; errors: string[] }> {
  return syncAllTools(apiKey);
}

export function hasClaudeDesktopData(): boolean {
  const dataDir = getClaudeDesktopDataDir();
  const sessionsDir = join(dataDir, 'local-agent-mode-sessions');
  return existsSync(sessionsDir);
}

export function hasAnyToolData(): boolean {
  return hasClaudeDesktopData() || hasOpenCodeDb();
}

export function getClaudeDesktopDataPath(): string {
  return getClaudeDesktopDataDir();
}
