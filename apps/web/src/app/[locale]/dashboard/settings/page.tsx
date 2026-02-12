import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { safeAuth, safeCurrentUser } from '@/lib/safe-auth';

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ApiKeyCard, PrivacyToggle } from '@/components/dashboard';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';



export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings - Modu Arena',
  description: 'Manage your Modu Arena account settings',
};

interface CurrentUserInfo {
  id: string;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  apiKeyPrefix: string | null;
  privacyMode: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get user info directly from DB (server-side only)
 * This avoids the need for internal API calls from server components
 */
async function getUserInfo(): Promise<CurrentUserInfo | null> {
  try {
    const { userId } = await safeAuth();

    if (!userId) {
      return null;
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const user = userResult[0];

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      githubUsername: user.githubUsername,
      githubAvatarUrl: user.githubAvatarUrl,
      apiKeyPrefix: user.apiKeyPrefix,
      privacyMode: user.privacyMode ?? false,
      createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Settings] Failed to get user info:', error);
    return null;
  }
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {['api-key', 'privacy'].map((cardId) => (
          <Card key={cardId}>
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function SettingsContent() {
  const t = await getTranslations('settings');
  const userInfo = await getUserInfo();

  if (!userInfo) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h3 className="text-lg font-semibold">{t('unableToLoad')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('tryAgainMessage')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard" aria-label={t('backToDashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t('title')}</h1>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <ApiKeyCard apiKeyPrefix={userInfo.apiKeyPrefix ?? ''} />
        <PrivacyToggle initialValue={userInfo.privacyMode} />
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await safeCurrentUser();

  if (!user) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-muted-foreground">
            You need to sign in to access settings and manage your API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
