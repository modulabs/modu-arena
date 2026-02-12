import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

export async function safeAuth(): Promise<{ userId: string | null }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { userId: null };
    const payload = await verifySessionToken(token);
    return { userId: payload?.userId ?? null };
  } catch {
    return { userId: null };
  }
}

export async function safeCurrentUser() {
  const { userId } = await safeAuth();
  if (!userId) return null;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}
