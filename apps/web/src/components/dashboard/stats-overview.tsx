"use client";

import { Zap, Activity, Flame, BarChart3, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

interface ToolBreakdown {
  toolType: string;
  tokens: number;
  sessions: number;
  percentage: number;
}

interface StatsOverviewProps {
  overview: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalSessions: number;
    averageTokensPerSession: number;
    efficiencyScore: number;
    successfulProjectsCount: number; // NEW
  };
  toolBreakdown?: ToolBreakdown[]; // NEW
  usage: {
    totalTokens: number;
    totalSessions: number;
  };
  streaks: {
    current: number;
    longest: number;
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  description?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {badge}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getToolDisplayName(toolType: string): string {
  const names: Record<string, string> = {
    'claude-code': 'Claude Code',
    'opencode': 'OpenCode',
    'gemini': 'Gemini',
    'codex': 'Codex',
    'crush': 'Crush AI',
  };
  return names[toolType] || toolType;
}

function getToolColor(toolType: string): string {
  const colors: Record<string, string> = {
    'claude-code': 'bg-orange-500',
    'opencode': 'bg-indigo-500',
    'gemini': 'bg-blue-500',
    'codex': 'bg-emerald-500',
    'crush': 'bg-pink-500',
  };
  return colors[toolType] || 'bg-gray-500';
}

export function StatsOverview({
  overview,
  toolBreakdown = [],
  usage,
  streaks,
}: StatsOverviewProps) {
  return (
    <div className="space-y-4">
      {/* Primary metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={BarChart3}
          label="Total Usage"
          value={formatNumber(usage.totalTokens)}
          description={`${formatNumber(usage.totalSessions)} sessions`}
        />
        <StatCard
          icon={Zap}
          label="Total Tokens"
          value={formatNumber(overview.totalTokens)}
          description={`${formatNumber(overview.totalInputTokens)} in / ${formatNumber(overview.totalOutputTokens)} out`}
        />
        <StatCard
          icon={Activity}
          label="Sessions"
          value={formatNumber(overview.totalSessions)}
          description={`~${formatNumber(overview.averageTokensPerSession)} tokens/session`}
        />
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={`${streaks.current} days`}
          description={`Longest: ${streaks.longest} days`}
        />
      </div>

      {/* NEW: Project count metric */}
      <div className="grid gap-4 md:grid-cols-1">
        <StatCard
          icon={FolderOpen}
          label="Successful Projects"
          value={overview.successfulProjectsCount}
          description="Projects that passed LLM evaluation"
        />
      </div>

      {/* NEW: Tool breakdown */}
      {toolBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Token Usage by Tool</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {toolBreakdown.map((tool) => (
                <div key={tool.toolType} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${getToolColor(tool.toolType)}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{getToolDisplayName(tool.toolType)}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(tool.tokens)} tokens ({tool.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${tool.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
