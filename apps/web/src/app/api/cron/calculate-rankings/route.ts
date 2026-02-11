import type { NextRequest } from 'next/server';
import { db, getPooledDb, dailyUserStats, tokenUsage, sessions } from '@/db';
import { sql, and, gte } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';

/**
 * Cron Job: Daily Usage Aggregation
 *
 * Aggregates yesterday's tokenUsage grouped by userId,
 * upserts into dailyUserStats.
 */

export const maxDuration = 60;

const BATCH_SIZE = 100;

export const dynamic = 'force-dynamic';

interface AggregationResult {
  status: 'success' | 'error';
  rowsAggregated: number;
  executionTimeMs: number;
  error?: string;
}

/**
 * GET /api/cron/calculate-rankings
 *
 * Aggregates usage data into daily_user_stats.
 * Security: Verifies CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const authorization = authHeader?.replace('Bearer ', '');

    const isDev = process.env.NODE_ENV === 'development';
    if (!cronSecret && !isDev) {
      console.error('[CRON] CRITICAL: CRON_SECRET environment variable is not configured');
      return Errors.internalError('Server configuration error');
    }

    if (!isDev && cronSecret !== authorization) {
      console.warn('[CRON] Unauthorized cron request');
      return Errors.unauthorized('Invalid cron secret');
    }

    const pooledDb = getPooledDb();
    const startTime = Date.now();
    let result: AggregationResult;

    try {
      console.log('[CRON] Starting daily usage aggregation...');
      result = await aggregateUsageData(pooledDb);
      console.log(
        `[CRON] Aggregation completed: ${result.rowsAggregated} rows in ${result.executionTimeMs}ms`
      );
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CRON] Aggregation failed after ${executionTimeMs}ms:`, error);
      result = {
        status: 'error',
        rowsAggregated: 0,
        executionTimeMs,
        error: errorMessage,
      };
    }

    const totalTimeMs = Date.now() - startTime;

    console.log(`[CRON] Complete: total time ${totalTimeMs}ms`);

    return successResponse({
      success: result.status === 'success',
      timestamp: new Date().toISOString(),
      summary: {
        rows_aggregated: result.rowsAggregated,
        total_execution_time_ms: totalTimeMs,
      },
      result,
    });
  } catch (error) {
    console.error('[CRON] Usage aggregation error:', error);
    return Errors.internalError();
  }
}

/**
 * Aggregate yesterday's token usage into daily_user_stats.
 * Groups tokenUsage by userId, then upserts into dailyUserStats.
 */
async function aggregateUsageData(
  pooledDb: ReturnType<typeof getPooledDb>
): Promise<AggregationResult> {
  const startTime = Date.now();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const dayStart = new Date(`${yesterdayStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${yesterdayStr}T23:59:59.999Z`);

  const rawStats = await db
    .select({
      userId: tokenUsage.userId,
      totalInputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
      totalCacheTokens: sql<number>`COALESCE(SUM(COALESCE(${tokenUsage.cacheCreationTokens}, 0) + COALESCE(${tokenUsage.cacheReadTokens}, 0)), 0)`,
      sessionCount: sql<number>`COUNT(DISTINCT ${tokenUsage.sessionId})`,
    })
    .from(tokenUsage)
    .where(
      and(
        gte(tokenUsage.recordedAt, dayStart),
        sql`${tokenUsage.recordedAt} <= ${dayEnd}`,
        sql`${tokenUsage.userId} IS NOT NULL`
      )
    )
    .groupBy(tokenUsage.userId);

  const stats = rawStats.filter(
    (r): r is typeof r & { userId: string } => r.userId !== null
  );

  if (stats.length === 0) {
    console.log('[CRON] No usage data to aggregate for yesterday');
    return {
      status: 'success',
      rowsAggregated: 0,
      executionTimeMs: Date.now() - startTime,
    };
  }

  const aggregateValues = stats.map((row) => {
    const inputTokens = Number(row.totalInputTokens);
    const outputTokens = Number(row.totalOutputTokens);
    const cacheTokens = Number(row.totalCacheTokens);

    return {
      userId: row.userId,
      statDate: yesterdayStr,
      inputTokens,
      outputTokens,
      cacheTokens,
      totalTokens: inputTokens + outputTokens,
      sessionCount: Number(row.sessionCount),
    };
  });

  let rowsAggregated = 0;

  for (let batchStart = 0; batchStart < aggregateValues.length; batchStart += BATCH_SIZE) {
    const batch = aggregateValues.slice(batchStart, batchStart + BATCH_SIZE);

    await pooledDb
      .insert(dailyUserStats)
      .values(batch)
      .onConflictDoUpdate({
        target: [dailyUserStats.userId, dailyUserStats.statDate],
        set: {
          inputTokens: sql`EXCLUDED.input_tokens`,
          outputTokens: sql`EXCLUDED.output_tokens`,
          cacheTokens: sql`EXCLUDED.cache_tokens`,
          totalTokens: sql`EXCLUDED.total_tokens`,
          sessionCount: sql`EXCLUDED.session_count`,
        },
      });

    rowsAggregated += batch.length;
  }

  console.log(
    `[CRON] Daily user stats: Upserted ${rowsAggregated} rows in ${Math.ceil(aggregateValues.length / BATCH_SIZE)} batches`
  );

  return {
    status: 'success',
    rowsAggregated,
    executionTimeMs: Date.now() - startTime,
  };
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}
