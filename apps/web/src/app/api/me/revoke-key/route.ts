import { safeAuth } from '@/lib/safe-auth';
import { db, users, apiKeys } from '@/db';
import { eq } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';
import { logApiKeyRevoked } from '@/lib/audit';

/**
 * API key revocation response
 */
interface RevokeKeyResponse {
  success: boolean;
  message: string;
  revokedKeyPrefix: string;
  nextSteps: string[];
}

/**
 * POST /api/me/revoke-key
 *
 * Immediately invalidates the current API key.
 * User must generate a new key via regenerate-key or re-register.
 * Use this when an API key may have been compromised.
 *
 * Requires JWT session authentication.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    // Store old prefix for audit log
    const oldPrefix = user.apiKeyPrefix ?? 'none';

    const revokedPrefix = `revoked_${Date.now()}`;

    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.userId, user.id));

    await db
      .update(users)
      .set({
        apiKeyPrefix: revokedPrefix,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Log the key revocation event
    await logApiKeyRevoked(user.id, oldPrefix, 'user_requested', request);

    const response: RevokeKeyResponse = {
      success: true,
      message: 'API key has been revoked immediately',
      revokedKeyPrefix: oldPrefix,
       nextSteps: [
         'Your old API key is now invalid and cannot be used',
         'To generate a new API key, use the regenerate-key endpoint or re-register via CLI',
         'Update your local credentials with: modu arena register',
       ],
    };

    return successResponse(response);
  } catch (error) {
    console.error('[API] Revoke key error:', error);
    return Errors.internalError();
  }
}
