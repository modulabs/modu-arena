import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, sessions, tokenUsage, dailyUserStats, userStats, toolTypes } from '@/db';
import { eq, sql, desc, avg } from 'drizzle-orm';
import { successResponse, Errors, corsOptionsResponse } from '@/lib/api-response';
import {
  validateApiKey,
  extractHmacAuth,
  verifyHmacSignature,
  computeSessionHash,
} from '@/lib/auth';
import {
  logInvalidApiKey,
  logInvalidHmacSignature,
  logSecurityEvent,
  logRateLimitExceeded,
} from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limiter';
import { del, delMany, delPattern } from '@/lib/cache';
import { userKeys, leaderboardPattern } from '@/cache/keys';

/**
 * Normalize model name — convert invalid values to null
 * "unknown", empty string, whitespace-only → null (stored as NULL in DB)
 */
function normalizeModelName(name: string | undefined | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
}

/**
 * Security Constants
 *
 * NOTE: These are SESSION-level limits, not per-message limits.
 * A session can accumulate tokens across many messages/turns.
 *
 * Typical AI coding session usage:
 * - Input tokens: Can accumulate to millions in long sessions
 * - Output tokens: Can accumulate to hundreds of thousands
 * - Cache tokens: Can accumulate to tens of millions (context caching)
 */
const MAX_INPUT_TOKENS = 500_000_000;
const MAX_OUTPUT_TOKENS = 100_000_000;
const MAX_CACHE_TOKENS = 1_000_000_000;
// Minimum time between sessions (1 second) - allows batch submissions from CLI daemons
const MIN_SESSION_INTERVAL_MS = 1000;
// Anomaly detection threshold (10x average)
const ANOMALY_THRESHOLD_MULTIPLIER = 10;

/**
 * Session timestamp tolerance in milliseconds (5 minutes)
 * Sessions must be submitted within +/- 5 minutes of current time
 */
const SESSION_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Supported tool types
 */
const API_KEY_PREFIX_LEN = 'modu_arena_'.length;
const VALID_TOOL_TYPES = ['claude-code', 'claude-desktop', 'opencode', 'gemini', 'codex', 'crush'];

/**
 * Code metrics schema for code analytics
 */
const CodeMetricsSchema = z.object({
  linesAdded: z.number().int().min(0).optional().default(0),
  linesDeleted: z.number().int().min(0).optional().default(0),
  filesModified: z.number().int().min(0).optional().default(0),
  filesCreated: z.number().int().min(0).optional().default(0),
});

/**
 * Session creation request schema
 * UPDATED: Added toolType field for multi-tool support
 */
const CreateSessionSchema = z.object({
  // NEW: Tool type to identify which AI coding tool was used
  toolType: z.enum(['claude-code', 'claude-desktop', 'opencode', 'gemini', 'codex', 'crush']).default('claude-code'),

  sessionHash: z.string().length(64, 'Invalid session hash').optional(),
  anonymousProjectId: z.string().max(100).optional(),
  // Timestamp bounds checking (validated post-parse for toolType-aware logic)
  endedAt: z.string().datetime(),
  modelName: z.string().max(100).optional(),
  // Token validation with maximum limits
  inputTokens: z
    .number()
    .int()
    .min(0)
    .max(MAX_INPUT_TOKENS, 'Input tokens exceed limit'),
  outputTokens: z
    .number()
    .int()
    .min(0)
    .max(MAX_OUTPUT_TOKENS, 'Output tokens exceed limit'),
  cacheCreationTokens: z
    .number()
    .int()
    .min(0)
    .max(MAX_CACHE_TOKENS, 'Cache creation tokens exceed limit')
    .optional()
    .default(0),
  cacheReadTokens: z
    .number()
    .int()
    .min(0)
    .max(MAX_CACHE_TOKENS, 'Cache read tokens exceed limit')
    .optional()
    .default(0),
  // Code analytics fields
  startedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(0).max(604800).optional(), // Max 7 days
  turnCount: z.number().int().min(0).max(10000).optional(),
  toolUsage: z.record(z.string(), z.number().int().min(0)).optional(),
  codeMetrics: CodeMetricsSchema.optional(),
});

/**
 * Session creation response
 */
interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

/**
 * POST /api/v1/sessions
 *
 * Records an AI coding tool session with token usage.
 * Requires API key authentication with HMAC signature.
 *
 * Headers:
 * - X-API-Key: User's API key
 * - X-Timestamp: Unix timestamp in seconds
 * - X-Signature: HMAC-SHA256 signature
 *
 * Body:
 * - toolType: AI coding tool used (claude-code, opencode, gemini, codex, crush)
 * - sessionHash: Client-generated session hash
 * - anonymousProjectId: Optional anonymized project identifier
 * - endedAt: ISO timestamp when session ended
 * - modelName: Optional model name (e.g., "claude-3-opus")
 * - inputTokens: Number of input tokens used
 * - outputTokens: Number of output tokens used
 * - cacheCreationTokens: Optional cache creation tokens
 * - cacheReadTokens: Optional cache read tokens
 * - startedAt: Optional session start timestamp
 * - durationSeconds: Optional session duration in seconds
 * - turnCount: Optional number of turns/conversations
 * - toolUsage: Optional tool usage breakdown
 * - codeMetrics: Optional code metrics
 */
export async function POST(request: NextRequest) {
  try {
    // Extract authentication headers
    const { apiKey, timestamp, signature } = extractHmacAuth(request.headers);

    // Validate API key presence
    if (!apiKey) {
      return Errors.unauthorized('API key required');
    }

    // Validate user from API key
    const user = await validateApiKey(apiKey);

    if (!user) {
      const underscoreIdx = apiKey.indexOf('_', API_KEY_PREFIX_LEN);
      const prefix = underscoreIdx > 0 ? apiKey.substring(0, underscoreIdx) : apiKey.substring(0, 24);
      await logInvalidApiKey(prefix, '/api/v1/sessions', request);
      return Errors.unauthorized('Invalid API key');
    }

    // Distributed rate limiting - 100 requests per minute per user
    const rateLimitResult = await checkRateLimit(user.id);
    if (!rateLimitResult.success) {
      await logRateLimitExceeded(user.id, '/api/v1/sessions', request);
      return Errors.rateLimited(
        `Rate limit exceeded. Try again after ${new Date(rateLimitResult.reset).toISOString()}`
      );
    }

    // Validate timestamp and signature presence
    if (!timestamp || !signature) {
      await logInvalidHmacSignature(
        user.id,
        '/api/v1/sessions',
        'Missing timestamp or signature',
        request
      );
      return Errors.unauthorized('HMAC authentication required');
    }

    // Get raw body for signature verification
    const bodyText = await request.text();

    // Verify HMAC signature
    if (!verifyHmacSignature(apiKey, timestamp, bodyText, signature)) {
      await logInvalidHmacSignature(
        user.id,
        '/api/v1/sessions',
        'Signature mismatch or expired timestamp',
        request
      );
      return Errors.unauthorized('Invalid HMAC signature');
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Errors.validationError('Invalid JSON body');
    }

    const parseResult = CreateSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return Errors.validationError('Invalid session data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const sessionData = parseResult.data;

    // endedAt timestamp bounds check (skipped for claude-desktop which reports after-the-fact)
    if (sessionData.toolType !== 'claude-desktop') {
      const endedAtTime = new Date(sessionData.endedAt).getTime();
      if (Math.abs(endedAtTime - Date.now()) > SESSION_TIMESTAMP_TOLERANCE_MS) {
        return Errors.validationError('Session endedAt is too far from current time');
      }
    }

    // Session frequency validation - minimum time between sessions
    const submittedEndedAt = new Date(sessionData.endedAt);
    const lastSession = await db
      .select({ endedAt: sessions.endedAt })
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.endedAt))
      .limit(1);

    if (
      lastSession.length > 0 &&
      Math.abs(submittedEndedAt.getTime() - lastSession[0].endedAt.getTime()) < MIN_SESSION_INTERVAL_MS
    ) {
      await logSecurityEvent('suspicious_activity', user.id, {
        reason: 'Session endedAt too close to existing session',
        lastSessionEndedAt: lastSession[0].endedAt.toISOString(),
        submittedEndedAt: submittedEndedAt.toISOString(),
        timeDifference: Math.abs(submittedEndedAt.getTime() - lastSession[0].endedAt.getTime()),
        minimumInterval: MIN_SESSION_INTERVAL_MS,
      });
      return Errors.validationError(
        'Session endedAt is too close to an existing session. Sessions must be at least 1 second apart.'
      );
    }

    // Anomaly detection - flag suspicious token counts
    const submittedTokens = sessionData.inputTokens + sessionData.outputTokens;
    const userAvgResult = await db
      .select({
        avgTokens: avg(sql`${tokenUsage.inputTokens} + ${tokenUsage.outputTokens}`),
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.userId, user.id));

    const avgTokens = userAvgResult[0]?.avgTokens ? Number(userAvgResult[0].avgTokens) : 0;

    // Flag if submitted tokens are >10x the user's historical average
    if (avgTokens > 0 && submittedTokens > avgTokens * ANOMALY_THRESHOLD_MULTIPLIER) {
      await logSecurityEvent('suspicious_activity', user.id, {
        reason: 'Token count anomaly detected',
        submittedTokens,
        averageTokens: avgTokens,
        ratio: submittedTokens / avgTokens,
        threshold: ANOMALY_THRESHOLD_MULTIPLIER,
      });
      // Note: We log but don't block - this allows legitimate high-usage sessions
    }

    // Recalculate session hash server-side
    const serverHash = computeSessionHash(user.id, user.userSalt, {
      inputTokens: sessionData.inputTokens,
      outputTokens: sessionData.outputTokens,
      cacheCreationTokens: sessionData.cacheCreationTokens,
      cacheReadTokens: sessionData.cacheReadTokens,
      modelName: sessionData.modelName,
      endedAt: sessionData.endedAt,
    });

    // Check for duplicate session
    const existingSession = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.sessionHash, serverHash))
      .limit(1);

    if (existingSession.length > 0) {
      await logSecurityEvent('session_duplicate', user.id, {
        sessionHash: serverHash.substring(0, 16),
      });
      return Errors.validationError('Session already recorded');
    }

    // Get startedAt timestamp or default to endedAt minus duration
    const startedAt = sessionData.startedAt
      ? new Date(sessionData.startedAt)
      : sessionData.durationSeconds
        ? new Date(submittedEndedAt.getTime() - sessionData.durationSeconds * 1000)
        : submittedEndedAt;

    // Calculate duration if not provided
    const durationSeconds = sessionData.durationSeconds ||
      Math.max(1, Math.floor((submittedEndedAt.getTime() - startedAt.getTime()) / 1000));

    // Insert session + token_usage + stats atomically in a transaction
    const newSession = await db.transaction(async (tx) => {
      const sessionResult = await tx
        .insert(sessions)
        .values({
          userId: user.id,
          toolTypeId: sessionData.toolType,
          sessionHash: serverHash,
          anonymousProjectId: sessionData.anonymousProjectId,
          startedAt,
          endedAt: submittedEndedAt,
          durationSeconds,
          modelName: normalizeModelName(sessionData.modelName),
          turnCount: sessionData.turnCount,
          toolUsage: sessionData.toolUsage,
          codeMetrics: sessionData.codeMetrics,
        })
        .returning({ id: sessions.id });

      const sess = sessionResult[0];

      // Insert token usage
      await tx.insert(tokenUsage).values({
        sessionId: sess.id,
        userId: user.id,
        toolTypeId: sessionData.toolType,
        inputTokens: sessionData.inputTokens,
        outputTokens: sessionData.outputTokens,
        cacheCreationTokens: sessionData.cacheCreationTokens,
        cacheReadTokens: sessionData.cacheReadTokens,
      });

      // Update daily user stats
      const sessionDate = new Date(sessionData.endedAt).toISOString().split('T')[0];

      await tx
        .insert(dailyUserStats)
        .values({
          userId: user.id,
          statDate: sessionDate,
          inputTokens: sessionData.inputTokens,
          outputTokens: sessionData.outputTokens,
          cacheTokens:
            (sessionData.cacheCreationTokens ?? 0) + (sessionData.cacheReadTokens ?? 0),
          totalTokens:
            sessionData.inputTokens +
            sessionData.outputTokens +
            (sessionData.cacheCreationTokens ?? 0) +
            (sessionData.cacheReadTokens ?? 0),
          sessionCount: 1,
          byTool: {
            [sessionData.toolType]: {
              tokens:
                sessionData.inputTokens +
                sessionData.outputTokens +
                (sessionData.cacheCreationTokens ?? 0) +
                (sessionData.cacheReadTokens ?? 0),
              sessions: 1,
            },
          },
        })
        .onConflictDoUpdate({
          target: [dailyUserStats.userId, dailyUserStats.statDate],
          set: {
            inputTokens: sql`${dailyUserStats.inputTokens} + ${sessionData.inputTokens}`,
            outputTokens: sql`${dailyUserStats.outputTokens} + ${sessionData.outputTokens}`,
            cacheTokens: sql`${dailyUserStats.cacheTokens} + ${
              (sessionData.cacheCreationTokens ?? 0) + (sessionData.cacheReadTokens ?? 0)
            }`,
            totalTokens: sql`${dailyUserStats.totalTokens} + ${
              sessionData.inputTokens +
              sessionData.outputTokens +
              (sessionData.cacheCreationTokens ?? 0) +
              (sessionData.cacheReadTokens ?? 0)
            }`,
            sessionCount: sql`${dailyUserStats.sessionCount} + 1`,
            byTool: sql`${dailyUserStats.byTool} || jsonb_build_object(
              ${sessionData.toolType}::text,
              jsonb_build_object(
                'tokens', COALESCE((${dailyUserStats.byTool} -> ${sessionData.toolType}::text ->> 'tokens')::bigint, 0) + ${
                  sessionData.inputTokens +
                  sessionData.outputTokens +
                  (sessionData.cacheCreationTokens ?? 0) +
                  (sessionData.cacheReadTokens ?? 0)
                },
                'sessions', COALESCE((${dailyUserStats.byTool} -> ${sessionData.toolType}::text ->> 'sessions')::int, 0) + 1
              )
            )`,
          },
        });

      // Update user_stats aggregate table
      const totalTokensForSession =
        sessionData.inputTokens +
        sessionData.outputTokens +
        (sessionData.cacheCreationTokens ?? 0) +
        (sessionData.cacheReadTokens ?? 0);

      await tx
        .insert(userStats)
        .values({
          userId: user.id,
          totalInputTokens: sessionData.inputTokens,
          totalOutputTokens: sessionData.outputTokens,
          totalCacheTokens:
            (sessionData.cacheCreationTokens ?? 0) + (sessionData.cacheReadTokens ?? 0),
          totalAllTokens: totalTokensForSession,
          totalSessions: 1,
          tokensByTool: { [sessionData.toolType]: totalTokensForSession },
          sessionsByTool: { [sessionData.toolType]: 1 },
          lastActivityAt: submittedEndedAt,
        })
        .onConflictDoUpdate({
          target: [userStats.userId],
          set: {
            totalInputTokens: sql`${userStats.totalInputTokens} + ${sessionData.inputTokens}`,
            totalOutputTokens: sql`${userStats.totalOutputTokens} + ${sessionData.outputTokens}`,
            totalCacheTokens: sql`${userStats.totalCacheTokens} + ${(sessionData.cacheCreationTokens ?? 0) + (sessionData.cacheReadTokens ?? 0)}`,
            totalAllTokens: sql`${userStats.totalAllTokens} + ${totalTokensForSession}`,
            totalSessions: sql`${userStats.totalSessions} + 1`,
            tokensByTool: sql`${userStats.tokensByTool} || jsonb_build_object(${sessionData.toolType}::text, COALESCE((${userStats.tokensByTool} ->> ${sessionData.toolType}::text)::bigint, 0) + ${totalTokensForSession})`,
            sessionsByTool: sql`${userStats.sessionsByTool} || jsonb_build_object(${sessionData.toolType}::text, COALESCE((${userStats.sessionsByTool} ->> ${sessionData.toolType}::text)::int, 0) + 1)`,
            lastActivityAt: submittedEndedAt,
            updatedAt: new Date(),
          },
        });

      return sess;
    });

    // Log successful session creation
    await logSecurityEvent('session_created', user.id, {
      sessionId: newSession.id,
      toolType: sessionData.toolType,
      inputTokens: sessionData.inputTokens,
      outputTokens: sessionData.outputTokens,
    });

    // Invalidate caches so leaderboard/rank reflect new data immediately
    try {
      await Promise.all([
        delMany(userKeys(user.id)),
        delPattern(leaderboardPattern('daily')),
        delPattern(leaderboardPattern('weekly')),
        delPattern(leaderboardPattern('monthly')),
      ]);
    } catch {
      // Cache invalidation failure is non-fatal; data is still in DB
    }

    const response: CreateSessionResponse = {
      success: true,
      sessionId: newSession.id,
      message: 'Session recorded successfully',
    };

    return successResponse(response, 201);
  } catch (error) {
    console.error('[API] V1 Sessions error:', error);
    return Errors.internalError();
  }
}

/**
 * OPTIONS /api/v1/sessions
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}
