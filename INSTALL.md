# Modu-Arena - AI Coding Agent Leaderboard

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql)
![License](https://img.shields.io/badge/License-Copyleft-green?style=flat-square)

A competitive leaderboard platform for tracking AI coding tool token usage across **Claude Code**, **Claude Desktop**, **OpenCode**, **Gemini CLI**, **Codex CLI**, and **Crush**. Track your sessions, compete with the community, and discover your coding style through Agentic Coding Analytics.

**Website**: [modu-arena.modulabs.co.kr](https://modu-arena.modulabs.co.kr)

---

## Quick Start: Modu-Arena CLI

Track your AI coding tool token usage with a single command.

### New Users — Register

```bash
npx @suncreation/modu-arena register
```

This will:
1. Create your account (username + password)
2. Generate an API key automatically
3. Set up token usage tracking for detected AI coding tools (Claude Code, Claude Desktop, OpenCode, Gemini CLI, Codex CLI, Crush)

### Existing Users — Login

```bash
npx @suncreation/modu-arena login
```

Logs in with your username and password, generates a new API key, and reinstalls hooks.

### Alternative: Manual API Key Setup

```bash
npx @suncreation/modu-arena install --api-key <your-api-key>
```

### Requirements

- **Node.js** 20.x or higher

---

## CLI Commands

```bash
npx @suncreation/modu-arena <command> [options]

Commands:
  register   Create a new account (interactive)
  login      Log in to an existing account (interactive)
  install    Set up hooks with an existing API key
  submit     Submit current project for AI evaluation
  rank       Show your current ranking
  status     Check daemon and API connection status
  uninstall  Remove token tracking configuration
```

### register - Create Account

```bash
npx @suncreation/modu-arena register
```

Interactive account creation. Sets up username, password, and automatically installs tracking hooks.

### login - Sign In

```bash
npx @suncreation/modu-arena login
```

Interactive login. Generates a new API key and reinstalls hooks.

### submit - Project Evaluation

```bash
npx @suncreation/modu-arena submit
```

Submits the current project for AI-powered evaluation. In Claude Code, prefer `/modu:submit`.

**How It Works**:
1. Uses `README.md` as the source of truth (sent as the evaluation description)
2. If `README.md` contains `## Local Validation` with a `bash title="test"` block, runs it locally to compute `localScore`
3. Sends a README-only payload to the evaluation API (no code content)
4. Remote evaluation scores based on README and returns backendScore/penaltyScore + feedback
5. Results appear on your Modu-Arena dashboard profile

### rank - Check Your Ranking

```bash
npx @suncreation/modu-arena rank
```

### status - Connection Check

```bash
npx @suncreation/modu-arena status
```

### uninstall - Remove Tracking

```bash
npx @suncreation/modu-arena uninstall
```

---

## Collected Metrics

| Metric           | Description                         | Collected |
| ---------------- | ----------------------------------- | --------- |
| **Token Usage**  | Input/Output tokens, Cache tokens   | O         |
| **Tool Usage**   | Read, Edit, Bash usage counts       | O         |
| **Model Usage**  | Opus, Sonnet, Haiku breakdown       | O         |
| **Code Metrics** | Added/deleted lines, modified files | O         |
| **Session Info** | Duration, turn count, timestamps    | O         |
| **Code Content** | Actual code content                 | X         |
| **File Paths**   | File paths within project           | X         |
| **Prompts**      | Conversation content with Claude    | X         |

**Privacy Guarantee**: Collected data contains **only numerical metrics**; code content or conversation details are never transmitted.

---

## Supported AI Coding Tools

| Tool             | ID              |
| ---------------- | --------------- |
| Claude Code      | `claude-code`   |
| Claude Desktop   | `claude-desktop`|
| OpenCode         | `opencode`      |
| Gemini CLI       | `gemini`        |
| Codex CLI        | `codex`         |
| Crush            | `crush`         |

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Commit: `git commit -m 'feat: add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open Pull Request

For full development setup and architecture details, see [README.md](README.md).

---

## License

This project is licensed under the **Copyleft License (COPYLEFT-3.0)** - see the [LICENSE](LICENSE) file for details.

---

**Modu-Arena**: A product by [MODULABS](https://modulabs.co.kr) (모두의연구소).

> **"Infinite Possibilism - AI for Everyone"**
