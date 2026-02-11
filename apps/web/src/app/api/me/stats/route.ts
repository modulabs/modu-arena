import { auth } from '@clerk/nextjs/server';
import { db, users, dailyUserStats } from '@/db';
import { eq, desc, and, sql, gte } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';
import { withCache } from '@/lib/cache';
import { userStatsKey } from '@/cache/keys';
import { CACHE_TTL } from '@/cache/config';

/**
 * User detailed statistics response
 * UPDATED: Added multi-tool metrics and project count
 */
interface UserDetailedStats {
  overview: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalSessions: number;
    averageTokensPerSession: number;
    efficiencyScore: number;
    successfulProjectsCount: number; // NEW
  };
  toolBreakdown: { // NEW: Multi-tool breakdown
    toolType: string;
    tokens: number;
    sessions: number;
    percentage: number;
  }[];
  trends: {
    last7Days: DailyStats[];
    last30Days: DailyStats[];
  };
  streaks: {
    current: number;
    longest: number;
  };
}

interface DailyStats {
  date: string;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
}

/**
 * GET /api/me/stats
 *
 * Returns detailed statistics for current authenticated user.
 * Includes token usage trends, multi-tool breakdown, and project count.
 * Requires Clerk authentication.
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return Errors.unauthorized();
    }

    // Find user by Clerk ID
    const userResult = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    // Cache key for this user's stats
    const cacheKey = userStatsKey(user.id);

    // Fetch user stats with caching
    const stats = await withCache(cacheKey, CACHE_TTL.USER_STATS, async () => {
      // Get daily aggregates for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyStatsResult = await db
        .select({
          date: dailyUserStats.statDate,
          inputTokens: dailyUserStats.inputTokens,
          outputTokens: dailyUserStats.outputTokens,
          sessions: dailyUserStats.sessionCount,
          byTool: dailyUserStats.byTool,
        })
        .from(dailyUserStats)
        .where(
          and(
            eq(dailyUserStats.userId, user.id),
            gte(dailyUserStats.statDate, thirtyDaysAgo.toISOString().split('T')[0])
          )
        )
        .orderBy(desc(dailyUserStats.statDate));

      const dailyStats: DailyStats[] = dailyStatsResult.map((d) => ({
        date: d.date,
        inputTokens: Number(d.inputTokens ?? 0),
        outputTokens: Number(d.outputTokens ?? 0),
        sessions: d.sessions ?? 0,
      }));

      // Calculate totals from daily stats
      const totalInputTokens = dailyStats.reduce((sum, d) => sum + d.inputTokens, 0);
      const totalOutputTokens = dailyStats.reduce((sum, d) => sum + d.outputTokens, 0);
      const totalSessions = dailyStats.reduce((sum, d) => sum + d.sessions, 0);

      // Calculate tool breakdown
      const toolTotals: Record<string, { tokens: number; sessions: number }> = {};

      for (const day of dailyStatsResult) {
        if (day.byTool && typeof day.byTool === 'object') {
          for (const [toolType, data] of Object.entries(day.byTool)) {
            if (!toolTotals[toolType]) {
              toolTotals[toolType] = { tokens: 0, sessions: 0 };
            }
            if (typeof data === 'object' && data !== null) {
              const toolData = data as { tokens?: number; sessions?: number };
              toolTotals[toolType].tokens += toolData.tokens ?? 0;
              toolTotals[toolType].sessions += toolData.sessions ?? 0;
            }
          }
        }
      }

      const totalAllTokens = totalInputTokens + totalOutputTokens;
      const toolBreakdown = Object.entries(toolTotals)
        .map(([toolType, data]) => ({
          toolType,
          tokens: data.tokens,
          sessions: data.sessions,
          percentage: totalAllTokens > 0 ? (data.tokens / totalAllTokens) * 100 : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

      // Calculate streaks
      const streaks = calculateStreaks(dailyStats);

      // Calculate efficiency score
      const efficiencyScore =
        totalInputTokens > 0
          ? Math.round((totalOutputTokens / totalInputTokens) * 10000) / 10000
          : 0;

      // Split into 7-day and 30-day trends
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const last7Days = dailyStats.filter((d) => d.date >= sevenDaysAgoStr);
      const last30Days = dailyStats;

      return {
        overview: {
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalAllTokens,
          totalSessions,
          averageTokensPerSession:
            totalSessions > 0 ? Math.round(totalAllTokens / totalSessions) : 0,
          efficiencyScore,
          successfulProjectsCount: user.successfulProjectsCount ?? 0, // NEW
        },
        toolBreakdown, // NEW: Multi-tool metrics
        trends: {
          last7Days,
          last30Days,
        },
        streaks,
      } as UserDetailedStats;
    });

    return successResponse(stats);
  } catch (error) {
    console.error('[API] Me stats error:', error);
    return Errors.internalError();
  }
}

/**
 * Calculate current and longest streaks from daily stats
 */
function calculateStreaks(dailyStats: DailyStats[]): {
  current: number;
  longest: number;
} {
  if (dailyStats.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Sort by date descending (most recent first)
  const sorted = [...dailyStats].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;

  // Check if most recent day is today or yesterday for current streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const mostRecentDate = new Date(sorted[0].date);
  mostRecentDate.setHours(0, 0, 0, 0);

  const isCurrentStreakActive =
    mostRecentDate.getTime() === today.getTime() ||
    mostRecentDate.getTime() === yesterday.getTime();

  for (const day of sorted) {
    const currentDate = new Date(day.date);
    currentDate.setHours(0, 0, 0, 0);

    if (day.sessions > 0) {
      if (lastDate === null) {
        tempStreak = 1;
      } else {
        const diffDays = Math.round(
          (lastDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      lastDate = currentDate;
    }
  }

  longestStreak = Math.max(longestStreak, tempStreak);
  currentStreak = isCurrentStreakActive ? tempStreak : 0;

  return { current: currentStreak, longest: longestStreak };
}
