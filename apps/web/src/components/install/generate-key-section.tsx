'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, Copy, Check, RefreshCw, Eye, EyeOff } from 'lucide-react';

export function ApiKeySection() {
  const t = useTranslations('install.apiKey');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch('/api/me/api-key')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then((data) => {
        const key = data.data?.apiKey ?? null;
        setApiKey(key);
        setHasKey(data.data?.hasKey ?? false);
        if (key) setVisible(false);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const regenerateKey = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch('/api/me/regenerate-key', { method: 'POST' });
      if (!res.ok) {
        if (res.status === 401) {
          setError(t('errorNotLoggedIn'));
          return;
        }
        setError(t('errorGeneric'));
        return;
      }
      const data = await res.json();
      setApiKey(data.data?.apiKey ?? data.apiKey ?? null);
      setHasKey(true);
      setVisible(true);
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const copyKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = apiKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 20)}${'*'.repeat(Math.max(0, apiKey.length - 24))}${apiKey.slice(-4)}`
    : '';

  if (fetching) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {apiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm break-all">
                {visible ? apiKey : maskedKey}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setVisible(!visible)}
                className="shrink-0"
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={copyKey}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('usageLabel')}</p>
              <pre className="bg-muted rounded-md p-2 font-mono text-xs">
                {`npx @suncreation/modu-arena install --api-key ${visible ? apiKey : '<your-api-key>'}`}
              </pre>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={regenerateKey}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3 w-3" />
              )}
              {t('regenerate')}
            </Button>
          </div>
        ) : hasKey ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('existsButEncrypted')}</p>
            <Button onClick={regenerateKey} disabled={loading} size="sm">
              {loading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t('regenerate')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('warning')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={regenerateKey} disabled={loading} size="sm">
              {loading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {loading ? t('generating') : t('generate')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('warning')}</p>
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
