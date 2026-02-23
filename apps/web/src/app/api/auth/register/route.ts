import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { hashPassword, generateApiKey, createSessionToken, storeNewApiKeyForUser } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, displayName } = body as {
      username?: string;
      password?: string;
      displayName?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 50) {
      return NextResponse.json(
        { error: 'Username must be between 3 and 50 characters' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }


    const normalizedUsername = username.toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, normalizedUsername))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        username: normalizedUsername,
        passwordHash,
        displayName: displayName || username,
      })
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        createdAt: users.createdAt,
      });

    const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix, encrypted: apiKeyEncrypted } = generateApiKey(newUser.id);
    await storeNewApiKeyForUser(newUser.id, {
      hash: apiKeyHash,
      prefix: apiKeyPrefix,
      encrypted: apiKeyEncrypted,
    });

    const { token, expiresAt } = await createSessionToken(newUser.id);
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return NextResponse.json({
      user: {
        ...newUser,
        apiKeyPrefix,
      },
      apiKey,
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
