import { Suspense } from 'react';
import { safeAuth } from '@/lib/safe-auth';
import { db, users, dailyUserStats, projectEvaluations, userStats } from '@/db';
import { eq, desc, sql, gte } from 'drizzle-orm';
import { Activity } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { UsageTable, Pagination } from '@/components/leaderboard';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

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

interface UsageResponse {
  success: boolean;
  data?: {
    items: UsageEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  };
}

/**
 * Get date range start based on period
 */
function getDateRangeStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'daily':
      now.setDate(now.getDate() - 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      now.setDate(now.getDate() - 30);
      break;
    default:
      now.setDate(now.getDate() - 1);
  }
  return now;
}

/**
 * Get usage data directly from database
 * Aggregates dailyUserStats grouped by user for the given period
 */
async function getUsageData(
  period: string,
  page: number,
  limit: number
): Promise<UsageResponse> {
  const offset = (page - 1) * limit;

  try {
    const startDate = getDateRangeStart(period);
    const startDateStr = startDate.toISOString().split('T')[0];
    const weeklyStart = getDateRangeStart('weekly');
    const weeklyStartStr = weeklyStart.toISOString().split('T')[0];
    const minStartStr = weeklyStartStr < startDateStr ? weeklyStartStr : startDateStr;

    // Query aggregated usage from dailyUserStats (NEW schema)
    const usageData = await db
      .select({
        userId: dailyUserStats.userId,
        username: sql<string>`COALESCE(${users.username}, ${users.githubUsername}, 'Anonymous')`,
        avatarUrl: users.githubAvatarUrl,
        totalTokens: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${startDateStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END), 0)`,
        weeklyTokens: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${weeklyStartStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END), 0)`,
        sessionCount: sql<number>`COALESCE(SUM(CASE WHEN ${dailyUserStats.statDate} >= ${startDateStr} THEN ${dailyUserStats.sessionCount} ELSE 0 END), 0)`,
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
      .having(sql`SUM(CASE WHEN ${dailyUserStats.statDate} >= ${startDateStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END) > 0`)
      .orderBy(desc(sql`SUM(CASE WHEN ${dailyUserStats.statDate} >= ${startDateStr} THEN ${dailyUserStats.totalTokens} ELSE 0 END)`))
      .limit(limit)
      .offset(offset);

    const userIds = usageData.map(r => r.userId).filter(Boolean);
    const projectScores = userIds.length > 0
      ? await db
          .select({
            userId: projectEvaluations.userId,
            finalScoreSum: sql<number>`COALESCE(SUM(CASE WHEN ${projectEvaluations.passed} = true THEN ${projectEvaluations.finalScore} ELSE 0 END), 0)`,
          })
          .from(projectEvaluations)
          .where(sql`${projectEvaluations.userId} IN ${userIds}`)
          .groupBy(projectEvaluations.userId)
      : [];

    const scoreMap = new Map(projectScores.map(s => [s.userId, Number(s.finalScoreSum)]));

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${dailyUserStats.userId})` })
      .from(dailyUserStats)
      .where(gte(dailyUserStats.statDate, startDateStr));

    const total = Number(countResult[0]?.count ?? 0);

    // Transform data respecting privacy settings
    const entries: UsageEntry[] = usageData.map((r, idx) => ({
      userId: r.privacyMode ? 'private' : (r.userId ?? 'unknown'),
      username: r.privacyMode ? `User #${offset + idx + 1}` : (r.username ?? 'Unknown'),
      avatarUrl: r.privacyMode ? null : (r.avatarUrl ?? null),
      totalTokens: Number(r.totalTokens ?? 0),
      weeklyTokens: r.privacyMode ? 0 : Number(r.weeklyTokens ?? 0),
      sessionCount: Number(r.sessionCount ?? 0),
      score: r.privacyMode ? 0 : (scoreMap.get(r.userId) ?? 0),
      lastActivityAt: r.privacyMode ? null : (r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null),
      isPrivate: r.privacyMode ?? false,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        items: entries,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      },
    };
  } catch (error) {
    console.error('Usage data fetch error:', error);
    return { success: false };
  }
}

async function getCurrentUserDbId(): Promise<string | null> {
  const { userId } = await safeAuth();
  return userId ?? null;
}

interface PageProps {
  searchParams: Promise<{ period?: string; page?: string }>;
}

async function UsageContent({ period, page }: { period: string; page: number }) {
  const t = await getTranslations('home');
  const [usageData, currentUserId] = await Promise.all([
    getUsageData(period, page, 20),
    getCurrentUserDbId(),
  ]);

  if (!usageData.success || !usageData.data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">{t('unableToLoad')}</h3>
        <p className="text-sm text-muted-foreground">{t('tryAgainLater')}</p>
      </div>
    );
  }

  const { items, pagination } = usageData.data;

  return (
    <>
      <UsageTable entries={items} currentUserId={currentUserId} />

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        hasNext={pagination.hasNext}
        hasPrevious={pagination.hasPrevious}
      />
    </>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = params.period || 'weekly';
  const page = Number(params.page) || 1;
  const t = await getTranslations('home');

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t(`periodDescription.${period}` as 'periodDescription.daily')}
        </p>
      </div>

      <div className="space-y-6">
        <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading usage data...</div>}>
          <UsageContent period={period} page={page} />
        </Suspense>
      </div>
    </div>
  );
}
