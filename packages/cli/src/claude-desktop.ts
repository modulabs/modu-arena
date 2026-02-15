/**
 * Claude Desktop session parser and sync logic.
 * 
 * Reads JSONL files from ~/Library/Application Support/Claude/local-agent-mode-sessions/
 * on macOS and %APPDATA%\Claude\local-agent-mode-sessions\ on Windows.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
  const data = `${session.sessionId}:${session.inputTokens}:${session.outputTokens}:${session.endedAt}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

export async function syncClaudeDesktop(apiKey: string): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const state = loadDaemonState();
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;
  
  const sessionDirs = getSessionDirs();
  
  for (const orgDir of sessionDirs) {
    const jsonlFiles = findJsonlFiles(orgDir);
    
    for (const file of jsonlFiles) {
      const session = parseJsonlFile(file);
      if (!session) continue;
      
      const hash = computeSessionHash(session);
      if (state.syncedSessions.includes(hash)) {
        skipped++;
        continue;
      }
      
      if (session.inputTokens === 0 && session.outputTokens === 0) {
        skipped++;
        continue;
      }
      
      try {
        const body = JSON.stringify({
          toolType: 'claude-desktop',
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
        } else {
          const err = await res.text();
          errors.push(`${session.sessionId}: ${err}`);
        }
      } catch (e) {
        errors.push(`${session.sessionId}: ${e}`);
      }
    }
  }
  
  state.lastSync = new Date().toISOString();
  saveDaemonState(state);
  
  return { synced, skipped, errors };
}

export function hasClaudeDesktopData(): boolean {
  const dataDir = getClaudeDesktopDataDir();
  const sessionsDir = join(dataDir, 'local-agent-mode-sessions');
  return existsSync(sessionsDir);
}

export function getClaudeDesktopDataPath(): string {
  return getClaudeDesktopDataDir();
}
