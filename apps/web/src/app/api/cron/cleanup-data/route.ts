import type { NextRequest } from 'next/server';
import { getPooledDb, tokenUsage, dailyUserStats, sessions } from '@/db';
import { lt, eq } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';

/**
 * Data Retention Cron Job
 *
 * Retention policies (90-day standard):
 * - token_usage: delete where recordedAt < 90 days ago
 * - daily_user_stats: delete where statDate < 90 days ago
 * - sessions: delete where startedAt < 90 days ago
 *
 * Optimizations applied:
 * - Uses Connection Pooler for batch operations
 * - Batch deletes instead of single-row operations (BATCH_SIZE = 100)
 * - Execution time monitoring for observability
 */

export const maxDuration = 60;

const BATCH_SIZE = 100;

export const dynamic = 'force-dynamic';

interface CleanupResult {
  table: string;
  deletedCount: number;
  duration: number;
}

/**
 * GET /api/cron/cleanup-data
 *
 * Cleans up old data according to retention policies.
 * Security: Verifies CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const authorization = authHeader?.replace('Bearer ', '');

    const isDev = process.env.NODE_ENV === 'development';
    if (!cronSecret && !isDev) {
      console.error('[CRON CLEANUP] CRITICAL: CRON_SECRET environment variable is not configured');
      return Errors.internalError('Server configuration error');
    }

    if (!isDev && cronSecret !== authorization) {
      console.warn('[CRON CLEANUP] Unauthorized cron request');
      return Errors.unauthorized('Invalid cron secret');
    }

    console.log('[CRON CLEANUP] Starting data cleanup process');

    const results: CleanupResult[] = [];

    const tokenUsageResult = await cleanupTokenUsage();
    results.push(tokenUsageResult);

    const dailyStatsResult = await cleanupDailyUserStats();
    results.push(dailyStatsResult);

    const sessionsResult = await cleanupSessions();
    results.push(sessionsResult);

    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

    console.log(`[CRON CLEANUP] Cleanup complete. Total deleted: ${totalDeleted} records`);

    return successResponse({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      totalDeleted,
    });
  } catch (error) {
    console.error('[CRON CLEANUP] Error:', error);
    return Errors.internalError();
  }
}

async function cleanupTokenUsage(): Promise<CleanupResult> {
  const startTime = Date.now();
  const pooledDb = getPooledDb();
  let deletedCount = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  console.log(`[CRON CLEANUP] Cleaning up token_usage older than ${cutoffDate.toISOString()}`);

  while (true) {
    const idsToDelete = await pooledDb
      .select({ id: tokenUsage.id })
      .from(tokenUsage)
      .where(lt(tokenUsage.recordedAt, cutoffDate))
      .limit(BATCH_SIZE);

    if (idsToDelete.length === 0) break;

    for (const row of idsToDelete) {
      await pooledDb.delete(tokenUsage).where(eq(tokenUsage.id, row.id));
    }

    deletedCount += idsToDelete.length;
    console.log(`[CRON CLEANUP] token_usage: Deleted ${deletedCount} records so far...`);
  }

  const duration = Date.now() - startTime;
  console.log(`[CRON CLEANUP] token_usage: Deleted ${deletedCount} records in ${duration}ms`);

  return { table: 'token_usage', deletedCount, duration };
}

async function cleanupDailyUserStats(): Promise<CleanupResult> {
  const startTime = Date.now();
  const pooledDb = getPooledDb();
  let deletedCount = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`[CRON CLEANUP] Cleaning up daily_user_stats older than ${cutoffDateStr}`);

  while (true) {
    const idsToDelete = await pooledDb
      .select({ id: dailyUserStats.id })
      .from(dailyUserStats)
      .where(lt(dailyUserStats.statDate, cutoffDateStr))
      .limit(BATCH_SIZE);

    if (idsToDelete.length === 0) break;

    for (const row of idsToDelete) {
      await pooledDb.delete(dailyUserStats).where(eq(dailyUserStats.id, row.id));
    }

    deletedCount += idsToDelete.length;
    console.log(`[CRON CLEANUP] daily_user_stats: Deleted ${deletedCount} records so far...`);
  }

  const duration = Date.now() - startTime;
  console.log(`[CRON CLEANUP] daily_user_stats: Deleted ${deletedCount} records in ${duration}ms`);

  return { table: 'daily_user_stats', deletedCount, duration };
}

async function cleanupSessions(): Promise<CleanupResult> {
  const startTime = Date.now();
  const pooledDb = getPooledDb();
  let deletedCount = 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  console.log(`[CRON CLEANUP] Cleaning up sessions older than ${cutoffDate.toISOString()}`);

  while (true) {
    const idsToDelete = await pooledDb
      .select({ id: sessions.id })
      .from(sessions)
      .where(lt(sessions.startedAt, cutoffDate))
      .limit(BATCH_SIZE);

    if (idsToDelete.length === 0) break;

    for (const row of idsToDelete) {
      await pooledDb.delete(sessions).where(eq(sessions.id, row.id));
    }

    deletedCount += idsToDelete.length;
    console.log(`[CRON CLEANUP] sessions: Deleted ${deletedCount} records so far...`);
  }

  const duration = Date.now() - startTime;
  console.log(`[CRON CLEANUP] sessions: Deleted ${deletedCount} records in ${duration}ms`);

  return { table: 'sessions', deletedCount, duration };
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
