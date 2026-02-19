'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

const REPO = 'modulabs/modu-arena';
const INSTALL_URL = `https://github.com/${REPO}/blob/master/INSTALL.md`;

function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

export function GitHubButton() {
  const [starCount, setStarCount] = useState<number | null>(null);
  const t = useTranslations('common');

  useEffect(() => {
    async function fetchStars() {
      try {
        const response = await fetch(`https://api.github.com/repos/${REPO}`);
        if (response.ok) {
          const data = await response.json();
          setStarCount(data.stargazers_count);
        }
      } catch {
        // Silently fail for star count
      }
    }
    fetchStars();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" asChild className="gap-1.5">
        <a
          href={INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('install')}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t('install')}</span>
          {starCount !== null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              <span className="text-xs font-medium text-foreground">
                {formatStarCount(starCount)}
              </span>
            </span>
          )}
        </a>
      </Button>
    </div>
  );
}
