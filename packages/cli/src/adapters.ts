/**
 * Tool Adapters — Cross-platform hook installation for AI coding tools.
 *
 * Generates Node.js hook scripts (works on all platforms) with
 * thin shell wrappers (.sh on Unix, .cmd on Windows).
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { API_BASE_URL, type ToolType } from './constants.js';

// ─── Platform ──────────────────────────────────────────────────────────────

const IS_WIN = process.platform === 'win32';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ToolAdapter {
  slug: ToolType;
  displayName: string;
  detect(): boolean;
  install(apiKey: string): InstallResult;
  getHookPath(): string;
}

export interface InstallResult {
  success: boolean;
  message: string;
  hookPath?: string;
  warning?: string;
}

interface EnvField {
  key: string;
  env: string;
  parse: 'string' | 'int';
  fallback: string;
}

// ─── Hook Script Generation ────────────────────────────────────────────────

const HOOK_JS = '_modu-hook.js';

function baseFields(prefix: string): EnvField[] {
  return [
    { key: 'sessionId', env: `${prefix}_SESSION_ID`, parse: 'string', fallback: '' },
    { key: 'startedAt', env: `${prefix}_SESSION_STARTED_AT`, parse: 'string', fallback: '' },
    { key: 'inputTokens', env: `${prefix}_INPUT_TOKENS`, parse: 'int', fallback: '0' },
    { key: 'outputTokens', env: `${prefix}_OUTPUT_TOKENS`, parse: 'int', fallback: '0' },
    { key: 'modelName', env: `${prefix}_MODEL`, parse: 'string', fallback: '' },
  ];
}

function generateHookJs(apiKey: string, toolType: string, prefix: string, fields: EnvField[]): string {
  const lines = fields.map((f) =>
    f.parse === 'int'
      ? `    ${f.key}: parseInt(process.env["${f.env}"] || "${f.fallback}", 10)`
      : `    ${f.key}: process.env["${f.env}"] || "${f.fallback}"`
  );

  const shebang = '#!/usr/bin/env node';
  return `${shebang}
"use strict";
var crypto = require("crypto");

var API_KEY = ${JSON.stringify(apiKey)};
var SERVER  = ${JSON.stringify(API_BASE_URL)};

if (!process.env["${prefix}_SESSION_ID"]) process.exit(0);

var body = JSON.stringify({
    toolType: ${JSON.stringify(toolType)},
    endedAt: new Date().toISOString(),
${lines.join(",\n")}
});

var ts  = Math.floor(Date.now() / 1000).toString();
var sig = crypto.createHmac("sha256", API_KEY).update(ts + ":" + body).digest("hex");

fetch(SERVER + "/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY, "X-Timestamp": ts, "X-Signature": sig },
    body: body
}).then(function(r) {
    if (!r.ok) r.text().then(function(t) { process.stderr.write("[modu-arena] " + r.status + " " + t + "\\n"); });
}).catch(function(e) { process.stderr.write("[modu-arena] hook error: " + e.message + "\\n"); });
`;
}

/**
 * Generate hook script for Claude Code.
 *
 * Claude Code's Stop hook passes data via **stdin JSON** (NOT environment variables):
 *   { "session_id": "...", "transcript_path": "~/.claude/projects/.../xxx.jsonl", ... }
 *
 * Token/model info must be parsed from the transcript JSONL file.
 * Each line with type==="assistant" and message.usage contains per-request token counts.
 * We deduplicate by requestId (last entry per requestId wins to avoid streaming duplicates)
 * then sum all unique requests.
 */
function generateClaudeCodeHookJs(apiKey: string): string {
  const shebang = '#!/usr/bin/env node';
  return `${shebang}
"use strict";
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var API_KEY = ${JSON.stringify(apiKey)};
var SERVER  = ${JSON.stringify(API_BASE_URL)};

// --- 1. Read hook input from stdin (Claude Code passes JSON via stdin) ---
function readStdin() {
    return new Promise(function (resolve) {
        var chunks = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", function (d) { chunks.push(d); });
        process.stdin.on("end", function () {
            var raw = chunks.join("");
            try { resolve(JSON.parse(raw)); }
            catch (_) { resolve({}); }
        });
        setTimeout(function () { resolve({}); }, 5000);
    });
}

// --- 2. Parse transcript JSONL for token & model stats ---
function parseTranscript(transcriptPath) {
    var result = {
        modelName: "unknown",
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        startedAt: "",
        endedAt: ""
    };

    if (!transcriptPath) return result;

    // Resolve ~ to home dir
    if (transcriptPath.startsWith("~")) {
        transcriptPath = path.join(
            process.env.HOME || process.env.USERPROFILE || "",
            transcriptPath.slice(1)
        );
    }

    var content;
    try { content = fs.readFileSync(transcriptPath, "utf8"); }
    catch (_) { return result; }

    var lines = content.split("\\n").filter(Boolean);
    var seenRequests = {};

    for (var i = 0; i < lines.length; i++) {
        var entry;
        try { entry = JSON.parse(lines[i]); }
        catch (_) { continue; }

        // Capture timestamps
        if (entry.timestamp && !result.startedAt) {
            result.startedAt = entry.timestamp;
        }
        if (entry.timestamp) {
            result.endedAt = entry.timestamp;
        }

        // Extract model & usage from assistant messages
        if (entry.type === "assistant" && entry.message && entry.message.usage) {
            var msg = entry.message;
            if (msg.model && result.modelName === "unknown") {
                result.modelName = msg.model;
            }
            // Last entry per requestId wins (streaming dedup)
            seenRequests[entry.requestId || ("idx_" + i)] = msg.usage;
        }
    }

    // Aggregate usage across all unique requests
    var reqIds = Object.keys(seenRequests);
    for (var j = 0; j < reqIds.length; j++) {
        var u = seenRequests[reqIds[j]];
        result.inputTokens += (u.input_tokens || 0);
        result.outputTokens += (u.output_tokens || 0);
        result.cacheCreationTokens += (u.cache_creation_input_tokens || 0);
        result.cacheReadTokens += (u.cache_read_input_tokens || 0);
    }

    return result;
}

// --- 3. Main ---
readStdin().then(function (hookInput) {
    var sessionId = hookInput.session_id || "";
    var transcriptPath = hookInput.transcript_path || "";

    if (!sessionId) {
        process.stderr.write("[modu-arena] no session_id in stdin, skipping\\n");
        process.exit(0);
    }

    var stats = parseTranscript(transcriptPath);

    var body = JSON.stringify({
        toolType: "claude-code",
        sessionId: sessionId,
        startedAt: stats.startedAt || "",
        endedAt: stats.endedAt || new Date().toISOString(),
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        modelName: stats.modelName === "unknown" ? "" : stats.modelName,
        cacheCreationTokens: stats.cacheCreationTokens,
        cacheReadTokens: stats.cacheReadTokens
    });

    var ts  = Math.floor(Date.now() / 1000).toString();
    var sig = crypto.createHmac("sha256", API_KEY).update(ts + ":" + body).digest("hex");

    return fetch(SERVER + "/api/v1/sessions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
            "X-Timestamp": ts,
            "X-Signature": sig
        },
        body: body
    }).then(function (r) {
        if (r.ok) {
            process.stderr.write("[modu-arena] session reported OK\\n");
        } else {
            r.text().then(function (t) {
                process.stderr.write("[modu-arena] " + r.status + " " + t + "\\n");
            });
        }
    });
}).catch(function (e) {
    process.stderr.write("[modu-arena] hook error: " + e.message + "\\n");
});
`;
}

function generateGeminiHookJs(apiKey: string): string {
  const shebang = '#!/usr/bin/env node';
  return `${shebang}
"use strict";
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var API_KEY = ${JSON.stringify(apiKey)};
var SERVER  = ${JSON.stringify(API_BASE_URL)};

function readStdin() {
    return new Promise(function (resolve) {
        var chunks = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", function (d) { chunks.push(d); });
        process.stdin.on("end", function () {
            var raw = chunks.join("");
            try { resolve(JSON.parse(raw)); }
            catch (_) { resolve({}); }
        });
        setTimeout(function () { resolve({}); }, 5000);
    });
}

function parseTranscript(transcriptPath) {
    var result = {
        sessionId: "",
        startedAt: "",
        endedAt: "",
        modelName: "unknown",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0
    };

    if (!transcriptPath) return result;

    if (transcriptPath.indexOf("~") === 0) {
        transcriptPath = path.join(
            process.env.HOME || process.env.USERPROFILE || "",
            transcriptPath.slice(1)
        );
    }

    var content;
    try { content = fs.readFileSync(transcriptPath, "utf8"); }
    catch (_) { return result; }

    var transcript;
    try { transcript = JSON.parse(content); }
    catch (_) { return result; }

    result.sessionId = transcript.sessionId || "";
    result.startedAt = transcript.startTime || "";
    result.endedAt = transcript.lastUpdated || "";

    var messages = Array.isArray(transcript.messages) ? transcript.messages : [];
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (!msg || msg.type !== "gemini" || !msg.tokens) continue;

        if (result.modelName === "unknown" && msg.model) {
            result.modelName = msg.model;
        }

        result.inputTokens += (msg.tokens.input || 0);
        result.outputTokens += (msg.tokens.output || 0);
        result.cacheReadTokens += (msg.tokens.cached || 0);
    }

    return result;
}

readStdin().then(function (hookInput) {
    var transcriptPath = hookInput.transcript_path || "";
    var stats = parseTranscript(transcriptPath);
    var sessionId = hookInput.session_id || stats.sessionId || "";

    if (!sessionId) {
        process.stderr.write("[modu-arena] no session id from stdin/transcript, skipping\\n");
        process.exit(0);
    }

    var body = JSON.stringify({
        toolType: "gemini",
        sessionId: sessionId,
        startedAt: stats.startedAt || "",
        endedAt: stats.endedAt || new Date().toISOString(),
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        modelName: stats.modelName,
        cacheCreationTokens: 0,
        cacheReadTokens: stats.cacheReadTokens
    });

    var ts  = Math.floor(Date.now() / 1000).toString();
    var sig = crypto.createHmac("sha256", API_KEY).update(ts + ":" + body).digest("hex");

    return fetch(SERVER + "/api/v1/sessions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
            "X-Timestamp": ts,
            "X-Signature": sig
        },
        body: body
    }).then(function (r) {
        if (r.ok) {
            process.stderr.write("[modu-arena] session reported OK\\n");
        } else {
            r.text().then(function (t) {
                process.stderr.write("[modu-arena] " + r.status + " " + t + "\\n");
            });
        }
    });
}).catch(function (e) {
    process.stderr.write("[modu-arena] hook error: " + e.message + "\\n");
});
`;
}

function shellWrapper(): string {
  return `#!/bin/bash
exec node "$(dirname "$0")/${HOOK_JS}"
`;
}

function cmdWrapper(): string {
  return `@node "%~dp0${HOOK_JS}" 2>nul\r\n`;
}

// ─── Shared Install Logic ──────────────────────────────────────────────────

function installHook(
  displayName: string,
  hooksDir: string,
  entryPath: string,
  apiKey: string,
  toolType: string,
  prefix: string,
  fields: EnvField[],
): InstallResult {
  try {
    if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

    writeFileSync(join(hooksDir, HOOK_JS), generateHookJs(apiKey, toolType, prefix, fields), { mode: 0o755 });

    if (IS_WIN) {
      writeFileSync(entryPath, cmdWrapper());
    } else {
      writeFileSync(entryPath, shellWrapper(), { mode: 0o755 });
    }

    return { success: true, message: `${displayName} hook installed at ${entryPath}`, hookPath: entryPath };
  } catch (err) {
    return { success: false, message: `Failed to install ${displayName} hook: ${err}` };
  }
}

function hookEntryName(): string {
  return IS_WIN ? 'session-end.cmd' : 'session-end.sh';
}

// ─── Claude Code Settings Registration ─────────────────────────────────────

/**
 * Register hook in ~/.claude/settings.json so Claude Code actually triggers it.
 * Claude Code requires explicit registration in settings.json (unlike other tools
 * that auto-discover hooks by filename convention).
 */
function quoteHookCommand(hookPath: string): string {
  return `"${hookPath.replace(/"/g, '\\"')}"`;
}

function normalizeCommandPath(command: string): string {
  const unquoted = command.trim().replace(/^"|"$/g, '');
  return unquoted.replace(/\\/g, '/');
}

function registerHookInSettings(configDir: string, hookPath: string): void {
  const settingsPath = join(configDir, 'settings.json');
  let settings: Record<string, unknown> = {};

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Invalid JSON in ${settingsPath}: ${String(err)}`);
    }
  }

  type HookEntry = { matcher: string; hooks: Array<{ type: string; command: string }> };
  const hooks = (
    settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)
      ? settings.hooks
      : {}
  ) as Record<string, HookEntry[]>;
  const stopHooks = (hooks.Stop ?? []) as HookEntry[];
  const expectedCommand = quoteHookCommand(hookPath);
  const normalizedExpectedCommand = normalizeCommandPath(expectedCommand);

  const alreadyRegistered = stopHooks.some(
    (entry) =>
      entry.hooks?.some(
        (h) =>
          h.type === 'command' &&
          typeof h.command === 'string' &&
          normalizeCommandPath(h.command) === normalizedExpectedCommand,
      ),
  );

  if (!alreadyRegistered) {
    stopHooks.push({
      matcher: '',
      hooks: [{ type: 'command', command: expectedCommand }],
    });
  }

  hooks.Stop = stopHooks;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Register hook in ~/.gemini/settings.json so Gemini CLI actually triggers it.
 * Gemini CLI uses 'SessionEnd' event (not 'Stop' like Claude Code).
 * Ref: https://geminicli.com/docs/hooks/reference/
 */
function registerGeminiHookInSettings(configDir: string, hookPath: string): void {
  const settingsPath = join(configDir, 'settings.json');
  let settings: Record<string, unknown> = {};

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Invalid JSON in ${settingsPath}: ${String(err)}`);
    }
  }

  type HookEntry = { matcher?: string; hooks: Array<{ type: string; command: string }> };
  const hooks = (
    settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks)
      ? settings.hooks
      : {}
  ) as Record<string, HookEntry[]>;
  const sessionEndHooks = (hooks.SessionEnd ?? []) as HookEntry[];
  const expectedCommand = quoteHookCommand(hookPath);
  const normalizedExpectedCommand = normalizeCommandPath(expectedCommand);

  const alreadyRegistered = sessionEndHooks.some(
    (entry) =>
      entry.hooks?.some(
        (h) =>
          h.type === 'command' &&
          typeof h.command === 'string' &&
          normalizeCommandPath(h.command) === normalizedExpectedCommand,
      ),
  );

  if (!alreadyRegistered) {
    sessionEndHooks.push({
      hooks: [{ type: 'command', command: expectedCommand }],
    });
  }

  hooks.SessionEnd = sessionEndHooks;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

// ─── Adapters ──────────────────────────────────────────────────────────────

class ClaudeCodeAdapter implements ToolAdapter {
  slug = 'claude-code' as const;
  displayName = 'Claude Code';

  private get configDir() { return join(homedir(), '.claude'); }
  private get hooksDir() { return join(this.configDir, 'hooks'); }

  getHookPath() { return join(this.hooksDir, hookEntryName()); }
  detect() { return existsSync(this.configDir); }

  install(apiKey: string): InstallResult {
    try {
      if (!existsSync(this.hooksDir)) mkdirSync(this.hooksDir, { recursive: true });

      // Claude Code uses stdin JSON + transcript JSONL — NOT environment variables.
      // Write the dedicated Claude Code hook script.
      writeFileSync(join(this.hooksDir, HOOK_JS), generateClaudeCodeHookJs(apiKey), { mode: 0o755 });

      const entryPath = this.getHookPath();
      if (IS_WIN) {
        writeFileSync(entryPath, cmdWrapper());
      } else {
        writeFileSync(entryPath, shellWrapper(), { mode: 0o755 });
      }

      const result: InstallResult = {
        success: true,
        message: `${this.displayName} hook installed at ${entryPath}`,
        hookPath: entryPath,
      };

      try {
        registerHookInSettings(this.configDir, entryPath);
      } catch (err) {
        result.warning = `Could not register in settings.json: ${String(err)}`;
      }

      return result;
    } catch (err) {
      return { success: false, message: `Failed to install ${this.displayName} hook: ${err}` };
    }
  }
}

class GeminiAdapter implements ToolAdapter {
  slug = 'gemini' as const;
  displayName = 'Gemini CLI';

  private get configDir() { return join(homedir(), '.gemini'); }
  private get hooksDir() { return join(this.configDir, 'hooks'); }

  getHookPath() { return join(this.hooksDir, hookEntryName()); }
  detect() { return existsSync(this.configDir); }

  install(apiKey: string): InstallResult {
    try {
      if (!existsSync(this.hooksDir)) mkdirSync(this.hooksDir, { recursive: true });

      writeFileSync(join(this.hooksDir, HOOK_JS), generateGeminiHookJs(apiKey), { mode: 0o755 });

      const entryPath = this.getHookPath();
      if (IS_WIN) {
        writeFileSync(entryPath, cmdWrapper());
      } else {
        writeFileSync(entryPath, shellWrapper(), { mode: 0o755 });
      }

      const result: InstallResult = {
        success: true,
        message: `${this.displayName} hook installed at ${entryPath}`,
        hookPath: entryPath,
      };

      try {
        registerGeminiHookInSettings(this.configDir, entryPath);
      } catch (err) {
        result.warning = `Could not register in settings.json: ${String(err)}`;
      }

      return result;
    } catch (err) {
      return { success: false, message: `Failed to install ${this.displayName} hook: ${err}` };
    }
  }
}

class OpenCodeAdapter implements ToolAdapter {
  slug = 'opencode' as const;
  displayName = 'OpenCode';

  private get configDir() {
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
  }
  private get hooksDir() { return join(this.configDir, 'hooks'); }

  getHookPath() { return join(this.hooksDir, hookEntryName()); }
  detect() { return existsSync(this.configDir); }

  install(apiKey: string) {
    return installHook(this.displayName, this.hooksDir, this.getHookPath(), apiKey, 'opencode', 'OPENCODE',
      baseFields('OPENCODE'),
    );
  }
}

class SimpleAdapter implements ToolAdapter {
  constructor(
    public slug: ToolType,
    public displayName: string,
    private dirName: string,
    private envPrefix: string,
  ) {}

  private get configDir() { return join(homedir(), this.dirName); }
  private get hooksDir() { return join(this.configDir, 'hooks'); }

  getHookPath() { return join(this.hooksDir, hookEntryName()); }
  detect() { return existsSync(this.configDir); }

  install(apiKey: string) {
    return installHook(this.displayName, this.hooksDir, this.getHookPath(), apiKey, this.slug, this.envPrefix,
      baseFields(this.envPrefix),
    );
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

export function getAllAdapters(): ToolAdapter[] {
  return [
    new ClaudeCodeAdapter(),
    new OpenCodeAdapter(),
    new GeminiAdapter(),
    new SimpleAdapter('codex', 'Codex CLI', '.codex', 'CODEX'),
    new SimpleAdapter('crush', 'Crush', '.crush', 'CRUSH'),
  ];
}

export function getAdapter(slug: string): ToolAdapter | undefined {
  return getAllAdapters().find((a) => a.slug === slug);
}
