import { safeAuth } from '@/lib/safe-auth';
import { db, apiKeys } from '@/db';
import { and, desc, eq } from 'drizzle-orm';
import { successResponse, Errors, rateLimitResponse } from '@/lib/api-response';
import { decryptApiKey } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET() {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const rateLimitResult = await checkRateLimit(`me:api-key:${userId}`);
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult.reset);
    }

    const keyRecords = await db
      .select({
        keyPrefix: apiKeys.keyPrefix,
        keyEncrypted: apiKeys.keyEncrypted,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
      .orderBy(desc(apiKeys.createdAt));

    if (keyRecords.length === 0) {
      return successResponse({ apiKey: null, hasKey: false });
    }

    for (const keyRecord of keyRecords) {
      if (keyRecord.keyEncrypted) {
        try {
          const apiKey = decryptApiKey(keyRecord.keyEncrypted, userId);
          return successResponse({ apiKey, hasKey: true, prefix: keyRecord.keyPrefix });
        } catch {}
      }
    }

    return successResponse({ apiKey: null, hasKey: true, prefix: keyRecords[0].keyPrefix });
  } catch (error) {
    console.error('[API] Get API key error:', error);
    return Errors.internalError();
  }
}
