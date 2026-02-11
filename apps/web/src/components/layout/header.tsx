import { Link } from '@/i18n/routing';
import { SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { safeAuth } from '@/lib/safe-auth';
import { Trophy, LayoutDashboard } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { LanguageSelector } from './language-selector';
import { GitHubButton } from './github-button';

const hasClerkKeys =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !!process.env.CLERK_SECRET_KEY;

export async function Header() {
  const { userId } = await safeAuth();
  const t = await getTranslations('common');

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-6xl items-center px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <span>MoAI Rank</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-4 md:flex">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('leaderboard')}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSelector />
          <GitHubButton />

          {hasClerkKeys && userId ? (
            <>
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/dashboard">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  {t('dashboard')}
                </Link>
              </Button>
              <Button variant="outline" size="icon" asChild className="sm:hidden">
                <Link href="/dashboard" aria-label={t('dashboard')}>
                  <LayoutDashboard className="h-5 w-5" />
                </Link>
              </Button>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: 'h-8 w-8',
                  },
                }}
              />
            </>
          ) : hasClerkKeys ? (
            <>
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  {t('signIn')}
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">{t('signUp')}</Button>
              </SignUpButton>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
