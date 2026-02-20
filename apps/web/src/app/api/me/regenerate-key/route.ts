import { safeAuth } from '@/lib/safe-auth';
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { successResponse, Errors } from "@/lib/api-response";
import { generateApiKey, storeNewApiKeyForUser } from "@/lib/auth";
import { logApiKeyRegenerated } from "@/lib/audit";

/**
 * API key regeneration response
 */
interface RegenerateKeyResponse {
  apiKey: string;
  apiKeyPrefix: string;
  message: string;
  warning: string;
}

/**
 * POST /api/me/regenerate-key
 *
 * Generates a new API key for the current user.
 * The old key is immediately invalidated.
 * The new key is only shown once in this response.
 *
 * Requires JWT session authentication.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound("User");
    }

    // Store old prefix for audit log
    const oldPrefix = user.apiKeyPrefix ?? 'none';

    // Generate new API key
    const { key, hash, prefix, encrypted } = generateApiKey(user.id);

    await storeNewApiKeyForUser(user.id, {
      hash,
      prefix,
      encrypted,
    });

    // Log the key regeneration event
    await logApiKeyRegenerated(user.id, oldPrefix, prefix, request);

    const response: RegenerateKeyResponse = {
      apiKey: key,
      apiKeyPrefix: prefix,
      message: "API key regenerated successfully",
      warning:
        "This is the only time your full API key will be shown. Please save it securely.",
    };

    return successResponse(response);
  } catch (error) {
    console.error("[API] Regenerate key error:", error);
    return Errors.internalError();
  }
}
