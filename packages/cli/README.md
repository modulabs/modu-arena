# @suncreation/modu-arena

Track and rank your AI coding tool usage across **Claude Code**, **Claude Desktop**, **OpenCode**, **Gemini CLI**, **Codex CLI**, and **Crush**.

## Quick Start

### New Users

```bash
npx @suncreation/modu-arena register
```

Creates your account (username + password), generates an API key, and installs tracking hooks automatically.

### Existing Users

```bash
npx @suncreation/modu-arena login
```

Logs in with your username and password, generates a new API key, and reinstalls hooks.

### Alternative: Manual API Key Setup

```bash
npx @suncreation/modu-arena install --api-key <your-api-key>
```

## Commands

### `register`

Create a new account interactively.

```bash
npx @suncreation/modu-arena register
```

Prompts for username, password, and display name. Automatically installs hooks for all detected AI coding tools.

### `login`

Log in to an existing account interactively.

```bash
npx @suncreation/modu-arena login
```

Prompts for username and password. Regenerates your API key and reinstalls hooks.

### `install`

Set up tracking hooks with an existing API key.

```bash
npx @suncreation/modu-arena install --api-key modu_arena_xxxxxxxx_yyyyyyyy
```

### `submit`

Submit current project for AI-powered evaluation.

```bash
npx @suncreation/modu-arena submit
```

In Claude Code, prefer `/modu:submit` for a better experience.

### `rank`

View your usage stats.

```bash
npx @suncreation/modu-arena rank
```

Shows total tokens, sessions, tool breakdown, and 7/30-day trends.

### `status`

Check your current configuration and installed hooks.

```bash
npx @suncreation/modu-arena status
```

### `uninstall`

Remove all hooks and configuration.

```bash
npx @suncreation/modu-arena uninstall
```

## Supported Tools

| Tool | Detection | Hook Location | Registration |
|------|-----------|---------------|--------------|
| Claude Code | `~/.claude/` | `~/.claude/hooks/session-end.sh` | `~/.claude/settings.json` (`hooks.Stop`) |
| Claude Desktop | `~/Library/Application Support/Claude/` | Daemon-based sync | N/A |
| OpenCode | `~/.opencode/` | `~/.opencode/hooks/session-end.sh` | Hook file only |
| Gemini CLI | `~/.gemini/` | `~/.gemini/hooks/session-end.sh` | `~/.gemini/settings.json` (`hooks.SessionEnd`) |
| Codex CLI | `~/.codex/` | `~/.codex/hooks/session-end.sh` | Hook file only |
| Crush | `~/.crush/` | `~/.crush/hooks/session-end.sh` | Hook file only |

## Configuration

Config is stored in `~/.modu-arena.json`:

```json
{
  "apiKey": "modu_arena_xxxxxxxx_yyyyyyyy",
  "serverUrl": "https://arena.vibemakers.kr"
}
```

## How It Works

1. `register` or `login` creates/authenticates your account and sets up lightweight shell hooks
2. When a coding session ends, the hook sends token usage data to the Modu-Arena server
3. Data includes: input/output tokens, cache tokens, model name, and timing
4. All submissions are authenticated with HMAC-SHA256 signatures
5. View your stats via `rank` command or the web dashboard

## Security

- API keys are stored locally in `~/.modu-arena.json`
- All API requests use HMAC-SHA256 signature verification
- Session data is hashed server-side for integrity and deduplication
- No source code or project content is ever transmitted

## Requirements

- Node.js 20+
- One or more supported AI coding tools installed

## License

Copyleft
