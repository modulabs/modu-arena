import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import {
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  Code2,
  Command,
  Download,
  Info,
  KeyRound,
  Lock,
  Monitor,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  Users,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { safeAuth } from '@/lib/safe-auth';
import { ApiKeySection } from '@/components/install/generate-key-section';

const quickStepIds = ['register', 'code', 'dashboard'] as const;
const quickStepIcons = {
  register: Terminal,
  code: Bot,
  dashboard: Trophy,
} as const;

const toolIds = [
  'claudeCode',
  'claudeDesktop',
  'opencode',
  'geminiCli',
  'codexCli',
  'crush',
] as const;

const toolIcons = {
  claudeCode: Bot,
  claudeDesktop: Monitor,
  opencode: Code2,
  geminiCli: Sparkles,
  codexCli: Braces,
  crush: Wrench,
} as const;

const collectIds = ['tokens', 'modelName', 'sessionTiming', 'toolUsageCounts', 'codeMetrics'] as const;
const dontCollectIds = ['codeContent', 'filePaths', 'prompts', 'personalData'] as const;

const howItWorksIds = ['installHooks', 'sessionEnd', 'dashboardSync'] as const;
const commandIds = ['register', 'login', 'install', 'submit', 'rank', 'status', 'uninstall'] as const;
const commandNames = {
  register: 'register',
  login: 'login',
  install: 'install',
  submit: 'submit',
  rank: 'rank',
  status: 'status',
  uninstall: 'uninstall',
} as const;

export default async function InstallPage() {
  const t = await getTranslations('install');
  const { userId } = await safeAuth();

  const commandBlock = commandIds
    .map(commandId => `${commandNames[commandId].padEnd(10, ' ')} - ${t(`commands.list.${commandId}`)}`)
    .join('\n');

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8 overflow-hidden rounded-xl border bg-card">
        <div className="bg-primary/10 p-6 md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Rocket className="h-3.5 w-3.5 text-primary" />
            <span>{t('hero.badge')}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('hero.title')}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{t('hero.subtitle')}</p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {t('hero.description')}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" />
            {t('hero.productBy')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">
                {t('hero.openDashboard')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">{t('hero.viewLeaderboard')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              {t('autoSetup.title')}
            </h2>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
              {t('autoSetup.description')}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <Info className="h-3.5 w-3.5" />
              {t('autoSetup.manualHint')}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('quickStart.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('quickStart.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {quickStepIds.map((stepId, index) => {
            const Icon = quickStepIcons[stepId];
            return (
              <Card key={stepId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-3 text-base">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      {t(`quickStart.steps.${stepId}.title`)}
                    </span>
                    <Icon className="h-4 w-4 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {t(`quickStart.steps.${stepId}.description`)}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">{t('quickStart.registerLabel')}</p>
            <pre className="bg-muted rounded-lg p-4 font-mono text-sm">{t('quickStart.registerCommand')}</pre>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">{t('quickStart.loginHint')}</p>
            <pre className="bg-muted rounded-lg p-4 font-mono text-sm">{t('quickStart.loginCommand')}</pre>
          </div>
        </div>
      </section>

      {userId && (
        <section className="mb-8">
          <ApiKeySection />
        </section>
      )}

      <section className="mb-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('supportedTools.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('supportedTools.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {toolIds.map((toolId) => {
            const Icon = toolIcons[toolId];
            return (
              <Card key={toolId} className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" />
                    {t(`supportedTools.tools.${toolId}.name`)}
                  </CardTitle>
                  <div className="inline-flex w-fit items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {t(`supportedTools.tools.${toolId}.hookType`)}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {t(`supportedTools.tools.${toolId}.description`)}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mb-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('whatWeTrack.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('whatWeTrack.description')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('whatWeTrack.collectTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {collectIds.map(itemId => (
                <div key={itemId} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t(`whatWeTrack.collect.${itemId}`)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                {t('whatWeTrack.dontCollectTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dontCollectIds.map(itemId => (
                <div key={itemId} className="flex items-start gap-2 text-sm">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t(`whatWeTrack.dontCollect.${itemId}`)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mb-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('howItWorks.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('howItWorks.description')}</p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            {howItWorksIds.map(stepId => (
              <div key={stepId} className="flex items-start gap-3 rounded-lg border bg-card p-4">
                <div className="rounded-md bg-primary/10 p-2">
                  {stepId === 'installHooks' && <KeyRound className="h-4 w-4 text-primary" />}
                  {stepId === 'sessionEnd' && <Command className="h-4 w-4 text-primary" />}
                  {stepId === 'dashboardSync' && <Download className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-sm leading-relaxed">{t(`howItWorks.steps.${stepId}`)}</p>
              </div>
            ))}

            <div className="flex items-start gap-3 rounded-lg border bg-primary/10 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm">{t('howItWorks.security')}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('importantNotes.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('importantNotes.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <Terminal className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm leading-relaxed">{t('importantNotes.items.lastActive')}</p>
              </div>
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm leading-relaxed">{t('importantNotes.items.apiKey')}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <Command className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm leading-relaxed">{t('importantNotes.items.nodeVersion')}</p>
              </div>
              <div className="flex items-start gap-3">
                <Trophy className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm leading-relaxed">{t('importantNotes.items.privacyMode')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('commands.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('commands.description')}</p>
        </div>

        <div className="bg-muted rounded-lg p-4 font-mono text-sm">
          <pre>{commandBlock}</pre>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>{t('commands.tip')}</span>
        </div>
      </section>
    </div>
  );
}
