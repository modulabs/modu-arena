# Modu-Arena API Specification

> **Version**: 1.1.0
> **Base URL**: `http://localhost:8989`
> **Last Updated**: 2026-02-15

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [CLI-Facing Endpoints](#2-cli-facing-endpoints)
3. [Dashboard-Facing Endpoints](#3-dashboard-facing-endpoints)
4. [Data Contracts (Schemas)](#4-data-contracts-schemas)
5. [Error Responses](#5-error-responses)
6. [Rate Limiting](#6-rate-limiting)
7. [Enums & Constants](#7-enums--constants)
8. [Security Algorithms](#8-security-algorithms)

---

## 1. Authentication

### 1.1 API Key + HMAC (CLI → Server)

Used by: `POST /api/v1/sessions`, `POST /api/v1/sessions/batch`

**Headers:**

| Header | Type | Required | Description |
|---|---|---|---|
| `X-API-Key` | string | ✅ | Full API key (`modu_arena_{prefix}_{secret}`) |
| `X-Timestamp` | string | ✅ | Unix timestamp in seconds (string) |
| `X-Signature` | string | ✅ | HMAC-SHA256 hex signature |
| `Content-Type` | string | ✅ | `application/json` |

**Timestamp Validation**: Must be within ±300 seconds (5 minutes) of server time.

**HMAC Signature Computation:**

```
message = "{timestamp}:{requestBodyJsonString}"
signature = HMAC-SHA256(apiKey, message).hexDigest()
```

Example (TypeScript):
```typescript
import { createHmac } from 'crypto';

const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify(payload);
const message = `${timestamp}:${body}`;
const signature = createHmac('sha256', apiKey)
  .update(message)
  .digest('hex');
```

### 1.2 API Key Only (CLI → Server, Read-only)

Used by: `GET /api/v1/rank`

**Headers:**

| Header | Type | Required | Description |
|---|---|---|---|
| `X-API-Key` | string | ✅ | Full API key |

No HMAC required for read-only endpoints.

### 1.3 Clerk Session (Dashboard → Server)

Used by: `GET /api/me`, `GET /api/me/stats`, `POST /api/v1/evaluate`

Authentication is handled by Clerk middleware via session cookies. No manual headers needed — the browser sends cookies automatically.

### 1.4 Public (No Auth)

Used by: `GET /api/leaderboard`, `GET /api/users/[username]`

IP-based rate limiting only.

### 1.5 API Key Format

```
modu_arena_{prefix}_{secret}
```

- **prefix**: 8 random alphanumeric characters (stored in DB for lookup)
- **secret**: 32 random alphanumeric characters
- Total format length: `modu_arena_` (11) + prefix (8) + `_` (1) + secret (32) = 52 characters

The key is hashed with scrypt before storage. Only the prefix is stored in plaintext for lookup.

---

## 2. CLI-Facing Endpoints

### 2.1 POST /api/v1/sessions

Submit a single coding session.

**Auth**: API Key + HMAC

**Request Body:**

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
  "codeMetrics": {
    "filesChanged": 5,
    "linesAdded": 120,
    "linesRemoved": 30
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `toolType` | string | ✅ | One of the registered tool slugs (see [Enums](#7-enums--constants)) |
| `sessionId` | string | ✅ | Client-generated unique session identifier |
| `startedAt` | string (ISO 8601) | ✅ | Session start timestamp |
| `endedAt` | string (ISO 8601) | ✅ | Session end timestamp |
| `inputTokens` | integer | ✅ | Input tokens consumed (≥ 0) |
| `outputTokens` | integer | ✅ | Output tokens produced (≥ 0) |
| `cacheCreationTokens` | integer | ❌ | Cache creation tokens (default: 0) |
| `cacheReadTokens` | integer | ❌ | Cache read tokens (default: 0) |
| `modelName` | string | ❌ | Model identifier (e.g., `claude-sonnet-4-20250514`) |
| `codeMetrics` | object | ❌ | Optional code change metrics (JSONB) |

**Validation Rules:**
- `inputTokens + outputTokens` must be > 0
- `endedAt` must be after `startedAt`
- Session duration must be ≥ 1 minute apart from last session (anti-spam)
- Anomaly detection: rejects if tokens > 10× user's rolling average

**Success Response (201):**

```json
{
  "success": true,
  "session": {
    "id": "uuid-here",
    "sessionHash": "sha256-hex-string",
    "totalTokens": 30000,
    "toolType": "claude-code"
  }
}
```

### 2.2 POST /api/v1/sessions/batch

Submit multiple sessions at once (historical sync).

**Auth**: API Key + HMAC

**Request Body:**

```json
{
  "sessions": [
    {
      "toolType": "claude-code",
      "sessionId": "sess_001",
      "startedAt": "2026-02-10T09:00:00.000Z",
      "endedAt": "2026-02-10T09:30:00.000Z",
      "inputTokens": 10000,
      "outputTokens": 5000,
      "cacheCreationTokens": 0,
      "cacheReadTokens": 0,
      "modelName": "claude-sonnet-4-20250514",
      "codeMetrics": null
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sessions` | array | ✅ | Array of session objects (1–100 items) |

Each session object follows the same schema as [POST /api/v1/sessions](#21-post-apiv1sessions).

**Key Differences from Single Endpoint:**
- No ±5 minute timestamp constraint (allows historical data sync)
- 5-phase pipeline: hash computation → duplicate check → bulk insert sessions → bulk insert token_usage → aggregate daily stats
- Duplicates are silently skipped (by `sessionHash`)

**Success Response (201):**

```json
{
  "success": true,
  "processed": 15,
  "duplicatesSkipped": 2,
  "sessions": [
    {
      "id": "uuid-here",
      "sessionHash": "sha256-hex-string",
      "totalTokens": 15000,
      "toolType": "claude-code"
    }
  ]
}
```

### 2.3 GET /api/v1/rank

Get current user's ranking and stats.

**Auth**: API Key only (no HMAC)

**Request**: No body. No query parameters.

**Success Response (200):**

```json
{
  "success": true,
  "rank": {
    "userId": "user_xxx",
    "username": "devuser",
    "totalTokens": 1250000,
    "totalSessions": 87,
    "successfulProjectsCount": 3,
    "toolBreakdown": {
      "claude-code": { "tokens": 800000, "sessions": 50 },
      "opencode": { "tokens": 450000, "sessions": 37 }
    },
    "last7Days": {
      "tokens": 180000,
      "sessions": 12
    },
    "last30Days": {
      "tokens": 650000,
      "sessions": 45
    }
  }
}
```

---

## 3. Dashboard-Facing Endpoints

### 3.1 GET /api/me

Get current authenticated user info. Auto-creates user record on first visit and generates API key.

**Auth**: Clerk session

**Success Response (200) — Existing User:**

```json
{
  "user": {
    "id": "user_xxx",
    "clerkId": "clerk_xxx",
    "username": "devuser",
    "email": "dev@example.com",
    "displayName": "Dev User",
    "avatarUrl": "https://...",
    "privacyMode": false,
    "createdAt": "2026-01-15T00:00:00.000Z"
  }
}
```

**Success Response (201) — New User (includes API key, shown ONCE):**

```json
{
  "user": {
    "id": "user_xxx",
    "clerkId": "clerk_xxx",
    "username": "devuser",
    "email": "dev@example.com",
    "displayName": "Dev User",
    "avatarUrl": "https://...",
    "privacyMode": false,
    "createdAt": "2026-02-11T00:00:00.000Z"
  },
   "apiKey": "modu_arena_AbCdEfGh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "isNewUser": true
}
```

> ⚠️ `apiKey` is returned **only once** at creation. It cannot be retrieved again.

### 3.2 GET /api/me/stats

Get detailed stats for current user.

**Auth**: Clerk session

**Success Response (200):**

```json
{
  "stats": {
    "totalTokens": 1250000,
    "totalSessions": 87,
    "totalCost": 42.50,
    "toolBreakdown": {
      "claude-code": {
        "tokens": 800000,
        "sessions": 50,
        "avgTokensPerSession": 16000
      },
      "opencode": {
        "tokens": 450000,
        "sessions": 37,
        "avgTokensPerSession": 12162
      }
    },
    "trends": {
      "daily": [
        { "date": "2026-02-11", "tokens": 25000, "sessions": 3 },
        { "date": "2026-02-10", "tokens": 18000, "sessions": 2 }
      ],
      "weekly": [
        { "week": "2026-W06", "tokens": 180000, "sessions": 12 }
      ]
    },
    "streaks": {
      "currentStreak": 5,
      "longestStreak": 14,
      "lastActiveDate": "2026-02-11"
    }
  }
}
```

### 3.3 POST /api/v1/evaluate

Submit a project for LLM-based evaluation.

**Auth**: JWT session cookie OR API Key + HMAC headers

**Rate Limit**: Max 10 evaluations per user per day.

**Request Body:**

```json
{
  "projectName": "my-awesome-project",
  "description": "# My Awesome Project\n\n## Local Validation\n\n```bash title=\"test\"\n...\n```\n",
  "fileStructure": {
    ".": ["README.md"],
    "src": ["index.ts"],
    "src/commands": ["deploy.ts", "rollback.ts"]
  },
  "projectPathHash": "<64-char sha256>",
  "localScore": 5,
  "localEvaluationSummary": "Ran README Local Validation test: PASS (localScore=5)."
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `projectName` | string | ✅ | Project name (1–255 chars) |
| `description` | string | ✅ | Project description (README content) (10–5000 chars) |
| `fileStructure` | object | ❌ | File structure summary as `{ "dir": ["file", ...] }` |
| `projectPathHash` | string | ❌ | 64-char SHA-256 of absolute project path (idempotency key) |
| `localScore` | integer | ❌ | 0..5 local score computed by local agent (default 0) |
| `localEvaluationSummary` | string | ❌ | Short explanation of how localScore was computed |

**Scoring Model:**

- `README.md` at the project root is the source of truth
- localScore: 0..5 (does it work as described in README)
- backendScore: 0..5 (novelty/quality re-evaluation)
- penaltyScore: -5..0 (low-quality penalty)
- finalScore = localScore + backendScore + penaltyScore
- finalScore range: -5 .. 10
- cumulativeScoreAfter accumulates per user over time:
  - cumulativeScoreAfter = cumulativeScoreBefore + finalScore
  - can be negative

**Success Response (200):**

```json
{
  "success": true,
  "evaluation": {
    "projectName": "my-awesome-project",
    "localScore": 4,
    "backendScore": 3,
    "penaltyScore": -1,
    "finalScore": 6,
    "cumulativeScoreAfter": 12,
    "passed": true,
    "feedback": "Well-structured project with clear separation of concerns...",
    "evaluatedAt": "2026-02-11T10:30:00.000Z"
  }
}
```

**Pass Threshold**: `finalScore >= 5`.

When passed, `users.successful_projects_count` is incremented.

### 3.4 GET /api/leaderboard

Get public leaderboard rankings.

**Auth**: None (public). IP-rate-limited.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `period` | string | `"weekly"` | `"daily"` \| `"weekly"` \| `"monthly"` |
| `limit` | integer | 20 | Max results (1–100) |
| `offset` | integer | 0 | Pagination offset |

**Success Response (200):**

```json
{
  "leaderboard": {
    "period": "weekly",
    "entries": [
      {
        "rank": 1,
        "username": "topdev",
        "displayName": "Top Developer",
        "avatarUrl": "https://...",
        "totalTokens": 2500000,
        "totalSessions": 150,
        "successfulProjectsCount": 8,
        "primaryTool": "claude-code"
      }
    ],
    "pagination": {
      "total": 245,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

**Privacy**: Users with `privacyMode: true` are excluded from the leaderboard.

### 3.5 GET /api/users/[username]

Get a public user profile.

**Auth**: None (public). IP-rate-limited.

**URL Parameters:**

| Param | Type | Description |
|---|---|---|
| `username` | string | GitHub username |

**Success Response (200):**

```json
{
  "profile": {
    "username": "devuser",
    "displayName": "Dev User",
    "avatarUrl": "https://...",
    "totalTokens": 1250000,
    "totalSessions": 87,
    "successfulProjectsCount": 3,
    "memberSince": "2026-01-15T00:00:00.000Z",
    "activity": {
      "last365Days": [
        { "date": "2026-02-11", "tokens": 25000, "sessions": 3 },
        { "date": "2026-02-10", "tokens": 18000, "sessions": 2 }
      ]
    },
    "patterns": {
      "hourlyDistribution": [0, 0, 0, 0, 0, 0, 100, 500, 2000, 5000, 8000, 10000, 7000, 6000, 8000, 9000, 7000, 5000, 3000, 1000, 500, 200, 100, 0],
      "dayOfWeekDistribution": {
        "Mon": 25000, "Tue": 30000, "Wed": 28000,
        "Thu": 32000, "Fri": 22000, "Sat": 8000, "Sun": 5000
      }
    },
    "vibeStyle": "Night Owl",
    "toolBreakdown": {
      "claude-code": { "tokens": 800000, "percentage": 64 },
      "opencode": { "tokens": 450000, "percentage": 36 }
    },
    "codeMetrics": {
      "totalFilesChanged": 1250,
      "totalLinesAdded": 45000,
      "totalLinesRemoved": 12000
    }
  }
}
```

**Privacy**: Returns 404 if user has `privacyMode: true`.

---

## 4. Data Contracts (Schemas)

### 4.1 Session Object (CLI → Server)

```typescript
interface SessionPayload {
  toolType: string;         // Required. Registered tool slug.
  sessionId: string;        // Required. Client-generated unique ID.
  startedAt: string;        // Required. ISO 8601 datetime.
  endedAt: string;          // Required. ISO 8601 datetime.
  inputTokens: number;      // Required. Integer >= 0.
  outputTokens: number;     // Required. Integer >= 0.
  cacheCreationTokens?: number;  // Optional. Default 0.
  cacheReadTokens?: number;      // Optional. Default 0.
  modelName?: string;       // Optional. Model identifier.
  codeMetrics?: {           // Optional. JSONB.
    filesChanged?: number;
    linesAdded?: number;
    linesRemoved?: number;
    [key: string]: unknown; // Extensible
  } | null;
}
```

### 4.2 Token Usage (Internal, auto-computed)

Created automatically on session insert:

```typescript
interface TokenUsage {
  id: string;               // UUID
  sessionId: string;        // FK → sessions.id
  userId: string;           // FK → users.id
  toolTypeId: string;       // FK → tool_types.id
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;      // Server-computed sum
  estimatedCost: number;    // Server-computed (placeholder)
  recordedAt: string;       // ISO 8601
}
```

### 4.3 User Stats (Pre-computed, read via dashboard)

```typescript
interface UserStats {
  userId: string;
  totalTokens: number;
  totalSessions: number;
  totalCost: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;   // ISO 8601 date
  byTool: Record<string, {  // JSONB
    tokens: number;
    sessions: number;
  }>;
}
```

### 4.4 Daily User Stats (Time-series)

```typescript
interface DailyUserStats {
  userId: string;
  date: string;             // YYYY-MM-DD
  totalTokens: number;
  totalSessions: number;
  totalCost: number;
  byTool: Record<string, {  // JSONB
    tokens: number;
    sessions: number;
  }>;
}
```

---

## 5. Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Meaning | When |
|---|---|---|
| 200 | OK | Successful GET, successful evaluation |
| 201 | Created | Session(s) created, new user created |
| 400 | Bad Request | Invalid body, missing fields, validation failure |
| 401 | Unauthorized | Missing/invalid API key, invalid HMAC, expired timestamp |
| 403 | Forbidden | Rate limit exceeded, anomaly detected |
| 404 | Not Found | User not found, privacy-blocked profile |
| 405 | Method Not Allowed | Wrong HTTP method |
| 409 | Conflict | Duplicate session (same sessionHash) |
| 429 | Too Many Requests | IP or user rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

### Common Error Examples

**401 — Invalid signature:**
```json
{ "error": "Invalid signature" }
```

**401 — Expired timestamp:**
```json
{ "error": "Request timestamp expired" }
```

**400 — Validation failure:**
```json
{ "error": "inputTokens + outputTokens must be greater than 0" }
```

**403 — Anomaly detected:**
```json
{ "error": "Anomalous token count detected" }
```

**409 — Duplicate session:**
```json
{ "error": "Session already recorded" }
```

**429 — Rate limited:**
```json
{ "error": "Rate limit exceeded. Try again later." }
```

---

## 6. Rate Limiting

### Per-User (API Key authenticated)

| Endpoint | Limit |
|---|---|
| `POST /api/v1/sessions` | 100 requests / minute / user |
| `POST /api/v1/sessions/batch` | 10 requests / minute / user |
| `POST /api/v1/evaluate` | 10 evaluations / day / user |

### Per-IP (Public endpoints)

| Endpoint | Limit |
|---|---|
| `GET /api/leaderboard` | 60 requests / minute / IP |
| `GET /api/users/[username]` | 60 requests / minute / IP |

### Session Frequency

- Minimum 1 minute between consecutive single-session submissions per user.
- Batch endpoint has no inter-session frequency constraint.

### Anomaly Detection

- Single session endpoint checks if submitted tokens > 10× user's rolling average.
- If triggered, returns 403 with `"Anomalous token count detected"`.

---

## 7. Enums & Constants

### 7.1 Tool Types (Registered)

| Slug | Display Name | Description |
|---|---|---|
| `claude-code` | Claude Code | Anthropic's Claude Code CLI |
| `claude-desktop` | Claude Desktop | Anthropic's Claude Desktop app |
| `opencode` | OpenCode | OpenCode CLI |
| `gemini` | Gemini CLI | Google's Gemini CLI |
| `codex` | Codex CLI | OpenAI's Codex CLI |
| `crush` | Crush | Charm's Crush CLI |

> Tool types are stored in `tool_types` table. The `slug` field is used as the `toolType` value in API requests. New tools can be added by inserting into this table.

### 7.2 Leaderboard Periods

| Value | Description |
|---|---|
| `daily` | Today's rankings |
| `weekly` | This week's rankings (Mon–Sun) |
| `monthly` | This month's rankings |

### 7.3 Vibe Styles (Computed Server-side)

Assigned based on usage patterns in `GET /api/users/[username]`:

| Style | Criteria |
|---|---|
| `Night Owl` | Peak activity between 22:00–04:00 |
| `Early Bird` | Peak activity between 05:00–09:00 |
| `Steady Builder` | Consistent daily activity |
| `Weekend Warrior` | >50% activity on Sat/Sun |
| `Sprint Master` | High variance, burst patterns |

---

## 8. Security Algorithms

### 8.1 API Key Hashing (Server-side Storage)

```typescript
import { scryptSync } from 'crypto';

function hashApiKey(apiKey: string): string {
  const salt = 'modu-arena-api-key-salt';  // Static salt
  return scryptSync(apiKey, salt, 64).toString('hex');
}
```

- Algorithm: scrypt
- Salt: `"modu-arena-api-key-salt"` (static, application-level)
- Output: 64-byte hex string (128 hex chars)

### 8.2 HMAC Signature Verification

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyHmacSignature(
  apiKey: string,
  timestamp: string,
  body: string,
  providedSignature: string
): boolean {
  // 1. Check timestamp freshness (±300 seconds)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 300) return false;

  // 2. Compute expected signature
  const message = `${timestamp}:${body}`;
  const expectedSignature = createHmac('sha256', apiKey)
    .update(message)
    .digest('hex');

  // 3. Constant-time comparison (with padding for equal length)
  const a = Buffer.from(expectedSignature, 'utf8');
  const b = Buffer.from(providedSignature, 'utf8');
  const maxLen = Math.max(a.length, b.length);
  const paddedA = Buffer.alloc(maxLen, 0); a.copy(paddedA);
  const paddedB = Buffer.alloc(maxLen, 0); b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB);
}
```

### 8.3 Session Hash (Integrity Check)

Server computes this after receiving a session to ensure data integrity:

```typescript
import { createHash } from 'crypto';

function computeSessionHash(
  userId: string,
  userSalt: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  modelName: string,
  endedAt: string       // ISO 8601 string
): string {
  const data = `${userId}:${userSalt}:${inputTokens}:${outputTokens}:${cacheCreationTokens}:${cacheReadTokens}:${modelName}:${endedAt}`;
  return createHash('sha256').update(data).digest('hex');
}
```

- Used for deduplication (duplicate sessions have same hash).
- `userSalt` is a per-user random value generated at user creation.

---

## 9. Daemon Sync Architecture

### 9.1 Overview

The CLI includes a **launchd daemon** (macOS) that runs every **2 minutes**, collecting token usage from all supported AI coding tools and syncing to the backend. This complements session-end hooks for tools that support them.

### 9.2 Data Collection Strategy

| Tool | Session-End Hook | Periodic Daemon (2 min) | Data Source |
|------|-----------------|------------------------|-------------|
| Claude Code | `session-end.sh` → `_modu-hook.js` | No local data store | Hook only |
| Claude Desktop | N/A (no hook support) | JSONL log parsing | `~/Library/Application Support/Claude/*.jsonl` |
| OpenCode | `session-end.sh` → `_modu-hook.js` | SQLite query | `~/.local/share/opencode/opencode.db` |
| Gemini/Codex/Crush | `session-end.sh` → `_modu-hook.js` | No local data store | Hook only |

### 9.3 Daemon State

The daemon persists state in `~/.modu-arena-daemon.json`:

```json
{
  "syncedHashes": ["sha256hex1", "sha256hex2"],
  "lastSync": "2026-02-15T14:03:00.000Z"
}
```

- `syncedHashes`: Set of session hashes already sent (dedup).
- `lastSync`: ISO timestamp of last successful sync (used to filter recent OpenCode sessions via `WHERE time_updated >= lastSync`).

### 9.4 Batching & Rate Limit Protection

To avoid overwhelming the backend (100 req/min limit), the daemon uses batching:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `BATCH_SIZE` | 50 | Sessions per batch request |
| `BATCH_DELAY_MS` | 35,000 | Delay between batches |
| `MAX_BATCHES_PER_RUN` | 3 | Maximum batches per daemon run |

If the backend returns `HTTP 429`, the daemon stops immediately and retries on next run.

### 9.5 Token Validation Limits (Server-Side)

The backend validates token counts on both single and batch endpoints:

| Limit | Value | Description |
|-------|-------|-------------|
| `MAX_INPUT_TOKENS` | 500,000,000 | Max input tokens per session |
| `MAX_OUTPUT_TOKENS` | 100,000,000 | Max output tokens per session |
| `MAX_CACHE_TOKENS` | 1,000,000,000 | Max cache tokens per session |

### 9.6 Deduplication

Sessions are deduplicated via `serverHash = SHA256(userId + userSalt + inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + modelName + endedAt)`. The same session sent via both hook and daemon produces the same hash and is silently rejected as a duplicate.

---

## Appendix: Quick Reference for CLI Implementation

### Minimal Session Submission (TypeScript)

```typescript
import { createHmac } from 'crypto';

const API_KEY = 'modu_arena_AbCdEfGh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const BASE_URL = 'http://localhost:8989';

async function submitSession(session: SessionPayload): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(session);
  const message = `${timestamp}:${body}`;
  const signature = createHmac('sha256', API_KEY)
    .update(message)
    .digest('hex');

  const response = await fetch(`${BASE_URL}/api/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Session submission failed: ${error.error}`);
  }
}
```

### Minimal Rank Check (TypeScript)

```typescript
async function getRank(): Promise<RankResponse> {
  const response = await fetch(`${BASE_URL}/api/v1/rank`, {
    headers: { 'X-API-Key': API_KEY },
  });
  return response.json();
}
```

---

## Appendix: Database ER Diagram

See `docs/database-schema.md` and `docs/database-schema.mmd` for the full database schema documentation and Mermaid ER diagram.

**Key Relationships:**
```
users ──1:N── sessions ──1:1── token_usage
users ──1:1── user_stats
users ──1:N── daily_user_stats
users ──1:N── project_evaluations
tool_types ──1:N── sessions
tool_types ──1:N── token_usage
```
