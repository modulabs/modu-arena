import type { NextRequest } from 'next/server';
import { safeAuth } from '@/lib/safe-auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { successResponse, Errors, rateLimitResponse } from '@/lib/api-response';
import { checkRateLimit } from '@/lib/rate-limiter';

interface CurrentUserInfo {
  id: string;
  username: string;
  displayName: string | null;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  apiKeyPrefix: string | null;
  privacyMode: boolean;
  successfulProjectsCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/me
 *
 * Returns current authenticated user info including API key prefix.
 * Requires JWT session authentication.
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const rateLimitResult = await checkRateLimit(`me:${userId}`);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult.reset);
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    const response: CurrentUserInfo = {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      githubUsername: user.githubUsername,
      githubAvatarUrl: user.githubAvatarUrl,
      apiKeyPrefix: user.apiKeyPrefix,
      privacyMode: user.privacyMode ?? false,
      successfulProjectsCount: user.successfulProjectsCount ?? 0,
      createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    return successResponse(response);
  } catch (error) {
    console.error('[API] Me error:', error);
    return Errors.internalError();
  }
}
