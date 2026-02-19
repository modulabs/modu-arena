import type { NextRequest } from 'next/server';
import { db, dailyUserStats, userStats, users } from '@/db';
import { eq, sql, gte } from 'drizzle-orm';
import { successResponse, Errors, corsOptionsResponse } from '@/lib/api-response';
import { validateApiKey, extractApiKey } from '@/lib/auth';
import { logInvalidApiKey, logRateLimitExceeded } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limiter';
import { withCache } from '@/lib/cache';
import { userRankKey } from '@/cache/keys';
import { CACHE_TTL } from '@/cache/config';

/**
 * User usage response for CLI
 */
interface UserUsageResponse {
  username: string;
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheTokens: number;
    totalTokens: number;
    totalSessions: number;
    toolBreakdown: Array<{ tool: string; tokens: number }>;
    last7Days: DailyUsage[];
    last30Days: DailyUsage[];
  };
  overview: {
    successfulProjectsCount: number;
  };
  lastUpdated: string;
}

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  sessions: number;
}

/**
 * GET /api/v1/rank
 *
 * Returns current user's usage statistics.
 * Requires API key authentication.
 *
 * Headers:
 * - X-API-Key: User's API key
 */
export async function GET(request: NextRequest) {
  try {
    // Extract and validate API key
    const apiKey = extractApiKey(request.headers);

    if (!apiKey) {
      return Errors.unauthorized('API key required');
    }

    const user = await validateApiKey(apiKey);

    if (!user) {
      // Log invalid API key attempt
      const prefix = apiKey.substring(0, 16);
      await logInvalidApiKey(prefix, '/api/v1/rank', request);
      return Errors.unauthorized('Invalid API key');
    }

    // Distributed rate limiting - 100 requests per minute per user
    const rateLimitResult = await checkRateLimit(user.id);
    if (!rateLimitResult.success) {
      await logRateLimitExceeded(user.id, '/api/v1/rank', request);
      return Errors.rateLimited(
        `Rate limit exceeded. Try again after ${new Date(rateLimitResult.reset).toISOString()}`
      );
    }

    // Fetch user usage data with per-user caching
    const cacheKey = userRankKey(user.id);
    const response = await withCache(cacheKey, CACHE_TTL.USER_RANK, async () => {
      // Get aggregated totals from userStats table (pre-computed)
      const statsResult = await db
        .select({
          totalInputTokens: userStats.totalInputTokens,
          totalOutputTokens: userStats.totalOutputTokens,
          totalCacheTokens: userStats.totalCacheTokens,
          totalAllTokens: userStats.totalAllTokens,
          totalSessions: userStats.totalSessions,
          tokensByTool: userStats.tokensByTool,
          successfulProjectsCount: userStats.successfulProjectsCount,
        })
        .from(userStats)
        .where(eq(userStats.userId, user.id));

      const stats = statsResult[0];
      const totalInputTokens = Number(stats?.totalInputTokens ?? 0);
      const totalOutputTokens = Number(stats?.totalOutputTokens ?? 0);
      const totalCacheTokens = Number(stats?.totalCacheTokens ?? 0);
      const totalAllTokens = Number(stats?.totalAllTokens ?? 0);

      // Get last 30 days of daily usage
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const dailyRows = await db
        .select({
          date: dailyUserStats.statDate,
          inputTokens: dailyUserStats.inputTokens,
          outputTokens: dailyUserStats.outputTokens,
          cacheTokens: dailyUserStats.cacheTokens,
          totalTokens: dailyUserStats.totalTokens,
          sessions: dailyUserStats.sessionCount,
          byTool: dailyUserStats.byTool,
        })
        .from(dailyUserStats)
        .where(
          sql`${dailyUserStats.userId} = ${user.id} AND ${dailyUserStats.statDate} >= ${thirtyDaysAgoStr}`
        )
        .orderBy(dailyUserStats.statDate);

      const last30Days: DailyUsage[] = dailyRows.map((r) => ({
        date: String(r.date),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        cacheTokens: Number(r.cacheTokens ?? 0),
        sessions: Number(r.sessions),
      }));

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      const last7Days = last30Days.filter((d) => d.date >= sevenDaysAgoStr);

      // Parse tool breakdown from JSONB
      const tokensByTool = stats?.tokensByTool as Record<string, number> | null;
      const toolBreakdown = tokensByTool
        ? Object.entries(tokensByTool).map(([tool, tokens]) => ({
            tool,
            tokens: Number(tokens),
          }))
        : [];

      return {
        username: user.githubUsername,
        usage: {
          totalInputTokens,
          totalOutputTokens,
          totalCacheTokens,
          totalTokens: totalAllTokens,
          totalSessions: Number(stats?.totalSessions ?? 0),
          toolBreakdown,
          last7Days,
          last30Days,
        },
        overview: {
          successfulProjectsCount: Number(stats?.successfulProjectsCount ?? 0),
        },
        lastUpdated: new Date().toISOString(),
      } as UserUsageResponse;
    });

    return successResponse(response);
  } catch (error) {
    console.error('[API] V1 Rank error:', error);
    return Errors.internalError();
  }
}

/**
 * OPTIONS /api/v1/rank
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}
