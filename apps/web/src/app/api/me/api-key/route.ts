import { safeAuth } from '@/lib/safe-auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';
import { decryptApiKey } from '@/lib/auth';

export async function GET() {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const userResult = await db
      .select({
        apiKeyEncrypted: users.apiKeyEncrypted,
        apiKeyPrefix: users.apiKeyPrefix,
        apiKeyHash: users.apiKeyHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    if (!user.apiKeyHash || !user.apiKeyPrefix) {
      return successResponse({ apiKey: null, hasKey: false });
    }

    if (!user.apiKeyEncrypted) {
      return successResponse({ apiKey: null, hasKey: true, prefix: user.apiKeyPrefix });
    }

    try {
      const apiKey = decryptApiKey(user.apiKeyEncrypted, userId);
      return successResponse({ apiKey, hasKey: true, prefix: user.apiKeyPrefix });
    } catch {
      return successResponse({ apiKey: null, hasKey: true, prefix: user.apiKeyPrefix });
    }
  } catch (error) {
    console.error('[API] Get API key error:', error);
    return Errors.internalError();
  }
}
