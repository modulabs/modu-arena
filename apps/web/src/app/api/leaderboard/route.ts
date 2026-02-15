import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, users, dailyUserStats, projectEvaluations, userStats } from '@/db';
import { eq, sql, gte, desc, sum } from 'drizzle-orm';
import {
  Errors,
  createPaginationMeta,
  paginatedResponse,
  corsOptionsResponse,
} from '@/lib/api-response';
import { checkPublicRateLimit, extractIpAddress } from '@/lib/rate-limiter';
import { withCache, set as cacheSet } from '@/lib/cache';
import { leaderboardKey } from '@/cache/keys';
import { CACHE_TTL } from '@/cache/config';

/**
 * Query parameters schema for usage overview
 */
const UsageQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).optional().default('weekly'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * Usage entry response type
 */
interface UsageEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalTokens: number;
  weeklyTokens: number;
  sessionCount: number;
  score: number;
  lastActivityAt: string | null;
  isPrivate: boolean;
}

/**
 * Compute the start date for a given period relative to today.
 */
function getDateRangeStart(period: 'daily' | 'weekly' | 'monthly'): Date {
  const now = new Date();
  switch (period) {
    case 'daily': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'weekly': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'monthly': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
}

/**
 * GET /api/leaderboard
 *
 * Returns aggregated usage data for all users over a given period.
 * Respects user privacy settings.
 *
 * Query params:
 * - period: 'daily' | 'weekly' | 'monthly' (default: 'weekly')
 * - limit: number (1-100, default: 50)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    // IP-based rate limiting for public endpoint
    const ipAddress = extractIpAddress(request.headers);
    const rateLimitResult = await checkPublicRateLimit(ipAddress);
    if (!rateLimitResult.success) {
      return Errors.rateLimited(
        `Rate limit exceeded. Try again after ${new Date(rateLimitResult.reset).toISOString()}`
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const parseResult = UsageQuerySchema.safeParse({
      period: searchParams.get('period') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });

    if (!parseResult.success) {
      return Errors.validationError('Invalid query parameters', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { period, limit, offset } = parseResult.data;

    const rangeStart = getDateRangeStart(period);
    const rangeStartStr = rangeStart.toISOString().split('T')[0];

    const weeklyStart = getDateRangeStart('weekly');
    const weeklyStartStr = weeklyStart.toISOString().split('T')[0];

    const minStartStr = weeklyStartStr < rangeStartStr ? weeklyStartStr : rangeStartStr;

    // Cache configuration
    const cacheKey = leaderboardKey(period, limit, offset);
    const defaultTtl = CACHE_TTL.LEADERBOARD[period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly'];
    const EMPTY_RESULT_TTL = 5 * 60;

    // Fetch data with caching
    const result = await withCache(cacheKey, defaultTtl, async () => {
      const usageData = await db
        .select({
          userId: dailyUserStats.userId,
          username: sql<string>`COALESCE(${users.username}, ${users.githubUsername}, 'Anonymous')`,
          avatarUrl: users.githubAvatarUrl,
          totalTokens: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${rangeStartStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END), 0)`,
          weeklyTokens: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${weeklyStartStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END), 0)`,
          sessionCount: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${rangeStartStr} THEN ${dailyUserStats.sessionCount} ELSE 0 END), 0)`,
          lastActivityAt: userStats.lastActivityAt,
          privacyMode: users.privacyMode,
        })
        .from(dailyUserStats)
        .innerJoin(users, eq(dailyUserStats.userId, users.id))
        .leftJoin(userStats, eq(userStats.userId, users.id))
        .where(gte(dailyUserStats.statDate, minStartStr))
        .groupBy(
          dailyUserStats.userId,
          users.username,
          users.githubUsername,
          users.githubAvatarUrl,
          users.privacyMode,
          userStats.lastActivityAt
        )
        .having(sql`SUM(CASE WHEN ${dailyUserStats.statDate} >= ${rangeStartStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END) > 0`)
        .orderBy(desc(sql`SUM(CASE WHEN ${dailyUserStats.statDate} >= ${rangeStartStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END)`))
        .limit(limit)
        .offset(offset);

      const userIds = usageData.map(r => r.userId).filter(Boolean);
      const projectScores = userIds.length > 0
        ? await db
            .select({
              userId: projectEvaluations.userId,
              finalScoreSum: sql<number>`COALESCE(SUM(${projectEvaluations.finalScore}), 0)`,
            })
            .from(projectEvaluations)
            .where(sql`${projectEvaluations.userId} IN ${userIds}`)
            .groupBy(projectEvaluations.userId)
        : [];

      const scoreMap = new Map(projectScores.map(s => [s.userId, Number(s.finalScoreSum)]));

      // Get total distinct users for pagination
      const countResult = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${dailyUserStats.userId})` })
        .from(dailyUserStats)
        .where(gte(dailyUserStats.statDate, rangeStartStr));

      const total = Number(countResult[0]?.count ?? 0);

      // Transform data respecting privacy settings
      const entries: UsageEntry[] = usageData.map((r, idx) => ({
        userId: r.privacyMode ? 'private' : (r.userId ?? 'unknown'),
        username: r.privacyMode ? `User #${offset + idx + 1}` : (r.username ?? 'Unknown'),
        avatarUrl: r.privacyMode ? null : (r.avatarUrl ?? null),
        totalTokens: Number(r.totalTokens),
        weeklyTokens: r.privacyMode ? 0 : Number(r.weeklyTokens),
        sessionCount: Number(r.sessionCount),
        score: r.privacyMode ? 0 : (scoreMap.get(r.userId) ?? 0),
        lastActivityAt: r.privacyMode ? null : (r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null),
        isPrivate: r.privacyMode ?? false,
      }));

      const pagination = createPaginationMeta(Math.floor(offset / limit) + 1, limit, total);

      return { entries, pagination };
    });

    // Re-cache with short TTL if result is empty
    if (result.entries.length === 0 && defaultTtl > EMPTY_RESULT_TTL) {
      await cacheSet(cacheKey, result, EMPTY_RESULT_TTL);
    }

    return paginatedResponse(result.entries, result.pagination);
  } catch (error) {
    console.error('[API] Usage overview error:', error);
    return Errors.internalError();
  }
}

/**
 * OPTIONS /api/leaderboard
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}
