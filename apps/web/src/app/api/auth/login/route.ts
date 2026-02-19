import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq, or } from 'drizzle-orm';
import { verifyPassword, createSessionToken, generateApiKey } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, username, password, source } = body as {
      email?: string;
      username?: string;
      password?: string;
      source?: string;
    };

    const identifier = email || username;
    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email/username and password are required' },
        { status: 400 }
      );
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const result = await db
      .select()
      .from(users)
      .where(or(eq(users.email, normalizedIdentifier), eq(users.username, normalizedIdentifier)))
      .limit(1);

    const user = result[0];
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const { token, expiresAt } = await createSessionToken(user.id);
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    // CLI login: regenerate API key and return it (raw key only shown once)
    if (source === 'cli') {
      const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateApiKey(user.id);
      await db
        .update(users)
        .set({ apiKeyHash, apiKeyPrefix, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          apiKeyPrefix,
        },
        apiKey,
      });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        apiKeyPrefix: user.apiKeyPrefix,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
