import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, sessions, tokenUsage, dailyUserStats } from '@/db';
import { inArray, sql } from 'drizzle-orm';
import { toolTypes } from '@/db';
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

/**
 * Batch API Constants
 */
const MAX_BATCH_SIZE = 100;
const MAX_INPUT_TOKENS = 500_000_000;
const MAX_OUTPUT_TOKENS = 100_000_000;
const MAX_CACHE_TOKENS = 1_000_000_000;

/**
 * Code metrics schema for vibe coding analytics
 */
const CodeMetricsSchema = z.object({
  linesAdded: z.number().int().min(0).optional().default(0),
  linesDeleted: z.number().int().min(0).optional().default(0),
  filesModified: z.number().int().min(0).optional().default(0),
  filesCreated: z.number().int().min(0).optional().default(0),
});

/**
 * Single session schema for batch
 *
  * NOTE: endedAt has NO timestamp tolerance for batch API.
  * Batch submissions are authenticated via API key + HMAC, so replay protection
  * is handled by serverSessionHash deduplication instead of timestamp validation.
  * This allows historical session sync (e.g., `modu arena sync`).
 */
const BatchSessionSchema = z.object({
  sessionHash: z.string().length(64, 'Invalid session hash').optional(),
  anonymousProjectId: z.string().max(100).optional(),
  toolType: z.enum(['claude-code', 'claude-desktop', 'opencode', 'gemini', 'codex', 'crush']).optional().default('claude-code'),
  endedAt: z.string().datetime(),
  modelName: z.string().max(50).optional(),
  inputTokens: z.number().int().min(0).max(MAX_INPUT_TOKENS),
  outputTokens: z.number().int().min(0).max(MAX_OUTPUT_TOKENS),
  cacheCreationTokens: z.number().int().min(0).max(MAX_CACHE_TOKENS).optional().default(0),
  cacheReadTokens: z.number().int().min(0).max(MAX_CACHE_TOKENS).optional().default(0),
  // Vibe coding analytics fields
  startedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(0).max(604800).optional(), // Max 7 days
  turnCount: z.number().int().min(0).max(10000).optional(),
  toolUsage: z.record(z.string(), z.number().int().min(0)).optional(),
  codeMetrics: CodeMetricsSchema.optional(),
});

const BatchRequestSchema = z.object({
  sessions: z
    .array(BatchSessionSchema)
    .min(1, 'At least one session required')
    .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} sessions per batch`),
});

interface SessionResult {
  index: number;
  sessionHash: string;
  success: boolean;
  sessionId?: string;
  error?: string;
}

interface BatchResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  duplicates: number;
  results: SessionResult[];
}

/**
 * POST /api/v1/sessions/batch
 *
 * Records multiple Claude Code sessions with BULK INSERT optimization.
 * Reduces DB calls from O(n*4) to O(5) for n sessions.
 */
export async function POST(request: NextRequest) {
  try {
    // === Authentication ===
    const { apiKey, timestamp, signature } = extractHmacAuth(request.headers);

    if (!apiKey) {
      return Errors.unauthorized('API key required');
    }

    const user = await validateApiKey(apiKey);
    if (!user) {
      const prefix = apiKey.substring(0, 16);
      await logInvalidApiKey(prefix, '/api/v1/sessions/batch', request);
      return Errors.unauthorized('Invalid API key');
    }

    const rateLimitResult = await checkRateLimit(user.id);
    if (!rateLimitResult.success) {
      await logRateLimitExceeded(user.id, '/api/v1/sessions/batch', request);
      return Errors.rateLimited(
        `Rate limit exceeded. Try again after ${new Date(rateLimitResult.reset).toISOString()}`
      );
    }

    if (!timestamp || !signature) {
      await logInvalidHmacSignature(
        user.id,
        '/api/v1/sessions/batch',
        'Missing timestamp or signature',
        request
      );
      return Errors.unauthorized('HMAC authentication required');
    }

    const bodyText = await request.text();
    if (!verifyHmacSignature(apiKey, timestamp, bodyText, signature)) {
      await logInvalidHmacSignature(
        user.id,
        '/api/v1/sessions/batch',
        'Signature mismatch or expired timestamp',
        request
      );
      return Errors.unauthorized('Invalid HMAC signature');
    }

    // === Parse Request ===
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Errors.validationError('Invalid JSON body');
    }

    const parseResult = BatchRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return Errors.validationError('Invalid batch data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { sessions: sessionDataList } = parseResult.data;

    // === Phase 1: Compute all server hashes (local, O(n)) ===
    const sessionsWithHash = sessionDataList.map((s, index) => ({
      index,
      data: s,
      serverHash: computeSessionHash(user.id, user.userSalt, {
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheCreationTokens: s.cacheCreationTokens,
        cacheReadTokens: s.cacheReadTokens,
        modelName: s.modelName,
        endedAt: s.endedAt,
      }),
    }));

    const allHashes = sessionsWithHash.map((s) => s.serverHash);

    // === Phase 2: Check duplicates in ONE query ===
    const existingHashes = await db
      .select({ hash: sessions.sessionHash })
      .from(sessions)
      .where(inArray(sessions.sessionHash, allHashes));

    const existingHashSet = new Set(existingHashes.map((e) => e.hash));

    // Separate new vs duplicate sessions
    const newSessions: typeof sessionsWithHash = [];
    const duplicateSessions: typeof sessionsWithHash = [];

    for (const session of sessionsWithHash) {
      if (existingHashSet.has(session.serverHash)) {
        duplicateSessions.push(session);
      } else {
        newSessions.push(session);
      }
    }

    const results: SessionResult[] = [];

    // Mark duplicates as failed
    for (const dup of duplicateSessions) {
      results.push({
        index: dup.index,
        sessionHash: dup.serverHash.substring(0, 16),
        success: false,
        error: 'Session already recorded',
      });
    }

    // If no new sessions, return early
    if (newSessions.length === 0) {
      return successResponse<BatchResponse>(
        {
          success: false,
          processed: sessionDataList.length,
          succeeded: 0,
          failed: duplicateSessions.length,
          duplicates: duplicateSessions.length,
          results: results.sort((a, b) => a.index - b.index),
        },
        200
      );
    }

    // === Phase 3: Bulk INSERT sessions with vibe coding analytics ===
    const sessionInsertValues = newSessions.map((s) => ({
      userId: user.id,
      sessionHash: s.serverHash,
      toolTypeId: s.data.toolType,
      anonymousProjectId: s.data.anonymousProjectId,
      startedAt: s.data.startedAt ? new Date(s.data.startedAt) : new Date(),
      endedAt: new Date(s.data.endedAt),
      durationSeconds: s.data.durationSeconds ?? 0,
      modelName: s.data.modelName,
      turnCount: s.data.turnCount,
      toolUsage: s.data.toolUsage,
      codeMetrics: s.data.codeMetrics,
    }));

    const insertedSessions = await db
      .insert(sessions)
      .values(sessionInsertValues)
      .returning({ id: sessions.id, hash: sessions.sessionHash });

    // Create hash -> sessionId map
    const hashToSessionId = new Map<string, string>();
    for (const inserted of insertedSessions) {
      hashToSessionId.set(inserted.hash, inserted.id);
    }

    // === Phase 4: Bulk INSERT token_usage ===
    const tokenInsertValues = newSessions
      .map((s) => {
        const sessionId = hashToSessionId.get(s.serverHash);
        if (!sessionId) return null;
        return {
          sessionId,
          userId: user.id,
          toolTypeId: s.data.toolType,
          inputTokens: s.data.inputTokens,
          outputTokens: s.data.outputTokens,
          cacheCreationTokens: s.data.cacheCreationTokens,
          cacheReadTokens: s.data.cacheReadTokens,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    await db.insert(tokenUsage).values(tokenInsertValues);

    // === Phase 5: Aggregate daily stats and bulk UPSERT ===
    const dailyStats = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        cacheTokens: number;
        sessionCount: number;
        byTool: Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; sessionCount: number }>;
      }
    >();

    for (const s of newSessions) {
      const dateKey = new Date(s.data.endedAt).toISOString().split('T')[0];
      const existing = dailyStats.get(dateKey) || {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        sessionCount: 0,
        byTool: {} as Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; sessionCount: number }>,
      };

      existing.inputTokens += s.data.inputTokens;
      existing.outputTokens += s.data.outputTokens;
      existing.cacheTokens += (s.data.cacheCreationTokens ?? 0) + (s.data.cacheReadTokens ?? 0);
      existing.sessionCount += 1;

      // Track by tool type
      const toolType = s.data.toolType;
      if (!existing.byTool[toolType]) {
        existing.byTool[toolType] = { inputTokens: 0, outputTokens: 0, cacheTokens: 0, sessionCount: 0 };
      }
      existing.byTool[toolType].inputTokens += s.data.inputTokens;
      existing.byTool[toolType].outputTokens += s.data.outputTokens;
      existing.byTool[toolType].cacheTokens += (s.data.cacheCreationTokens ?? 0) + (s.data.cacheReadTokens ?? 0);
      existing.byTool[toolType].sessionCount += 1;

      dailyStats.set(dateKey, existing);
    }

    // Upsert each date (usually 1-2 dates per batch)
    for (const [date, stats] of dailyStats) {
      await db
        .insert(dailyUserStats)
        .values({
          userId: user.id,
          statDate: date,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          cacheTokens: stats.cacheTokens,
          totalTokens: stats.inputTokens + stats.outputTokens + stats.cacheTokens,
          sessionCount: stats.sessionCount,
          byTool: stats.byTool,
        })
        .onConflictDoUpdate({
          target: [dailyUserStats.userId, dailyUserStats.statDate],
          set: {
            inputTokens: sql`${dailyUserStats.inputTokens} + ${stats.inputTokens}`,
            outputTokens: sql`${dailyUserStats.outputTokens} + ${stats.outputTokens}`,
            cacheTokens: sql`${dailyUserStats.cacheTokens} + ${stats.cacheTokens}`,
            totalTokens: sql`${dailyUserStats.totalTokens} + ${stats.inputTokens + stats.outputTokens + stats.cacheTokens}`,
            sessionCount: sql`${dailyUserStats.sessionCount} + ${stats.sessionCount}`,
            byTool: sql`${dailyUserStats.byTool} || '{}'::jsonb || ${JSON.stringify(stats.byTool)}::jsonb`,
          },
        });
    }

    // Build success results
    for (const s of newSessions) {
      results.push({
        index: s.index,
        sessionHash: s.serverHash.substring(0, 16),
        success: true,
        sessionId: hashToSessionId.get(s.serverHash),
      });
    }

    // Sort by original index
    results.sort((a, b) => a.index - b.index);

    await logSecurityEvent('batch_sessions_created', user.id, {
      totalSessions: sessionDataList.length,
      succeeded: newSessions.length,
      duplicates: duplicateSessions.length,
    });

    return successResponse<BatchResponse>(
      {
        success: true,
        processed: sessionDataList.length,
        succeeded: newSessions.length,
        failed: duplicateSessions.length,
        duplicates: duplicateSessions.length,
        results,
      },
      201
    );
  } catch (error) {
    console.error('[API] V1 Sessions Batch error:', error);
    return Errors.internalError();
  }
}

export async function OPTIONS() {
  return corsOptionsResponse();
}
