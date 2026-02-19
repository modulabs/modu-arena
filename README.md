# Modu-Arena - AI Coding Agent Leaderboard

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker-336791?style=flat-square&logo=postgresql)
![Auth](https://img.shields.io/badge/Auth-Custom_JWT-orange?style=flat-square)
![License](https://img.shields.io/badge/License-Copyleft-green?style=flat-square)

A competitive leaderboard platform for tracking AI coding tool token usage across Claude Code, Claude Desktop, OpenCode, Gemini CLI, Codex CLI, and Crush. Track your sessions, compete with the community, and discover your coding style through Agentic Coding Analytics.

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

---

## 🚀 Quick Start: Install Modu-Arena CLI

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

---

## 🎮 Modu-Arena CLI Commands

### Command Overview

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

This CLI command is optional. In Claude Code, prefer `/modu:submit`.

Submits the current project for AI-powered evaluation. The evaluation results are sent to the Modu-Arena dashboard.

**Recommended (Claude Code)**:

- In Claude Code chat, run: `/modu:submit`
- It will first show the exact local test command it plans to run
- Re-run with: `/modu:submit --run` to execute local validation and submit a README-only payload for remote scoring

**How It Works**:
1. Uses `README.md` as the source of truth (sent as the evaluation description)
2. If `README.md` contains `## Local Validation` with a `bash title="test"` block, runs it locally to compute `localScore`
3. Sends a README-only payload to the evaluation API (no code content)
4. Remote evaluation scores based on README and returns backendScore/penaltyScore + feedback
5. Results appear on your Modu-Arena dashboard profile

---

## 📊 Collected Metrics

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

**Guarantee**: Collected data contains **only numerical metrics**; code content or conversation details are never transmitted.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Development](#development)
- [Deployment](#deployment)
- [Security](#security)
- [Performance & Scalability](#performance--scalability)

## Features

### Ranking System

- **Multi-Period Rankings**: Daily, weekly, monthly, and all-time leaderboards
- **Composite Score Calculation**: Weighted algorithm considering multiple factors
  - Token Usage (40%): Total input + output tokens
  - Efficiency (25%): Output/input ratio optimization
  - Session Count (20%): Number of coding sessions
  - Streak (15%): Consecutive active days

### Vibe Coding Analytics

Discover your own coding style through AI analysis:

- **Explorer**: Focus on code exploration and system understanding
- **Creator**: Focus on creating new features and code
- **Refactorer**: Excellence in improving existing code
- **Automator**: Task automation and workflow orchestration

### Dashboard Features

- Real-time token usage tracking
- Activity heatmap (GitHub style)
- Model usage analysis
- Hourly activity patterns
- Weekly coding patterns
- Tool usage statistics
- Privacy mode for anonymous participation

### Multi-language Support

Full support for 4 languages:

- English (en)
- Korean (ko)
- Japanese (ja)
- Chinese (zh)

## Architecture

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/         # Multi-language routes (next-intl)
│   │   │   ├── api/          # API routes
│   │   │   │   ├── v1/       # Public CLI API (v1)
│   │   │   │   │   ├── sessions/ # Session records
│   │   │   │   │   ├── rank/     # User ranking
│   │   │   │   │   ├── status/   # API status check
│   │   │   │   │   └── verify/   # API key verification
│   │   │   │   ├── me/       # User dashboard API
│   │   │   │   ├── leaderboard/ # Public leaderboard
│   │   │   │   ├── cron/     # Scheduled tasks
│   │   │   │   │   ├── calculate-rankings/ # Ranking calculation
│   │   │   │   │   └── cleanup-data/       # Data cleanup
│   │   │   │   └── auth/     # CLI authentication
│   │   │   ├── dashboard/    # User dashboard pages
│   │   │   └── users/        # Public user profiles
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Global styles
│   ├── cache/                 # Cache layer
│   │   ├── config.ts         # Cache TTL settings
│   │   └── keys.ts           # Cache key generators
│   ├── components/            # React components
│   │   ├── ui/               # Base UI components
│   │   ├── layout/           # Layout components
│   │   ├── leaderboard/      # Leaderboard components
│   │   ├── dashboard/        # Dashboard components
│   │   └── profile/          # Profile components
│   ├── db/                    # Database layer
│   │   ├── schema.ts         # Drizzle ORM schema
│   │   ├── index.ts          # Database connection
│   │   ├── rls.ts            # Row-level security
│   │   └── seed.ts           # Seed data script
│   ├── lib/                   # Utility functions
│   │   ├── auth.ts           # API key & HMAC authentication
│   │   ├── audit.ts          # Security audit logging
│   │   ├── cache.ts          # Redis cache utilities
│   │   ├── rate-limiter.ts   # Rate limiting
│   │   ├── score.ts          # Score calculation
│   │   └── api-response.ts   # Response helpers
│   └── i18n/                  # Internationalization
├── messages/                   # Translation files
└── drizzle/                   # Database migrations
```

### System Architecture

![System Architecture](docs/system-architecture.png)

## Tech Stack

| Category   | Technology        | Purpose                          |
| ---------- | ----------------- | -------------------------------- |
| Framework  | Next.js 16        | Full-stack React framework       |
| Language   | TypeScript 5      | Type-safe development            |
| Database   | PostgreSQL        | Docker container database        |
| ORM        | Drizzle ORM       | Type-safe database queries       |
| Auth       | Custom JWT        | Email OTP signup + password login |
| Proxy      | Caddy             | HTTPS reverse proxy              |
| Process    | PM2               | Node.js process manager          |
| Email      | Gmail REST API    | OTP verification emails          |
| UI         | Tailwind CSS 4    | Styling                          |
| Components | Radix UI          | Accessible UI primitives         |
| Charts     | Recharts          | Data visualization               |
| i18n       | next-intl         | Internationalization             |
| Validation | Zod               | Runtime type validation          |

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **Bun** 1.x (recommended) or npm/yarn
- **PostgreSQL** (Docker container or standalone)
- **Caddy** for HTTPS reverse proxy (production)
- **PM2** for Node.js process management (production)

### Installation

1. **Clone Repository**

```bash
git clone https://github.com/modulabs/modu-arena.git
cd modu-arena/apps/web
```

2. **Install Dependencies**

```bash
bun install
```

3. **Set Up Environment Variables**

```bash
cp .env.example .env.local
# Open .env.local and enter your credentials
```

4. **Set Up Database**

```bash
# Generate migration
bun run db:generate

# Push schema to database
bun run db:push

# (Optional) Seed sample data
bun run db:seed
```

5. **Start Development Server**

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Environment Variables

### Required Variables

| Variable                            | Description                | Example                                          |
| ----------------------------------- | -------------------------- | ------------------------------------------------ |
| `DATABASE_URL`                      | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/dbname` |
| `JWT_SECRET`                        | JWT signing secret           | `your-secure-random-string`                    |

### Optional Variables

| Variable            | Description                            | Default                |
| ------------------- | -------------------------------------- | ---------------------- |
| `GMAIL_CLIENT_ID`      | Gmail OAuth2 client ID         | Required for OTP emails  |
| `GMAIL_CLIENT_SECRET`  | Gmail OAuth2 client secret     | Required for OTP emails  |
| `GMAIL_REFRESH_TOKEN`  | Gmail OAuth2 refresh token     | Required for OTP emails  |
| `GMAIL_USER`           | Gmail sender email address     | Required for OTP emails  |
| `CRON_SECRET`          | Cron job authentication secret | Required in production   |

### .env.local Example

```env
# Database (required)
DATABASE_URL="postgresql://modu:password@localhost:5432/modu_rank"

# JWT Authentication (required)
JWT_SECRET="your-secure-random-string"

# Gmail OAuth2 (required for email OTP)
GMAIL_CLIENT_ID="your-client-id"
GMAIL_CLIENT_SECRET="your-client-secret"
GMAIL_REFRESH_TOKEN="your-refresh-token"
GMAIL_USER="your-email@gmail.com"

# Cron Authentication (required in production)
CRON_SECRET="your-secure-random-string"
```

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ sessions : has
    users ||--o{ token_usage : has
    users ||--o{ daily_user_stats : has
    users ||--o{ rankings : has
    users ||--o{ project_evaluations : has
    users ||--o| user_stats : has
    users ||--o{ security_audit_log : logs
    users ||--o{ email_verifications : verifies
    tool_types ||--o{ sessions : identifies
    tool_types ||--o{ token_usage : identifies
    sessions ||--o{ token_usage : has

    users {
        uuid id PK
        varchar username UK
        varchar password_hash
        varchar github_id UK
        varchar github_username
        text github_avatar_url
        varchar display_name
        varchar email
        varchar api_key_hash
        varchar api_key_prefix
        varchar user_salt
        boolean privacy_mode
        integer successful_projects_count
        timestamp created_at
        timestamp updated_at
    }

    email_verifications {
        uuid id PK
        varchar email
        varchar code
        timestamp expires_at
        boolean used
        timestamp created_at
    }

    tool_types {
        varchar id PK
        varchar name
        varchar display_name
        text icon_url
        varchar color
        boolean is_active
        integer sort_order
        timestamp created_at
    }

    sessions {
        uuid id PK
        uuid user_id FK
        varchar tool_type_id FK
        varchar session_hash UK
        varchar anonymous_project_id
        timestamp started_at
        timestamp ended_at
        integer duration_seconds
        varchar model_name
        integer turn_count
        jsonb tool_usage
        jsonb code_metrics
        timestamp created_at
    }

    token_usage {
        uuid id PK
        uuid session_id FK
        uuid user_id FK
        varchar tool_type_id FK
        bigint input_tokens
        bigint output_tokens
        bigint cache_creation_tokens
        bigint cache_read_tokens
        timestamp recorded_at
    }

    project_evaluations {
        uuid id PK
        uuid user_id FK
        varchar project_path_hash
        varchar project_name
        integer local_score
        integer backend_score
        integer penalty_score
        integer final_score
        integer cumulative_score_after
        varchar llm_model
        varchar llm_provider
        boolean passed
        text feedback
        timestamp evaluated_at
    }

    user_stats {
        uuid user_id PK_FK
        bigint total_input_tokens
        bigint total_output_tokens
        bigint total_cache_tokens
        bigint total_all_tokens
        jsonb tokens_by_tool
        integer total_sessions
        jsonb sessions_by_tool
        integer successful_projects_count
        integer total_evaluations
        timestamp last_activity_at
        timestamp updated_at
    }

    daily_user_stats {
        uuid id PK
        uuid user_id FK
        date stat_date
        bigint input_tokens
        bigint output_tokens
        bigint cache_tokens
        bigint total_tokens
        integer session_count
        jsonb by_tool
        timestamp created_at
    }

    rankings {
        uuid id PK
        uuid user_id FK
        varchar period_type
        date period_start
        integer rank_position
        bigint total_tokens
        decimal composite_score
        integer session_count
        decimal efficiency_score
        timestamp updated_at
    }

    security_audit_log {
        uuid id PK
        uuid user_id FK
        varchar event_type
        varchar ip_address
        text user_agent
        jsonb details
        timestamp created_at
    }
```

### Table Overview

| Table                  | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `users`                | User accounts with email/password authentication |
| `email_verifications`  | OTP codes for email verification during signup   |
| `tool_types`           | Registry of supported AI coding tools           |
| `sessions`             | AI coding tool session records with metadata    |
| `token_usage`          | Normalized token consumption per session        |
| `project_evaluations`  | LLM-based project evaluation results            |
| `user_stats`           | Aggregated user statistics for dashboard        |
| `daily_user_stats`     | Daily aggregates for historical charts          |
| `rankings`             | Calculated rankings for each period             |
| `security_audit_log`   | Security event audit trail                      |

## API Reference

### API v1 (CLI Integration)

Base URL: `/api/v1`

#### API Status Check

```http
GET /api/v1/status
```

Response:

```json
{
  "status": "operational",
  "version": "1.0.0",
  "timestamp": "2025-01-11T00:00:00.000Z",
  "endpoints": {
    "sessions": "/api/v1/sessions",
    "rank": "/api/v1/rank",
    "status": "/api/v1/status"
  }
}
```

#### API Key Verification

```http
GET /api/v1/verify
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Response:

```json
{
  "valid": true,
  "username": "developer",
  "apiKeyPrefix": "modu_arena_xxxxxxxx",
  "privacyMode": false,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

#### Session Record

```http
POST /api/v1/sessions
Content-Type: application/json
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
X-Timestamp: 1704067200
X-Signature: <HMAC-SHA256 signature>
```

Request body:

```json
{
  "toolType": "claude-code",
  "sessionId": "sess_abc123",
  "startedAt": "2026-02-11T09:00:00.000Z",
  "endedAt": "2026-02-11T09:30:00.000Z",
  "inputTokens": 15000,
  "outputTokens": 8000,
  "cacheCreationTokens": 2000,
  "cacheReadTokens": 5000,
  "modelName": "claude-sonnet-4-20250514",
  "anonymousProjectId": "proj_abc123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toolType` | string | Yes | One of: `claude-code`, `claude-desktop`, `opencode`, `gemini`, `codex`, `crush` |
| `sessionId` | string | Yes | Unique session identifier (replaces legacy `sessionHash`) |
| `startedAt` | string | No | ISO 8601 session start time |
| `endedAt` | string | Yes | ISO 8601 session end time |
| `inputTokens` | number | Yes | Input prompt tokens |
| `outputTokens` | number | Yes | Output response tokens |
| `cacheCreationTokens` | number | No | Cache write tokens (default: 0) |
| `cacheReadTokens` | number | No | Cache read tokens (default: 0) |
| `modelName` | string | No | AI model used |
| `anonymousProjectId` | string | No | Anonymous project identifier |

Response:

```json
{
  "success": true,
  "sessionId": "uuid",
  "message": "Session recorded successfully"
}
```

#### User Ranking Query

```http
GET /api/v1/rank
X-API-Key: modu_arena_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Response:

```json
{
  "username": "developer",
  "rankings": {
    "daily": {
      "position": 5,
      "compositeScore": 450.25,
      "totalParticipants": 100
    },
    "weekly": {
      "position": 12,
      "compositeScore": 380.5,
      "totalParticipants": 250
    },
    "monthly": null,
    "allTime": {
      "position": 8,
      "compositeScore": 520.75,
      "totalParticipants": 500
    }
  },
  "stats": {
    "totalTokens": 1500000,
    "totalSessions": 45,
    "inputTokens": 1200000,
    "outputTokens": 300000
  },
  "lastUpdated": "2025-01-11T00:00:00.000Z"
}
```

### Public API

#### Leaderboard Query

```http
GET /api/leaderboard?period=weekly&limit=50&offset=0
```

Query parameters:
| Parameter | Type | Default | Description |
| --------- | ------ | ------- | ------------------------------------------------ |
| `period` | string | `weekly`| `daily`, `weekly`, `monthly`, `all_time` |
| `limit` | number | `50` | Results per page (1-100) |
| `offset` | number | `0` | Pagination offset |

Response:

```json
{
  "data": [
    {
      "rank": 1,
      "userId": "uuid",
      "username": "top_coder",
      "avatarUrl": "https://...",
      "totalTokens": 5000000,
      "compositeScore": 850.5,
      "sessionCount": 120,
      "efficiencyScore": 0.85,
      "isPrivate": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 500,
    "totalPages": 10,
    "hasMore": true
  }
}
```

### Authentication Headers

| Header        | Description                | Required |
| ------------- | -------------------------- | -------- |
| `X-API-Key`   | API key for authentication | Yes      |
| `X-Timestamp` | Unix timestamp in seconds  | For POST |
| `X-Signature` | HMAC-SHA256 signature      | For POST |

### HMAC Signature Calculation

```
message = timestamp + ":" + request_body
signature = HMAC-SHA256(api_key, message)
```

Signature verification conditions:

- Maximum timestamp validity: 5 minutes
- Constant-time comparison for timing attack prevention

## Development

### Available Scripts

```bash
# Development
bun run dev          # Start dev server with Turbopack

# Build
bun run build        # Production build
bun run start        # Start production server

# Database
bun run db:generate  # Generate Drizzle migration
bun run db:migrate   # Run migration
bun run db:push      # Direct schema push
bun run db:studio    # Open Drizzle Studio GUI
bun run db:seed      # Seed sample data

# Quality
bun run lint         # Run Biome linter
bun run lint:fix     # Fix lint issues
bun run format       # Code formatting
bun run type-check   # TypeScript type checking
```

### Code Style

This project uses **Biome** for linting and formatting:

```bash
# Check issues
bun run lint

# Auto-fix
bun run lint:fix

# Format code
bun run format
```

### Local Testing

1. **API Testing with curl**

```bash
# API status check
curl http://localhost:3000/api/v1/status

# API key verification
curl -H "X-API-Key: your_api_key" http://localhost:3000/api/v1/verify
```

2. **Database Studio**

```bash
bun run db:studio
```

Drizzle Studio opens at [https://local.drizzle.studio](https://local.drizzle.studio).

## Deployment

### Production Deployment

1. **Server Setup**
   - PostgreSQL running in Docker container
   - Caddy configured as HTTPS reverse proxy
   - PM2 managing Node.js processes

2. **Deploy via SCP**

   ```bash
   # Copy files to server
   scp -r apps/web/ user@server:/path/to/modu-arena/apps/web/

   # On server: build and restart
   cd /path/to/modu-arena/apps/web
   npx next build
   pm2 restart modu-arena-web
   ```

3. **Cron Jobs**

   Configure automated tasks via crontab or PM2 cron:

   - **Ranking Calculation**: Daily at midnight UTC — `GET /api/cron/calculate-rankings`
   - **Data Cleanup**: Daily at 2 AM UTC — `GET /api/cron/cleanup-data`

## Security

### Authentication

- **Web Dashboard**: Custom JWT (email OTP signup + password login)
- **CLI API**: API Key + HMAC-SHA256 signature

### API Security Features

| Feature                  | Implementation                        |
| ------------------------ | ------------------------------------- |
| API Key Hashing          | SHA-256 (stores hash only)            |
| Request Signing          | HMAC-SHA256 with timestamp            |
| Rate Limiting            | 100 req/min (Redis-based distributed) |
| Timing Attack Prevention | Constant-time comparison              |
| Replay Attack Prevention | 5-minute timestamp validity window    |
| Session Integrity        | Server-side hash verification         |
| Anomaly Detection        | 10x token threshold flagging          |
| Audit Logging            | All security events logged            |

### Rate Limits

| Endpoint Type        | Limit   | Window |
| -------------------- | ------- | ------ |
| Normal API           | 100 req | 1 min  |
| Authentication       | 10 req  | 1 min  |
| Sensitive Operations | 30 req  | 1 min  |
| Public Read          | 200 req | 1 min  |

### Security Event Types

Events tracked by audit logs:

- `api_key_generated` / `api_key_regenerated` / `api_key_revoked`
- `api_key_validated` / `api_key_invalid`
- `hmac_signature_invalid` / `hmac_timestamp_expired`
- `rate_limit_exceeded`
- `session_created` / `session_duplicate`
- `suspicious_activity`
- `privacy_mode_changed`

## Performance & Scalability

### Caching Strategy

Optimize API response times with server-side caching.

#### Cache TTL Settings

| Data Type            | TTL             | Description                          |
| -------------------- | --------------- | ------------------------------------ |
| Daily Leaderboard    | 23 hours        | Valid until next ranking calculation |
| Weekly Leaderboard   | 6 days 23 hours | Valid until next ranking calculation |
| Monthly Leaderboard  | 29 days         | Valid until next ranking calculation |
| All-Time Leaderboard | 6 days 23 hours | Synchronized with weekly leaderboard |
| User Rank            | 1 hour          | Individual user data                 |
| User Stats           | 30 minutes      | Detailed statistics for dashboard    |
| Global Stats         | 15 minutes      | Global aggregate data                |

#### Cache Invalidation

Automatically invalidates related caches after ranking calculation cron job completes:

```typescript
// Execute after ranking calculation
await delPattern(`modu-arena:leaderboard:daily:*`);
await delPattern(`modu-arena:leaderboard:weekly:*`);
await delPattern(`modu-arena:leaderboard:monthly:*`);
await delPattern(`modu-arena:leaderboard:all_time:*`);
```

#### Graceful Degradation

When Redis connection fails, bypasses caching and queries database directly to prevent service disruption.

### Data Retention Policy

Automatic data cleanup policies to manage database size and maintain performance.

#### Retention Periods

| Table              | Retention | Cleanup Target                     |
| ------------------ | --------- | ---------------------------------- |
| `token_usage`      | 90 days   | Records older than 90 days         |
| `daily_aggregates` | 90 days   | Aggregate data older than 90 days  |
| `rankings` (daily) | 30 days   | Daily rankings older than 30 days  |
| `sessions`         | 90 days   | Session records older than 90 days |

#### Cleanup Schedule

- **Execution Time**: Daily at 2 AM UTC
- **Batch Processing**: Processes in batches of 100 to distribute database load
- **Logging**: Logs deleted record count and execution time

#### Cleanup Logic Example

```typescript
// Cleanup token_usage older than 90 days
while (true) {
  const idsToDelete = await pooledDb
    .select({ id: tokenUsage.id })
    .from(tokenUsage)
    .where(lt(tokenUsage.recordedAt, cutoffDate))
    .limit(100);

  if (idsToDelete.length === 0) break;

  for (const row of idsToDelete) {
    await pooledDb.delete(tokenUsage).where(eq(tokenUsage.id, row.id));
  }
}
```

### Database Optimization

#### Batch Processing

Optimize performance with batch processing for large data insertions/updates:

- **Batch Size**: 100 records
- **Applied To**: Ranking updates, daily aggregate updates
- **ORM Optimization**: Leverage PostgreSQL `INSERT ... ON CONFLICT`

#### Connection Pooling

Implements connection pooling using Drizzle ORM with PostgreSQL:

```typescript
// Database connection with Drizzle ORM
export const db = drizzle(pool, { schema });
```

### Performance Monitoring

#### Key Metrics

- API response times (cache Hit vs Miss)
- Database query execution times
- Cron job execution times and processed record counts
- Redis cache hit rates

#### Optimization Opportunities

- Identify endpoints with low cache hit rates
- Optimize slow queries
- Review index additions
- Consider partitioning strategies (at high traffic volumes)

## Composite Score Algorithm

```
Score = (Token * 0.40) + (Efficiency * 0.25) + (Session * 0.20) + (Streak * 0.15)

Calculations:
- Token = min(1, log10(totalTokens + 1) / 10)
- Efficiency = min(outputTokens / inputTokens, 2) / 2
- Session = min(1, log10(sessions + 1) / 3)
- Streak = min(streak, 30) / 30

Final Score = Weighted Sum * 1000
```

### Score Tiers

| Tier     | Score Range |
| -------- | ----------- |
| Diamond  | 800+        |
| Platinum | 600-799     |
| Gold     | 400-599     |
| Silver   | 200-399     |
| Bronze   | 0-199       |

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run linting: `bun run lint:fix`
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open Pull Request

## License

This project is licensed under the **Copyleft License (COPYLEFT-3.0)** - see the [LICENSE](../../LICENSE) file for details.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=modulabs/modu-arena&type=date&legend=top-left)](https://www.star-history.com/#modulabs/modu-arena&type=date&legend=top-left)

---

## 🙏 Made with ❤️ by Modu-Arena Team

**Last Updated:** 2026-02-15
**Modu-Arena**: A product by MODULABS (모두의연구소).

> **"Infinite Possibilism - AI for Everyone"**
