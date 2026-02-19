# Modu-Arena - AI Coding Agent Leaderboard

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql)
![License](https://img.shields.io/badge/License-Copyleft-green?style=flat-square)

A competitive leaderboard platform for tracking AI coding tool token usage across **Claude Code**, **Claude Desktop**, **OpenCode**, **Gemini CLI**, **Codex CLI**, and **Crush**. Track your sessions, compete with the community, and discover your coding style through Agentic Coding Analytics.

**Website**: [modu-arena.modulabs.co.kr](https://modu-arena.modulabs.co.kr)

---

## Quick Start: Install Modu-Arena CLI

Track your AI coding tool token usage with a single command.

### Installation via npx (Recommended)

```bash
# Install and configure in one step
npx @suncreation/modu-arena install --api-key <your-api-key>
```

This will:
1. Set up token usage tracking for your AI coding tools (Claude Code, Claude Desktop, OpenCode, Gemini CLI, Codex CLI, Crush)
2. Store your API key securely
3. Begin automatic session tracking

### Alternative: Global Install

```bash
# Install globally
npm install -g @suncreation/modu-arena

# Then run commands directly
modu-arena install --api-key <your-api-key>
modu-arena submit   # Optional: project evaluation
```

### Requirements

- **Node.js** 20.x or higher

### Get Your API Key

1. Visit [modu-arena.modulabs.co.kr](https://modu-arena.modulabs.co.kr)
2. Sign in with your GitHub account
3. Go to **Dashboard** > **Settings**
4. Generate your API key

---

## CLI Commands

```bash
npx @suncreation/modu-arena <command> [options]

Commands:
  install    Install and configure token tracking
  submit     Submit current project for AI evaluation
  rank       Show your current ranking
  status     Check daemon and API connection status
  uninstall  Remove token tracking configuration
```

### install - Set Up Token Tracking

```bash
npx @suncreation/modu-arena install --api-key <your-api-key>
```

Configures automatic token usage tracking for supported AI coding tools.

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
