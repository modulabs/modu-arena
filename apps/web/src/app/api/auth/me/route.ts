import { NextResponse } from 'next/server';
import { safeAuth } from '@/lib/safe-auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const { userId } = await safeAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const result = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        apiKeyPrefix: users.apiKeyPrefix,
        privacyMode: users.privacyMode,
        githubUsername: users.githubUsername,
        githubAvatarUrl: users.githubAvatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
