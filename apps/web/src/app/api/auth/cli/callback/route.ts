import { type NextRequest, NextResponse } from 'next/server';
import { safeAuth } from '@/lib/safe-auth';
import { db, users, apiKeys } from '@/db';
import { and, eq } from 'drizzle-orm';
import { generateApiKey, decryptApiKey, storeNewApiKeyForUser } from '@/lib/auth';
import { logApiKeyGenerated } from '@/lib/audit';
import { CLI_AUTH_COOKIE } from '../route';

interface CliAuthState {
  redirectUri: string;
  state: string;
  createdAt: number;
}

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(CLI_AUTH_COOKIE)?.value;

  if (!cookieValue) {
    return renderErrorPage('Auth session expired. Please try again.');
  }

  let stateInfo: CliAuthState;
  try {
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf-8');
    stateInfo = JSON.parse(decoded);
  } catch {
    return renderErrorPage('Invalid auth session. Please try again.');
  }

  if (Date.now() - stateInfo.createdAt > 5 * 60 * 1000) {
    const response = renderErrorPage('Auth session expired. Please try again.');
    response.cookies.delete(CLI_AUTH_COOKIE);
    return response;
  }

  const { userId } = await safeAuth();

  if (!userId) {
    return renderErrorPage('Authentication failed. Please try again.');
  }

  try {
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];

    if (!user) {
      return renderErrorPage('User not found. Please register first.');
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
          console.warn(`[CLI Auth Callback] Failed to decrypt key ${keyRecord.keyPrefix} for user ${user.id}:`, decryptErr);
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
        console.warn('[CLI Auth Callback] Failed to log key generation audit:', err)
      );
    }

    const cliCallbackUrl = new URL(stateInfo.redirectUri);
    cliCallbackUrl.searchParams.set('api_key', apiKeyRaw);
    cliCallbackUrl.searchParams.set('api_key_prefix', apiKeyPrefix);
    cliCallbackUrl.searchParams.set('state', stateInfo.state);
    cliCallbackUrl.searchParams.set('username', user.username);

    const response = renderSuccessPage(cliCallbackUrl.toString(), user.username);
    response.cookies.delete(CLI_AUTH_COOKIE);

    return response;
  } catch (error) {
    console.error('[CLI Auth Callback] Error:', error);
    const response = renderErrorPage('Failed to complete authentication. Please try again.');
    response.cookies.delete(CLI_AUTH_COOKIE);
    return response;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderSuccessPage(redirectUrl: string, username: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="2;url=${escapeHtml(redirectUrl)}">
  <title>Modu Arena - CLI Authorization</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #fff; }
    .container { text-align: center; padding: 2rem; max-width: 400px; }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .username { color: #4ade80; font-weight: 600; }
    p { color: #94a3b8; margin-top: 1rem; font-size: 0.9rem; }
    .redirect-notice { margin-top: 2rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.85rem; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>CLI Authorized!</h1>
    <p>Hello, <span class="username">@${escapeHtml(username)}</span>!</p>
    <p>Your API key has been generated.</p>
    <div class="redirect-notice">
      Redirecting to your terminal...<br>
      <small>If not redirected, <a href="${escapeHtml(redirectUrl)}">click here</a></small>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function renderErrorPage(message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Modu Arena - Authorization Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #fff; }
    .container { text-align: center; padding: 2rem; max-width: 400px; }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f87171; }
    p { color: #94a3b8; margin-top: 1rem; }
    .retry { margin-top: 2rem; display: inline-block; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 500; }
    .retry:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Authorization Failed</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/" class="retry">Return to Home</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: { 'Content-Type': 'text/html' },
  });
}
