/** Base URL for the Modu-Arena API server */
export const API_BASE_URL =
  process.env.MODU_ARENA_API_URL ?? 'http://backend.vibemakers.kr:23010';

/** API key prefix used for all keys */
export const API_KEY_PREFIX = 'modu_arena_';

/** Supported AI coding tools */
export const TOOL_TYPES = [
  'claude-code',
  'claude-desktop',
  'opencode',
  'gemini',
  'codex',
  'crush',
] as const;

export type ToolType = (typeof TOOL_TYPES)[number];

/** Display names for each tool */
export const TOOL_DISPLAY_NAMES: Record<ToolType, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
  codex: 'Codex CLI',
  crush: 'Crush',
};

/** Config file name stored in user home directory */
export const CONFIG_FILE_NAME = '.modu-arena.json';

/** Daemon state file for tracking synced sessions */
export const DAEMON_STATE_FILE = '.modu-arena-daemon.json';

/** Minimum interval between sessions (seconds) */
export const MIN_SESSION_INTERVAL_SEC = 60;

/** HMAC timestamp tolerance (seconds) */
export const HMAC_TIMESTAMP_TOLERANCE_SEC = 300;

/** Daemon sync interval in seconds */
export const DAEMON_SYNC_INTERVAL_SEC = 120; // 2 minutes
