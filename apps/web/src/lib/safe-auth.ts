const hasClerkKeys =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !!process.env.CLERK_SECRET_KEY;

export async function safeAuth(): Promise<{ userId: string | null }> {
  if (!hasClerkKeys) {
    return { userId: null };
  }
  const { auth } = await import('@clerk/nextjs/server');
  return auth();
}

export async function safeCurrentUser() {
  if (!hasClerkKeys) {
    return null;
  }
  const { currentUser } = await import('@clerk/nextjs/server');
  return currentUser();
}
