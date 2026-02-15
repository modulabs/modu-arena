/**
 * Tool Adapters — Cross-platform hook installation for AI coding tools.
 *
 * Generates Node.js hook scripts (works on all platforms) with
 * thin shell wrappers (.sh on Unix, .cmd on Windows).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
    { key: 'modelName', env: `${prefix}_MODEL`, parse: 'string', fallback: 'unknown' },
  ];
}

function generateHookJs(apiKey: string, toolType: string, prefix: string, fields: EnvField[]): string {
  const lines = fields.map((f) =>
    f.parse === 'int'
      ? `    ${f.key}: parseInt(process.env["${f.env}"] || "${f.fallback}", 10)`
      : `    ${f.key}: process.env["${f.env}"] || "${f.fallback}"`
  );

  return `#!/usr/bin/env node
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

// ─── Adapters ──────────────────────────────────────────────────────────────

class ClaudeCodeAdapter implements ToolAdapter {
  slug = 'claude-code' as const;
  displayName = 'Claude Code';

  private get configDir() { return join(homedir(), '.claude'); }
  private get hooksDir() { return join(this.configDir, 'hooks'); }

  getHookPath() { return join(this.hooksDir, hookEntryName()); }
  detect() { return existsSync(this.configDir); }

  install(apiKey: string) {
    return installHook(this.displayName, this.hooksDir, this.getHookPath(), apiKey, 'claude-code', 'CLAUDE',
      [
        ...baseFields('CLAUDE'),
        { key: 'cacheCreationTokens', env: 'CLAUDE_CACHE_CREATION_TOKENS', parse: 'int', fallback: '0' },
        { key: 'cacheReadTokens', env: 'CLAUDE_CACHE_READ_TOKENS', parse: 'int', fallback: '0' },
      ],
    );
  }
}

class OpenCodeAdapter implements ToolAdapter {
  slug = 'opencode' as const;
  displayName = 'OpenCode';

  private static readonly PLUGIN_NAME = 'opencode-modu-arena';

  // OpenCode uses ~/.config/opencode on ALL platforms (including Windows)
  // It uses xdg-basedir which respects XDG_CONFIG_HOME on all platforms
  private get configDir() {
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
  }
  private get configFile() { return join(this.configDir, 'opencode.json'); }

  getHookPath() { return this.configFile; }
  detect() { return existsSync(this.configDir); }

  // OpenCode uses a JS plugin system, not shell hooks — registers plugin in opencode.json
  install(_apiKey: string) {
    try {
      let config: Record<string, unknown> = {};
      if (existsSync(this.configFile)) {
        const raw = readFileSync(this.configFile, 'utf-8');
        config = JSON.parse(raw) as Record<string, unknown>;
      }

      const plugins = (Array.isArray(config.plugin) ? config.plugin : []) as string[];

      if (plugins.some((p) => p === OpenCodeAdapter.PLUGIN_NAME || p.startsWith(`${OpenCodeAdapter.PLUGIN_NAME}@`))) {
        return { success: true, message: `${this.displayName} plugin already registered`, hookPath: this.configFile };
      }

      plugins.push(OpenCodeAdapter.PLUGIN_NAME);
      config.plugin = plugins;

      if (!existsSync(this.configDir)) mkdirSync(this.configDir, { recursive: true });
      writeFileSync(this.configFile, JSON.stringify(config, null, 4) + '\n');

      return { success: true, message: `${this.displayName} plugin registered in ${this.configFile}`, hookPath: this.configFile };
    } catch (err) {
      return { success: false, message: `Failed to register ${this.displayName} plugin: ${err}` };
    }
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
    new SimpleAdapter('gemini', 'Gemini CLI', '.gemini', 'GEMINI'),
    new SimpleAdapter('codex', 'Codex CLI', '.codex', 'CODEX'),
    new SimpleAdapter('crush', 'Crush', '.crush', 'CRUSH'),
  ];
}

export function getAdapter(slug: string): ToolAdapter | undefined {
  return getAllAdapters().find((a) => a.slug === slug);
}
