import { safeAuth } from '@/lib/safe-auth';
import { z } from 'zod';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { successResponse, Errors } from '@/lib/api-response';
import { logPrivacyModeChanged, logUserSettingsUpdated, logApiKeyRegenerated } from '@/lib/audit';
import { generateApiKey } from '@/lib/auth';

/**
 * Settings update schema
 */
const UpdateSettingsSchema = z.object({
  privacyMode: z.boolean().optional(),
});

/**
 * Settings response
 */
interface UserSettings {
  privacyMode: boolean;
  updatedAt: string;
}

/**
 * PATCH /api/me/settings
 *
 * Updates user settings.
 * Currently supports:
 * - privacyMode: boolean - Hide username and stats from leaderboard
 *
 * Requires JWT session authentication.
 */
export async function PATCH(request: Request) {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Errors.validationError('Invalid JSON body');
    }

    // Validate input
    const parseResult = UpdateSettingsSchema.safeParse(body);

    if (!parseResult.success) {
      return Errors.validationError('Invalid settings data', {
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const updates = parseResult.data;

    // Check if there's anything to update
    if (Object.keys(updates).length === 0) {
      return Errors.validationError('No settings to update');
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    // Track changes for audit log
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    // Build update object
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.privacyMode !== undefined) {
      const oldValue = user.privacyMode ?? false;
      if (oldValue !== updates.privacyMode) {
        updateData.privacyMode = updates.privacyMode;
        changes.privacyMode = {
          old: oldValue,
          new: updates.privacyMode,
        };
      }
    }

    // Update user settings
    const updatedResult = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning({
        privacyMode: users.privacyMode,
        updatedAt: users.updatedAt,
      });

    const updated = updatedResult[0];

    // Log security events
    if (changes.privacyMode !== undefined && updates.privacyMode !== undefined) {
      await logPrivacyModeChanged(user.id, updates.privacyMode, request);
    }

    if (Object.keys(changes).length > 0) {
      await logUserSettingsUpdated(user.id, changes, request);
    }

    const response: UserSettings = {
      privacyMode: updated.privacyMode ?? false,
      updatedAt: updated.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    return successResponse(response);
  } catch (error) {
    console.error('[API] Settings update error:', error);
    return Errors.internalError();
  }
}

/**
 * POST /api/me/settings
 *
 * Regenerates the user's API key.
 * Returns the new full key (shown once to the user) and the stored prefix.
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

    const oldPrefix = user.apiKeyPrefix ?? 'none';
    const { key, hash, prefix, encrypted } = generateApiKey(user.id);

    await db
      .update(users)
      .set({
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        apiKeyEncrypted: encrypted,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logApiKeyRegenerated(user.id, oldPrefix, prefix, request);

    return successResponse({
      apiKey: key,
      prefix,
    });
  } catch (error) {
    console.error('[API] API key regeneration error:', error);
    return Errors.internalError();
  }
}

/**
 * GET /api/me/settings
 *
 * Returns current user settings.
 * Requires JWT session authentication.
 */
export async function GET() {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const userResult = await db
      .select({
        privacyMode: users.privacyMode,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return Errors.notFound('User');
    }

    const response: UserSettings = {
      privacyMode: user.privacyMode ?? false,
      updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    return successResponse(response);
  } catch (error) {
    console.error('[API] Settings get error:', error);
    return Errors.internalError();
  }
}
