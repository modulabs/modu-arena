'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

interface AgentBreakdown {
  toolType: string;
  tokens: number;
  sessions: number;
  percentage: number;
}

interface AgentTokenBreakdownCardProps {
  agentBreakdown: AgentBreakdown[];
  className?: string;
}

const AGENT_COLORS: Record<string, string> = {
  'claude-code': 'bg-[#d97706] dark:bg-[#f59e0b]',
  opencode: 'bg-[#4f46e5] dark:bg-[#818cf8]',
  gemini: 'bg-[#2563eb] dark:bg-[#60a5fa]',
  codex: 'bg-[#059669] dark:bg-[#34d399]',
  crush: 'bg-[#db2777] dark:bg-[#f472b6]',
  'kilo-code': 'bg-[#7c3aed] dark:bg-[#a78bfa]',
  aider: 'bg-[#0891b2] dark:bg-[#22d3ee]',
  cursor: 'bg-[#0d9488] dark:bg-[#2dd4bf]',
  windsurf: 'bg-[#ea580c] dark:bg-[#fb923c]',
};

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
  codex: 'Codex CLI',
  crush: 'Crush AI',
  'kilo-code': 'Kilo Code',
  aider: 'Aider',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
};

function getAgentColor(toolType: string): string {
  return AGENT_COLORS[toolType] ?? 'bg-gray-500 dark:bg-gray-400';
}

function getAgentDisplayName(toolType: string): string {
  return AGENT_DISPLAY_NAMES[toolType] ?? toolType;
}

export function AgentTokenBreakdownCard({ agentBreakdown, className }: AgentTokenBreakdownCardProps) {
  const t = useTranslations('profile.agentBreakdown');

  const sortedBreakdown = useMemo(() => {
    return [...agentBreakdown].sort((a, b) => b.tokens - a.tokens);
  }, [agentBreakdown]);

  const totalTokens = useMemo(() => {
    return agentBreakdown.reduce((sum, a) => sum + a.tokens, 0);
  }, [agentBreakdown]);

  if (agentBreakdown.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('noData')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          {sortedBreakdown.map((agent) => (
            <div
              key={agent.toolType}
              className={`${getAgentColor(agent.toolType)} transition-all`}
              style={{ width: `${agent.percentage}%` }}
              title={`${getAgentDisplayName(agent.toolType)}: ${agent.percentage.toFixed(1)}%`}
            />
          ))}
        </div>

        <div className="space-y-2">
          {sortedBreakdown.map((agent) => (
            <div key={agent.toolType} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${getAgentColor(agent.toolType)}`} />
                <span className="text-sm">{getAgentDisplayName(agent.toolType)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {agent.sessions} {t('sessions')}
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatNumber(agent.tokens)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('totalTokens')}</span>
            <span className="font-medium">{formatNumber(totalTokens)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
