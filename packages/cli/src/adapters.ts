/**
 * Tool Adapters — Hook installation for each supported AI coding tool.
 *
 * Each adapter knows how to:
 * 1. Detect if the tool is installed
 * 2. Install a session-end hook to capture token usage
 * 3. Parse session data from tool-specific formats
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { API_BASE_URL, type ToolType } from './constants.js';

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

// ─── Claude Code Adapter ───────────────────────────────────────────────────

class ClaudeCodeAdapter implements ToolAdapter {
  slug = 'claude-code' as const;
  displayName = 'Claude Code';

  private get configDir(): string {
    return join(homedir(), '.claude');
  }

  private get hooksDir(): string {
    return join(this.configDir, 'hooks');
  }

  getHookPath(): string {
    return join(this.hooksDir, 'session-end.sh');
  }

  detect(): boolean {
    // Check for ~/.claude directory or claude binary
    return existsSync(this.configDir);
  }

  install(apiKey: string): InstallResult {
    try {
      if (!existsSync(this.hooksDir)) {
        mkdirSync(this.hooksDir, { recursive: true });
      }

      const hookScript = this.generateHookScript(apiKey);
      const hookPath = this.getHookPath();

      writeFileSync(hookPath, hookScript, { mode: 0o755 });

      return {
        success: true,
        message: `Claude Code hook installed at ${hookPath}`,
        hookPath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install Claude Code hook: ${err}`,
      };
    }
  }

   private generateHookScript(apiKey: string): string {
     return `#!/bin/bash
# Modu-Arena: Claude Code session tracking hook
# Auto-generated — do not edit manually

MODU_API_KEY="${apiKey}"
MODU_SERVER="${API_BASE_URL}"

# Claude Code passes session data via environment variables
# This hook fires at session end
if [ -n "$CLAUDE_SESSION_ID" ]; then
  SESSION_DATA=$(cat <<EOF
{
  "toolType": "claude-code",
  "sessionId": "$CLAUDE_SESSION_ID",
  "startedAt": "$CLAUDE_SESSION_STARTED_AT",
  "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "inputTokens": \${CLAUDE_INPUT_TOKENS:-0},
  "outputTokens": \${CLAUDE_OUTPUT_TOKENS:-0},
  "cacheCreationTokens": \${CLAUDE_CACHE_CREATION_TOKENS:-0},
  "cacheReadTokens": \${CLAUDE_CACHE_READ_TOKENS:-0},
  "modelName": "\${CLAUDE_MODEL:-unknown}"
}
EOF
)

  TIMESTAMP=$(date +%s)
  MESSAGE="\${TIMESTAMP}:\${SESSION_DATA}"
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$MODU_API_KEY" | sed 's/.*= //')

  curl -s -X POST "\${MODU_SERVER}/api/v1/sessions" \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: \${MODU_API_KEY}" \\
    -H "X-Timestamp: \${TIMESTAMP}" \\
    -H "X-Signature: \${SIGNATURE}" \\
    -d "\${SESSION_DATA}" > /dev/null 2>&1 &
fi
`;
  }
}

// ─── OpenCode Adapter ──────────────────────────────────────────────────────

class OpenCodeAdapter implements ToolAdapter {
  slug = 'opencode' as const;
  displayName = 'OpenCode';

  private get configDir(): string {
    return join(homedir(), '.opencode');
  }

  getHookPath(): string {
    return join(this.configDir, 'hooks', 'session-end.sh');
  }

  detect(): boolean {
    return existsSync(this.configDir);
  }

  install(apiKey: string): InstallResult {
    try {
      const hooksDir = join(this.configDir, 'hooks');
      if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

      const hookScript = this.generateHookScript(apiKey);
      const hookPath = this.getHookPath();
      writeFileSync(hookPath, hookScript, { mode: 0o755 });

      return {
        success: true,
        message: `OpenCode hook installed at ${hookPath}`,
        hookPath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install OpenCode hook: ${err}`,
      };
    }
  }

   private generateHookScript(apiKey: string): string {
     return `#!/bin/bash
# Modu-Arena: OpenCode session tracking hook
# Auto-generated — do not edit manually

MODU_API_KEY="${apiKey}"
MODU_SERVER="${API_BASE_URL}"

if [ -n "$OPENCODE_SESSION_ID" ]; then
  SESSION_DATA=$(cat <<EOF
{
  "toolType": "opencode",
  "sessionId": "$OPENCODE_SESSION_ID",
  "startedAt": "$OPENCODE_SESSION_STARTED_AT",
  "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "inputTokens": \${OPENCODE_INPUT_TOKENS:-0},
  "outputTokens": \${OPENCODE_OUTPUT_TOKENS:-0},
  "modelName": "\${OPENCODE_MODEL:-unknown}"
}
EOF
)

  TIMESTAMP=$(date +%s)
  MESSAGE="\${TIMESTAMP}:\${SESSION_DATA}"
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$MODU_API_KEY" | sed 's/.*= //')

  curl -s -X POST "\${MODU_SERVER}/api/v1/sessions" \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: \${MODU_API_KEY}" \\
    -H "X-Timestamp: \${TIMESTAMP}" \\
    -H "X-Signature: \${SIGNATURE}" \\
    -d "\${SESSION_DATA}" > /dev/null 2>&1 &
fi
`;
  }
}

// ─── Gemini CLI Adapter ────────────────────────────────────────────────────

class GeminiAdapter implements ToolAdapter {
  slug = 'gemini' as const;
  displayName = 'Gemini CLI';

  private get configDir(): string {
    return join(homedir(), '.gemini');
  }

  getHookPath(): string {
    return join(this.configDir, 'hooks', 'session-end.sh');
  }

  detect(): boolean {
    return existsSync(this.configDir);
  }

  install(apiKey: string): InstallResult {
    try {
      const hooksDir = join(this.configDir, 'hooks');
      if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

      const hookScript = this.generateHookScript(apiKey);
      const hookPath = this.getHookPath();
      writeFileSync(hookPath, hookScript, { mode: 0o755 });

      return {
        success: true,
        message: `Gemini CLI hook installed at ${hookPath}`,
        hookPath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install Gemini CLI hook: ${err}`,
      };
    }
  }

   private generateHookScript(apiKey: string): string {
     return `#!/bin/bash
# Modu-Arena: Gemini CLI session tracking hook
# Auto-generated — do not edit manually

MODU_API_KEY="${apiKey}"
MODU_SERVER="${API_BASE_URL}"

if [ -n "$GEMINI_SESSION_ID" ]; then
  SESSION_DATA=$(cat <<EOF
{
  "toolType": "gemini",
  "sessionId": "$GEMINI_SESSION_ID",
  "startedAt": "$GEMINI_SESSION_STARTED_AT",
  "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "inputTokens": \${GEMINI_INPUT_TOKENS:-0},
  "outputTokens": \${GEMINI_OUTPUT_TOKENS:-0},
  "modelName": "\${GEMINI_MODEL:-unknown}"
}
EOF
)

  TIMESTAMP=$(date +%s)
  MESSAGE="\${TIMESTAMP}:\${SESSION_DATA}"
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$MODU_API_KEY" | sed 's/.*= //')

  curl -s -X POST "\${MODU_SERVER}/api/v1/sessions" \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: \${MODU_API_KEY}" \\
    -H "X-Timestamp: \${TIMESTAMP}" \\
    -H "X-Signature: \${SIGNATURE}" \\
    -d "\${SESSION_DATA}" > /dev/null 2>&1 &
fi
`;
  }
}

// ─── Codex CLI Adapter ─────────────────────────────────────────────────────

class CodexAdapter implements ToolAdapter {
  slug = 'codex' as const;
  displayName = 'Codex CLI';

  private get configDir(): string {
    return join(homedir(), '.codex');
  }

  getHookPath(): string {
    return join(this.configDir, 'hooks', 'session-end.sh');
  }

  detect(): boolean {
    return existsSync(this.configDir);
  }

  install(apiKey: string): InstallResult {
    try {
      const hooksDir = join(this.configDir, 'hooks');
      if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

      const hookScript = this.generateHookScript(apiKey);
      const hookPath = this.getHookPath();
      writeFileSync(hookPath, hookScript, { mode: 0o755 });

      return {
        success: true,
        message: `Codex CLI hook installed at ${hookPath}`,
        hookPath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install Codex CLI hook: ${err}`,
      };
    }
  }

   private generateHookScript(apiKey: string): string {
     return `#!/bin/bash
# Modu-Arena: Codex CLI session tracking hook
# Auto-generated — do not edit manually

MODU_API_KEY="${apiKey}"
MODU_SERVER="${API_BASE_URL}"

if [ -n "$CODEX_SESSION_ID" ]; then
  SESSION_DATA=$(cat <<EOF
{
  "toolType": "codex",
  "sessionId": "$CODEX_SESSION_ID",
  "startedAt": "$CODEX_SESSION_STARTED_AT",
  "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "inputTokens": \${CODEX_INPUT_TOKENS:-0},
  "outputTokens": \${CODEX_OUTPUT_TOKENS:-0},
  "modelName": "\${CODEX_MODEL:-unknown}"
}
EOF
)

  TIMESTAMP=$(date +%s)
  MESSAGE="\${TIMESTAMP}:\${SESSION_DATA}"
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$MODU_API_KEY" | sed 's/.*= //')

  curl -s -X POST "\${MODU_SERVER}/api/v1/sessions" \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: \${MODU_API_KEY}" \\
    -H "X-Timestamp: \${TIMESTAMP}" \\
    -H "X-Signature: \${SIGNATURE}" \\
    -d "\${SESSION_DATA}" > /dev/null 2>&1 &
fi
`;
  }
}

// ─── Crush Adapter ─────────────────────────────────────────────────────────

class CrushAdapter implements ToolAdapter {
  slug = 'crush' as const;
  displayName = 'Crush';

  private get configDir(): string {
    return join(homedir(), '.crush');
  }

  getHookPath(): string {
    return join(this.configDir, 'hooks', 'session-end.sh');
  }

  detect(): boolean {
    return existsSync(this.configDir);
  }

  install(apiKey: string): InstallResult {
    try {
      const hooksDir = join(this.configDir, 'hooks');
      if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

      const hookScript = this.generateHookScript(apiKey);
      const hookPath = this.getHookPath();
      writeFileSync(hookPath, hookScript, { mode: 0o755 });

      return {
        success: true,
        message: `Crush hook installed at ${hookPath}`,
        hookPath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to install Crush hook: ${err}`,
      };
    }
  }

   private generateHookScript(apiKey: string): string {
     return `#!/bin/bash
# Modu-Arena: Crush session tracking hook
# Auto-generated — do not edit manually

MODU_API_KEY="${apiKey}"
MODU_SERVER="${API_BASE_URL}"

if [ -n "$CRUSH_SESSION_ID" ]; then
  SESSION_DATA=$(cat <<EOF
{
  "toolType": "crush",
  "sessionId": "$CRUSH_SESSION_ID",
  "startedAt": "$CRUSH_SESSION_STARTED_AT",
  "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "inputTokens": \${CRUSH_INPUT_TOKENS:-0},
  "outputTokens": \${CRUSH_OUTPUT_TOKENS:-0},
  "modelName": "\${CRUSH_MODEL:-unknown}"
}
EOF
)

  TIMESTAMP=$(date +%s)
  MESSAGE="\${TIMESTAMP}:\${SESSION_DATA}"
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$MODU_API_KEY" | sed 's/.*= //')

  curl -s -X POST "\${MODU_SERVER}/api/v1/sessions" \\
    -H "Content-Type: application/json" \\
    -H "X-API-Key: \${MODU_API_KEY}" \\
    -H "X-Timestamp: \${TIMESTAMP}" \\
    -H "X-Signature: \${SIGNATURE}" \\
    -d "\${SESSION_DATA}" > /dev/null 2>&1 &
fi
`;
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

export function getAllAdapters(): ToolAdapter[] {
  return [
    new ClaudeCodeAdapter(),
    new OpenCodeAdapter(),
    new GeminiAdapter(),
    new CodexAdapter(),
    new CrushAdapter(),
  ];
}

export function getAdapter(slug: string): ToolAdapter | undefined {
  return getAllAdapters().find((a) => a.slug === slug);
}
