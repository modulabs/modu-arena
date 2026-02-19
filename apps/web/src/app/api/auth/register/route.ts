import { NextRequest, NextResponse } from 'next/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { hashPassword, generateApiKey, createSessionToken } from '@/lib/auth';
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

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);
    const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix, encrypted: apiKeyEncrypted } = generateApiKey(username);

    const [newUser] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName: displayName || username,
        apiKeyHash,
        apiKeyPrefix,
        apiKeyEncrypted,
      })
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        apiKeyPrefix: users.apiKeyPrefix,
        createdAt: users.createdAt,
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
      user: newUser,
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
