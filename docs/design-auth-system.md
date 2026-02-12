# Modu-Arena: Self-Hosted Authentication System Design

> **Version**: 1.0.0  
> **Status**: Approved — Ready for Implementation  
> **Last Updated**: 2026-02-12  
> **Replaces**: Clerk (3rd-party auth)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Motivation](#2-motivation)
3. [Architecture](#3-architecture)
4. [Database Changes](#4-database-changes)
5. [Authentication Flows](#5-authentication-flows)
6. [API Endpoints](#6-api-endpoints)
7. [Web Session Management](#7-web-session-management)
8. [CLI Authentication](#8-cli-authentication)
9. [Middleware Changes](#9-middleware-changes)
10. [UI Changes](#10-ui-changes)
11. [Files to Modify](#11-files-to-modify)
12. [Migration Plan](#12-migration-plan)
13. [Security Considerations](#13-security-considerations)

---

## 1. Overview

Replace Clerk (3rd-party SaaS auth) with a **self-hosted username + password** authentication system. The system supports two entry points:

- **Web**: Sign-up / Sign-in pages → JWT cookie session
- **CLI**: `npx @suncreation/modu-arena register` / `login` → API key issuance

Public pages (leaderboard, user profiles, dashboard view) remain accessible **without authentication**.

---

## 2. Motivation

| Problem | Impact |
|---------|--------|
| Clerk requires external API keys (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) | App errors when keys are empty or expired |
| Clerk adds unnecessary 3rd-party dependency | We already have our own backend server |
| No self-service API key issuance path exists | Users cannot register or get keys without admin intervention |
| GitHub OAuth adds friction for non-developer users | Simple username+password is sufficient for this platform |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Modu-Arena Auth                       │
├──────────────────────┬───────────────────────────────────┤
│    Web (Browser)     │         CLI (Terminal)            │
├──────────────────────┼───────────────────────────────────┤
│  /sign-up page       │  npx modu-arena register          │
│  /sign-in page       │  npx modu-arena login             │
│         │            │         │                         │
│         ▼            │         ▼                         │
│  POST /api/auth/*    │  POST /api/auth/register          │
│         │            │  POST /api/auth/login             │
│         ▼            │         │                         │
│  JWT httpOnly cookie │         ▼                         │
│  (web session)       │  API Key returned                 │
│         │            │  (stored in ~/.modu-arena/config) │
│         ▼            │         │                         │
│  middleware.ts       │         ▼                         │
│  verifies JWT        │  X-API-Key + HMAC headers         │
│  on protected routes │  (existing auth — no change)      │
└──────────────────────┴───────────────────────────────────┘
```

### Key Principle

- **Web session**: JWT in httpOnly cookie → middleware validates
- **CLI data submission**: API Key + HMAC signature → unchanged from current implementation
- **Public pages**: No auth required (leaderboard, user profiles, dashboard overview)
- **Protected pages**: Settings, API key management → JWT required

---

## 4. Database Changes

### 4.1 Users Table — Schema Diff

```diff
 export const users = pgTable('users', {
   id: uuid('id').primaryKey().defaultRandom(),
-  clerkId: varchar('clerk_id', { length: 255 }).unique(),
+  username: varchar('username', { length: 100 }).unique().notNull(),
+  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
   githubId: varchar('github_id', { length: 255 }).unique(),
   githubUsername: varchar('github_username', { length: 255 }),
   githubAvatarUrl: text('github_avatar_url'),
   displayName: varchar('display_name', { length: 255 }),
   email: varchar('email', { length: 255 }),
   apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(),
   apiKeyPrefix: varchar('api_key_prefix', { length: 32 }).notNull(),
   userSalt: varchar('user_salt', { length: 64 }).notNull(),
   privacyMode: boolean('privacy_mode').default(false),
   successfulProjectsCount: integer('successful_projects_count').default(0),
   createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
   updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
-}, (table) => [index('users_api_key_hash_idx').on(table.apiKeyHash)]);
+}, (table) => [
+  index('users_api_key_hash_idx').on(table.apiKeyHash),
+  index('users_username_idx').on(table.username),
+]);
```

### 4.2 Migration SQL

```sql
-- Step 1: Add new columns
ALTER TABLE users ADD COLUMN username VARCHAR(100);
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);

-- Step 2: Backfill existing users (use github_username or generate from id)
UPDATE users SET username = COALESCE(github_username, 'user_' || LEFT(id::text, 8))
  WHERE username IS NULL;
UPDATE users SET password_hash = 'MIGRATION_PLACEHOLDER'
  WHERE password_hash IS NULL;

-- Step 3: Add constraints
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
CREATE INDEX users_username_idx ON users (username);

-- Step 4: Remove Clerk column
ALTER TABLE users DROP COLUMN IF EXISTS clerk_id;
```

### 4.3 Validation Rules

| Field | Rule |
|-------|------|
| `username` | 3-50 chars, alphanumeric + underscore + hyphen, unique, case-insensitive |
| `password` | Minimum 8 characters |
| `email` | Optional, standard email format |

---

## 5. Authentication Flows

### 5.1 Web Registration

```
User → /sign-up page
  → Fill: username, password, email (optional), displayName (optional)
  → POST /api/auth/register
  → Server:
      1. Validate input (username uniqueness, password strength)
      2. Hash password with scrypt
      3. Generate API key (generateApiKey())
      4. Insert user into DB
      5. Create JWT, set httpOnly cookie
      6. Return: { success: true, user: { username, displayName }, apiKey: "modu_arena_..." }
  → Client: Show API key once, redirect to dashboard
```

### 5.2 Web Login

```
User → /sign-in page
  → Fill: username, password
  → POST /api/auth/login
  → Server:
      1. Find user by username (case-insensitive)
      2. Verify password with scrypt
      3. Create JWT, set httpOnly cookie
      4. Return: { success: true, user: { username, displayName } }
  → Client: Redirect to dashboard
```

### 5.3 Web Logout

```
User → Click logout button
  → POST /api/auth/logout
  → Server: Clear JWT cookie
  → Client: Redirect to /
```

### 5.4 CLI Registration

```
$ npx @suncreation/modu-arena register
  → Prompt: username, password, email (optional)
  → POST /api/auth/register
  → Server: Same as 5.1
  → CLI: Save API key to ~/.modu-arena/config.json
  → Print: "Registration successful! API key saved."
```

### 5.5 CLI Login

```
$ npx @suncreation/modu-arena login
  → Prompt: username, password
  → POST /api/auth/login
  → Server: Verify credentials, return existing API key prefix
  → CLI: Optionally re-issue key if requested
  → Print: "Login successful! API key confirmed."
```

---

## 6. API Endpoints

### 6.1 POST /api/auth/register

**Request:**
```json
{
  "username": "johndoe",
  "password": "securepass123",
  "email": "john@example.com",
  "displayName": "John Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "johndoe",
    "displayName": "John Doe"
  },
  "apiKey": "modu_arena_a1b2c3d4_e5f6g7h8..."
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_INPUT` | Missing/invalid fields |
| 409 | `USERNAME_TAKEN` | Username already exists |

### 6.2 POST /api/auth/login

**Request:**
```json
{
  "username": "johndoe",
  "password": "securepass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "johndoe",
    "displayName": "John Doe"
  }
}
```

**Side Effect:** Sets `modu-arena-session` httpOnly cookie with JWT.

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `INVALID_CREDENTIALS` | Wrong username or password |

### 6.3 POST /api/auth/logout

**Response (200):**
```json
{
  "success": true
}
```

**Side Effect:** Clears `modu-arena-session` cookie.

### 6.4 GET /api/auth/me

**Auth:** JWT cookie required.

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "johndoe",
    "displayName": "John Doe",
    "email": "john@example.com",
    "apiKeyPrefix": "modu_arena_a1b2c3d4"
  }
}
```

---

## 7. Web Session Management

### 7.1 JWT Token

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Secret | `JWT_SECRET` environment variable |
| Payload | `{ sub: userId, username, iat, exp }` |
| Expiration | 7 days |
| Storage | httpOnly, Secure, SameSite=Lax cookie |
| Cookie name | `modu-arena-session` |

### 7.2 Token Creation (auth.ts addition)

```typescript
// New functions to add to apps/web/src/lib/auth.ts

import { SignJWT, jwtVerify } from 'jose';

export async function createSessionToken(user: { id: string; username: string }): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ sub: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{ sub: string; username: string } | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as { sub: string; username: string };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return scryptSync(password, process.env.JWT_SECRET || 'modu-arena-default-salt', 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  const computed = hashPassword(password);
  return timingSafeEqual(computed, hash);
}
```

### 7.3 Library Choice

Use **jose** (lightweight, Edge-compatible JWT library) — already common in Next.js projects. No heavy dependencies.

---

## 8. CLI Authentication

### 8.1 New CLI Commands

| Command | Description |
|---------|-------------|
| `npx @suncreation/modu-arena register` | Interactive sign-up, saves API key |
| `npx @suncreation/modu-arena login` | Interactive sign-in, confirms/refreshes API key |

### 8.2 Data Submission — No Change

The existing CLI data flow (API Key + HMAC signature in headers) is **completely unaffected**. The `register` and `login` commands simply provide a self-service way to obtain the API key.

### 8.3 Config File

```
~/.modu-arena/config.json
{
  "apiKey": "modu_arena_a1b2c3d4_...",
  "username": "johndoe",
  "serverUrl": "https://backend.vibemakers.kr:23010"
}
```

---

## 9. Middleware Changes

### 9.1 Current State (Clerk)

```typescript
// middleware.ts — CURRENT
import { clerkMiddleware } from '@clerk/nextjs/server';
export default hasClerkKeys ? clerkHandler : noAuthMiddleware;
```

### 9.2 Target State (Self-hosted JWT)

```typescript
// middleware.ts — TARGET
// Remove: clerkMiddleware, createRouteMatcher from '@clerk/nextjs/server'
// Add: JWT cookie verification

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip intl middleware for API and non-locale paths
  if (shouldSkipIntlMiddleware(pathname)) {
    // Rate limiting for API routes (unchanged)
    return applyRateLimit(request);
  }

  // 2. Apply next-intl middleware for page routes
  const intlResponse = intlMiddleware(request);
  if (intlResponse) return intlResponse;

  // 3. Protected routes: check JWT cookie
  if (isProtectedRoute(pathname)) {
    const token = request.cookies.get('modu-arena-session')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    // JWT verification happens in route handlers (Edge middleware can't use jose easily)
  }

  return NextResponse.next();
}
```

### 9.3 Protected Routes

Only these routes require authentication:

| Route | Reason |
|-------|--------|
| `/dashboard/settings` | Personal settings management |
| `/api/me/*` | User-specific data endpoints |
| `/api/auth/cli` | CLI OAuth flow (existing) |

Everything else (leaderboard, user profiles, dashboard overview) is **public**.

---

## 10. UI Changes

### 10.1 Sign-Up Page (`/sign-up`)

Replace Clerk's `<SignUp />` component with a custom form:

- Fields: username, password, confirmPassword, email (optional), displayName (optional)
- Validation: Client-side + server-side
- On success: Show API key in a copyable box, then redirect to dashboard

### 10.2 Sign-In Page (`/sign-in`)

Replace Clerk's `<SignIn />` component with a custom form:

- Fields: username, password
- On success: Redirect to dashboard

### 10.3 Header

Replace Clerk's `<UserButton />`, `<SignInButton />`, `<SignUpButton />` with:

- Logged in: Username display + dropdown (Settings, Logout)
- Not logged in: "Sign In" / "Sign Up" links

### 10.4 Layout

Remove `<ClerkProvider>` wrapper from `layout.tsx`.

---

## 11. Files to Modify

### 11.1 Remove Clerk — 14 files

| # | File | Change |
|---|------|--------|
| 1 | `apps/web/src/middleware.ts` | Remove Clerk, add JWT check |
| 2 | `apps/web/src/app/layout.tsx` | Remove `<ClerkProvider>` |
| 3 | `apps/web/src/lib/safe-auth.ts` | Delete entirely |
| 4 | `apps/web/src/components/layout/header.tsx` | Replace Clerk UI components |
| 5 | `apps/web/src/app/[locale]/sign-in/[[...sign-in]]/page.tsx` | Custom sign-in form |
| 6 | `apps/web/src/app/[locale]/sign-up/[[...sign-up]]/page.tsx` | Custom sign-up form |
| 7 | `apps/web/src/app/[locale]/page.tsx` | Remove `safeAuth()` |
| 8 | `apps/web/src/app/[locale]/dashboard/page.tsx` | Remove `safeAuth()` / `safeCurrentUser()` |
| 9 | `apps/web/src/app/[locale]/dashboard/settings/page.tsx` | Use JWT auth instead of Clerk |
| 10 | `apps/web/src/app/api/me/route.ts` | JWT auth instead of `auth()` |
| 11 | `apps/web/src/app/api/me/stats/route.ts` | JWT auth instead of `auth()` |
| 12 | `apps/web/src/app/api/me/settings/route.ts` | JWT auth instead of `auth()` |
| 13 | `apps/web/src/app/api/me/regenerate-key/route.ts` | JWT auth instead of `auth()` |
| 14 | `apps/web/src/app/api/me/revoke-key/route.ts` | JWT auth instead of `auth()` |

### 11.2 Remove Clerk — Additional files

| # | File | Change |
|---|------|--------|
| 15 | `apps/web/src/app/api/auth/cli/route.ts` | Rewrite: remove Clerk dependency |
| 16 | `apps/web/src/app/api/auth/cli/callback/route.ts` | Rewrite: remove Clerk dependency |
| 17 | `apps/web/src/app/api/v1/evaluate/route.ts` | Remove Clerk branch from dual auth |

### 11.3 New Files

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/web/src/app/api/auth/register/route.ts` | Registration endpoint |
| 2 | `apps/web/src/app/api/auth/login/route.ts` | Login endpoint |
| 3 | `apps/web/src/app/api/auth/logout/route.ts` | Logout endpoint |
| 4 | `apps/web/src/app/api/auth/me/route.ts` | Session info endpoint |
| 5 | DB migration file | Schema migration |

### 11.4 Modify Existing

| # | File | Change |
|---|------|---------|
| 1 | `apps/web/src/lib/auth.ts` | Add: `hashPassword`, `verifyPassword`, `createSessionToken`, `verifySessionToken` |
| 2 | `apps/web/src/db/schema.ts` | Add `username`, `passwordHash`; remove `clerkId` |
| 3 | `apps/web/src/db/seed.ts` | Add password field for seed users |
| 4 | `packages/shared/src/types/user.ts` | Remove `clerkId`, add `username` |
| 5 | `packages/shared/src/schemas/user.ts` | Remove `clerkId`, `clerkSessionId` |
| 6 | `packages/cli/` | Add `register` and `login` commands |
| 7 | `apps/web/package.json` | Remove `@clerk/nextjs` |
| 8 | `turbo.json` | Remove Clerk env vars, add `JWT_SECRET` |

---

## 12. Migration Plan

### Execution Order

```
Phase 1: Foundation
  ├─ 1.1 DB migration (add username, passwordHash; drop clerkId)
  ├─ 1.2 Add auth functions to lib/auth.ts (password hash, JWT)
  ├─ 1.3 Install jose dependency
  └─ 1.4 Add JWT_SECRET to .env

Phase 2: API Layer
  ├─ 2.1 Create /api/auth/register endpoint
  ├─ 2.2 Create /api/auth/login endpoint
  ├─ 2.3 Create /api/auth/logout endpoint
  ├─ 2.4 Create /api/auth/me endpoint
  └─ 2.5 Update /api/me/* routes (Clerk → JWT)

Phase 3: Middleware & Layout
  ├─ 3.1 Rewrite middleware.ts (remove Clerk, add JWT)
  ├─ 3.2 Remove ClerkProvider from layout.tsx
  └─ 3.3 Delete safe-auth.ts

Phase 4: UI
  ├─ 4.1 Build custom sign-up page
  ├─ 4.2 Build custom sign-in page
  ├─ 4.3 Replace header auth components
  └─ 4.4 Update dashboard pages

Phase 5: CLI
  ├─ 5.1 Add register command
  └─ 5.2 Add login command

Phase 6: Cleanup
  ├─ 6.1 Remove @clerk/nextjs from package.json
  ├─ 6.2 Update shared package types
  ├─ 6.3 Clean up env vars (turbo.json, .env files)
  └─ 6.4 Update seed.ts

Phase 7: Deploy & Verify
  ├─ 7.1 rsync to server
  ├─ 7.2 Run DB migration on production
  ├─ 7.3 Set JWT_SECRET on server
  ├─ 7.4 Build & restart PM2
  └─ 7.5 Playwright visual verification
```

---

## 13. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Password storage | scrypt hashing (same algorithm as API keys) |
| JWT theft | httpOnly + Secure + SameSite=Lax cookies |
| Brute force | Existing edge rate limiting (200/min per IP) |
| Token expiry | 7-day JWT expiration |
| CSRF | SameSite=Lax + POST-only mutations |
| Timing attacks | Constant-time comparison (existing `timingSafeEqual`) |
| CLI key storage | File permissions: 600 on `~/.modu-arena/config.json` |

### What Stays Unchanged

- API Key + HMAC signature flow for CLI data submission
- scrypt-based API key hashing
- Edge rate limiting (Upstash Redis)
- Security audit logging

---

## Appendix: Environment Variables

### Remove

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL
NEXT_PUBLIC_CLERK_SIGN_UP_URL
```

### Add

```
JWT_SECRET=<random-64-char-hex-string>
```
