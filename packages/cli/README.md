# @suncreation/modu-arena

Track and rank your AI coding tool usage across **Claude Code**, **OpenCode**, **Gemini CLI**, **Codex CLI**, and **Crush**.

## Quick Start

```bash
npx @suncreation/modu-arena install --api-key <your-api-key>
```

Get your API key from the [Modu-Arena dashboard](https://your-server.com).

## Commands

### `install`

Set up tracking hooks for all detected AI coding tools.

```bash
npx @suncreation/modu-arena install --api-key modu_arena_xxxxxxxx_yyyyyyyy
```

This will:
- Save your API key to `~/.modu-arena.json`
- Detect installed AI coding tools
- Install session-end hooks for each detected tool

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

| Tool | Detection | Hook Location |
|------|-----------|---------------|
| Claude Code | `~/.claude/` | `~/.claude/hooks/session-end.sh` |
| OpenCode | `~/.opencode/` | `~/.opencode/hooks/session-end.sh` |
| Gemini CLI | `~/.gemini/` | `~/.gemini/hooks/session-end.sh` |
| Codex CLI | `~/.codex/` | `~/.codex/hooks/session-end.sh` |
| Crush | `~/.crush/` | `~/.crush/hooks/session-end.sh` |

## Configuration

Config is stored in `~/.modu-arena.json`:

```json
{
  "apiKey": "modu_arena_xxxxxxxx_yyyyyyyy",
  "serverUrl": "https://your-server.com"
}
```

### Custom Server URL

```bash
MODU_ARENA_API_URL=https://your-server.com npx @suncreation/modu-arena install --api-key <key>
```

## How It Works

1. **Install** sets up lightweight shell hooks in each tool's config directory
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

MIT
