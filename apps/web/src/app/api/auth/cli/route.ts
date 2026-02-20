import { type NextRequest, NextResponse } from 'next/server';
import { safeAuth } from '@/lib/safe-auth';
import { db, users, apiKeys } from '@/db';
import { and, eq } from 'drizzle-orm';
import { generateApiKey, decryptApiKey, storeNewApiKeyForUser } from '@/lib/auth';
import { logApiKeyGenerated } from '@/lib/audit';

const CLI_AUTH_COOKIE = 'modu_cli_auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');

  if (!redirectUri || !state) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required parameters: redirect_uri and state' } },
      { status: 400 }
    );
  }

  try {
    const url = new URL(redirectUri);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'redirect_uri must be localhost' } },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid redirect_uri' } },
      { status: 400 }
    );
  }

  const { userId } = await safeAuth();

  if (!userId) {
    const callbackUrl = new URL('/api/auth/cli/callback', request.url);
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect_url', callbackUrl.toString());

    const response = NextResponse.redirect(signInUrl);

    const cookieData = JSON.stringify({ redirectUri, state, createdAt: Date.now() });
    response.cookies.set(CLI_AUTH_COOKIE, Buffer.from(cookieData).toString('base64'), {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false,
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });

    return response;
  }

  return processCliAuth(request, userId, redirectUri, state);
}

async function processCliAuth(
  request: NextRequest,
  userId: string,
  redirectUri: string,
  state: string
): Promise<NextResponse> {
  try {
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    let apiKeyRaw: string;
    let apiKeyPrefix = user.apiKeyPrefix ?? '';

    const existingKeys = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.isActive, true)));

    apiKeyRaw = '';
    for (const keyRecord of existingKeys) {
      if (keyRecord.keyEncrypted) {
        try {
          apiKeyRaw = decryptApiKey(keyRecord.keyEncrypted, user.id);
          apiKeyPrefix = keyRecord.keyPrefix;
          break;
        } catch (decryptErr) {
          console.warn(`[CLI Auth] Failed to decrypt key ${keyRecord.keyPrefix} for user ${user.id}:`, decryptErr);
        }
      }
    }

    if (!apiKeyRaw) {
      const { key, hash, prefix, encrypted } = generateApiKey(user.id);
      apiKeyRaw = key;
      apiKeyPrefix = prefix;

      await storeNewApiKeyForUser(user.id, {
        hash,
        prefix,
        encrypted,
      });

      logApiKeyGenerated(user.id, prefix, request).catch((err) =>
        console.warn('[CLI Auth] Failed to log key generation audit:', err)
      );
    }

    const cliCallbackUrl = new URL(redirectUri);
    cliCallbackUrl.searchParams.set('api_key', apiKeyRaw);
    cliCallbackUrl.searchParams.set('api_key_prefix', apiKeyPrefix);
    cliCallbackUrl.searchParams.set('state', state);
    cliCallbackUrl.searchParams.set('username', user.username);

    const response = NextResponse.redirect(cliCallbackUrl);
    response.cookies.delete(CLI_AUTH_COOKIE);

    return response;
  } catch (error) {
    console.error('[CLI Auth] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process CLI authentication. Please try again.' } },
      { status: 500 }
    );
  }
}

export { CLI_AUTH_COOKIE };
